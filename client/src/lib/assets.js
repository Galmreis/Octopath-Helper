import monsterSprites from '../../../data/monsterSprites.json';
import characterIcons from '../../../data/characterIcons.json';
import weaknessIcons from '../../../data/weaknessIcons.json';

/**
 * Returns the monster sprite.
 * Prefers local downloaded asset if present in public/images/monsters/,
 * otherwise falls back to verified Fandom CDN URL.
 */
export function getMonsterSpriteUrl(monsterId) {
  const cdnUrl = monsterSprites[monsterId];
  if (!cdnUrl) return null;
  const ext = cdnUrl.includes('.gif') ? '.gif' : '.png';
  return `/images/monsters/${monsterId}${ext}`;
}

export function getMonsterCdnFallback(monsterId) {
  return monsterSprites[monsterId] || null;
}

/**
 * Returns the character portrait/icon for a given traveler name.
 */
export function getCharacterIconUrl(name) {
  return `/images/characters/${name.toLowerCase()}.png`;
}

export function getCharacterCdnFallback(name) {
  return characterIcons[name] || null;
}

/**
 * Returns the official in-game weapon/element weakness icon.
 */
export function getWeaknessIconUrl(type) {
  return `/images/weaknesses/${type.toLowerCase()}.png`;
}

export function getWeaknessCdnFallback(type) {
  return weaknessIcons[type.toLowerCase()] || null;
}
