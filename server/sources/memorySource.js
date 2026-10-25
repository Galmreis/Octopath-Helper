const fs = require('fs');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const { DATA_DIR } = require('../config');

const monstersDb = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'monsters.json'), 'utf8'));
const zonesDb = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'zones.json'), 'utf8'));
const itemsDb = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'items.json'), 'utf8'));

const CHARACTER_NAMES = {
  0: 'Olberic',
  1: 'Tressa',
  2: 'Cyrus',
  3: 'Primrose',
  4: "H'aanit",
  5: 'Therion',
  6: 'Ophilia',
  7: 'Alfyn'
};

const WEAPON_KEYS = ['sword', 'polearm', 'dagger', 'axe', 'bow', 'staff'];
const MAGIC_KEYS = ['fire', 'ice', 'lightning', 'wind', 'light', 'dark'];

class MemorySource {
  constructor(getBaselineState, onStateParsed) {
    this.getBaselineState = getBaselineState;
    this.onStateParsed = onStateParsed;
    this.worker = null;
    this.retryTimer = null;
    this.attachedAddress = null;
    this.liveZoneAddress = null;
  }

  isAttached() {
    return Boolean(this.attachedAddress);
  }

  decodeSnapshot(snap, baseline) {
    const partyBuf = Buffer.from(snap.partyB64, 'base64');
    const party = [];
    for (let i = 0; i < 4; i++) {
      const charId = partyBuf.readInt32LE(i * 4);
      if (charId >= 0 && CHARACTER_NAMES[charId]) {
        party.push({ id: charId, name: CHARACTER_NAMES[charId] });
      }
    }

    // Decode EnemyInfoData (stride 8: byte 0 = isAnalysed, byte 4 = wOpen, byte 5 = mOpen)
    const enemyBuf = Buffer.from(snap.enemyB64, 'base64');
    const currentZoneId = snap.levelId || baseline?.currentZoneId;

    // Merge verified live in-battle reveals (strictly filtered to current zone's valid monsters + Caits)
    const validZoneMonsters = new Set(zonesDb[currentZoneId]?.monsters || []);
    if (snap.liveReveals && Array.isArray(snap.liveReveals)) {
      for (const rev of snap.liveReveals) {
        const isCait = rev.id >= 416 && rev.id <= 418;
        if (!validZoneMonsters.has(rev.id) && !isCait) {
          continue; // Discard stale ghost actor from a past zone!
        }
        const offset = rev.id * 8;
        if (offset + 6 <= enemyBuf.length) {
          enemyBuf[offset + 4] |= rev.w;
          enemyBuf[offset + 5] |= rev.m;
        }
      }
    }

    const monsters = {};
    let strategistCompleted = 0;
    const strategistTotal = Object.keys(monstersDb).length;

    for (const [idStr, mInfo] of Object.entries(monstersDb)) {
      const id = Number(idStr);
      const offset = id * 8;
      if (offset + 6 > enemyBuf.length) continue;

      const isAnalysed = enemyBuf.readUInt8(offset) !== 0;
      const wOpen = enemyBuf.readUInt8(offset + 4);
      const mOpen = enemyBuf.readUInt8(offset + 5);
      const isCompleted = wOpen === mInfo.weaponMask && mOpen === mInfo.magicMask;
      if (isCompleted) strategistCompleted++;

      const revealedMap = {};
      for (let bit = 0; bit < 6; bit++) {
        if (((mInfo.weaponMask >> bit) & 1) !== 0) {
          revealedMap[WEAPON_KEYS[bit]] = ((wOpen >> bit) & 1) !== 0;
        }
        if (((mInfo.magicMask >> bit) & 1) !== 0) {
          revealedMap[MAGIC_KEYS[bit]] = ((mOpen >> bit) & 1) !== 0;
        }
      }

      monsters[id] = {
        isAnalysed,
        isCompleted,
        revealedWeaknesses: mInfo.weaknesses.map(k => Boolean(revealedMap[k])),
        revealedByKey: revealedMap
      };
    }

    // Decode VisitedMap
    const visitedBuf = Buffer.from(snap.visitedB64, 'base64');
    const visitedSet = new Set();
    let bitId = 0;
    for (let i = 0; i < visitedBuf.length; i++) {
      const b = visitedBuf.readUInt8(i);
      for (let bit = 0; bit < 8; bit++, bitId++) {
        if (((b >> bit) & 1) !== 0) {
          visitedSet.add(bitId);
        }
      }
    }

    // Decode MapData (zones 12..196)
    // In RAM, byte 0 is 0 padding, bytes 1..chestCount are chests, bytes 1+chestCount..summation are hidden items!
    const zones = {};
    let visitedZonesCount = 0;
    const totalZonesCount = Object.keys(zonesDb).length;

    for (const [idStr, zInfo] of Object.entries(zonesDb)) {
      const id = Number(idStr);
      const visited = visitedSet.has(id);
      if (visited) visitedZonesCount++;

      const chestsOpened = [];
      const hiddenItemsFound = [];
      const zB64 = snap.zones?.[idStr];

      if (zB64 && zInfo.summation > 0) {
        const zBuf = Buffer.from(zB64, 'base64');
        for (let j = 0; j < zInfo.summation; j++) {
          const opened = zBuf.readUInt8(1 + j) !== 0;
          if (j < zInfo.chestCount) {
            chestsOpened.push(opened);
          } else {
            hiddenItemsFound.push(opened);
          }
        }
      } else if (baseline?.zones?.[idStr]) {
        chestsOpened.push(...baseline.zones[idStr].chestsOpened);
        hiddenItemsFound.push(...baseline.zones[idStr].hiddenItemsFound);
      }

      zones[id] = {
        visited,
        chestsOpened,
        hiddenItemsFound,
        isChestsComplete: chestsOpened.every(Boolean),
        isHiddenComplete: hiddenItemsFound.every(Boolean)
      };
    }

    // Decode ItemFlag (Collector)
    const itemFlagBuf = Buffer.from(snap.itemFlagB64, 'base64');
    const itemsObtainedSet = new Set();
    for (let i = 0; i < itemFlagBuf.length / 4; i++) {
      const flags = itemFlagBuf.readUInt32LE(i * 4);
      for (let bit = 0; bit < 32; bit++) {
        const itemId = i * 32 + bit;
        if (itemId > 0 && ((flags >>> bit) & 1) === 1) {
          itemsObtainedSet.add(itemId);
        }
      }
    }

    // Mutually exclusive mask group (Primrose Ch 2): items 325, 326, 327.
    // Exactly 1 of the 3 can be obtained in a single playthrough.
    const EXCLUSIVE_GROUP_MASKS = [325, 326, 327];
    const hasExclusiveMask = EXCLUSIVE_GROUP_MASKS.some(id => itemsObtainedSet.has(id));

    let collectorObtainedCount = 0;
    let collectorTotalCount = 0;
    for (const [idStr, itemInfo] of Object.entries(itemsDb)) {
      if (!itemInfo.isCollectorRequired) continue;
      const id = Number(idStr);

      // Group the 3 masks into a single required achievement slot
      if (EXCLUSIVE_GROUP_MASKS.includes(id)) {
        if (id === EXCLUSIVE_GROUP_MASKS[0]) {
          collectorTotalCount += 1;
          if (hasExclusiveMask) {
            collectorObtainedCount += 1;
          }
        }
        continue;
      }

      collectorTotalCount++;
      if (itemsObtainedSet.has(id)) {
        collectorObtainedCount++;
      }
    }

    // Decode SubMissionData (Side Stories / Worth Your Salt)
    const REGIONS = [
      'Frostlands',
      'Flatlands',
      'Coastlands',
      'Highlands',
      'Sunlands',
      'Riverlands',
      'Cliftlands',
      'Woodlands'
    ];
    let sideStoriesByRegion = baseline?.sideStoriesByRegion || {};
    let worthYourSalt = baseline?.stats?.worthYourSalt || { completed: 0, inProgress: 0, total: 101 };

    if (snap.missionB64) {
      const mBuf = Buffer.from(snap.missionB64, 'base64');
      if (mBuf.length >= 400) {
        sideStoriesByRegion = {};
        let completed = 0;
        let inProgress = 0;
        for (let r = 0; r < 8; r++) {
          const entries = [];
          for (let s = 0; s < 25; s++) {
            const state = mBuf.readUInt8(r * 50 + s * 2);
            const clearMethod = mBuf.readUInt8(r * 50 + s * 2 + 1);
            if (state !== 0 || clearMethod !== 0) {
              if (state === 2) completed++;
              else if (state === 1) inProgress++;
              entries.push({ slotIndex: s, state, clearMethod });
            }
          }
          sideStoriesByRegion[REGIONS[r]] = entries;
        }
        worthYourSalt = { completed, inProgress, total: 101 };
      }
    }

    return {
      lastUpdated: new Date().toISOString(),
      currentZoneId,
      currentZoneName: zonesDb[currentZoneId]?.name || baseline?.currentZoneName,
      currentLevelName: `Live RAM (${this.liveZoneAddress || 'SaveObj'})`,
      ramAddress: this.attachedAddress,
      party,
      stats: {
        playTimeSeconds: snap.playTime,
        playTimeFormatted: `${Math.floor(snap.playTime / 3600)}h ${Math.floor((snap.playTime % 3600) / 60)}m`,
        battleCount: snap.battleCount,
        totalLeaf: snap.totalLeaf,
        strategist: { current: strategistCompleted, total: strategistTotal },
        treasureHunter: { current: snap.treasureCount, total: 734 },
        eagleEyed: { current: snap.hiddenPointCount, total: 152 },
        globetrotter: { current: visitedZonesCount, total: totalZonesCount },
        collector: { current: collectorObtainedCount, total: collectorTotalCount },
        worthYourSalt
      },
      monsters,
      zones,
      itemsObtained: [...itemsObtainedSet].sort((a, b) => a - b),
      sideStoriesByRegion
    };
  }

  start() {
    this.spawnWorker();
  }

  ensureCompiledWorker() {
    const csPath = path.join(__dirname, 'ramWorker.cs');
    const binDir = path.join(__dirname, 'bin');
    const exePath = path.join(binDir, 'ramWorker.exe');
    const cscPath = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe';

    if (!fs.existsSync(cscPath) || !fs.existsSync(csPath)) {
      return null;
    }

    try {
      if (!fs.existsSync(binDir)) {
        fs.mkdirSync(binDir, { recursive: true });
      }
      const needBuild =
        !fs.existsSync(exePath) ||
        fs.statSync(csPath).mtimeMs > fs.statSync(exePath).mtimeMs;

      if (needBuild) {
        execFileSync(cscPath, ['/nologo', '/optimize+', '/platform:x64', `/out:${exePath}`, csPath], {
          stdio: 'pipe'
        });
        console.log('[MemorySource] Compiled native ramWorker.exe helper');
      }
      return exePath;
    } catch (err) {
      console.warn('[MemorySource] Failed to compile ramWorker.exe, falling back to PowerShell:', err.message);
      return null;
    }
  }

  spawnWorker() {
    const exePath = this.ensureCompiledWorker();
    if (exePath) {
      this.worker = spawn(exePath, [String(process.pid)], { windowsHide: true });
    } else {
      const baseline = this.getBaselineState();
      const bc = baseline?.stats?.battleCount || 0;
      const tc = baseline?.stats?.treasureHunter?.current || 0;
      const hc = baseline?.stats?.eagleEyed?.current || 0;
      const scriptPath = path.join(__dirname, 'ramWorker.ps1');
      this.worker = spawn('powershell', [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        scriptPath,
        '-ParentPid',
        String(process.pid),
        '-BattleCount',
        String(bc),
        '-EscapeCount',
        '0',
        '-TreasureCount',
        String(tc),
        '-HiddenPointCount',
        String(hc)
      ]);
    }

    let buffer = '';
    this.worker.stdout.on('data', chunk => {
      buffer += chunk.toString();
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.trim().startsWith('{')) continue;
        try {
          const msg = JSON.parse(line.trim());
          if (msg.type === 'ATTACHED') {
            this.attachedAddress = msg.address;
            this.liveZoneAddress = msg.liveZoneAddress;
            console.log(
              `[MemorySource] Attached to Octopath Traveler PID ${msg.pid} (SaveObj=${msg.address}, LiveZone=${msg.liveZoneAddress})`
            );
          } else if (msg.type === 'DETACHED') {
            this.attachedAddress = null;
            this.liveZoneAddress = null;
            console.log('[MemorySource] Detached from Octopath Traveler process');
          } else if (msg.type === 'RAM_SNAPSHOT') {
            const state = this.decodeSnapshot(msg, this.getBaselineState());
            this.onStateParsed(state, 'live-ram');
          }
        } catch (err) {
          console.error('[MemorySource] Parse error:', err.message);
        }
      }
    });

    this.worker.on('error', err => {
      console.warn('[MemorySource] Worker process error:', err.message);
    });

    this.worker.on('exit', () => {
      this.attachedAddress = null;
      this.worker = null;
      this.retryTimer = setTimeout(() => this.spawnWorker(), 5000);
    });
  }

  stop() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.worker) this.worker.kill();
  }
}

module.exports = { MemorySource };
