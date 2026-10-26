import React from 'react';
import { getCharacterIconUrl } from '../lib/assets';

export default function Header({
  saveState,
  saveFilePath,
  availableSlots,
  selectSaveSlot
}) {
  const { stats = {}, party = [] } = saveState;

  return (
    <header className="journal-header">
      <div className="journal-slot-picker">
        <span className="journal-label">Save Record</span>
        {availableSlots && availableSlots.length > 0 ? (
          <select
            className="select journal-select"
            value={saveFilePath}
            onChange={e => selectSaveSlot(e.target.value)}
          >
            {availableSlots.map(slot => (
              <option key={slot.filePath} value={slot.filePath}>
                {slot.label} (Modified: {new Date(slot.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})
              </option>
            ))}
          </select>
        ) : (
          <code className="journal-code">
            {saveFilePath ? saveFilePath.split(/[\\/]/).pop() : 'SaveData0.sav'}
          </code>
        )}
      </div>

      <div className="journal-party">
        <span className="journal-label">Party in Formation</span>
        <div className="journal-avatars-row">
          {(party || []).map(p => {
            const iconUrl = getCharacterIconUrl(p.name);
            return (
              <div key={p.name} className="journal-avatar-badge" title={p.name}>
                {iconUrl ? (
                  <img
                    src={iconUrl}
                    alt={p.name}
                    className="party-avatar-icon"
                    loading="lazy"
                  />
                ) : null}
                <span className="party-avatar-name">{p.name}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="journal-metrics">
        <div className="journal-metric">
          <span className="journal-label">Play Time</span>
          <strong className="journal-value">{stats.playTimeFormatted || '0h 00m'}</strong>
        </div>
        {stats.totalLeaf !== undefined && (
          <div className="journal-metric">
            <span className="journal-label">Leaves</span>
            <strong className="journal-value journal-leaf">
              {Number(stats.totalLeaf).toLocaleString()}
            </strong>
          </div>
        )}
        {stats.battleCount !== undefined && (
          <div className="journal-metric">
            <span className="journal-label">Battles</span>
            <strong className="journal-value">{stats.battleCount}</strong>
          </div>
        )}
      </div>
    </header>
  );
}
