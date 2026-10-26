const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');

// Enforce single-instance lock
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

let mainWindow = null;
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

// Window position persistence
const windowStateFile = path.join(app.getPath('userData'), 'window-state.json');

function loadWindowState() {
  try {
    if (fs.existsSync(windowStateFile)) {
      return JSON.parse(fs.readFileSync(windowStateFile, 'utf8'));
    }
  } catch (e) {}
  return { width: 1440, height: 900 };
}

function saveWindowState() {
  if (!mainWindow) return;
  try {
    const bounds = mainWindow.getBounds();
    fs.writeFileSync(windowStateFile, JSON.stringify(bounds));
  } catch (e) {}
}

function isPortActive(port, testPath = '/api/state') {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}${testPath}`, () => resolve(true));
    req.on('error', () => resolve(false));
    req.setTimeout(500, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function startBackendServer() {
  const active = await isPortActive(3001);
  if (active) {
    console.log('[Electron Main] Backend server already running on :3001.');
    return;
  }

  console.log('[Electron Main] Starting embedded backend server in main process...');
  try {
    require('../server/index.js');
  } catch (err) {
    console.error('[Electron Main] Failed to initialize embedded server:', err);
  }

  // Wait for server to bind
  for (let i = 0; i < 30; i++) {
    if (await isPortActive(3001)) {
      console.log('[Electron Main] Backend server verified listening on :3001.');
      break;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
}

function togglePin() {
  if (!mainWindow) return false;
  const isTop = !mainWindow.isAlwaysOnTop();
  mainWindow.setAlwaysOnTop(isTop);
  mainWindow.setTitle(`Octopath Helper — ${isTop ? '[PINNED ON TOP]' : 'Companion'}`);
  mainWindow.webContents.send('always-on-top-changed', isTop);
  return isTop;
}

// IPC Handlers
ipcMain.handle('toggle-always-on-top', () => togglePin());
ipcMain.handle('get-always-on-top', () => (mainWindow ? mainWindow.isAlwaysOnTop() : false));

async function createWindow() {
  const state = loadWindowState();

  mainWindow = new BrowserWindow({
    x: state.x,
    y: state.y,
    width: state.width || 1440,
    height: state.height || 900,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#0b0907', // Obsidian dark theme (zero white startup flash)
    title: 'Octopath Helper — Companion',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0b0907',
      symbolColor: '#f3efe6',
      height: 38
    },
    autoHideMenuBar: true,
    show: false, // Show once ready-to-show for clean render
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // Decide URL: use Vite dev server if active in dev mode, otherwise built Express server
  let targetUrl = 'http://localhost:3001';
  if (isDev) {
    const viteActive = await isPortActive(5173, '/');
    if (viteActive) {
      targetUrl = 'http://localhost:5173';
    }
  }

  console.log(`[Electron Main] Loading dashboard from ${targetUrl}`);
  mainWindow.loadURL(targetUrl);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('close', () => {
    saveWindowState();
  });

  // In-App Shortcut: Ctrl+Shift+P to toggle Always on Top
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if ((input.control || input.meta) && input.shift && input.key.toLowerCase() === 'p') {
      togglePin();
      event.preventDefault();
    }
  });
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(async () => {
  await startBackendServer();
  await createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
