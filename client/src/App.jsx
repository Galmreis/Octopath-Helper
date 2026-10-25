import React, { useState, useEffect } from 'react';
import { useSaveData } from './hooks/useSaveData';

function ProgressStat({ label, current, total, subtitle, highlight }) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  return (
    <div className={`stat-card ${highlight ? 'highlight' : ''}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">
        <span>
          {current} / {total}
        </span>
        <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{pct}%</span>
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
      {subtitle && (
        <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: 4 }}>{subtitle}</div>
      )}
    </div>
  );
}

export default function App() {
  const { staticDb, saveState, saveFilePath, availableSlots, selectSaveSlot, connected, lastFlashIds } =
    useSaveData();
  const [activeTab, setActiveTab] = useState('radar');
  const [selectedZoneId, setSelectedZoneId] = useState(null);

  // Filters
  const [monsterSearch, setMonsterSearch] = useState('');
  const [hideCompletedMonsters, setHideCompletedMonsters] = useState(true);
  const [onlyMissableMonsters, setOnlyMissableMonsters] = useState(false);

  const [zoneSearch, setZoneSearch] = useState('');
  const [hideCompletedZones, setHideCompletedZones] = useState(true);

  const [itemSearch, setItemSearch] = useState('');
  const [hideObtainedItems, setHideObtainedItems] = useState(true);

  const [questSearch, setQuestSearch] = useState('');
  const [questRegionFilter, setQuestRegionFilter] = useState('ALL');
  const [hideCompletedQuests, setHideCompletedQuests] = useState(false);

  // Global hotkeys for seamless dual-screen control
  useEffect(() => {
    function handleKeyDown(e) {
      const activeTag = document.activeElement?.tagName;
      if (e.key === 'Escape') {
        if (activeTag === 'INPUT' || activeTag === 'SELECT' || activeTag === 'TEXTAREA') {
          document.activeElement.blur();
        }
        return;
      }
      if (activeTag === 'INPUT' || activeTag === 'SELECT' || activeTag === 'TEXTAREA') {
        return;
      }
      if (e.key === '1') setActiveTab('radar');
      else if (e.key === '2') setActiveTab('monsters');
      else if (e.key === '3') setActiveTab('zones');
      else if (e.key === '4') setActiveTab('collector');
      else if (e.key === '5') setActiveTab('quests');
      else if (e.key === 'f' || e.key === 'F') setSelectedZoneId(null);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (!staticDb || !saveState) {
    return (
      <div className="app-shell">
        <div className="panel">Loading Octopath Helper telemetry & static dictionaries...</div>
      </div>
    );
  }

  const { stats, party, recentEvents = [] } = saveState;
  const isInspecting = selectedZoneId !== null && selectedZoneId !== saveState.currentZoneId;
  const activeZoneId = isInspecting ? selectedZoneId : saveState.currentZoneId;
  const activeZoneMeta = staticDb.zones[activeZoneId];
  const activeZoneState = saveState.zones?.[activeZoneId];
  const obtainedSet = new Set(saveState.itemsObtained || []);

  // Filtered lists
  const allMonsters = Object.values(staticDb.monsters).filter(m => {
    const st = saveState.monsters?.[m.id];
    if (hideCompletedMonsters && st?.isCompleted) return false;
    if (onlyMissableMonsters && !m.isMissable) return false;
    if (monsterSearch) {
      const q = monsterSearch.toLowerCase();
      const matchName = m.name.toLowerCase().includes(q);
      const matchId = String(m.id) === q.replace('#', '');
      const matchLoc = (m.locations || []).some(l => l.toLowerCase().includes(q));
      if (!matchName && !matchId && !matchLoc) return false;
    }
    return true;
  });

  const allZones = Object.values(staticDb.zones).filter(z => {
    const st = saveState.zones?.[z.id];
    const isZoneDone = st?.visited && st?.isChestsComplete && st?.isHiddenComplete;
    if (hideCompletedZones && isZoneDone) return false;
    if (zoneSearch) {
      const q = zoneSearch.toLowerCase();
      if (
        !z.name.toLowerCase().includes(q) &&
        !z.region.toLowerCase().includes(q) &&
        String(z.id) !== q.replace('#', '')
      ) {
        return false;
      }
    }
    return true;
  });

  // Mutually exclusive mask group (Primrose Ch 2): items 325, 326, 327.
  const EXCLUSIVE_GROUP_MASKS = [325, 326, 327];
  const hasExclusiveMask = EXCLUSIVE_GROUP_MASKS.some(id => obtainedSet.has(id));

  const collectorItems = Object.values(staticDb.items).filter(item => {
    if (!item.isCollectorRequired) return false;
    const isGot = obtainedSet.has(item.id);
    const isMask = EXCLUSIVE_GROUP_MASKS.includes(item.id);
    const isSatisfied = isGot || (isMask && hasExclusiveMask);
    if (hideObtainedItems && isSatisfied) return false;
    if (itemSearch) {
      const q = itemSearch.toLowerCase();
      if (
        !item.name.toLowerCase().includes(q) &&
        !item.category.toLowerCase().includes(q) &&
        String(item.id) !== q.replace('#', '')
      ) {
        return false;
      }
    }
    return true;
  });

  function getQuestStatus(quest) {
    const regList = saveState.sideStoriesByRegion?.[quest.saveRegion] || [];
    const found = regList.find(e => e.slotIndex === quest.slotIndex);
    if (!found) return { state: 0, clearMethod: 0 };
    return { state: found.state, clearMethod: found.clearMethod };
  }

  const allQuests = (staticDb.quests || []).filter(q => {
    const { state } = getQuestStatus(q);
    if (hideCompletedQuests && state === 2) return false;
    if (questRegionFilter !== 'ALL' && q.region !== questRegionFilter && q.saveRegion !== questRegionFilter) {
      return false;
    }
    if (questSearch) {
      const s = questSearch.toLowerCase();
      const matchName = q.name.toLowerCase().includes(s);
      const matchTown = (q.town || '').toLowerCase().includes(s);
      const matchNpc = (q.npc || '').toLowerCase().includes(s);
      const matchSol = (q.solution || '').toLowerCase().includes(s);
      const matchRew = (q.reward || '').toLowerCase().includes(s);
      if (!matchName && !matchTown && !matchNpc && !matchSol && !matchRew) return false;
    }
    return true;
  });

  const questsById = new Map((staticDb.quests || []).map(q => [q.id, q]));

  return (
    <div className="app-shell">
      {/* Top Bar */}
      <header className="top-bar">
        <div>
          <div className="brand-title">OCTOPATH HELPER — LIVE TELEMETRY & 100% TRACKER</div>
          <div
            style={{
              fontSize: '0.8rem',
              color: 'var(--text-muted)',
              marginTop: 4,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexWrap: 'wrap'
            }}
          >
            <span>
              {saveState.sourceType === 'live-ram'
                ? 'Active Source: Live Game RAM (Any Loaded Slot) • Disk Slot Inspector:'
                : 'Active Save Slot:'}
            </span>
            {availableSlots && availableSlots.length > 0 ? (
              <select
                className="select"
                value={saveFilePath}
                onChange={e => selectSaveSlot(e.target.value)}
                style={{ padding: '3px 8px', fontSize: '0.78rem' }}
              >
                {availableSlots.map(slot => (
                  <option key={slot.filePath} value={slot.filePath}>
                    {slot.label} (Modified: {new Date(slot.updatedAt).toLocaleString()})
                  </option>
                ))}
              </select>
            ) : (
              <code>{saveFilePath || 'SaveData0.sav'}</code>
            )}
            <span>(100% Read-Only)</span>
          </div>
        </div>
        <div className="telemetry-status">
          <span className={`status-pill ${connected ? 'online' : 'offline'}`}>
            ●{' '}
            {connected
              ? saveState.sourceType === 'live-ram'
                ? `WS LIVE (Real-Time RAM @ ${saveState.ramAddress})`
                : 'WS LIVE (Autosave Fallback)'
              : 'RECONNECTING...'}
          </span>
          <span>
            Party: <strong>{(party || []).map(p => p.name).join(', ')}</strong>
          </span>
          <span>
            Play Time: <strong>{stats.playTimeFormatted}</strong>
          </span>
          <span>
            Updated: <strong>{new Date(saveState.lastUpdated).toLocaleTimeString()}</strong>
          </span>
        </div>
      </header>

      {/* Global Completion Bar */}
      <section className="stats-grid">
        <div className="stat-card highlight">
          <div className="stat-label">Current Player Location</div>
          <div className="stat-value" style={{ fontSize: '1.02rem', color: 'var(--accent-gold)' }}>
            <span>{saveState.currentZoneName || 'Unknown Zone'}</span>
            <span className="badge id">#{saveState.currentZoneId}</span>
          </div>
          <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: 6 }}>
            Internal Map Key: <code>{saveState.currentLevelName}</code>
          </div>
        </div>

        <ProgressStat
          label="Strategist (Weaknesses)"
          current={stats.strategist.current}
          total={stats.strategist.total}
          subtitle={`${stats.strategist.total - stats.strategist.current} monsters remaining`}
        />
        <ProgressStat
          label="Treasure Hunter (Chests)"
          current={stats.treasureHunter.current}
          total={stats.treasureHunter.total}
          subtitle={`${stats.treasureHunter.total - stats.treasureHunter.current} chests unopened`}
        />
        <ProgressStat
          label="Eagle-Eyed (Hidden Items)"
          current={stats.eagleEyed.current}
          total={stats.eagleEyed.total}
          subtitle={`${stats.eagleEyed.total - stats.eagleEyed.current} hidden items left`}
        />
        <ProgressStat
          label="Collector (All Items)"
          current={stats.collector.current}
          total={stats.collector.total}
          subtitle={`${stats.collector.total - stats.collector.current} items unobtained`}
        />
        <ProgressStat
          label="Globetrotter (Locations)"
          current={stats.globetrotter.current}
          total={stats.globetrotter.total}
          subtitle={`${stats.globetrotter.total - stats.globetrotter.current} zones unvisited`}
        />
        <ProgressStat
          label="Worth Your Salt (Side Stories)"
          current={stats.worthYourSalt.completed}
          total={stats.worthYourSalt.total}
          subtitle={`${stats.worthYourSalt.inProgress} in progress • ${
            stats.worthYourSalt.total - stats.worthYourSalt.completed
          } remaining`}
        />
      </section>

      {/* Main Content + Right Live Telemetry Sidebar */}
      <div className="main-layout">
        <main className="panel">
          <div className="tabs-bar">
            <button
              className={`tab-btn ${activeTab === 'radar' ? 'active' : ''}`}
              onClick={() => setActiveTab('radar')}
            >
              1. Current Zone Radar (#{activeZoneId})
              <span className="kbd-hint">1</span>
            </button>
            <button
              className={`tab-btn ${activeTab === 'monsters' ? 'active' : ''}`}
              onClick={() => setActiveTab('monsters')}
            >
              2. Strategist Monsters ({stats.strategist.current}/{stats.strategist.total})
              <span className="kbd-hint">2</span>
            </button>
            <button
              className={`tab-btn ${activeTab === 'zones' ? 'active' : ''}`}
              onClick={() => setActiveTab('zones')}
            >
              3. Zones, Chests & Hidden ({stats.treasureHunter.current}/734)
              <span className="kbd-hint">3</span>
            </button>
            <button
              className={`tab-btn ${activeTab === 'collector' ? 'active' : ''}`}
              onClick={() => setActiveTab('collector')}
            >
              4. Collector Items ({stats.collector.current}/{stats.collector.total})
              <span className="kbd-hint">4</span>
            </button>
            <button
              className={`tab-btn ${activeTab === 'quests' ? 'active' : ''}`}
              onClick={() => setActiveTab('quests')}
            >
              5. Side Stories ({stats.worthYourSalt.completed}/{stats.worthYourSalt.total})
              <span className="kbd-hint">5</span>
            </button>
          </div>

          {/* TAB 1: CURRENT ZONE RADAR */}
          {activeTab === 'radar' && (
            <div>
              <div className="filter-row">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>Zone Inspector:</span>
                  <select
                    className="select"
                    value={activeZoneId || ''}
                    onChange={e => {
                      const val = Number(e.target.value);
                      setSelectedZoneId(val === saveState.currentZoneId ? null : val);
                    }}
                  >
                    {Object.values(staticDb.zones).map(z => (
                      <option key={z.id} value={z.id}>
                        {z.id === saveState.currentZoneId ? '📍 ' : ''}#{z.id} — {z.name} ({z.region})
                      </option>
                    ))}
                  </select>
                </div>

                {isInspecting ? (
                  <button
                    className="action-btn"
                    onClick={() => setSelectedZoneId(null)}
                    title="Return to your live character location"
                  >
                    <span>📍 Return to Live Location (#{saveState.currentZoneId} {saveState.currentZoneName})</span>
                    <span className="kbd-hint">F</span>
                  </button>
                ) : (
                  <span className="badge done" style={{ padding: '6px 12px', fontSize: '0.78rem' }}>
                    ● LIVE COMPANION RADAR (Auto-Tracking)
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
                          ℹ️ {activeZoneMeta.tips}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Chests in Current Zone */}
                  <div>
                    <h3 style={{ fontSize: '0.95rem', marginBottom: 8 }}>
                      Treasure Chests ({activeZoneState?.chestsOpened.filter(Boolean).length || 0} /{' '}
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
                                  {isOpened ? '✓ OPENED' : '○ UNOPENED'}
                                </span>
                                {chest.isLocked && (
                                  <span className="badge locked">Purple Chest (Therion)</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Hidden Items in Current Zone */}
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
                                  {isFound ? '✓ FOUND' : '○ UNFOUND'}
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

                  {/* Monsters in Current Zone */}
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
                          return (
                            <div
                              key={mId}
                              className={`item-card ${st?.isCompleted ? 'complete' : ''} ${
                                lastFlashIds[`monster-${mId}`] ? 'flash' : ''
                              }`}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <strong>{m.name}</strong>
                                <span className="badge id">Enemy #{m.id}</span>
                              </div>
                              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                Shields: {m.shields || '?'} | Steal/Drop: {m.stealDrop || 'None'}
                              </div>
                              <div className="weakness-row">
                                {m.weaknesses.map((wKey, idx) => {
                                  const isRev = st?.revealedWeaknesses?.[idx];
                                  return (
                                    <span
                                      key={wKey}
                                      className={`weak-chip ${isRev ? 'revealed' : 'hidden'}`}
                                    >
                                      {isRev ? '✓ ' : '? '}
                                      {wKey}
                                    </span>
                                  );
                                })}
                              </div>
                              <div style={{ fontSize: '0.75rem', marginTop: 2 }}>
                                <span className={`badge ${st?.isCompleted ? 'done' : 'pending'}`}>
                                  {st?.isCompleted
                                    ? '✓ ALL WEAKNESSES REVEALED'
                                    : `${revCount}/${m.weaknesses.length} Revealed`}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Side Stories in Current Zone */}
                  {activeZoneMeta.quests && activeZoneMeta.quests.length > 0 && (
                    <div>
                      <h3 style={{ fontSize: '0.95rem', marginBottom: 8 }}>
                        Side Stories in {activeZoneMeta.name} ({activeZoneMeta.quests.length})
                      </h3>
                      <div className="card-grid">
                        {activeZoneMeta.quests.map(qId => {
                          const q = questsById.get(qId);
                          if (!q) return null;
                          const { state, clearMethod } = getQuestStatus(q);
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
                                    ? `✓ COMPLETED${clearMethod ? ` (Sol. ${clearMethod})` : ''}`
                                    : state === 1
                                    ? '● IN PROGRESS'
                                    : '○ UNSTARTED'}
                                </span>
                              </div>
                              <div style={{ fontSize: '0.78rem', color: 'var(--accent-gold)' }}>
                                Quest Giver NPC: <strong>{q.npc || 'Unknown'}</strong> | Town: {q.town}
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
          )}

          {/* TAB 2: STRATEGIST MONSTERS */}
          {activeTab === 'monsters' && (
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
                  Hide Completed ({stats.strategist.current})
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

              <div className="card-grid">
                {allMonsters.map(m => {
                  const st = saveState.monsters?.[m.id];
                  return (
                    <div key={m.id} className={`item-card ${st?.isCompleted ? 'complete' : ''}`}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <strong>{m.name}</strong>
                        <span className="badge id">#{m.id}</span>
                      </div>
                      <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                        {(m.locations || []).join(', ') || 'Various / Dungeon'}
                      </div>
                      <div className="weakness-row">
                        {m.weaknesses.map((wKey, idx) => {
                          const isRev = st?.revealedWeaknesses?.[idx];
                          return (
                            <span
                              key={wKey}
                              className={`weak-chip ${isRev ? 'revealed' : 'hidden'}`}
                            >
                              {isRev ? '✓ ' : '? '}
                              {wKey}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 3: ZONES, CHESTS & HIDDEN ITEMS */}
          {activeTab === 'zones' && (
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
                  const missingHidden = z.hiddenItems.filter(
                    (_, idx) => !st?.hiddenItemsFound?.[idx]
                  );

                  return (
                    <div
                      key={z.id}
                      className="item-card"
                      style={{ cursor: 'pointer' }}
                      onClick={() => {
                        setFollowPlayerZone(false);
                        setSelectedZoneId(z.id);
                        setActiveTab('radar');
                      }}
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
          )}

          {/* TAB 4: COLLECTOR ITEMS */}
          {activeTab === 'collector' && (
            <div>
              <div className="filter-row">
                <input
                  className="input"
                  placeholder="Search item name, category, or #ItemID..."
                  value={itemSearch}
                  onChange={e => setItemSearch(e.target.value)}
                  style={{ minWidth: 260 }}
                />
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={hideObtainedItems}
                    onChange={e => setHideObtainedItems(e.target.checked)}
                  />
                  Hide Obtained ({stats.collector.current})
                </label>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  Showing {collectorItems.length} items
                </span>
              </div>

              <div className="card-grid">
                {collectorItems.map(item => {
                  const isGot = obtainedSet.has(item.id);
                  const isMask = EXCLUSIVE_GROUP_MASKS.includes(item.id);
                  const isAltSatisfied = !isGot && isMask && hasExclusiveMask;
                  const isCardDone = isGot || isAltSatisfied;
                  return (
                    <div key={item.id} className={`item-card ${isCardDone ? 'complete' : ''}`}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <strong>{item.name}</strong>
                        <span className="badge id">Item #{item.id}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span className="badge id">{item.category}</span>
                        {isGot ? (
                          <span className="badge done">✓ OBTAINED</span>
                        ) : isAltSatisfied ? (
                          <span className="badge alternative">✓ CHOICE SATISFIED (Other Mask Chosen in Ch 2)</span>
                        ) : (
                          <span className="badge pending">
                            {isMask ? '○ MISSING (1 of 3 required)' : '○ MISSING'}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 5: SIDE STORIES (WORTH YOUR SALT) */}
          {activeTab === 'quests' && (
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
                  Hide Completed ({stats.worthYourSalt.completed}/101)
                </label>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  Showing {allQuests.length} side stories
                </span>
              </div>

              <div className="card-grid">
                {allQuests.map(q => {
                  const { state, clearMethod } = getQuestStatus(q);
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
                            ? `✓ COMPLETED${clearMethod ? ` (Sol. ${clearMethod})` : ''}`
                            : state === 1
                            ? '● IN PROGRESS'
                            : '○ UNSTARTED'}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--accent-gold)' }}>
                        <strong>{q.region}</strong> — {q.town} | NPC: <strong>{q.npc || 'Unknown'}</strong>
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
          )}
        </main>

        {/* Right Sidebar: Live Telemetry Event Feed */}
        <aside className="panel">
          <h3 style={{ fontSize: '0.95rem', color: 'var(--accent-gold)', marginBottom: 10 }}>
            Live Telemetry Event Log
          </h3>
          <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginBottom: 10 }}>
            Every autosave diff (room change, chest opened, weakness revealed, item obtained) logs
            here and in <code>server/live-telemetry.log</code>.
          </div>
          <div className="event-feed">
            {recentEvents.map(ev => (
              <div key={ev.id} className="event-item">
                <div className="event-meta">
                  <span>{ev.type}</span>
                  <span>{new Date(ev.timestamp).toLocaleTimeString()}</span>
                </div>
                <div>{ev.message}</div>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
