const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');
const { parseSaveBuffer } = require('../parser/parseSave');

// === CONCEPT: DataSource Adapter (SaveFileSource) ===
// Watches the entire SaveGames directory for changes to ANY SaveData*.sav slot (Slot 0..24+).
// Reads the updated .sav buffer into RAM in one non-locking call after chokidar confirms
// the game has stopped writing for 300ms.
class SaveFileSource {
  constructor(saveFilePath, onStateParsed) {
    this.saveFilePath = saveFilePath;
    this.onStateParsed = onStateParsed;
    this.watcher = null;
  }

  readAndEmit(triggerReason = 'autosave', targetPath = this.saveFilePath) {
    try {
      if (!fs.existsSync(targetPath)) {
        console.warn(`[SaveFileSource] File not found: ${targetPath}`);
        return;
      }
      this.saveFilePath = targetPath;
      const buf = fs.readFileSync(targetPath);
      const parsed = parseSaveBuffer(buf);
      this.onStateParsed(parsed, triggerReason);
    } catch (err) {
      console.error(`[SaveFileSource] Error reading ${targetPath}:`, err.message);
    }
  }

  start() {
    // Initial synchronous load on server boot
    this.readAndEmit('initial', this.saveFilePath);

    const saveDir = path.dirname(this.saveFilePath);
    this.watcher = chokidar.watch(saveDir, {
      persistent: true,
      ignoreInitial: true,
      depth: 0,
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 100
      }
    });

    const handleFileEvent = changedPath => {
      const base = path.basename(changedPath);
      if (/^SaveData(\d+|Auto)\.sav$/i.test(base)) {
        this.readAndEmit('autosave', changedPath);
      }
    };

    this.watcher.on('change', handleFileEvent);
    this.watcher.on('add', handleFileEvent);

    console.log(`[SaveFileSource] Watching all SaveData*.sav slots in: ${saveDir}`);
  }

  stop() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }

  switchFile(newFilePath) {
    if (!fs.existsSync(newFilePath)) {
      throw new Error(`Save file does not exist: ${newFilePath}`);
    }
    this.readAndEmit('slot-select', newFilePath);
  }
}

module.exports = { SaveFileSource };
