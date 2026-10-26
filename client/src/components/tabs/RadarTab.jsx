import React from 'react';
import { getQuestStatus } from '../../lib/selectors';
import { getMonsterSpriteUrl, getWeaknessIconUrl, getWeaknessCdnFallback } from '../../lib/assets';

export default function RadarTab({
  staticDb,
  saveState,
  selectedZoneId,
  onSelectZoneId,
  lastFlashIds
}) {
  const isInspecting = selectedZoneId !== null && selectedZoneId !== saveState.currentZoneId;
  const activeZoneId = isInspecting ? selectedZoneId : saveState.currentZoneId;
  const activeZoneMeta = staticDb.zones[activeZoneId];
  const activeZoneState = saveState.zones?.[activeZoneId];
  const questsById = new Map((staticDb.quests || []).map(q => [q.id, q]));

  return (
    <div>
      <div className="filter-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>Browse zone:</span>
          <select
            className="select"
            value={activeZoneId || ''}
            onChange={e => {
              const val = Number(e.target.value);
              onSelectZoneId(val === saveState.currentZoneId ? null : val);
            }}
          >
            {Object.values(staticDb.zones).map(z => (
              <option key={z.id} value={z.id}>
                {z.id === saveState.currentZoneId ? '(you are here) ' : ''}#{z.id} — {z.name} ({z.region})
              </option>
            ))}
          </select>
        </div>

        {isInspecting ? (
          <button
            className="action-btn"
            onClick={() => onSelectZoneId(null)}
            title="Return to your live character location"
          >
            <span>Back to {saveState.currentZoneName}</span>
            <span className="kbd-hint">F</span>
          </button>
        ) : (
          <span className="badge done" style={{ padding: '6px 12px', fontSize: '0.78rem' }}>
            Following your character
          </span>
        )}
      </div>

      {!activeZoneMeta ? (
        <div>Zone #{activeZoneId} not found in static dictionary.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Zone Header */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderBottom: '1px solid var(--border)',
              paddingBottom: 10
            }}
          >
            <div>
              <h2 style={{ fontSize: '1.25rem', color: 'var(--accent-gold)' }}>
                {activeZoneMeta.name}{' '}
                <span className="badge id">LevelID #{activeZoneMeta.id}</span>
              </h2>
              <div style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>
                Region: <strong>{activeZoneMeta.region}</strong> | TreasureState Offset ID:{' '}
                <code>{activeZoneMeta.treasureStateId}</code> | Visited:{' '}
                <strong>{activeZoneState?.visited ? 'Yes' : 'No'}</strong>
              </div>
              {activeZoneMeta.tips && (
                <div
                  style={{
                    marginTop: 8,
                    padding: '6px 10px',
                    background: 'rgba(245, 158, 11, 0.1)',
                    borderLeft: '3px solid var(--accent-amber)',
                    borderRadius: 4,
                    fontSize: '0.8rem',
                    color: 'var(--text-main)'
                  }}
                >
                  {activeZoneMeta.tips}
                </div>
              )}
            </div>
          </div>

          {/* Chests */}
          <div>
            <h3 style={{ fontSize: '0.95rem', marginBottom: 8 }}>
              Chests ({activeZoneState?.chestsOpened.filter(Boolean).length || 0} /{' '}
              {activeZoneMeta.chestCount})
            </h3>
            {activeZoneMeta.chestCount === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                No treasure chests in this zone.
              </div>
            ) : (
              <div className="card-grid">
                {activeZoneMeta.chests.map((chest, idx) => {
                  const isOpened = activeZoneState?.chestsOpened?.[idx];
                  return (
                    <div
                      key={idx}
                      className={`item-card ${isOpened ? 'complete' : ''}`}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <strong>{chest.contents}</strong>
                        <span className="badge id">Chest #{idx + 1}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span className={`badge ${isOpened ? 'done' : 'pending'}`}>
                          {isOpened ? 'Opened' : 'Not opened'}
                        </span>
                        {chest.isLocked && (
                          <span className="badge locked">Locked chest (Therion)</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Hidden Items */}
          <div>
            <h3 style={{ fontSize: '0.95rem', marginBottom: 8 }}>
              Hidden Items ({activeZoneState?.hiddenItemsFound.filter(Boolean).length || 0}{' '}
              / {activeZoneMeta.hiddenCount})
            </h3>
            {activeZoneMeta.hiddenCount === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                No hidden items in this zone.
              </div>
            ) : (
              <div className="card-grid">
                {activeZoneMeta.hiddenItems.map((hItem, idx) => {
                  const isFound = activeZoneState?.hiddenItemsFound?.[idx];
                  return (
                    <div
                      key={idx}
                      className={`item-card ${isFound ? 'complete' : ''}`}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <strong>{hItem.contents}</strong>
                        <span className="badge id">Hidden #{idx + 1}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span className={`badge ${isFound ? 'done' : 'pending'}`}>
                          {isFound ? 'Found' : 'Not found'}
                        </span>
                        {hItem.isMissable && <span className="badge missable">Missable</span>}
                      </div>
                      {hItem.note && (
                        <div style={{ fontSize: '0.78rem', color: 'var(--accent-amber)' }}>
                          Note: {hItem.note}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Monsters */}
          <div>
            <h3 style={{ fontSize: '0.95rem', marginBottom: 8 }}>
              Zone Monsters ({activeZoneMeta?.monsters?.length || 0})
            </h3>
            {!activeZoneMeta?.monsters || activeZoneMeta.monsters.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                No Strategist monsters mapped to this zone (Town / Safe Area).
              </div>
            ) : (
              <div className="card-grid">
                {activeZoneMeta.monsters.map(mId => {
                  const m = staticDb.monsters[mId];
                  const st = saveState.monsters?.[mId];
                  if (!m) return null;
                  const revCount = st?.revealedWeaknesses.filter(Boolean).length || 0;
                  const spriteUrl = getMonsterSpriteUrl(mId);
                  return (
                    <div
                      key={mId}
                      className={`item-card ${st?.isCompleted ? 'complete' : ''} ${
                        lastFlashIds[`monster-${mId}`] ? 'flash' : ''
                      }`}
                    >
                      <div className="monster-card-content">
                        {spriteUrl && (
                          <div className="monster-thumb-box">
                            <img
                              src={spriteUrl}
                              alt={m.name}
                              className="monster-thumb-img"
                              loading="lazy"
                              onError={e => {
                                e.target.parentElement.style.display = 'none';
                              }}
                            />
                          </div>
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                            <strong>{m.name}</strong>
                            <span className="badge id">Enemy #{m.id}</span>
                          </div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                            Shields: {m.shields || '?'} | Steal/Drop: {m.stealDrop || 'None'}
                          </div>
                          <div className="weakness-row">
                            {m.weaknesses.map((wKey, idx) => {
                              const isRev = st?.revealedWeaknesses?.[idx];
                              const iconUrl = getWeaknessIconUrl(wKey);
                              return (
                                <span
                                  key={wKey}
                                  className={`weak-chip ${wKey} ${isRev ? 'revealed' : 'hidden'}`}
                                  title={isRev ? `${wKey} (Revealed)` : `${wKey} (Unrevealed)`}
                                >
                                  <img
                                    src={iconUrl}
                                    alt={wKey}
                                    className="weak-icon-img"
                                    loading="lazy"
                                    onError={e => {
                                      const fallback = getWeaknessCdnFallback(wKey);
                                      if (fallback && e.target.src !== fallback) {
                                        e.target.src = fallback;
                                      }
                                    }}
                                  />
                                  <span>{wKey}</span>
                                </span>
                              );
                            })}
                          </div>
                          <div style={{ fontSize: '0.75rem', marginTop: 4 }}>
                            <span className={`badge ${st?.isCompleted ? 'done' : 'pending'}`}>
                              {st?.isCompleted
                                ? 'All weaknesses known'
                                : `${revCount}/${m.weaknesses.length} known`}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Side Stories */}
          {activeZoneMeta.quests && activeZoneMeta.quests.length > 0 && (
            <div>
              <h3 style={{ fontSize: '0.95rem', marginBottom: 8 }}>
                Side Stories in {activeZoneMeta.name} ({activeZoneMeta.quests.length})
              </h3>
              <div className="card-grid">
                {activeZoneMeta.quests.map(qId => {
                  const q = questsById.get(qId);
                  if (!q) return null;
                  const { state, clearMethod } = getQuestStatus(saveState, q);
                  return (
                    <div
                      key={q.id}
                      className={`item-card ${state === 2 ? 'complete' : ''}`}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <strong>{q.name}</strong>
                        <span
                          className={`badge ${
                            state === 2 ? 'done' : state === 1 ? 'missable' : 'pending'
                          }`}
                        >
                          {state === 2
                            ? `Completed${clearMethod ? ` (solution ${clearMethod})` : ''}`
                            : state === 1
                            ? 'In progress'
                            : 'Not started'}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--accent-gold)' }}>
                        Given by <strong>{q.npc || 'Unknown'}</strong> | Town: {q.town}
                      </div>
                      {q.solution && (
                        <div
                          style={{
                            fontSize: '0.76rem',
                            color: 'var(--text-muted)',
                            whiteSpace: 'pre-line'
                          }}
                        >
                          {q.solution}
                        </div>
                      )}
                      {q.reward && (
                        <div style={{ fontSize: '0.76rem', color: 'var(--accent-green)' }}>
                          Reward: {q.reward.replace(/\n/g, ', ')}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
