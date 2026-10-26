import React, { useState } from 'react';
import { filterCollectorItems, getItemStatus } from '../../lib/selectors';
import { EXCLUSIVE_GROUP_MASKS } from '../../lib/constants';

export default function CollectorTab({
  staticDb,
  obtainedSet,
  collectorStats
}) {
  const [itemSearch, setItemSearch] = useState('');
  const [hideObtainedItems, setHideObtainedItems] = useState(true);

  const collectorItems = filterCollectorItems(staticDb, obtainedSet, {
    search: itemSearch,
    hideObtained: hideObtainedItems
  });

  return (
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
          Hide Obtained ({collectorStats?.current || 0})
        </label>
        <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
          Showing {collectorItems.length} items
        </span>
      </div>

      <div className="card-grid">
        {collectorItems.map(item => {
          const status = getItemStatus(item, obtainedSet);
          const isMask = EXCLUSIVE_GROUP_MASKS.includes(item.id);
          const isCardDone = status !== 'missing';

          return (
            <div key={item.id} className={`item-card ${isCardDone ? 'complete' : ''}`}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <strong>{item.name}</strong>
                <span className="badge id">Item #{item.id}</span>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <span className="badge id">{item.category}</span>
                {status === 'obtained' ? (
                  <span className="badge done">Obtained</span>
                ) : status === 'covered' ? (
                  <span className="badge alternative">Covered by the mask you chose in Ch 2</span>
                ) : (
                  <span className="badge pending">
                    {isMask ? 'Missing (pick one of three)' : 'Missing'}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
