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

// 2. Compile native launcher exe
console.log('2. Compiling OctopathHelper.exe with csc...');
const cscPath = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe';
execSync(`"${cscPath}" /nologo /optimize+ /platform:x64 /out:"${path.join(ROOT_DIR, 'OctopathHelper.exe')}" "${path.join(ROOT_DIR, 'launcher.cs')}"`, {
  stdio: 'inherit'
});

// 3. Clean and prepare staging folder
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
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name === 'tmp' || entry.name === '.git' || entry.name.endsWith('.log')) continue;
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(path.relative(ROOT_DIR, s), path.relative(ROOT_DIR, d));
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

console.log('3. Staging distribution files...');
copyFile('OctopathHelper.exe');
copyFile('start.bat');
copyFile('README.md');
copyFile('LICENSE');

copyDir('data');
copyDir('server');
copyDir('client/dist');

// 4. Create ZIP archive via PowerShell Compress-Archive
console.log('4. Compressing to standalone ZIP archive for GitHub Releases...');
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
