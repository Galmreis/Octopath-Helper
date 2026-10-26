const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const SPRITES_MAP_PATH = path.join(ROOT_DIR, 'data', 'monsterSprites.json');
const CHAR_MAP_PATH = path.join(ROOT_DIR, 'data', 'characterIcons.json');
const WEAK_MAP_PATH = path.join(ROOT_DIR, 'data', 'weaknessIcons.json');

const DEST_MONSTERS = path.join(ROOT_DIR, 'client', 'public', 'images', 'monsters');
const DEST_CHARS = path.join(ROOT_DIR, 'client', 'public', 'images', 'characters');
const DEST_WEAKS = path.join(ROOT_DIR, 'client', 'public', 'images', 'weaknesses');

fs.mkdirSync(DEST_MONSTERS, { recursive: true });
fs.mkdirSync(DEST_CHARS, { recursive: true });
fs.mkdirSync(DEST_WEAKS, { recursive: true });

const monsterSprites = JSON.parse(fs.readFileSync(SPRITES_MAP_PATH, 'utf8'));
const characterIcons = JSON.parse(fs.readFileSync(CHAR_MAP_PATH, 'utf8'));
const weaknessIcons = fs.existsSync(WEAK_MAP_PATH) ? JSON.parse(fs.readFileSync(WEAK_MAP_PATH, 'utf8')) : {};

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(destPath) && fs.statSync(destPath).size > 0) {
      return resolve(); // already downloaded
    }

    const opts = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://octopathtraveler.fandom.com/'
      }
    };

    https.get(url, opts, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadFile(res.headers.location, destPath).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} from ${url}`));
      }

      const file = fs.createWriteStream(destPath);
      res.pipe(file);
      file.on('finish', () => {
        file.close(() => resolve());
      });
      file.on('error', err => {
        fs.unlink(destPath, () => {});
        reject(err);
      });
    }).on('error', reject);
  });
}

async function runQueue(tasks, concurrency = 8) {
  let index = 0;
  let completed = 0;

  async function worker() {
    while (index < tasks.length) {
      const task = tasks[index++];
      try {
        await downloadFile(task.url, task.dest);
      } catch (err) {
        console.warn(`[Downloader] Failed ${task.label}: ${err.message}`);
      }
      completed++;
      if (completed % 50 === 0 || completed === tasks.length) {
        process.stdout.write(`\r[Downloader] Downloaded ${completed} / ${tasks.length} sprites...`);
      }
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);
  console.log();
}

async function main() {
  console.log('=== [SPRITE DOWNLOADER] Caching local sprites for offline / Electron use ===');

  const tasks = [];

  // Characters
  for (const [name, url] of Object.entries(characterIcons)) {
    tasks.push({
      url,
      dest: path.join(DEST_CHARS, `${name.toLowerCase()}.png`),
      label: `Character ${name}`
    });
  }

  // Weaknesses
  for (const [key, url] of Object.entries(weaknessIcons)) {
    if (url) {
      tasks.push({
        url,
        dest: path.join(DEST_WEAKS, `${key}.png`),
        label: `Weakness ${key}`
      });
    }
  }

  // Monsters
  for (const [id, url] of Object.entries(monsterSprites)) {
    const ext = url.includes('.gif') ? '.gif' : '.png';
    tasks.push({
      url,
      dest: path.join(DEST_MONSTERS, `${id}${ext}`),
      label: `Monster #${id}`
    });
  }

  console.log(`Starting concurrent download of ${tasks.length} sprites to client/public/images/...`);
  const start = Date.now();
  await runQueue(tasks, 10);
  console.log(`[Downloader] Complete in ${((Date.now() - start) / 1000).toFixed(1)}s!`);
}

main().catch(console.error);
