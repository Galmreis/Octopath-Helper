import React, { useState } from 'react';
import { filterZones } from '../../lib/selectors';

export default function ZonesTab({
  staticDb,
  saveState,
  onSelectZone
}) {
  const [zoneSearch, setZoneSearch] = useState('');
  const [hideCompletedZones, setHideCompletedZones] = useState(true);

  const allZones = filterZones(staticDb, saveState, {
    search: zoneSearch,
    hideCompleted: hideCompletedZones
  });

  return (
    <div>
      <div className="filter-row">
        <input
          className="input"
          placeholder="Search zone name, region, or #LevelID..."
          value={zoneSearch}
          onChange={e => setZoneSearch(e.target.value)}
          style={{ minWidth: 260 }}
        />
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={hideCompletedZones}
            onChange={e => setHideCompletedZones(e.target.checked)}
          />
          Hide 100% Cleared Zones
        </label>
        <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
          Showing {allZones.length} zones
        </span>
      </div>

      <div className="card-grid">
        {allZones.map(z => {
          const st = saveState.zones?.[z.id];
          const cOpen = st?.chestsOpened.filter(Boolean).length || 0;
          const hFound = st?.hiddenItemsFound.filter(Boolean).length || 0;
          const missingChests = z.chests.filter((_, idx) => !st?.chestsOpened?.[idx]);
          const missingHidden = z.hiddenItems.filter((_, idx) => !st?.hiddenItemsFound?.[idx]);

          return (
            <div
              key={z.id}
              className="item-card"
              style={{ cursor: 'pointer' }}
              onClick={() => onSelectZone(z.id)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <strong>{z.name}</strong>
                <span className="badge id">#{z.id}</span>
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                {z.region} | Visited: <strong>{st?.visited ? 'Yes' : 'NO (Unvisited)'}</strong>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {z.chestCount > 0 && (
                  <span className={`badge ${cOpen === z.chestCount ? 'done' : 'pending'}`}>
                    Chests: {cOpen}/{z.chestCount}
                  </span>
                )}
                {z.hiddenCount > 0 && (
                  <span className={`badge ${hFound === z.hiddenCount ? 'done' : 'pending'}`}>
                    Hidden: {hFound}/{z.hiddenCount}
                  </span>
                )}
              </div>
              {missingChests.length > 0 && (
                <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                  Missing Chests:{' '}
                  {missingChests
                    .map(c => `${c.contents}${c.isLocked ? ' (Locked)' : ''}`)
                    .join(', ')}
                </div>
              )}
              {missingHidden.length > 0 && (
                <div style={{ fontSize: '0.76rem', color: 'var(--accent-amber)' }}>
                  Missing Hidden: {missingHidden.map(h => h.contents).join(', ')}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
