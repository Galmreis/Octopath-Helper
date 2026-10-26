const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const STAGE_DIR = path.join(ROOT_DIR, 'dist-release', 'OctopathHelper-v0.1-win64');
const ZIP_PATH = path.join(ROOT_DIR, 'dist-release', 'OctopathHelper-v0.1-win64.zip');

console.log('=== [RELEASE PACKAGER] Staging v0.1 Standalone Package ===');

// 1. Ensure client is built
console.log('1. Verifying production frontend bundle...');
execSync('npm --prefix client run build', { cwd: ROOT_DIR, stdio: 'inherit' });

// 2. Ensure server dependencies are installed
console.log('2. Verifying server dependencies...');
if (!fs.existsSync(path.join(ROOT_DIR, 'server', 'node_modules'))) {
  execSync('npm --prefix server install', { cwd: ROOT_DIR, stdio: 'inherit' });
}

// 3. Compile native launcher exe
console.log('3. Compiling OctopathHelper.exe with csc...');
const cscPath = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe';
execSync(`"${cscPath}" /nologo /optimize+ /platform:x64 /out:"${path.join(ROOT_DIR, 'OctopathHelper.exe')}" "${path.join(ROOT_DIR, 'launcher.cs')}"`, {
  stdio: 'inherit'
});

// 4. Clean and prepare staging folder
console.log('4. Staging distribution files...');
if (fs.existsSync(STAGE_DIR)) {
  fs.rmSync(STAGE_DIR, { recursive: true, force: true });
}
fs.mkdirSync(STAGE_DIR, { recursive: true });

function copyFile(relSrc, relDest = relSrc) {
  const src = path.join(ROOT_DIR, relSrc);
  const dest = path.join(STAGE_DIR, relDest);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function copyDir(relSrc, relDest = relSrc) {
  const src = path.join(ROOT_DIR, relSrc);
  const dest = path.join(STAGE_DIR, relDest);
  fs.cpSync(src, dest, {
    recursive: true,
    filter: (srcPath) => {
      const name = path.basename(srcPath);
      if (name === '.git' || name === 'tmp' || name.endsWith('.log')) return false;
      // Commercial font: never ship it in public releases
      if (name.startsWith('FOT-')) return false;
      return true;
    }
  });
}

// Copy top-level executables and documentation
copyFile('OctopathHelper.exe');
copyFile('start.bat');
copyFile('README.md');
copyFile('LICENSE');

// Copy necessary modules and data
copyDir('data');
copyDir('server');
copyDir('client/dist');

// 5. Sanity check staged structure
console.log('5. Verifying staged payload integrity...');
const criticalChecks = [
  'OctopathHelper.exe',
  'start.bat',
  'server/index.js',
  'server/node_modules/ws',
  'server/parser/parseSave.js',
  'server/repair/mercyRepair.js',
  'data/zones.json',
  'client/dist/index.html'
];

for (const check of criticalChecks) {
  const target = path.join(STAGE_DIR, check);
  if (!fs.existsSync(target)) {
    throw new Error(`Integrity check failed: missing ${check} in staging payload!`);
  }
}
console.log('   ✓ All critical files verified in staging payload.');

// 6. Create ZIP archive via PowerShell Compress-Archive
console.log('6. Compressing to standalone ZIP archive for GitHub Releases...');
if (fs.existsSync(ZIP_PATH)) {
  fs.unlinkSync(ZIP_PATH);
}

const psCommand = `powershell -NoProfile -Command "Compress-Archive -Path '${STAGE_DIR}' -DestinationPath '${ZIP_PATH}' -Force"`;
execSync(psCommand, { stdio: 'inherit' });

const stat = fs.statSync(ZIP_PATH);
console.log(`\n=== RELEASE PACKAGE READY ===`);
console.log(`Target: ${ZIP_PATH}`);
console.log(`Size: ${(stat.size / 1024 / 1024).toFixed(2)} MB`);
console.log(`Ready to attach to your GitHub v0.1 Release!`);
