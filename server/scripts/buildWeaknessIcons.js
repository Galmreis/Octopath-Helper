const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const OUTPUT_PATH = path.join(ROOT_DIR, 'data', 'weaknessIcons.json');

const mapping = {
  sword: 'File:Type Swords.png',
  polearm: 'File:Type Polearms.png',
  dagger: 'File:Type Daggers.png',
  axe: 'File:Type Axes.png',
  bow: 'File:Type Bows.png',
  staff: 'File:Type Staves.png',
  fire: 'File:Type Fire.png',
  ice: 'File:Type Ice.png',
  lightning: 'File:Type Lightning.png',
  wind: 'File:Type Wind.png',
  light: 'File:Type Light.png',
  dark: 'File:Type Dark.png'
};

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'OctopathHelper/1.0' } }, res => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => resolve(JSON.parse(raw)));
    }).on('error', reject);
  });
}

async function run() {
  const titles = Object.values(mapping).join('|');
  const url = `https://octopathtraveler.fandom.com/api.php?action=query&titles=${encodeURIComponent(titles)}&prop=imageinfo&iiprop=url&format=json`;
  const data = await fetchJson(url);
  const pages = Object.values(data.query?.pages || {});

  const titleToUrl = {};
  for (const p of pages) {
    if (p.imageinfo?.[0]?.url) {
      titleToUrl[p.title] = p.imageinfo[0].url;
    }
  }

  const weaknessIcons = {};
  for (const [key, title] of Object.entries(mapping)) {
    weaknessIcons[key] = titleToUrl[title] || null;
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(weaknessIcons, null, 2));
  console.log(`[WeaknessMapper] Saved 12 weakness icons to: ${OUTPUT_PATH}`);
}

run().catch(console.error);
