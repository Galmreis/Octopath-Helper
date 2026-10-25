const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const TELEMETRY_LOG_PATH = path.join(__dirname, 'live-telemetry.log');

function resolveSaveFilePath() {
  if (process.env.OCTOPATH_SAVE_PATH && fs.existsSync(process.env.OCTOPATH_SAVE_PATH)) {
    return process.env.OCTOPATH_SAVE_PATH;
  }

  // Auto-detect Windows Steam save directory: %USERPROFILE%/Documents/My Games/Octopath_Traveler/<SteamID>/SaveGames/
  const slots = listAvailableSaveSlots();
  if (slots.length > 0) {
    // Prefer SaveData0.sav (Autosave) if present; otherwise pick the most recently modified slot
    const autoSave = slots.find(s => s.slotNum === 0 && !s.label.startsWith('Project Root'));
    if (autoSave) return autoSave.filePath;
    const sortedByRecent = [...slots].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
    return sortedByRecent[0].filePath;
  }

  // Fallback to local SaveData0.sav in project root
  return path.join(ROOT_DIR, 'SaveData0.sav');
}

function listAvailableSaveSlots() {
  const slots = [];
  const seenPaths = new Set();

  const octopathDocs = path.join(os.homedir(), 'Documents', 'My Games', 'Octopath_Traveler');
  if (fs.existsSync(octopathDocs)) {
    const entries = fs.readdirSync(octopathDocs, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && /^\d+$/.test(entry.name)) {
        const saveDir = path.join(octopathDocs, entry.name, 'SaveGames');
        if (fs.existsSync(saveDir)) {
          const files = fs.readdirSync(saveDir).filter(f => /^SaveData(\d+|Auto)\.sav$/i.test(f));
          files.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
          for (const fileName of files) {
            const fullPath = path.join(saveDir, fileName);
            const stat = fs.statSync(fullPath);
            const numMatch = fileName.match(/\d+/);
            const slotNum = numMatch ? Number(numMatch[0]) : 0;
            const isAuto = /auto/i.test(fileName) || slotNum === 0;
            const label = isAuto
              ? `Slot ${slotNum} — Autosave (${fileName})`
              : `Slot ${slotNum} — Manual (${fileName})`;
            slots.push({
              slotNum,
              fileName,
              label,
              filePath: fullPath,
              updatedAt: stat.mtime.toISOString()
            });
            seenPaths.add(fullPath);
          }
        }
      }
    }
  }

  const localFallback = path.join(ROOT_DIR, 'SaveData0.sav');
  if (fs.existsSync(localFallback) && !seenPaths.has(localFallback)) {
    const stat = fs.statSync(localFallback);
    slots.push({
      slotNum: 0,
      fileName: 'SaveData0.sav',
      label: 'Project Root — SaveData0.sav',
      filePath: localFallback,
      updatedAt: stat.mtime.toISOString()
    });
  }

  return slots;
}

module.exports = {
  PORT: Number(process.env.PORT || 3001),
  ROOT_DIR,
  DATA_DIR,
  TELEMETRY_LOG_PATH,
  SAVE_FILE_PATH: resolveSaveFilePath(),
  listAvailableSaveSlots
};
