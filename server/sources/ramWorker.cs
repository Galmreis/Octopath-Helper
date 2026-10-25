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

    // === Live battle actors (BattleEnemyBP_C) ===
    // Mid-battle weakness reveals live in the battle actor (TmpWeaknessOpen) and are only
    // committed to UKSSaveGameBP_C.EnemyInfoData when the battle ends. We locate the actors
    // and OR their reveal bits into the snapshot so the dashboard updates mid-battle.
    // Offsets are relative to CharacterParam.HP inside the actor.
    const int ACT_PRE = 12;        // EnemyID sits 12 bytes before HP
    const int ACT_LEN = 1700;
    static readonly object battleLock = new object();
    static List<long> battleActors = new List<long>();      // address of HP field
    static HashSet<long> battleRegions = new HashSet<long>(); // pools that held actors
    static byte[] battleScanBuf = new byte[256 * 1024];
    static byte[] actorBuf = new byte[ACT_LEN + ACT_PRE];

    static bool IsActorAt(byte[] b, int i) {
        int bp = BitConverter.ToInt32(b, i + 8);
        if (bp < 1 || bp > 5) return false;
        int enemyId = BitConverter.ToInt32(b, i - 12);
        if (enemyId < 1 || enemyId > 900 || BitConverter.ToInt32(b, i + 628) != enemyId) return false;
        int maxHp = BitConverter.ToInt32(b, i);
        int sp = BitConverter.ToInt32(b, i + 12);
        if (maxHp < 5 || maxHp > 1000000 || sp < 1 || sp > 99) return false;
        return BitConverter.ToInt64(b, i) == BitConverter.ToInt64(b, i + 744)
            && BitConverter.ToInt64(b, i + 16) == BitConverter.ToInt64(b, i + 760)
            && BitConverter.ToInt64(b, i + 32) == BitConverter.ToInt64(b, i + 776);
    }

    static bool ScanRegionForActors(IntPtr hProc, long rBase, long rSize, List<long> found) {
        IntPtr read;
        if (!ReadProcessMemory(hProc, new IntPtr(rBase), battleScanBuf, (int)rSize, out read)) return false;
        int n = (int)read;
        bool any = false;
        for (int i = ACT_PRE; i <= n - ACT_LEN; i += 4) {
            if (IsActorAt(battleScanBuf, i)) { found.Add(rBase + i); any = true; }
        }
        return any;
    }

    // Full scan (~450ms) — runs once asynchronously when a battle starts.
    static void FullBattleScan(IntPtr hProc) {
        List<long> found = new List<long>();
        HashSet<long> regions = new HashSet<long>();
        IntPtr addr = IntPtr.Zero;
        MEMORY_BASIC_INFORMATION mbi;
        int mbiSize = Marshal.SizeOf(typeof(MEMORY_BASIC_INFORMATION));
        while ((long)addr < 0x7FF000000000L) {
            if (VirtualQueryEx(hProc, addr, out mbi, (uint)mbiSize) == 0) break;
            long rBase = (long)mbi.BaseAddress;
            long rSize = (long)mbi.RegionSize;
            if (mbi.State == MEM_COMMIT && mbi.Type == MEM_PRIVATE && mbi.Protect == 0x04 && rSize > 0 && rSize <= 256 * 1024) {
                if (ScanRegionForActors(hProc, rBase, rSize, found)) regions.Add(rBase);
            }
            addr = new IntPtr(rBase + rSize);
        }
        lock (battleLock) {
            battleActors = found;
            foreach (long r in regions) battleRegions.Add(r);
        }
    }

    static volatile bool scanInProgress = false;

    static void TriggerBattleScan(IntPtr hProc) {
        if (scanInProgress) return;
        scanInProgress = true;
        ThreadPool.QueueUserWorkItem(_ => {
            try { FullBattleScan(hProc); } catch { }
            finally { scanInProgress = false; }
        });
    }

    // Quick scan (<5ms) — only the pools where actors were seen before (same UE bin size).
    static void QuickBattleScan(IntPtr hProc) {
        long[] regions;
        lock (battleLock) { regions = new long[battleRegions.Count]; battleRegions.CopyTo(regions); }
        if (regions.Length == 0) return;
        List<long> found = new List<long>();
        MEMORY_BASIC_INFORMATION mbi;
        int mbiSize = Marshal.SizeOf(typeof(MEMORY_BASIC_INFORMATION));
        foreach (long r in regions) {
            if (VirtualQueryEx(hProc, new IntPtr(r), out mbi, (uint)mbiSize) == 0) continue;
            long rSize = (long)mbi.RegionSize;
            if (mbi.State == MEM_COMMIT && mbi.Protect == 0x04 && rSize > 0 && rSize <= 256 * 1024) {
                ScanRegionForActors(hProc, (long)mbi.BaseAddress, rSize, found);
            }
        }
        lock (battleLock) { battleActors = found; }
    }

    static string liveEnemiesJson = "[]";

    // OR live battle reveal bits into the EnemyInfoData snapshot (reveals are monotonic).
    static void MergeBattleActors(IntPtr hProc, byte[] enemyBuf) {
        List<long> actors;
        lock (battleLock) { actors = battleActors; }
        if (actors.Count == 0) {
            liveEnemiesJson = "[]";
            return;
        }
        IntPtr read;
        int aliveCount = 0;
        List<int> currentIds = new List<int>();
        foreach (long a in actors) {
            if (!ReadProcessMemory(hProc, new IntPtr(a - ACT_PRE), actorBuf, actorBuf.Length, out read) || (int)read < actorBuf.Length) continue;
            if (!IsActorAt(actorBuf, ACT_PRE)) continue;
            aliveCount++;
            int enemyId = BitConverter.ToInt32(actorBuf, 0);
            if (!currentIds.Contains(enemyId)) {
                currentIds.Add(enemyId);
            }
            int off = enemyId * 8;
            if (off + 6 > enemyBuf.Length) continue;
            enemyBuf[off + 4] |= actorBuf[ACT_PRE + 1684];
            enemyBuf[off + 5] |= actorBuf[ACT_PRE + 1685];
        }
        if (aliveCount == 0) {
            lock (battleLock) { battleActors.Clear(); }
            liveEnemiesJson = "[]";
        } else {
            StringBuilder sb = new StringBuilder("[");
            for (int k = 0; k < currentIds.Count; k++) {
                if (k > 0) sb.Append(",");
                sb.Append(currentIds[k]);
            }
            sb.Append("]");
            liveEnemiesJson = sb.ToString();
        }
    }

    // Ultra-fast (~320ms) 16-byte aligned scan across UE4 FMallocBinned2 UObject pools (<= 256 KB PAGE_READWRITE regions)
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
            // buffers cuts scan time from ~33s to ~320ms.
            if (mbi.State == MEM_COMMIT && mbi.Type == MEM_PRIVATE && mbi.Protect == 0x04 && regionSize > 0 && regionSize <= 256 * 1024) {
                IntPtr read;
                if (ReadProcessMemory(hProc, mbi.BaseAddress, sharedScanBuf, (int)regionSize, out read)) {
                    int n = (int)read;
                    // UKSSaveGameBP_C.Achievement is always at UObject + 0x88, so (addr & 0xF) == 8 (step by 16)
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

    public static void PollProcess(int pid, Process parentProc) {
        IntPtr hProc = OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, false, pid);
        if (hProc == IntPtr.Zero) return;

        Process gameProc = null;
        try { gameProc = Process.GetProcessById(pid); } catch { CloseHandle(hProc); return; }

        long achAddr = 0;
        long liveZoneAddr = 0;
        FindAddresses(hProc, 0, out achAddr, ref liveZoneAddr);
        if (achAddr == 0) {
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
        byte[] enemyBuf = new byte[900 * 8];
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
        int lastBattle = -1;
        long lastQuickBattleMs = 0;
        long lastBattleScanMs = 0;
        TriggerBattleScan(hProc); // initial check in case launched mid-battle

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

            // If save object was unloaded (e.g. Title Screen / loading a new save slot), stay alive and re-scan quickly
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
            if (curBattle != lastBattle) {
                lastBattle = curBattle;
                lock (battleLock) { battleActors.Clear(); }
                liveEnemiesJson = "[]";
            }
            if (sw.ElapsedMilliseconds - lastBattleScanMs > 2000) {
                lastBattleScanMs = sw.ElapsedMilliseconds;
                TriggerBattleScan(hProc);
            }
            if (battleActors.Count > 0 && sw.ElapsedMilliseconds - lastQuickBattleMs > 500) {
                lastQuickBattleMs = sw.ElapsedMilliseconds;
                QuickBattleScan(hProc);
            }
            MergeBattleActors(hProc, enemyBuf);
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
            for (int k = 0; k < liveEnemiesJson.Length; k++) {
                hash = (hash ^ (ulong)liveEnemiesJson[k]) * 1099511628211UL;
            }

            if (hash != lastChecksum) {
                lastChecksum = hash;
                string json = string.Format(
                    "{{\"type\":\"RAM_SNAPSHOT\",\"levelId\":{0},\"battleCount\":{1},\"escapeCount\":{2},\"totalLeaf\":{3},\"treasureCount\":{4},\"hiddenPointCount\":{5},\"playTime\":{6},\"partyB64\":\"{7}\",\"enemyB64\":\"{8}\",\"visitedB64\":\"{9}\",\"itemFlagB64\":\"{10}\",\"missionB64\":\"{11}\",\"zones\":{{{12}}},\"battleEnemies\":{13}}}",
                    levelId, curBattle, curEscape, curLeaf, curTreasure, curHidden, curPlayTime,
                    Convert.ToBase64String(partyBuf),
                    Convert.ToBase64String(enemyBuf),
                    Convert.ToBase64String(visitedBuf),
                    Convert.ToBase64String(itemFlagBuf),
                    Convert.ToBase64String(missionBuf),
                    cachedZonesJson,
                    liveEnemiesJson
                );
                Console.WriteLine(json);
                Console.Out.Flush();
            }

            Thread.Sleep(80);
        }

        CloseHandle(hProc);
    }

    public static void Main(string[] args) {
        int parentPid = 0;
        if (args.Length > 0) {
            int.TryParse(args[0], out parentPid);
        }

        Process parentProc = null;
        if (parentPid > 0) {
            try { parentProc = Process.GetProcessById(parentPid); } catch { return; }
        }

        while (true) {
            if (parentProc != null && parentProc.HasExited) break;

            Process[] procs = Process.GetProcessesByName("Octopath_Traveler-Win64-Shipping");
            if (procs != null && procs.Length > 0) {
                int gamePid = procs[0].Id;
                for (int i = 0; i < procs.Length; i++) procs[i].Dispose();
                PollProcess(gamePid, parentProc);
            }

            Thread.Sleep(1500);
        }
    }
}
