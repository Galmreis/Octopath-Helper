import React, { useState, useEffect } from 'react';

function PinIcon({ pinned }) {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill={pinned ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        transform: pinned ? 'rotate(-35deg)' : 'none',
        transition: 'transform 0.2s ease',
        display: 'inline-block',
        verticalAlign: 'middle',
        marginRight: 5
      }}
    >
      <line x1="12" y1="17" x2="12" y2="22" />
      <path d="M5 17h14v-2l-2-3V5a1 1 0 0 0-1-1h-8a1 1 0 0 0-1 1v7l-2 3v2z" />
    </svg>
  );
}

export default function TitleBar({ saveState = {}, connected = true }) {
  const [isPinned, setIsPinned] = useState(false);
  const isElectron = typeof window !== 'undefined' && Boolean(window.electronAPI?.isElectron);

  useEffect(() => {
    if (window.electronAPI?.getAlwaysOnTop) {
      window.electronAPI.getAlwaysOnTop().then(setIsPinned);
    }
    if (window.electronAPI?.onAlwaysOnTopChanged) {
      return window.electronAPI.onAlwaysOnTopChanged(setIsPinned);
    }
  }, []);

  const handleTogglePin = async () => {
    if (window.electronAPI?.toggleAlwaysOnTop) {
      const state = await window.electronAPI.toggleAlwaysOnTop();
      setIsPinned(state);
    }
  };

  return (
    <div className="titlebar">
      <div className="titlebar-drag-area">
        <div className="titlebar-brand">
          <span className="titlebar-logo-mark">❖</span>
          <span className="titlebar-text">Octopath Helper</span>
          <span className={`status-pill ${connected ? 'online' : 'offline'}`}>
            {connected
              ? saveState.sourceType === 'live-ram'
                ? 'Live RAM'
                : 'Autosave'
              : 'Connecting…'}
          </span>
          {saveState.currentZoneName && (
            <span className="titlebar-zone">
              <span className="titlebar-sep">◈</span>
              <strong>{saveState.currentZoneName}</strong>
            </span>
          )}
        </div>
      </div>

      <div className="titlebar-controls">
        {isElectron && (
          <button
            type="button"
            className={`titlebar-pin-btn ${isPinned ? 'pinned' : ''}`}
            onClick={handleTogglePin}
            title={`Always on Top (${isPinned ? 'Pinned' : 'Unpinned'})\nShortcut: Ctrl+Shift+P`}
          >
            <PinIcon pinned={isPinned} />
            <span>{isPinned ? 'Pinned' : 'Pin'}</span>
          </button>
        )}
      </div>
    </div>
  );
}
