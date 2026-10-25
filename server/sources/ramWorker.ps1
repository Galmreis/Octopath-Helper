param(
    [int]$ParentPid = 0,
    [int]$BattleCount = 0,
    [int]$EscapeCount = 0,
    [int]$TreasureCount = 0,
    [int]$HiddenPointCount = 0
)

$code = @"
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

public class RamPoller {
    const int PROCESS_QUERY_INFORMATION = 0x0400;
    const int PROCESS_VM_READ = 0x0010;
    const uint MEM_COMMIT = 0x1000;
    const uint MEM_PRIVATE = 0x20000;
    const uint PAGE_NOACCESS = 0x01;
    const uint PAGE_GUARD = 0x100;

    [StructLayout(LayoutKind.Sequential)]
    public struct MEMORY_BASIC_INFORMATION {
        public IntPtr BaseAddress;
        public IntPtr AllocationBase;
        public uint AllocationProtect;
        public IntPtr RegionSize;
        public uint State;
        public uint Protect;
        public uint Type;
    }

    [DllImport("kernel32.dll")]
    public static extern IntPtr OpenProcess(int dwDesiredAccess, bool bInheritHandle, int dwProcessId);
    [DllImport("kernel32.dll")]
    public static extern int VirtualQueryEx(IntPtr hProcess, IntPtr lpAddress, out MEMORY_BASIC_INFORMATION lpBuffer, uint dwLength);
    [DllImport("kernel32.dll")]
    public static extern bool ReadProcessMemory(IntPtr hProcess, IntPtr lpBaseAddress, byte[] lpBuffer, int dwSize, out IntPtr lpNumberOfBytesRead);
    [DllImport("kernel32.dll")]
    public static extern bool CloseHandle(IntPtr hObject);

    static byte[] sharedScanBuf = new byte[256 * 1024];

    // Ultra-fast (~300ms) 16-byte aligned scan across UE4 FMallocBinned2 UObject pools (<= 256 KB PAGE_READWRITE regions)
    public static void FindAddresses(IntPtr hProc, long ignoreAchAddr, out long achAddr, ref long liveZoneAddr) {
        achAddr = 0;
        List<long> achCandidates = new List<long>();
        List<int> initialPlayTimes = new List<int>();

        IntPtr addr = IntPtr.Zero;
        long maxAddr = 0x7FF000000000L;
        MEMORY_BASIC_INFORMATION mbi;
        int mbiSize = Marshal.SizeOf(typeof(MEMORY_BASIC_INFORMATION));

        while ((long)addr < maxAddr) {
            if (VirtualQueryEx(hProc, addr, out mbi, (uint)mbiSize) == 0) break;
            long regionBase = (long)mbi.BaseAddress;
            long regionSize = (long)mbi.RegionSize;

            // Unreal Engine 4 FMallocBinned2 UObject pools are always MEM_COMMIT (0x1000), MEM_PRIVATE (0x20000),
            // PAGE_READWRITE (0x04), and <= 256 KB (typically 40-64 KB). Filtering out multi-megabyte texture/audio/vertex
            // buffers cuts scan time from ~33s to ~320ms!
            if (mbi.State == MEM_COMMIT && mbi.Type == MEM_PRIVATE && mbi.Protect == 0x04 && regionSize > 0 && regionSize <= 256 * 1024) {
                IntPtr read;
                if (ReadProcessMemory(hProc, mbi.BaseAddress, sharedScanBuf, (int)regionSize, out read)) {
                    int n = (int)read;
                    // UKSSaveGameBP_C.Achievement is always at UObject + 0x88, so (addr & 0xF) == 8 (step by 16!)
                    for (int i = 72; i <= n - 512; i += 16) {
                        if (BitConverter.ToInt32(sharedScanBuf, i + 40) == 80 && BitConverter.ToInt32(sharedScanBuf, i + 44) == 80) {
                            int bpLen = BitConverter.ToInt32(sharedScanBuf, i + 224);
                            int partyLen = BitConverter.ToInt32(sharedScanBuf, i + 240);
                            int subMissionLen = BitConverter.ToInt32(sharedScanBuf, i + 384);
                            int visitedLen = BitConverter.ToInt32(sharedScanBuf, i + 400);
                            int mapDataLen = BitConverter.ToInt32(sharedScanBuf, i + 424);
                            int enemyLen = BitConverter.ToInt32(sharedScanBuf, i + 440);
                            int playTime = BitConverter.ToInt32(sharedScanBuf, i + 24);
                            if (bpLen == 2000 && partyLen == 4 && subMissionLen == 8 && visitedLen == 10 && mapDataLen == 220 && enemyLen == 2500 && playTime > 0) {
                                long cand = regionBase + i;
                                if (cand != ignoreAchAddr && !achCandidates.Contains(cand)) {
                                    achCandidates.Add(cand);
                                    initialPlayTimes.Add(playTime);
                                }
                            }
                        }
                    }

                    if (liveZoneAddr == 0) {
                        for (int i = 0x370; i <= n - 0x420; i += 8) {
                            long vt370 = BitConverter.ToInt64(sharedScanBuf, i);
                            if ((vt370 >> 40) == 0x7F) {
                                long vt000 = BitConverter.ToInt64(sharedScanBuf, i - 0x370);
                                if (vt000 - vt370 == 0x260) {
                                    long fn1 = BitConverter.ToInt64(sharedScanBuf, i + 8);
                                    long fn2 = BitConverter.ToInt64(sharedScanBuf, i + 0x410);
                                    int lvl = BitConverter.ToInt32(sharedScanBuf, i - 4);
                                    if (fn1 != 0 && fn1 == fn2 && lvl >= 1 && lvl <= 219) {
                                        liveZoneAddr = regionBase + i - 4;
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }
            }
            addr = new IntPtr(regionBase + regionSize);
        }

        if (achCandidates.Count == 1) {
            achAddr = achCandidates[0];
        } else if (achCandidates.Count > 1) {
            Thread.Sleep(1050);
            byte[] ptBuf = new byte[4];
            IntPtr r;
            achAddr = achCandidates[achCandidates.Count - 1];
            for (int c = 0; c < achCandidates.Count; c++) {
                if (ReadProcessMemory(hProc, new IntPtr(achCandidates[c] + 24), ptBuf, 4, out r)) {
                    int nowPt = BitConverter.ToInt32(ptBuf, 0);
                    if (nowPt > initialPlayTimes[c]) {
                        achAddr = achCandidates[c];
                        break;
                    }
                }
            }
        }
    }

    public static void PollLoop(int pid, int parentPid) {
        IntPtr hProc = OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, false, pid);
        if (hProc == IntPtr.Zero) {
            Console.WriteLine("{\"type\":\"ERROR\",\"message\":\"Cannot open process\"}");
            Console.Out.Flush();
            return;
        }

        Process gameProc = null;
        try { gameProc = Process.GetProcessById(pid); } catch { CloseHandle(hProc); return; }

        Process parentProc = null;
        if (parentPid > 0) {
            try { parentProc = Process.GetProcessById(parentPid); } catch { CloseHandle(hProc); return; }
        }

        long achAddr = 0;
        long liveZoneAddr = 0;
        FindAddresses(hProc, 0, out achAddr, ref liveZoneAddr);
        if (achAddr == 0) {
            Console.WriteLine("{\"type\":\"ERROR\",\"message\":\"Could not locate UKSSaveGameBP_C in RAM\"}");
            Console.Out.Flush();
            CloseHandle(hProc);
            return;
        }

        Console.WriteLine(string.Format("{{\"type\":\"ATTACHED\",\"pid\":{0},\"address\":\"0x{1:X}\",\"liveZoneAddress\":\"0x{2:X}\"}}", pid, achAddr, liveZoneAddr));
        Console.Out.Flush();

        ulong lastChecksum = 0;
        long lastRescanMs = 0;
        int lastPlayTime = -1;
        int frozenPlayTimeTicks = 0;
        int lastTreasure = -1;
        int lastHidden = -1;
        int lastLevelId = -1;
        int tickCount = 0;
        string cachedZonesJson = "";
        Stopwatch sw = Stopwatch.StartNew();

        byte[] structBuf = new byte[600];
        byte[] zoneCheckBuf = new byte[24];
        byte[] enemyBuf = new byte[450 * 8];
        byte[] visitedBuf = new byte[40];
        byte[] itemFlagBuf = new byte[320];
        byte[] partyBuf = new byte[16];
        byte[] mapHeaders = new byte[205 * 16];
        byte[] zBytes = new byte[64];
        byte[] subHeaders = new byte[8 * 64];
        byte[] msInts = new byte[25 * 4];
        byte[] ciInts = new byte[25 * 4];
        byte[] missionBuf = new byte[8 * 50];
        StringBuilder zonesB64 = new StringBuilder(4096);
        IntPtr read;

        while (true) {
            if (parentProc != null && parentProc.HasExited) break;
            if (gameProc != null && gameProc.HasExited) {
                Console.WriteLine("{\"type\":\"DETACHED\"}");
                Console.Out.Flush();
                break;
            }

            bool validSaveObj = false;
            if (ReadProcessMemory(hProc, new IntPtr(achAddr - 64), structBuf, structBuf.Length, out read) && (int)read >= 550) {
                if (BitConverter.ToInt32(structBuf, 64 + 40) == 80 && BitConverter.ToInt32(structBuf, 64 + 424) == 220) {
                    validSaveObj = true;
                }
            }

            // If save object was unloaded (e.g. Title Screen / loading a new save slot), stay alive and re-scan quickly!
            if (!validSaveObj) {
                long newAch = 0;
                FindAddresses(hProc, achAddr, out newAch, ref liveZoneAddr);
                if (newAch != 0) {
                    achAddr = newAch;
                    lastChecksum = 0;
                    cachedZonesJson = "";
                    frozenPlayTimeTicks = 0;
                    Console.WriteLine(string.Format("{{\"type\":\"ATTACHED\",\"pid\":{0},\"address\":\"0x{1:X}\",\"liveZoneAddress\":\"0x{2:X}\"}}", pid, achAddr, liveZoneAddr));
                    Console.Out.Flush();
                } else {
                    Thread.Sleep(500);
                }
                continue;
            }

            int levelId = BitConverter.ToInt32(structBuf, 64 - 28);

            if (liveZoneAddr != 0) {
                if (ReadProcessMemory(hProc, new IntPtr(liveZoneAddr), zoneCheckBuf, zoneCheckBuf.Length, out read) && (int)read == 24) {
                    int liveLvl = BitConverter.ToInt32(zoneCheckBuf, 0);
                    long vt = BitConverter.ToInt64(zoneCheckBuf, 4);
                    if ((vt >> 40) == 0x7F && liveLvl >= 1 && liveLvl <= 219) {
                        levelId = liveLvl;
                    }
                }
            }

            int curBattle = BitConverter.ToInt32(structBuf, 64 + 0);
            int curEscape = BitConverter.ToInt32(structBuf, 64 + 4);
            int curLeaf = BitConverter.ToInt32(structBuf, 64 + 8);
            int curTreasure = BitConverter.ToInt32(structBuf, 64 + 16);
            int curHidden = BitConverter.ToInt32(structBuf, 64 + 20);
            int curPlayTime = BitConverter.ToInt32(structBuf, 64 + 24);

            // If PlayTime froze for >2.5 seconds (32 ticks * 80ms), check if a new save slot was loaded into a new UKSSaveGameBP_C
            if (curPlayTime == lastPlayTime) {
                frozenPlayTimeTicks++;
                if (frozenPlayTimeTicks >= 32 && sw.ElapsedMilliseconds - lastRescanMs > 2500) {
                    lastRescanMs = sw.ElapsedMilliseconds;
                    frozenPlayTimeTicks = 0;
                    long newAch = 0;
                    FindAddresses(hProc, achAddr, out newAch, ref liveZoneAddr);
                    if (newAch != 0 && newAch != achAddr) {
                        achAddr = newAch;
                        lastChecksum = 0;
                        cachedZonesJson = "";
                        Console.WriteLine(string.Format("{{\"type\":\"ATTACHED\",\"pid\":{0},\"address\":\"0x{1:X}\",\"liveZoneAddress\":\"0x{2:X}\"}}", pid, achAddr, liveZoneAddr));
                        Console.Out.Flush();
                        continue;
                    }
                }
            } else {
                lastPlayTime = curPlayTime;
                frozenPlayTimeTicks = 0;
            }

            long itemFlagPtr = BitConverter.ToInt64(structBuf, 64 + 32);
            long partyPtr = BitConverter.ToInt64(structBuf, 64 + 232);
            long subMissionPtr = BitConverter.ToInt64(structBuf, 64 + 376);
            long visitedPtr = BitConverter.ToInt64(structBuf, 64 + 392);
            long mapDataPtr = BitConverter.ToInt64(structBuf, 64 + 416);
            long enemyDataPtr = BitConverter.ToInt64(structBuf, 64 + 432);

            ReadProcessMemory(hProc, new IntPtr(enemyDataPtr), enemyBuf, enemyBuf.Length, out read);
            ReadProcessMemory(hProc, new IntPtr(visitedPtr), visitedBuf, visitedBuf.Length, out read);
            ReadProcessMemory(hProc, new IntPtr(itemFlagPtr), itemFlagBuf, itemFlagBuf.Length, out read);
            ReadProcessMemory(hProc, new IntPtr(partyPtr), partyBuf, partyBuf.Length, out read);

            bool needZoneSync = (cachedZonesJson.Length == 0) || (curTreasure != lastTreasure) || (curHidden != lastHidden) || (levelId != lastLevelId) || (tickCount % 25 == 0);
            if (needZoneSync) {
                lastTreasure = curTreasure;
                lastHidden = curHidden;
                lastLevelId = levelId;

                ReadProcessMemory(hProc, new IntPtr(mapDataPtr), mapHeaders, mapHeaders.Length, out read);
                zonesB64.Clear();
                for (int z = 12; z <= 196; z++) {
                    long tPtr = BitConverter.ToInt64(mapHeaders, z * 16);
                    int tNum = BitConverter.ToInt32(mapHeaders, z * 16 + 8);
                    if (tPtr != 0 && tNum > 0 && tNum <= 64) {
                        ReadProcessMemory(hProc, new IntPtr(tPtr), zBytes, tNum, out read);
                        string zb = Convert.ToBase64String(zBytes, 0, tNum);
                        if (zonesB64.Length > 0) zonesB64.Append(',');
                        zonesB64.Append("\"").Append(z).Append("\":\"").Append(zb).Append("\"");
                    }
                }
                cachedZonesJson = zonesB64.ToString();

                Array.Clear(missionBuf, 0, missionBuf.Length);
                if (subMissionPtr != 0 && ReadProcessMemory(hProc, new IntPtr(subMissionPtr), subHeaders, subHeaders.Length, out read)) {
                    for (int r = 0; r < 8; r++) {
                        long msPtr = BitConverter.ToInt64(subHeaders, r * 64);
                        long ciPtr = BitConverter.ToInt64(subHeaders, r * 64 + 16);
                        if (msPtr != 0 && ciPtr != 0) {
                            ReadProcessMemory(hProc, new IntPtr(msPtr), msInts, msInts.Length, out read);
                            ReadProcessMemory(hProc, new IntPtr(ciPtr), ciInts, ciInts.Length, out read);
                            for (int s = 0; s < 25; s++) {
                                missionBuf[r * 50 + s * 2] = (byte)BitConverter.ToInt32(msInts, s * 4);
                                missionBuf[r * 50 + s * 2 + 1] = (byte)BitConverter.ToInt32(ciInts, s * 4);
                            }
                        }
                    }
                }
            }
            tickCount++;

            ulong hash = 14695981039346656037UL;
            hash = (hash ^ (ulong)levelId) * 1099511628211UL;
            hash = (hash ^ (ulong)curBattle) * 1099511628211UL;
            hash = (hash ^ (ulong)curTreasure) * 1099511628211UL;
            hash = (hash ^ (ulong)curHidden) * 1099511628211UL;
            for (int k = 0; k < enemyBuf.Length; k += 4) {
                hash = (hash ^ (ulong)BitConverter.ToUInt32(enemyBuf, k)) * 1099511628211UL;
            }
            for (int k = 0; k < visitedBuf.Length; k += 4) {
                hash = (hash ^ (ulong)BitConverter.ToUInt32(visitedBuf, k)) * 1099511628211UL;
            }
            for (int k = 0; k < itemFlagBuf.Length; k += 4) {
                hash = (hash ^ (ulong)BitConverter.ToUInt32(itemFlagBuf, k)) * 1099511628211UL;
            }
            for (int k = 0; k < partyBuf.Length; k += 4) {
                hash = (hash ^ (ulong)BitConverter.ToUInt32(partyBuf, k)) * 1099511628211UL;
            }
            for (int k = 0; k < missionBuf.Length; k += 4) {
                hash = (hash ^ (ulong)BitConverter.ToUInt32(missionBuf, k)) * 1099511628211UL;
            }
            for (int k = 0; k < cachedZonesJson.Length; k += 8) {
                hash = (hash ^ (ulong)cachedZonesJson[k]) * 1099511628211UL;
            }

            if (hash != lastChecksum) {
                lastChecksum = hash;
                string json = string.Format(
                    "{{\"type\":\"RAM_SNAPSHOT\",\"levelId\":{0},\"battleCount\":{1},\"escapeCount\":{2},\"totalLeaf\":{3},\"treasureCount\":{4},\"hiddenPointCount\":{5},\"playTime\":{6},\"partyB64\":\"{7}\",\"enemyB64\":\"{8}\",\"visitedB64\":\"{9}\",\"itemFlagB64\":\"{10}\",\"missionB64\":\"{11}\",\"zones\":{{{12}}}}}",
                    levelId, curBattle, curEscape, curLeaf, curTreasure, curHidden, curPlayTime,
                    Convert.ToBase64String(partyBuf),
                    Convert.ToBase64String(enemyBuf),
                    Convert.ToBase64String(visitedBuf),
                    Convert.ToBase64String(itemFlagBuf),
                    Convert.ToBase64String(missionBuf),
                    cachedZonesJson
                );
                Console.WriteLine(json);
                Console.Out.Flush();
            }

            Thread.Sleep(80);
        }

        CloseHandle(hProc);
    }
}
"@

Add-Type -TypeDefinition $code
$proc = Get-Process -Name "Octopath_Traveler-Win64-Shipping" -ErrorAction SilentlyContinue
if (-not $proc) {
    Write-Output '{"type":"NO_PROCESS"}'
    exit 0
}
[RamPoller]::PollLoop($proc.Id, $ParentPid)
