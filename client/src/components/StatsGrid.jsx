import React from 'react';

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

export default function StatsGrid({ saveState }) {
  const { stats = {} } = saveState;

  return (
    <section className="stats-grid">
      <div className="stat-card highlight">
        <div className="stat-label">You are in</div>
        <div className="stat-value" style={{ fontSize: '1.15rem' }}>
          <span>{saveState.currentZoneName || 'Unknown Zone'}</span>
          <span className="badge id">#{saveState.currentZoneId}</span>
        </div>
        <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: 6 }}>
          Internal Map Key: <code>{saveState.currentLevelName}</code>
        </div>
      </div>

      <ProgressStat
        label="Strategist - weaknesses"
        current={stats.strategist?.current || 0}
        total={stats.strategist?.total || 0}
        subtitle={`${(stats.strategist?.total || 0) - (stats.strategist?.current || 0)} monsters remaining`}
      />
      <ProgressStat
        label="Treasure Hunter (Chests)"
        current={stats.treasureHunter?.current || 0}
        total={stats.treasureHunter?.total || 0}
        subtitle={`${(stats.treasureHunter?.total || 0) - (stats.treasureHunter?.current || 0)} chests unopened`}
      />
      <ProgressStat
        label="Eagle-Eyed (Hidden Items)"
        current={stats.eagleEyed?.current || 0}
        total={stats.eagleEyed?.total || 0}
        subtitle={`${(stats.eagleEyed?.total || 0) - (stats.eagleEyed?.current || 0)} hidden items left`}
      />
      <ProgressStat
        label="Collector (All Items)"
        current={stats.collector?.current || 0}
        total={stats.collector?.total || 0}
        subtitle={`${(stats.collector?.total || 0) - (stats.collector?.current || 0)} items unobtained`}
      />
      <ProgressStat
        label="Globetrotter (Locations)"
        current={stats.globetrotter?.current || 0}
        total={stats.globetrotter?.total || 0}
        subtitle={`${(stats.globetrotter?.total || 0) - (stats.globetrotter?.current || 0)} zones unvisited`}
      />
      <ProgressStat
        label="Worth Your Salt (Side Stories)"
        current={stats.worthYourSalt?.completed || 0}
        total={stats.worthYourSalt?.total || 0}
        subtitle={`${stats.worthYourSalt?.inProgress || 0} in progress • ${
          (stats.worthYourSalt?.total || 0) - (stats.worthYourSalt?.completed || 0)
        } remaining`}
      />
    </section>
  );
}
