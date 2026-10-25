const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const DATA_DIR = path.join(ROOT, 'data');

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

function findAll(buf, needleStr, start = 0) {
  const needle = Buffer.from(needleStr, 'ascii');
  const results = [];
  let pos = start;
  while (pos <= buf.length - needle.length) {
    const idx = buf.indexOf(needle, pos);
    if (idx === -1) break;
    results.push(idx);
    pos = idx + needle.length;
  }
  return results;
}

function readIntProperty(buf, propName, startOffset = 0) {
  const idx = buf.indexOf(Buffer.from(propName + '\x00', 'ascii'), startOffset);
  if (idx === -1) return null;
  const typeLen = buf.readUInt32LE(idx + propName.length + 1);
  const valOffset = idx + propName.length + 1 + 4 + typeLen + 8 + 1;
  return buf.readInt32LE(valOffset);
}

function readIntArrayAt(buf, propAddr) {
  const keyLen = buf.readUInt32LE(propAddr - 4);
  let p = propAddr + keyLen;
  const typeLen = buf.readUInt32LE(p);
  p += 4 + typeLen + 8; // skip ArrayProperty\0 + 8-byte byteSize
  const subTypeLen = buf.readUInt32LE(p);
  p += 4 + subTypeLen + 1; // skip IntProperty\0 + 1-byte tag
  const count = buf.readUInt32LE(p);
  p += 4;
  return { address: p, count };
}

function parseSaveBuffer(buf) {
  // 1. Current Player Location
  const locIdx = buf.indexOf(Buffer.from('PlayerLocation\x00', 'ascii'));
  const currentZoneId = locIdx !== -1 ? readIntProperty(buf, 'LevelID', locIdx) : null;
  let currentLevelName = null;
  if (locIdx !== -1) {
    const lvlNameIdx = buf.indexOf(Buffer.from('LevelName\x00', 'ascii'), locIdx);
    if (lvlNameIdx !== -1) {
      const typeLen = buf.readUInt32LE(lvlNameIdx + 10);
      const strLenOffset = lvlNameIdx + 10 + 4 + typeLen + 8 + 1;
      const strLen = buf.readUInt32LE(strLenOffset);
      currentLevelName = buf.slice(strLenOffset + 4, strLenOffset + 4 + strLen - 1).toString('ascii');
    }
  }

  // 2. Active Party
  const mainMemberAddr = findAll(buf, 'MainMemberID_')[0];
  const party = [];
  if (mainMemberAddr !== undefined) {
    const arr = readIntArrayAt(buf, mainMemberAddr);
    for (let i = 0; i < Math.min(4, arr.count); i++) {
      const charId = buf.readInt32LE(arr.address + i * 4);
      if (charId >= 0 && CHARACTER_NAMES[charId]) {
        party.push({ id: charId, name: CHARACTER_NAMES[charId] });
      }
    }
  }

  // 3. Global Stats & Achievement Counters
  const achieveIdx = buf.indexOf(Buffer.from('Achievement\x00', 'ascii'));
  const playTimeSeconds = readIntProperty(buf, 'PlayTime') || 0;
  const battleCount = achieveIdx !== -1 ? readIntProperty(buf, 'BattleCount', achieveIdx) : 0;
  const treasureCount = achieveIdx !== -1 ? readIntProperty(buf, 'TreasureCount', achieveIdx) : 0;
  const hiddenPointCount = achieveIdx !== -1 ? readIntProperty(buf, 'HiddenPointCount', achieveIdx) : 0;
  const totalLeaf = achieveIdx !== -1 ? readIntProperty(buf, 'TotalLeaf', achieveIdx) : 0;

  // 4. Strategist (381 Monsters)
  const isAnalyseAddrs = findAll(buf, 'IsAnalyse_');
  const monsters = {};
  let strategistCompleted = 0;
  const strategistTotal = Object.keys(monstersDb).length;

  for (const [idStr, mInfo] of Object.entries(monstersDb)) {
    const id = Number(idStr);
    const addr = isAnalyseAddrs[id];
    if (addr === undefined) continue;

    // IsAnalyse BoolProperty value is at keyLen + 4 + typeLen + 10
    const analyseKeyLen = buf.readUInt32LE(addr - 4);
    const analyseTypeLen = buf.readUInt32LE(addr + analyseKeyLen);
    const isAnalysed = buf.readUInt8(addr + analyseKeyLen + 4 + analyseTypeLen + 9) !== 0;

    const weakAddr = buf.indexOf(Buffer.from('WeaknessOpen_', 'ascii'), addr);
    const weakKeyLen = buf.readUInt32LE(weakAddr - 4);
    const weakTypeLen = buf.readUInt32LE(weakAddr + weakKeyLen);
    const valAddr = weakAddr + weakKeyLen + 4 + weakTypeLen + 9;

    const wOpen = buf.readUInt8(valAddr);
    const mOpen = buf.readUInt8(valAddr + 1);
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

  // 5. Globetrotter (VisitedMap) & Treasure Hunter / Eagle-Eyed (TreasureStateArray)
  const visitedAddr = findAll(buf, 'VisitedMap\x00')[0];
  const visitedArr = readIntArrayAt(buf, visitedAddr);
  const visitedSet = new Set();
  let bitId = 0;
  for (let i = 0; i < visitedArr.count; i++) {
    for (let byteOffset = 0; byteOffset < 4; byteOffset++) {
      const b = buf.readUInt8(visitedArr.address + i * 4 + byteOffset);
      for (let bit = 0; bit < 8; bit++, bitId++) {
        if (((b >> bit) & 1) !== 0) {
          visitedSet.add(bitId);
        }
      }
    }
  }

  const treasureAddrs = findAll(buf, 'TreasureStateArray');
  const diff = treasureAddrs[12] - 1257303;
  const addrByTreasureId = new Map();
  for (let i = 12; i < treasureAddrs.length; i++) {
    addrByTreasureId.set(treasureAddrs[i] - diff, treasureAddrs[i]);
  }

  const zones = {};
  let visitedZonesCount = 0;
  const totalZonesCount = Object.keys(zonesDb).length;

  for (const [idStr, zInfo] of Object.entries(zonesDb)) {
    const id = Number(idStr);
    const visited = visitedSet.has(id);
    if (visited) visitedZonesCount++;

    const chestsOpened = [];
    const hiddenItemsFound = [];
    const tAddr = addrByTreasureId.get(zInfo.treasureStateId);

    if (tAddr !== undefined && zInfo.summation > 0) {
      const baseAddr = tAddr + 100 + 3;
      for (let j = 0; j < zInfo.summation; j++) {
        const opened = buf.readUInt8(baseAddr + j) !== 0;
        if (j < zInfo.chestCount) {
          chestsOpened.push(opened);
        } else {
          hiddenItemsFound.push(opened);
        }
      }
    }

    zones[id] = {
      visited,
      chestsOpened,
      hiddenItemsFound,
      isChestsComplete: chestsOpened.every(Boolean),
      isHiddenComplete: hiddenItemsFound.every(Boolean)
    };
  }

  // 6. Collector (ItemFlag in Achievement)
  const itemFlagAddr = findAll(buf, 'ItemFlag\x00', achieveIdx)[0];
  const itemFlagArr = readIntArrayAt(buf, itemFlagAddr);
  const itemsObtainedSet = new Set();
  for (let i = 0; i < itemFlagArr.count; i++) {
    const flags = buf.readUInt32LE(itemFlagArr.address + i * 4);
    for (let bit = 0; bit < 32; bit++) {
      const itemId = i * 32 + bit;
      if (itemId > 0 && ((flags >>> bit) & 1) === 1) {
        itemsObtainedSet.add(itemId);
      }
    }
  }

  let collectorObtainedCount = 0;
  let collectorTotalCount = 0;
  for (const [idStr, itemInfo] of Object.entries(itemsDb)) {
    if (!itemInfo.isCollectorRequired) continue;
    collectorTotalCount++;
    if (itemsObtainedSet.has(Number(idStr))) {
      collectorObtainedCount++;
    }
  }

  // 7. Side Stories (Worth Your Salt)
  const REGIONS = ['Frostlands', 'Flatlands', 'Coastlands', 'Highlands', 'Sunlands', 'Riverlands', 'Cliftlands', 'Woodlands'];
  const missionStates = findAll(buf, 'MissionState_');
  const clearIndices = findAll(buf, 'ClearIndex_');
  const sideStoriesByRegion = {};
  let sideStoriesCompleted = 0;
  let sideStoriesInProgress = 0;

  for (let c = 0; c < Math.min(REGIONS.length, missionStates.length); c++) {
    const stateArr = readIntArrayAt(buf, missionStates[c]);
    const clearArr = readIntArrayAt(buf, clearIndices[c]);
    const entries = [];
    for (let j = 0; j < stateArr.count; j++) {
      const state = buf.readUInt32LE(stateArr.address + j * 4);
      const clearMethod = buf.readUInt32LE(clearArr.address + j * 4);
      if (state !== 0 || clearMethod !== 0) {
        if (state === 2) sideStoriesCompleted++;
        else if (state === 1) sideStoriesInProgress++;
        entries.push({ slotIndex: j, state, clearMethod });
      }
    }
    sideStoriesByRegion[REGIONS[c]] = entries;
  }

  return {
    lastUpdated: new Date().toISOString(),
    currentZoneId,
    currentZoneName: zonesDb[currentZoneId]?.name || currentLevelName,
    currentLevelName,
    party,
    stats: {
      playTimeSeconds,
      playTimeFormatted: `${Math.floor(playTimeSeconds / 3600)}h ${Math.floor((playTimeSeconds % 3600) / 60)}m`,
      battleCount,
      totalLeaf,
      strategist: { current: strategistCompleted, total: strategistTotal },
      treasureHunter: { current: treasureCount, total: 734 },
      eagleEyed: { current: hiddenPointCount, total: 152 },
      globetrotter: { current: visitedZonesCount, total: totalZonesCount },
      collector: { current: collectorObtainedCount, total: collectorTotalCount },
      worthYourSalt: { completed: sideStoriesCompleted, inProgress: sideStoriesInProgress, total: 101 }
    },
    monsters,
    zones,
    itemsObtained: [...itemsObtainedSet].sort((a, b) => a - b),
    sideStoriesByRegion
  };
}

function parseSaveFile(filePath) {
  const buf = fs.readFileSync(filePath);
  return parseSaveBuffer(buf);
}

if (require.main === module) {
  const targetSav = process.argv[2] || path.join(ROOT, 'SaveData0.sav');
  const parsed = parseSaveFile(targetSav);
  const outPath = path.join(DATA_DIR, 'mockSaveData.json');
  fs.writeFileSync(outPath, JSON.stringify(parsed, null, 2));
  console.log(`Parsed ${targetSav} -> ${outPath}`);
  console.log('Summary Stats:', JSON.stringify(parsed.stats, null, 2));
}

module.exports = { parseSaveFile, parseSaveBuffer };
