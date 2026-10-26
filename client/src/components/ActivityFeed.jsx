import React from 'react';

export default function ActivityFeed({ events = [] }) {
  return (
    <aside className="panel">
      <h3>Activity</h3>
      <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginBottom: 10 }}>
        Room changes, chests, weaknesses and items show up here as you play.
      </div>
      <div className="event-feed">
        {events.map(ev => (
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
  );
}
