// Pure functions that turn (staticDb, saveState, filters) into the lists the tabs display.
// No React in here, so they are easy to read and to test.
import { EXTINCT_MISSABLE_MONSTER_IDS, EXCLUSIVE_GROUP_MASKS } from './constants';

const matchesId = (id, query) => String(id) === query.replace('#', '');

/** True once the player is far enough along that Coastlands danger levels can have passed 31. */
export function isPostGame(saveState) {
  return Boolean(
    (saveState?.stats?.globetrotter?.current || 0) >= 90 ||
      saveState?.sideStoriesByRegion?.Highlands?.some(e => e.slotIndex === 18 && e.state >= 1)
  );
}

/** Missable monsters that can no longer spawn and still lack weaknesses. */
export function getExtinctMonsters(staticDb, saveState) {
  if (!isPostGame(saveState)) return [];
  return EXTINCT_MISSABLE_MONSTER_IDS
    .filter(id => !saveState.monsters?.[id]?.isCompleted)
    .map(id => staticDb.monsters[id])
    .filter(Boolean);
}

export function filterMonsters(staticDb, saveState, { search, hideCompleted, onlyMissable }) {
  const q = search.toLowerCase();
  return Object.values(staticDb.monsters).filter(m => {
    if (hideCompleted && saveState.monsters?.[m.id]?.isCompleted) return false;
    if (onlyMissable && !m.isMissable) return false;
    if (!q) return true;
    return (
      m.name.toLowerCase().includes(q) ||
      matchesId(m.id, q) ||
      (m.locations || []).some(l => l.toLowerCase().includes(q))
    );
  });
}

export function filterZones(staticDb, saveState, { search, hideCompleted }) {
  const q = search.toLowerCase();
  return Object.values(staticDb.zones).filter(z => {
    const st = saveState.zones?.[z.id];
    const isDone = st?.visited && st?.isChestsComplete && st?.isHiddenComplete;
    if (hideCompleted && isDone) return false;
    if (!q) return true;
    return (
      z.name.toLowerCase().includes(q) ||
      z.region.toLowerCase().includes(q) ||
      matchesId(z.id, q)
    );
  });
}

/** Does the player already hold one of the mutually exclusive masks? */
export function hasExclusiveMask(obtainedSet) {
  return EXCLUSIVE_GROUP_MASKS.some(id => obtainedSet.has(id));
}

/** 'obtained' | 'covered' (another mask was chosen) | 'missing' */
export function getItemStatus(item, obtainedSet) {
  if (obtainedSet.has(item.id)) return 'obtained';
  if (EXCLUSIVE_GROUP_MASKS.includes(item.id) && hasExclusiveMask(obtainedSet)) return 'covered';
  return 'missing';
}

export function filterCollectorItems(staticDb, obtainedSet, { search, hideObtained }) {
  const q = search.toLowerCase();
  return Object.values(staticDb.items).filter(item => {
    if (!item.isCollectorRequired) return false;
    if (hideObtained && getItemStatus(item, obtainedSet) !== 'missing') return false;
    if (!q) return true;
    return (
      item.name.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q) ||
      matchesId(item.id, q)
    );
  });
}

/** Save state of one side story: { state: 0 unstarted | 1 in progress | 2 done, clearMethod } */
export function getQuestStatus(saveState, quest) {
  const entries = saveState.sideStoriesByRegion?.[quest.saveRegion] || [];
  const found = entries.find(e => e.slotIndex === quest.slotIndex);
  return found
    ? { state: found.state, clearMethod: found.clearMethod }
    : { state: 0, clearMethod: 0 };
}

export function filterQuests(staticDb, saveState, { search, region, hideCompleted }) {
  const s = search.toLowerCase();
  return (staticDb.quests || []).filter(q => {
    if (hideCompleted && getQuestStatus(saveState, q).state === 2) return false;
    if (region !== 'ALL' && q.region !== region && q.saveRegion !== region) return false;
    if (!s) return true;
    return [q.name, q.town, q.npc, q.solution, q.reward].some(f => (f || '').toLowerCase().includes(s));
  });
}
