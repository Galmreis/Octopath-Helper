const fs = require('fs');
const path = require('path');
const { DATA_DIR, TELEMETRY_LOG_PATH } = require('./config');

const monstersDb = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'monsters.json'), 'utf8'));
const zonesDb = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'zones.json'), 'utf8'));
const itemsDb = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'items.json'), 'utf8'));
const questsDb = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'quests.json'), 'utf8'));

const questByRegionSlot = new Map();
for (const q of questsDb) {
  questByRegionSlot.set(`${q.saveRegion}:${q.slotIndex}`, q);
}

// === CONCEPT: State Store & Diff Engine ===
// Rather than blindly broadcasting a raw save snapshot, StateStore compares
// the incoming state (`next`) against the previous state (`prev`).
// This produces a list of human-readable domain events (e.g. ZONE_CHANGE,
// CHEST_OPENED, WEAKNESS_REVEALED) for both the UI activity feed and
// terminal/log observability during live gameplay testing.
class StateStore {
  constructor() {
    this.currentState = null;
    this.recentEvents = [];
  }

  computeDiffEvents(prev, next, sourceType) {
    if (!prev) {
      return [
        {
          id: `${Date.now()}-init`,
          timestamp: next.lastUpdated,
          source: sourceType,
          type: 'INITIAL_LOAD',
          message: `Loaded save state at Zone #${next.currentZoneId} (${next.currentZoneName || next.currentLevelName})`
        }
      ];
    }

    // Detect if the user loaded a different save slot (PlayTime jumped by >120s or went backwards)
    const prevPlay = prev.stats?.playTimeSeconds || 0;
    const nextPlay = next.stats?.playTimeSeconds || 0;
    if (Math.abs(nextPlay - prevPlay) > 120 || next.stats?.battleCount < prev.stats?.battleCount) {
      return [
        {
          id: `${Date.now()}-slot-switch`,
          timestamp: next.lastUpdated,
          source: sourceType,
          type: 'SAVE_SLOT_SWITCH',
          message: `Loaded different save state at #${next.currentZoneId} (${
            next.currentZoneName || next.currentLevelName
          }) — PlayTime: ${next.stats?.playTimeFormatted}, Strategist: ${
            next.stats?.strategist?.current
          }/381, Chests: ${next.stats?.treasureHunter?.current}/734`
        }
      ];
    }

    const events = [];
    const ts = next.lastUpdated;

    // 1. Zone / Room Transition
    if (prev.currentZoneId !== next.currentZoneId || prev.currentLevelName !== next.currentLevelName) {
      events.push({
        id: `${Date.now()}-zone`,
        timestamp: ts,
        source: sourceType,
        type: 'ZONE_CHANGE',
        fromZoneId: prev.currentZoneId,
        toZoneId: next.currentZoneId,
        levelName: next.currentLevelName,
        message: `Moved from #${prev.currentZoneId} (${prev.currentZoneName || prev.currentLevelName}) -> #${next.currentZoneId} (${next.currentZoneName || next.currentLevelName} [${next.currentLevelName}])`
      });
    }

    // 2. Party Changes
    const prevPartyStr = (prev.party || []).map(p => p.name).join(', ');
    const nextPartyStr = (next.party || []).map(p => p.name).join(', ');
    if (prevPartyStr !== nextPartyStr) {
      events.push({
        id: `${Date.now()}-party`,
        timestamp: ts,
        source: sourceType,
        type: 'PARTY_CHANGE',
        message: `Party updated: [${nextPartyStr}]`
      });
    }

    // 3. Zone Visited, Chests Opened, Hidden Items Found
    for (const [zIdStr, nextZone] of Object.entries(next.zones || {})) {
      const prevZone = prev.zones?.[zIdStr];
      if (!prevZone) continue;
      const zMeta = zonesDb[zIdStr] || { name: `Zone #${zIdStr}`, chests: [], hiddenItems: [] };

      if (!prevZone.visited && nextZone.visited) {
        events.push({
          id: `${Date.now()}-visit-${zIdStr}`,
          timestamp: ts,
          source: sourceType,
          type: 'ZONE_DISCOVERED',
          zoneId: Number(zIdStr),
          message: `Discovered new zone: #${zIdStr} ${zMeta.name} (${next.stats.globetrotter.current}/${next.stats.globetrotter.total})`
        });
      }

      nextZone.chestsOpened.forEach((opened, idx) => {
        if (opened && !prevZone.chestsOpened[idx]) {
          const chestName = zMeta.chests?.[idx]?.contents || `Chest #${idx + 1}`;
          events.push({
            id: `${Date.now()}-chest-${zIdStr}-${idx}`,
            timestamp: ts,
            source: sourceType,
            type: 'CHEST_OPENED',
            zoneId: Number(zIdStr),
            chestIndex: idx,
            message: `Opened Chest #${idx + 1} in ${zMeta.name}: ${chestName} (${next.stats.treasureHunter.current}/734)`
          });
        }
      });

      nextZone.hiddenItemsFound.forEach((found, idx) => {
        if (found && !prevZone.hiddenItemsFound[idx]) {
          const hiddenName = zMeta.hiddenItems?.[idx]?.contents || `Hidden Item #${idx + 1}`;
          events.push({
            id: `${Date.now()}-hidden-${zIdStr}-${idx}`,
            timestamp: ts,
            source: sourceType,
            type: 'HIDDEN_ITEM_FOUND',
            zoneId: Number(zIdStr),
            hiddenIndex: idx,
            message: `Found Hidden Item #${idx + 1} in ${zMeta.name}: ${hiddenName} (${next.stats.eagleEyed.current}/152)`
          });
        }
      });
    }

    // 4. Monster Weaknesses Revealed
    for (const [mIdStr, nextMon] of Object.entries(next.monsters || {})) {
      const prevMon = prev.monsters?.[mIdStr];
      if (!prevMon) continue;
      const mMeta = monstersDb[mIdStr] || { name: `Monster #${mIdStr}`, weaknesses: [] };

      const newlyRevealed = [];
      for (const [wKey, isRev] of Object.entries(nextMon.revealedByKey || {})) {
        if (isRev && !prevMon.revealedByKey?.[wKey]) {
          newlyRevealed.push(wKey);
        }
      }

      if (newlyRevealed.length > 0) {
        const revCount = nextMon.revealedWeaknesses.filter(Boolean).length;
        const totCount = mMeta.weaknesses.length;
        events.push({
          id: `${Date.now()}-weak-${mIdStr}`,
          timestamp: ts,
          source: sourceType,
          type: 'WEAKNESS_REVEALED',
          monsterId: Number(mIdStr),
          weaknesses: newlyRevealed,
          isMonsterComplete: nextMon.isCompleted,
          message: `Revealed [${newlyRevealed.join(', ')}] on #${mIdStr} ${mMeta.name} (${revCount}/${totCount})${nextMon.isCompleted ? ' — STRATEGIST ENTRY COMPLETE!' : ''}`
        });
      }
    }

    // 5. Collector Items Obtained
    const prevItems = new Set(prev.itemsObtained || []);
    for (const itemId of next.itemsObtained || []) {
      if (!prevItems.has(itemId)) {
        const itemMeta = itemsDb[itemId];
        if (itemMeta && itemMeta.isCollectorRequired) {
          events.push({
            id: `${Date.now()}-item-${itemId}`,
            timestamp: ts,
            source: sourceType,
            type: 'ITEM_OBTAINED',
            itemId,
            message: `New Collector Item obtained: #${itemId} ${itemMeta.name} [${itemMeta.category}] (${next.stats.collector.current}/${next.stats.collector.total})`
          });
        }
      }
    }

    // 6. Side Stories (Worth Your Salt)
    for (const [reg, nextList] of Object.entries(next.sideStoriesByRegion || {})) {
      const prevList = prev.sideStoriesByRegion?.[reg] || [];
      const prevMap = new Map(prevList.map(e => [e.slotIndex, e.state]));
      for (const entry of nextList) {
        const prevState = prevMap.get(entry.slotIndex) || 0;
        if (entry.state !== prevState) {
          const qMeta = questByRegionSlot.get(`${reg}:${entry.slotIndex}`);
          const qLabel = qMeta
            ? `#${qMeta.id} "${qMeta.name}" (${qMeta.town} — NPC: ${qMeta.npc})`
            : `${reg} Slot #${entry.slotIndex}`;
          if (entry.state === 2) {
            events.push({
              id: `${Date.now()}-quest-done-${reg}-${entry.slotIndex}`,
              timestamp: ts,
              source: sourceType,
              type: 'QUEST_COMPLETED',
              message: `Completed Side Story ${qLabel} (${next.stats.worthYourSalt.completed}/101)`
            });
          } else if (entry.state === 1) {
            events.push({
              id: `${Date.now()}-quest-start-${reg}-${entry.slotIndex}`,
              timestamp: ts,
              source: sourceType,
              type: 'QUEST_STARTED',
              message: `Started Side Story ${qLabel}`
            });
          }
        }
      }
    }

    // 7. Heartbeat if file saved with no tracked achievement diffs (e.g. saved at journal in same room)
    if (events.length === 0) {
      events.push({
        id: `${Date.now()}-save`,
        timestamp: ts,
        source: sourceType,
        type: 'SAVE_SYNC',
        message: `Autosave synced at #${next.currentZoneId} (${next.currentZoneName || next.currentLevelName}) — Battles: ${next.stats.battleCount}, PlayTime: ${next.stats.playTimeFormatted}`
      });
    }

    return events;
  }

  update(nextState, sourceType = 'autosave') {
    const newEvents = this.computeDiffEvents(this.currentState, nextState, sourceType);
    this.recentEvents = [...newEvents, ...this.recentEvents].slice(0, 50);
    this.currentState = {
      ...nextState,
      sourceType,
      recentEvents: this.recentEvents
    };

    // Write structured telemetry lines to console and server/live-telemetry.log
    for (const ev of newEvents) {
      const logLine = `[${new Date(ev.timestamp).toLocaleTimeString()}] [${ev.type}] ${ev.message}`;
      console.log(logLine);
      try {
        fs.appendFileSync(TELEMETRY_LOG_PATH, logLine + '\n');
      } catch (_) {}
    }

    return {
      state: this.currentState,
      newEvents
    };
  }
}

module.exports = { StateStore };
