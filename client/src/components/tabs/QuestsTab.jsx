import React, { useState } from 'react';
import { filterQuests, getQuestStatus } from '../../lib/selectors';

export default function QuestsTab({
  staticDb,
  saveState
}) {
  const [questSearch, setQuestSearch] = useState('');
  const [questRegionFilter, setQuestRegionFilter] = useState('ALL');
  const [hideCompletedQuests, setHideCompletedQuests] = useState(false);

  const allQuests = filterQuests(staticDb, saveState, {
    search: questSearch,
    region: questRegionFilter,
    hideCompleted: hideCompletedQuests
  });

  return (
    <div>
      <div className="filter-row">
        <input
          className="input"
          placeholder="Search quest name, town, NPC, solution, or reward..."
          value={questSearch}
          onChange={e => setQuestSearch(e.target.value)}
          style={{ minWidth: 280 }}
        />
        <select
          className="select"
          value={questRegionFilter}
          onChange={e => setQuestRegionFilter(e.target.value)}
        >
          <option value="ALL">All Regions (101)</option>
          <option value="Frostlands">Frostlands (13)</option>
          <option value="Flatlands">Flatlands (12)</option>
          <option value="Coastlands">Coastlands (12)</option>
          <option value="Highlands">Highlands (12)</option>
          <option value="Sunlands">Sunlands (12)</option>
          <option value="Riverlands">Riverlands + Starting Town (16)</option>
          <option value="Cliftlands">Cliftlands (12)</option>
          <option value="Woodlands">Woodlands (12)</option>
        </select>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={hideCompletedQuests}
            onChange={e => setHideCompletedQuests(e.target.checked)}
          />
          Hide Completed ({saveState.stats?.worthYourSalt?.completed || 0}/101)
        </label>
        <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
          Showing {allQuests.length} side stories
        </span>
      </div>

      <div className="card-grid">
        {allQuests.map(q => {
          const { state, clearMethod } = getQuestStatus(saveState, q);
          return (
            <div key={q.id} className={`item-card ${state === 2 ? 'complete' : ''}`}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <strong>
                  #{q.id} — {q.name}
                </strong>
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
                <strong>{q.region}</strong> — {q.town} | Given by <strong>{q.npc || 'Unknown'}</strong>
              </div>
              {q.solution && (
                <div
                  style={{
                    fontSize: '0.76rem',
                    color: 'var(--text-muted)',
                    whiteSpace: 'pre-line',
                    marginTop: 4
                  }}
                >
                  {q.solution}
                </div>
              )}
              {q.reward && (
                <div
                  style={{
                    fontSize: '0.76rem',
                    color: 'var(--accent-green)',
                    marginTop: 4
                  }}
                >
                  Reward: {q.reward.replace(/\n/g, ' • ')}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
