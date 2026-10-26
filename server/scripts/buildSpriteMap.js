const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const MONSTERS_PATH = path.join(ROOT_DIR, 'data', 'monsters.json');
const OUTPUT_PATH = path.join(ROOT_DIR, 'data', 'monsterSprites.json');
const CHAR_OUTPUT_PATH = path.join(ROOT_DIR, 'data', 'characterIcons.json');

const monstersData = JSON.parse(fs.readFileSync(MONSTERS_PATH, 'utf8'));
const monsters = Array.isArray(monstersData) ? monstersData : Object.values(monstersData);

console.log(`[SpriteMapper] Loaded ${monsters.length} monsters from static data.`);

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const opts = {
      headers: {
        'User-Agent': 'OctopathHelper/1.0 (https://github.com/Galmreis/Octopath-Helper)'
      }
    };
    https.get(url, opts, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchJson(res.headers.location).then(resolve, reject);
      }
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(raw));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

function cleanName(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function fetchCategoryMembers(category) {
  let members = [];
  let cmcontinue = '';
  do {
    const url = `https://octopathtraveler.fandom.com/api.php?action=query&list=categorymembers&cmtitle=${encodeURIComponent(category)}&cmlimit=100&format=json${cmcontinue ? `&cmcontinue=${encodeURIComponent(cmcontinue)}` : ''}`;
    const data = await fetchJson(url);
    if (data.query?.categorymembers) {
      members = members.concat(data.query.categorymembers);
    }
    cmcontinue = data.continue?.cmcontinue || '';
  } while (cmcontinue);
  return members;
}

async function fetchImageUrls(fileTitles) {
  const fileMap = new Map();
  // Batch requests in chunks of 40
  for (let i = 0; i < fileTitles.length; i += 40) {
    const chunk = fileTitles.slice(i, i + 40);
    const titlesParam = chunk.join('|');
    const url = `https://octopathtraveler.fandom.com/api.php?action=query&titles=${encodeURIComponent(titlesParam)}&prop=imageinfo&iiprop=url&format=json`;
    try {
      const data = await fetchJson(url);
      const pages = Object.values(data.query?.pages || {});
      for (const page of pages) {
        if (page.imageinfo?.[0]?.url) {
          fileMap.set(page.title, page.imageinfo[0].url);
        }
      }
    } catch (err) {
      console.warn(`[SpriteMapper] Error fetching chunk: ${err.message}`);
    }
  }
  return fileMap;
}

async function run() {
  console.log('[SpriteMapper] Querying Fandom Category:Enemy_Sprites...');
  const members = await fetchCategoryMembers('Category:Enemy_Sprites');
  console.log(`[SpriteMapper] Found ${members.length} members in Category:Enemy_Sprites.`);

  const fileTitles = members.filter(m => m.ns === 6).map(m => m.title);
  console.log(`[SpriteMapper] Resolving direct CDN URLs for ${fileTitles.length} files...`);
  const cdnMap = await fetchImageUrls(fileTitles);

  const monsterSprites = {};
  const normalizedIndex = new Map();

  for (const [title, url] of cdnMap.entries()) {
    // Strip "File:" and extension
    const base = title.replace(/^File:/, '').replace(/\.(png|gif|jpg|jpeg|webp)$/i, '');
    const key = cleanName(base);
    normalizedIndex.set(key, url);
  }

  // 1. First, search for GIFs for all monsters
  console.log('[SpriteMapper] Performing priority search for animated .gif sprites...');
  let matchedCount = 0;
  const gifCandidateTitles = [];
  const candidateToMonsterId = new Map();

  // Synonyms and typo overrides
  const NAME_OVERRIDES = {
    'Agressive Ant': 'Aggressive Ant',
    'Flame Sentinel Mk.II': 'Fire Sentinel Mk.II',
    'Ravus Soldier III': 'Ravus Guard III'
  };

  for (const m of monsters) {
    const rawName = NAME_OVERRIDES[m.name.trim()] || m.name.trim();
    const cleanRaw = rawName.replace(/\s*\(\d+\)$/, '');
    const tGifUnderscore = `File:${cleanRaw.replace(/\s+/g, '_')}.gif`;
    const tGifSpace = `File:${cleanRaw}.gif`;
    
    for (const title of [tGifUnderscore, tGifSpace]) {
      gifCandidateTitles.push(title);
      if (!candidateToMonsterId.has(title)) {
        candidateToMonsterId.set(title, []);
      }
      candidateToMonsterId.get(title).push(m.id);
    }
  }

  const gifUrls = await fetchImageUrls(gifCandidateTitles);
  for (const [title, url] of gifUrls.entries()) {
    const mIds = candidateToMonsterId.get(title) || [];
    for (const mId of mIds) {
      if (!monsterSprites[mId]) {
        monsterSprites[mId] = url;
        matchedCount++;
      }
    }
  }

  console.log(`[SpriteMapper] Found ${matchedCount} animated .gif sprites!`);

  // 2. For any monster without a GIF, fall back to Category:Enemy_Sprites and static PNGs
  const remainingWithoutGif = monsters.filter(m => !monsterSprites[m.id]);
  console.log(`[SpriteMapper] Resolving static fallback PNGs for ${remainingWithoutGif.length} monsters...`);

  // Try Category:Enemy_Sprites index
  for (const m of remainingWithoutGif) {
    const key = cleanName(m.name);
    if (normalizedIndex.has(key)) {
      monsterSprites[m.id] = normalizedIndex.get(key);
      matchedCount++;
    }
  }

  // Targeted fallback PNG queries
  const pngCandidates = [];
  const pngToId = new Map();
  for (const m of monsters.filter(m => !monsterSprites[m.id])) {
    const cleanRaw = m.name.trim().replace(/\s*\(\d+\)$/, '');
    const tPng = `File:${cleanRaw}.png`;
    const tBattle = `File:${cleanRaw} Battle.png`;
    const tPlain = `File:${cleanRaw.replace(/\s+/g, '')}.png`;
    
    pngCandidates.push(tPng, tBattle, tPlain);
    pngToId.set(tPng, m.id);
    pngToId.set(tBattle, m.id);
    pngToId.set(tPlain, m.id);
  }

  const pngUrls = await fetchImageUrls(pngCandidates);
  for (const [title, url] of pngUrls.entries()) {
    const mId = pngToId.get(title);
    if (mId && !monsterSprites[mId]) {
      monsterSprites[mId] = url;
      matchedCount++;
    }
  }

  console.log(`[SpriteMapper] Final match count: ${matchedCount} / ${monsters.length} (${((matchedCount/monsters.length)*100).toFixed(1)}%)`);

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(monsterSprites, null, 2));
  console.log(`[SpriteMapper] Wrote monster sprite map to: ${OUTPUT_PATH}`);

  // Now resolve 8 Traveler Headshots / Overworld Sprites
  console.log('[SpriteMapper] Resolving protagonist party icons...');
  const travelers = [
    { name: 'Ophilia', file: 'File:CharNavTile Ophilia.png' },
    { name: 'Cyrus', file: 'File:CharNavTile Cyrus.png' },
    { name: 'Tressa', file: 'File:CharNavTile Tressa.png' },
    { name: 'Olberic', file: 'File:CharNavTile Olberic.png' },
    { name: 'Primrose', file: 'File:CharNavTile Primrose.png' },
    { name: 'Alfyn', file: 'File:CharNavTile Alfyn.png' },
    { name: 'Therion', file: 'File:CharNavTile Therion.png' },
    { name: "H'aanit", file: "File:CharNavTile H'aanit.png" }
  ];

  const travelerTitles = travelers.map(t => t.file);
  // Also add fallback headshot titles
  travelers.forEach(t => {
    travelerTitles.push(`File:${t.name} (CotC).png`);
    travelerTitles.push(`File:${t.name}.png`);
  });

  const travelerUrls = await fetchImageUrls(travelerTitles);
  const characterIcons = {};

  for (const t of travelers) {
    const url = travelerUrls.get(t.file) ||
                travelerUrls.get(`File:${t.name} (CotC).png`) ||
                travelerUrls.get(`File:${t.name}.png`);
    if (url) {
      characterIcons[t.name] = url;
    }
  }

  fs.writeFileSync(CHAR_OUTPUT_PATH, JSON.stringify(characterIcons, null, 2));
  console.log(`[SpriteMapper] Wrote character icons (${Object.keys(characterIcons).length}/8) to: ${CHAR_OUTPUT_PATH}`);
}

run().catch(console.error);
