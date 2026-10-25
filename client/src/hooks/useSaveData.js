import { useState, useEffect, useRef } from 'react';

// In dev mode (Vite on :5173), proxy to Node server on :3001.
// In production (served from Node on :3001), connect dynamically to the host origin.
const API_BASE = typeof window !== 'undefined' && window.location.port === '5173' ? 'http://localhost:3001' : '';
const WS_URL = typeof window !== 'undefined' && window.location.port === '5173'
  ? 'ws://localhost:3001'
  : (typeof window !== 'undefined'
      ? `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`
      : 'ws://localhost:3001');

export function useSaveData() {
  const [staticDb, setStaticDb] = useState(null);
  const [saveState, setSaveState] = useState(null);
  const [saveFilePath, setSaveFilePath] = useState('');
  const [availableSlots, setAvailableSlots] = useState([]);
  const [connected, setConnected] = useState(false);
  const [lastFlashIds, setLastFlashIds] = useState({});
  const wsRef = useRef(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/static`)
      .then(res => res.json())
      .then(data => setStaticDb(data))
      .catch(err => console.error('Failed to load static database:', err));

    fetch(`${API_BASE}/api/state`)
      .then(res => res.json())
      .then(data => {
        if (data) setSaveState(data);
      })
      .catch(() => {});

    fetch(`${API_BASE}/api/slots`)
      .then(res => res.json())
      .then(data => {
        if (data?.currentPath) setSaveFilePath(data.currentPath);
        if (data?.slots) setAvailableSlots(data.slots);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let reconnectTimer = null;

    function connect() {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
      };

      ws.onmessage = event => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === 'STATE_UPDATE') {
            setSaveState(payload.state);
            if (payload.saveFilePath) setSaveFilePath(payload.saveFilePath);
            if (payload.availableSlots) setAvailableSlots(payload.availableSlots);

            if (payload.newEvents && payload.newEvents.length > 0) {
              const flashes = {};
              for (const ev of payload.newEvents) {
                if (ev.monsterId !== undefined) flashes[`monster-${ev.monsterId}`] = Date.now();
                if (ev.zoneId !== undefined) flashes[`zone-${ev.zoneId}`] = Date.now();
                if (ev.itemId !== undefined) flashes[`item-${ev.itemId}`] = Date.now();
              }
              if (Object.keys(flashes).length > 0) {
                setLastFlashIds(flashes);
                setTimeout(() => setLastFlashIds({}), 2200);
              }
            }
          }
        } catch (err) {
          console.error('WebSocket message error:', err);
        }
      };

      ws.onclose = () => {
        setConnected(false);
        reconnectTimer = setTimeout(connect, 2000);
      };
    }

    connect();
    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  async function selectSaveSlot(filePath) {
    try {
      const res = await fetch(`${API_BASE}/api/slots/select`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath })
      });
      const data = await res.json();
      if (data.currentPath) setSaveFilePath(data.currentPath);
      if (data.slots) setAvailableSlots(data.slots);
    } catch (err) {
      console.error('Failed to switch save slot:', err);
    }
  }

  return { staticDb, saveState, saveFilePath, availableSlots, selectSaveSlot, connected, lastFlashIds };
}
