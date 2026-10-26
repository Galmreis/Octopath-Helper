import React, { useState } from 'react';
import { filterMonsters, getExtinctMonsters, isPostGame } from '../../lib/selectors';
import { EXTINCT_MISSABLE_MONSTER_IDS } from '../../lib/constants';
import { getMonsterSpriteUrl, getWeaknessIconUrl, getWeaknessCdnFallback } from '../../lib/assets';

export default function MonstersTab({
  staticDb,
  saveState,
  onMercyRepair,
  repairingId
}) {
  const [monsterSearch, setMonsterSearch] = useState('');
  const [hideCompletedMonsters, setHideCompletedMonsters] = useState(true);
  const [onlyMissableMonsters, setOnlyMissableMonsters] = useState(false);

  const extinctUncompletedMonsters = getExtinctMonsters(staticDb, saveState);
  const postGame = isPostGame(saveState);

  const allMonsters = filterMonsters(staticDb, saveState, {
    search: monsterSearch,
    hideCompleted: hideCompletedMonsters,
    onlyMissable: onlyMissableMonsters
  });

  return (
    <div>
      <div className="filter-row">
        <input
          className="input"
          placeholder="Search monster name, #ID, or location..."
          value={monsterSearch}
          onChange={e => setMonsterSearch(e.target.value)}
          style={{ minWidth: 260 }}
        />
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={hideCompletedMonsters}
            onChange={e => setHideCompletedMonsters(e.target.checked)}
          />
          Hide Completed ({saveState.stats?.strategist?.current || 0})
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={onlyMissableMonsters}
            onChange={e => setOnlyMissableMonsters(e.target.checked)}
          />
          Chapter/Missable Candidates Only
        </label>
        <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
          Showing {allMonsters.length} monsters
        </span>
      </div>

      {extinctUncompletedMonsters.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
          {extinctUncompletedMonsters.map(m => (
            <div key={m.id} className="alert">
              <div>
                <strong>{m.name} (#{m.id}) can no longer appear</strong>
                <p>
                  Coastlands danger levels have permanently scaled past 31, preventing {m.name} from spawning.
                  You can apply a surgical save file mercy repair (with an automatic .bak backup) to restore 100% Strategist eligibility.
                </p>
              </div>
              <button
                className="action-btn"
                style={{ borderColor: 'var(--accent-red)', color: 'var(--accent-red)' }}
                onClick={() => onMercyRepair('monster', m.id, m.name)}
                disabled={repairingId === m.id}
              >
                {repairingId === m.id ? 'Repairing...' : 'Repair save'}
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="card-grid">
        {allMonsters.map(m => {
          const st = saveState.monsters?.[m.id];
          const spriteUrl = getMonsterSpriteUrl(m.id);
          return (
            <div key={m.id} className={`item-card ${st?.isCompleted ? 'complete' : ''}`}>
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
                    <span className="badge id">#{m.id}</span>
                  </div>
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                    {(m.locations || []).join(', ') || 'Various / Dungeon'}
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
                </div>
              </div>
              {EXTINCT_MISSABLE_MONSTER_IDS.includes(m.id) && !st?.isCompleted && postGame && (
                <div style={{ marginTop: 8 }}>
                  <button
                    className="action-btn"
                    style={{ fontSize: '0.74rem', width: '100%', justifyContent: 'center' }}
                    onClick={() => onMercyRepair('monster', m.id, m.name)}
                    disabled={repairingId === m.id}
                  >
                    Repair save
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
