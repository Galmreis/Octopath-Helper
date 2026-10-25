const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const INFO_XML_DIR = path.join(ROOT, '_references/info_xml/xl');
const CSV_DIR = path.join(ROOT, 'CSVRefs');
const DATA_DIR = path.join(ROOT, 'data');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// --- 1. Read info.xlsx XML sheets ---
const ssXml = fs.readFileSync(path.join(INFO_XML_DIR, 'sharedStrings.xml'), 'utf8');
const sharedStrings = [...ssXml.matchAll(/<si>(.*?)<\/si>/gs)].map(m =>
  [...m[1].matchAll(/<t[^>]*>(.*?)<\/t>/gs)]
    .map(t => t[1])
    .join('')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
);

const wbXml = fs.readFileSync(path.join(INFO_XML_DIR, 'workbook.xml'), 'utf8');
const sheetDefs = [...wbXml.matchAll(/<sheet name="([^"]+)" sheetId="(\d+)"[^>]*r:id="rId(\d+)"/g)];

const excelDb = {};
for (const [, name, , rId] of sheetDefs) {
  const xml = fs.readFileSync(path.join(INFO_XML_DIR, `worksheets/sheet${rId}.xml`), 'utf8');
  const rows = [...xml.matchAll(/<row[^>]*>(.*?)<\/row>/gs)].map(r => {
    const cells = {};
    for (const c of r[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*)>(?:<v>(.*?)<\/v>)?/gs)) {
      cells[c[1]] = c[2].includes('t="s"') ? sharedStrings[Number(c[3])] : c[3];
    }
    return cells;
  });
  excelDb[name] = rows.slice(1);
}

// --- 2. CSV Parser ---
function parseCSV(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const rows = [];
  let row = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(cur.trim());
        cur = '';
      } else if (ch === '\n' || (ch === '\r' && text[i + 1] === '\n')) {
        if (ch === '\r') i++;
        row.push(cur.trim());
        rows.push(row);
        row = [];
        cur = '';
      } else {
        cur += ch;
      }
    }
  }
  if (cur.length > 0 || row.length > 0) {
    row.push(cur.trim());
    rows.push(row);
  }
  return rows;
}

function normalizeName(str) {
  let s = (str || '')
    .toLowerCase()
    .replace(/&apos;/g, "'")
    .replace(/['’]/g, '')
    .replace(/mk\.2/g, 'mk.ii')
    .replace(/\bseabird/g, 'sea bird')
    .replace(/\bmaster thief\b/g, 'thief')
    .replace(/\s*\(2\)\s*$/g, '');

  // Normalize Roman numerals at end of name or word boundary (e.g. "birdian vi" -> "birdian 6")
  s = s.replace(/\bvi\b/g, '6')
       .replace(/\bv\b/g, '5')
       .replace(/\biv\b/g, '4')
       .replace(/\biii\b/g, '3')
       .replace(/\bii\b/g, '2')
       .replace(/\bi\b/g, '1');

  return s
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeLocationString(locStr) {
  if (!locStr) return [];
  const cleaned = locStr
    .replace(/Untouched Sanctum \(15\) Farshore \(30\)/g, 'Untouched Sanctum (15), Farshore (30)')
    .replace(/Northen Flamegrace Wilds/g, 'Northern Flamesgrace Wilds');
  return cleaned.split(',').map(s => s.trim()).filter(Boolean);
}

// --- 3. Parse Enemies.csv & Checklist.csv for Monster Metadata ---
const enemiesCsv = parseCSV(path.join(CSV_DIR, 'Copy of Octopath Traveler Resource - Enemies.csv'));
const csvEnemiesByNorm = new Map();
for (const r of enemiesCsv) {
  if (r[1] === 'FALSE' || r[1] === 'TRUE') {
    const rawName = r[2].split('\n')[0].trim();
    const norm = normalizeName(rawName);
    const newLocs = normalizeLocationString(r[15]);
    const existing = csvEnemiesByNorm.get(norm);
    if (existing) {
      if (newLocs.length > 0) {
        existing.locations = Array.from(new Set([...existing.locations, ...newLocs]));
      }
      if (!existing.shields && r[3]) existing.shields = r[3];
      if (!existing.stealDrop && r[9]) existing.stealDrop = r[9];
      if (!existing.summonStrength && r[11]) existing.summonStrength = r[11];
      if (!existing.summonSkill && r[13]) existing.summonSkill = r[13];
    } else {
      csvEnemiesByNorm.set(norm, {
        csvName: rawName,
        shields: r[3] || null,
        stealDrop: r[9] || null,
        summonStrength: r[11] || null,
        summonSkill: r[13] || null,
        locations: newLocs
      });
    }
  }
}

const WEAPON_KEYS = ['sword', 'polearm', 'dagger', 'axe', 'bow', 'staff'];
const MAGIC_KEYS = ['fire', 'ice', 'lightning', 'wind', 'light', 'dark'];

function decodeMaskToKeys(maskStr, keys) {
  if (!maskStr || maskStr === '0' || maskStr === '000000') return [];
  const num = parseInt(maskStr, 2);
  const out = [];
  for (let bit = 0; bit < 6; bit++) {
    if (((num >> bit) & 1) !== 0) {
      out.push(keys[bit]);
    }
  }
  return out;
}

const monsters = {};
for (const row of excelDb.enemy_weakness) {
  if (!row.A || !row.B) continue;
  const id = Number(row.A);
  const wMask = !row.C || row.C === '0' || row.C === '000000' ? 0 : parseInt(row.C, 2);
  const mMask = !row.D || row.D === '0' || row.D === '000000' ? 0 : parseInt(row.D, 2);
  const isAchievementRequired = wMask !== 0 || mMask !== 0;
  if (!isAchievementRequired) continue;

  const norm = normalizeName(row.B);
  const csvMeta = csvEnemiesByNorm.get(norm) || {};
  const weaponWeaknesses = decodeMaskToKeys(row.C, WEAPON_KEYS);
  const magicWeaknesses = decodeMaskToKeys(row.D, MAGIC_KEYS);

  // Check if enemy only appears in chapter story dungeons or temporary areas
  const locs = csvMeta.locations || [];
  const isChapterExclusive =
    row.B.includes('Ravus') ||
    row.B.includes("Morlock's") ||
    row.B.includes("Werner's") ||
    row.B.includes('Believer') ||
    row.B.includes('Bandit') ||
    row.B.includes('Pirate') ||
    row.B.includes('Ruffian') ||
    row.B.includes('Mercenary') ||
    row.B.includes('Lackey') ||
    row.B.includes('Bodyguard') ||
    row.B.includes('Sentinel');

  monsters[id] = {
    id,
    name: row.B,
    weaponMask: wMask,
    magicMask: mMask,
    weaknesses: [...weaponWeaknesses, ...magicWeaknesses],
    weaponWeaknesses,
    magicWeaknesses,
    shields: csvMeta.shields || null,
    stealDrop: csvMeta.stealDrop || null,
    locations: locs,
    isAchievementRequired: true,
    isMissable: isChapterExclusive
  };
}

// --- 4. Parse Checklist.csv for Zones, Chest Contents, Hidden Items, and Missable Warnings ---
const checklistRows = parseCSV(path.join(CSV_DIR, 'Copy of Octopath Traveler Resource - Checklist.csv'));
const REGIONS = new Set(['Frostlands', 'Flatlands', 'Coastlands', 'Highlands', 'Sunlands', 'Riverlands', 'Cliftlands', 'Woodlands']);

const csvChestZones = [];
const csvHiddenZones = [];
const missableNotes = [];

let curRegion = '';
let curChestZone = null;
let curHiddenZone = null;

for (const r of checklistRows) {
  if (REGIONS.has(r[0])) {
    curRegion = r[0];
  }
  const col14 = r[14] || '';
  const col15 = r[15] || '';
  if (col14 && col14 !== 'FALSE' && col14 !== 'TRUE' && col14.includes('Chest)')) {
    const m = col14.match(/^(.*?)\s*\((\d+)\s*Chest\)$/i);
    if (m) {
      curChestZone = {
        region: curRegion,
        name: m[1].trim(),
        expectedCount: Number(m[2]),
        chests: []
      };
      csvChestZones.push(curChestZone);
    }
  } else if ((col14 === 'FALSE' || col14 === 'TRUE') && col15 && curChestZone) {
    const isLocked = /\(locked\)/i.test(col15);
    curChestZone.chests.push({
      index: curChestZone.chests.length,
      contents: col15.replace(/\s*\(locked\)/i, '').trim(),
      rawLabel: col15,
      isLocked
    });
  }

  const col19 = r[19] || '';
  const col20 = r[20] || '';
  const col21 = r[21] || '';
  if (col19 && col19 !== 'FALSE' && col19 !== 'TRUE' && !col19.includes('Eagle-Eyed') && !col19.includes('Chapter')) {
    curHiddenZone = {
      region: curRegion,
      name: col19.trim(),
      hiddenItems: []
    };
    csvHiddenZones.push(curHiddenZone);
  } else if ((col19 === 'FALSE' || col19 === 'TRUE') && col20 && curHiddenZone) {
    curHiddenZone.hiddenItems.push({
      index: curHiddenZone.hiddenItems.length,
      contents: col20,
      note: col21 || null,
      isMissable: Boolean(col21)
    });
  }

  // Column 23/24/25: Other Missable / Limited notes
  const col23 = r[23] || '';
  const col24 = r[24] || '';
  const col25 = r[25] || '';
  if ((col23 === 'FALSE' || col23 === 'TRUE') && col24) {
    missableNotes.push({
      region: curRegion,
      target: col24,
      note: col25 || null
    });
  }
}

// Map info.xlsx places & treasure_states (indexed by LevelID 12..196)
function getRegionByZoneId(id) {
  if (id >= 12 && id <= 33) return 'Highlands';
  if (id >= 34 && id <= 55) return 'Sunlands';
  if (id >= 56 && id <= 75) return 'Riverlands';
  if (id >= 76 && id <= 93) return 'Flatlands';
  if (id >= 94 && id <= 113) return 'Cliftlands';
  if (id >= 114 && id <= 136) return 'Coastlands';
  if (id >= 137 && id <= 157) return 'Frostlands';
  if (id >= 158 && id <= 178) return 'Woodlands';
  if (id >= 179 && id <= 190) return 'Job Shrines';
  if (id >= 193 && id <= 196) return 'Post-Game (Hornburg & Finis)';
  return 'Other';
}

function normZoneKey(name) {
  return (name || '')
    .toLowerCase()
    .replace(/①/g, ' 1')
    .replace(/②/g, ' 2')
    .replace(/\(\d+\)/g, m => {
      // In Checklist.csv, first floor is (45) or (34) or (40) or (48), second floor is (46) or (36) or (50)
      return m;
    })
    .replace(/wispermill/g, 'whispermill')
    .replace(/wisperwood/g, 'whisperwood')
    .replace(/amphitheatre/g, 'amphitheater')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Build zones dictionary keyed by LevelID (12..196)
const zones = {};
for (let i = 0; i < excelDb.place.length; i++) {
  const p = excelDb.place[i];
  const t = excelDb.treasure_states[i] || {};
  const id = Number(p.A);
  let name = p.B || t.B;
  if (!id) continue;

  if (id === 193) name = 'Path to the Ruins of Hornburg';
  if (id === 194) name = 'Ruins of Hornburg';
  if (!name || name.includes('ㄒoㄒ')) continue;

  const chestCount = Number(t.D || 0);
  const hiddenCount = Number(t.E || 0);
  const summation = Number(t.C || 0);
  const treasureStateId = Number(p.D || t.A || 0);
  const region = getRegionByZoneId(id);

  let tips = t.F || null;
  if (id === 194) tips = 'Threshold to the Gate of Finis (No random encounters. Boss gauntlet lies beyond the Gate).';
  if (id === 193) tips = 'Approach to the Ruins of Hornburg.';

  zones[id] = {
    id,
    name,
    region,
    treasureStateId,
    summation,
    chestCount,
    hiddenCount,
    tips,
    isMissable: Boolean(tips && /missable/i.test(tips)),
    chests: [],
    hiddenItems: []
  };
}

// Match CSV chest lists into zones where names match 1-to-1 or sequentially for multi-part towns/dungeons
const csvChestsByNorm = new Map();
for (const cz of csvChestZones) {
  let key = cz.name
    .toLowerCase()
    .replace(/wispermill/g, 'whispermill')
    .replace(/wisperwood/g, 'whisperwood')
    .replace(/\s*\((?:45|34)\)\s*$/, ' 1')
    .replace(/\s*\((?:46|36)\)\s*$/, ' 2')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  csvChestsByNorm.set(key, [...cz.chests]);
}

const csvHiddenByNorm = new Map();
for (const hz of csvHiddenZones) {
  let key = hz.name
    .toLowerCase()
    .replace(/wispermill/g, 'whispermill')
    .replace(/wisperwood/g, 'whisperwood')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  csvHiddenByNorm.set(key, [...hz.hiddenItems]);
}

const SUBZONE_TO_CSV_CHEST_TOWN = {
  'everhold amphitheater': 'amphitheater',
  'lower riverford': 'riverford',
  'east noblecourt': 'noblecourt',
  'ravus manor gate': 'bolderfall'
};

const SUBZONE_TO_CSV_HIDDEN_TOWN = {
  'everhold amphitheater': 'everhold',
  'lower riverford': 'riverford',
  'east noblecourt': 'noblecourt',
  'ravus manor gate': 'bolderfall'
};

for (const z of Object.values(zones)) {
  const zKey = normZoneKey(z.name);
  const mappedChestKey = SUBZONE_TO_CSV_CHEST_TOWN[zKey] || zKey;
  const mappedHiddenKey = SUBZONE_TO_CSV_HIDDEN_TOWN[zKey] || zKey;

  let chestSource = csvChestsByNorm.get(mappedChestKey);
  if (!chestSource) {
    for (const [k, arr] of csvChestsByNorm.entries()) {
      if (mappedChestKey.startsWith(k + ' ') && arr.length >= z.chestCount) {
        chestSource = arr;
        break;
      }
    }
  }
  for (let c = 0; c < z.chestCount; c++) {
    const item = chestSource && chestSource.length > 0 ? chestSource.shift() : null;
    z.chests.push({
      index: c,
      contents: item ? item.contents : `Chest #${c + 1}`,
      isLocked: item ? item.isLocked : false
    });
  }

  let hiddenSource = csvHiddenByNorm.get(mappedHiddenKey);
  if (!hiddenSource) {
    for (const [k, arr] of csvHiddenByNorm.entries()) {
      if (mappedHiddenKey.startsWith(k + ' ') && arr.length >= z.hiddenCount) {
        hiddenSource = arr;
        break;
      }
    }
  }
  for (let h = 0; h < z.hiddenCount; h++) {
    const item = hiddenSource && hiddenSource.length > 0 ? hiddenSource.shift() : null;
    z.hiddenItems.push({
      index: h,
      contents: item ? item.contents : `Hidden Item #${h + 1}`,
      note: item ? item.note : z.tips,
      isMissable: item ? item.isMissable : z.isMissable
    });
  }
}

// Populate z.monsters for each zone by matching monster locations to zone names
for (const z of Object.values(zones)) {
  const zBase = normZoneKey(z.name).replace(/\s+[12]$/, '');
  const zoneMonsters = [];
  for (const m of Object.values(monsters)) {
    for (const loc of m.locations) {
      const locBase = normZoneKey(loc.replace(/\([^)]*\)/g, ''));
      if (locBase && (locBase === zBase || zBase.startsWith(locBase + ' '))) {
        zoneMonsters.push(m.id);
        break;
      }
    }
  }
  z.monsters = zoneMonsters;
}

// --- 5. Items (Collector) ---
const items = {};
for (const row of excelDb.item_inventory) {
  if (!row.A || !row.B) continue;
  const id = Number(row.A);
  const type = Number(row.C);
  const typeName = row.D;
  // Type 14 is Knowledge (Inquire/Scrutinize info, not required for Collector achievement)
  // IDs 325, 326, 327 are Primrose Ch.2 masks where only 1 of 3 is obtainable
  const isCollectorRequired = type !== 14;
  items[id] = {
    id,
    name: row.B,
    categoryId: type,
    category: typeName,
    isCollectorRequired,
    isMutuallyExclusiveChoice: id === 325 || id === 326 || id === 327
  };
}

// --- 6. Quests (Side Stories / Worth Your Salt) ---
// Internal SubMissionData slot indices per region in UKSSaveGameBP_C
const QUEST_SLOT_INDICES_BY_SAVE_REGION = {
  Frostlands: [1, 2, 5, 6, 7, 8, 9, 10, 12, 13, 14, 15, 16],
  Flatlands: [0, 4, 5, 6, 7, 9, 10, 11, 13, 14, 15, 17],
  Coastlands: [1, 2, 4, 5, 6, 8, 9, 12, 13, 14, 15, 17],
  Highlands: [0, 1, 3, 5, 6, 7, 10, 11, 12, 13, 14, 18],
  Sunlands: [0, 2, 3, 5, 6, 7, 9, 10, 11, 12, 13, 14],
  Riverlands: [0, 1, 2, 3, 4, 5, 8, 9, 11, 12, 13, 14, 15, 16, 17, 18],
  Cliftlands: [3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 16],
  Woodlands: [0, 1, 3, 4, 6, 7, 9, 10, 12, 13, 14, 16]
};
const regionSlotCounters = {};

const questsCsv = parseCSV(path.join(CSV_DIR, 'Copy of Octopath Traveler Resource - Quests.csv'));
const quests = [];
let qRegion = 'Starting Town';
let qTown = 'Outside Starting Town';
for (const r of questsCsv) {
  if (REGIONS.has(r[0])) {
    qRegion = r[0];
  } else if (r[1] && r[1] !== 'FALSE' && r[1] !== 'TRUE' && !r[2]) {
    qTown = r[1];
  } else if ((r[1] === 'FALSE' || r[1] === 'TRUE') && r[2]) {
    const saveRegion = qRegion === 'Starting Town' ? 'Riverlands' : qRegion;
    const idxInReg = regionSlotCounters[saveRegion] || 0;
    regionSlotCounters[saveRegion] = idxInReg + 1;
    const slotList = QUEST_SLOT_INDICES_BY_SAVE_REGION[saveRegion] || [];
    const slotIndex = slotList[idxInReg] !== undefined ? slotList[idxInReg] : idxInReg;

    quests.push({
      id: quests.length + 1,
      region: qRegion,
      saveRegion,
      slotIndex,
      town: qTown,
      name: r[2],
      npc: r[3] || null,
      solution: r[4] || null,
      reward: r[5] || null
    });
  }
}

// Link quests to zones by matching quest town name to zone name
for (const z of Object.values(zones)) {
  const zNorm = normZoneKey(z.name);
  const matchingQuestIds = [];
  for (const q of quests) {
    const qTownClean = normZoneKey(q.town.replace(/\([^)]*\)/g, ''));
    if (!qTownClean) continue;
    if (
      zNorm === qTownClean ||
      zNorm.startsWith(qTownClean + ' ') ||
      zNorm.endsWith(' ' + qTownClean)
    ) {
      matchingQuestIds.push(q.id);
    }
  }
  z.quests = matchingQuestIds;
}

// Starting town paths where Kit waits for the player after completing traveler Chapter 1
const STARTING_GATE_ZONE_IDS = [20, 36, 58, 79, 98, 116, 141, 160];
for (const gid of STARTING_GATE_ZONE_IDS) {
  if (zones[gid] && !zones[gid].quests.includes(1)) {
    zones[gid].quests.push(1);
  }
}

fs.writeFileSync(path.join(DATA_DIR, 'monsters.json'), JSON.stringify(monsters, null, 2));
fs.writeFileSync(path.join(DATA_DIR, 'zones.json'), JSON.stringify(zones, null, 2));
fs.writeFileSync(path.join(DATA_DIR, 'items.json'), JSON.stringify(items, null, 2));
fs.writeFileSync(path.join(DATA_DIR, 'quests.json'), JSON.stringify(quests, null, 2));
fs.writeFileSync(path.join(DATA_DIR, 'missableNotes.json'), JSON.stringify(missableNotes, null, 2));

console.log(`Generated static database in ${DATA_DIR}:`);
console.log(`- monsters.json: ${Object.keys(monsters).length} Strategist monsters`);
console.log(`- zones.json: ${Object.keys(zones).length} zones`);
console.log(`- items.json: ${Object.keys(items).length} items (${Object.values(items).filter(i => i.isCollectorRequired).length} Collector-relevant)`);
console.log(`- quests.json: ${quests.length} side stories`);
console.log(`- missableNotes.json: ${missableNotes.length} missable/limited notes`);
