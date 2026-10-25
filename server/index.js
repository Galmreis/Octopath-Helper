const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const { PORT, DATA_DIR, SAVE_FILE_PATH, listAvailableSaveSlots } = require('./config');
const { StateStore } = require('./stateStore');
const { SaveFileSource } = require('./sources/saveFileSource');
const { MemorySource } = require('./sources/memorySource');
const { getMercyStatus, applyMercyRepair } = require('./repair/mercyRepair');

// Preload static databases into memory so HTTP requests are instant
const staticDatabase = {
  monsters: JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'monsters.json'), 'utf8')),
  zones: JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'zones.json'), 'utf8')),
  items: JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'items.json'), 'utf8')),
  quests: JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'quests.json'), 'utf8')),
  missableNotes: JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'missableNotes.json'), 'utf8'))
};

const store = new StateStore();

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === '/api/static') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(staticDatabase));
    return;
  }

  if (req.url === '/api/state') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(store.currentState));
    return;
  }

  if (req.url === '/api/slots' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        currentPath: saveSource.saveFilePath,
        slots: listAvailableSaveSlots()
      })
    );
    return;
  }

  if (req.url === '/api/slots/select' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        const { filePath } = JSON.parse(body || '{}');
        saveSource.switchFile(filePath);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            ok: true,
            currentPath: saveSource.saveFilePath,
            slots: listAvailableSaveSlots()
          })
        );
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  if (req.url === '/api/mercy/status' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        eligible: getMercyStatus(store.currentState, staticDatabase)
      })
    );
    return;
  }

  if (req.url === '/api/mercy/repair' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        const { targetType, targetId } = JSON.parse(body || '{}');
        const repairResult = applyMercyRepair(
          saveSource.saveFilePath,
          targetType,
          Number(targetId),
          staticDatabase
        );
        saveSource.readAndEmit('mercy-repair', saveSource.saveFilePath);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            ok: true,
            repairResult
          })
        );
      } catch (err) {
        console.error('[MercyRepair] Failed to apply repair:', err.message);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

const wss = new WebSocketServer({ server });

function broadcast(payload) {
  const msg = JSON.stringify(payload);
  wss.clients.forEach(client => {
    if (client.readyState === 1) {
      client.send(msg);
    }
  });
}

wss.on('connection', ws => {
  if (store.currentState) {
    ws.send(
      JSON.stringify({
        type: 'STATE_UPDATE',
        state: store.currentState,
        newEvents: [],
        saveFilePath: saveSource.saveFilePath,
        availableSlots: listAvailableSaveSlots()
      })
    );
  }
});

let memorySource = null;

const saveSource = new SaveFileSource(SAVE_FILE_PATH, (parsedState, sourceType) => {
  // If live RAM reader is actively attached, keep RAM's real-time zone/combat state
  // unless the user explicitly switched save slots while inspecting files.
  if (memorySource && memorySource.isAttached() && store.currentState && sourceType === 'autosave') {
    store.currentState.sideStoriesByRegion = parsedState.sideStoriesByRegion;
    if (store.currentState.stats && parsedState.stats?.worthYourSalt) {
      store.currentState.stats.worthYourSalt = parsedState.stats.worthYourSalt;
    }
    return;
  }

  const { state, newEvents } = store.update(parsedState, sourceType);
  broadcast({
    type: 'STATE_UPDATE',
    state,
    newEvents,
    saveFilePath: saveSource.saveFilePath,
    availableSlots: listAvailableSaveSlots()
  });
});

saveSource.start();

let lastRamBroadcastMs = 0;

memorySource = new MemorySource(
  () => store.currentState,
  (parsedState, sourceType) => {
    const { state, newEvents } = store.update(parsedState, sourceType);
    const now = Date.now();
    // If real game events happened (weakness revealed, zone change, etc.), broadcast immediately.
    // If no events happened (tick heartbeat), throttle broadcast to at most once every 2 seconds.
    if (newEvents.length > 0 || now - lastRamBroadcastMs > 2000) {
      lastRamBroadcastMs = now;
      broadcast({
        type: 'STATE_UPDATE',
        state,
        newEvents,
        saveFilePath: saveSource.saveFilePath,
        availableSlots: listAvailableSaveSlots()
      });
    }
  }
);

memorySource.start();

server.listen(PORT, () => {
  console.log(`[Octopath Helper Server] HTTP + WebSocket listening on http://localhost:${PORT}`);
});
