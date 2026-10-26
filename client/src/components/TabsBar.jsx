import React from 'react';

export default function TabsBar({ activeTab, onSelectTab, stats }) {
  return (
    <div className="tabs-bar">
      <button
        type="button"
        className={`tab-btn ${activeTab === 'radar' ? 'active' : ''}`}
        onClick={() => onSelectTab('radar')}
      >
        <span>Field Radar</span>
        <span className="kbd-hint">1</span>
      </button>
      <button
        type="button"
        className={`tab-btn ${activeTab === 'monsters' ? 'active' : ''}`}
        onClick={() => onSelectTab('monsters')}
      >
        <span>Monsters ({stats.strategist?.current || 0}/{stats.strategist?.total || 0})</span>
        <span className="kbd-hint">2</span>
      </button>
      <button
        type="button"
        className={`tab-btn ${activeTab === 'zones' ? 'active' : ''}`}
        onClick={() => onSelectTab('zones')}
      >
        <span>Zones & Chests ({stats.treasureHunter?.current || 0}/734)</span>
        <span className="kbd-hint">3</span>
      </button>
      <button
        type="button"
        className={`tab-btn ${activeTab === 'collector' ? 'active' : ''}`}
        onClick={() => onSelectTab('collector')}
      >
        <span>Collector ({stats.collector?.current || 0}/{stats.collector?.total || 0})</span>
        <span className="kbd-hint">4</span>
      </button>
      <button
        type="button"
        className={`tab-btn ${activeTab === 'quests' ? 'active' : ''}`}
        onClick={() => onSelectTab('quests')}
      >
        <span>Side Stories ({stats.worthYourSalt?.completed || 0}/{stats.worthYourSalt?.total || 0})</span>
        <span className="kbd-hint">5</span>
      </button>
    </div>
  );
}
