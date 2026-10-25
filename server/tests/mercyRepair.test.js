const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { parseSaveBuffer } = require('../parser/parseSave');
const { getMercyStatus, applyMercyRepair } = require('../repair/mercyRepair');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const staticDb = {
  monsters: JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'monsters.json'), 'utf8')),
  zones: JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'zones.json'), 'utf8')),
  items: JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'items.json'), 'utf8')),
  quests: JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'quests.json'), 'utf8'))
};

// Use an actual save file copy in a dedicated temporary scratch space
const originalSavePath = 'C:\\Users\\Reis\\Documents\\My Games\\Octopath_Traveler\\76561198360788272\\SaveGames\\SaveData0.sav';
const tempDir = path.join(__dirname, 'tmp');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

const testSavePath = path.join(tempDir, 'TestSaveData.sav');

console.log('=== [TEST] Starting Automated Test for Mercy Repair ===');

// 1. Prepare isolated test copy
fs.copyFileSync(originalSavePath, testSavePath);
const initialBuf = fs.readFileSync(testSavePath);
const initialState = parseSaveBuffer(initialBuf);

console.log('1. Verifying initial save state pre-conditions:');
assert.strictEqual(initialState.monsters[208].isCompleted, false, 'Sea Birdian IV should initially be incomplete');
console.log('   ✓ Monster #208 is confirmed incomplete (0/4 weaknesses revealed)');

// 2. Test extinction detector
console.log('2. Testing Point-of-No-Return Extinction Detector:');
const mercyEligible = getMercyStatus(initialState, staticDb);
console.log('   Eligible targets detected:', mercyEligible);
assert.strictEqual(mercyEligible.length, 1, 'Should find exactly 1 extinct eligible monster');
assert.strictEqual(mercyEligible[0].id, 208, 'Extinct target must be #208 Sea Birdian IV');
console.log('   ✓ Extinction detection accurately flagged #208 Sea Birdian IV');

// 3. Apply Mercy Repair
console.log('3. Applying Mercy Repair to test save file:');
const result = applyMercyRepair(testSavePath, 'monster', 208, staticDb);
assert.strictEqual(result.success, true, 'Repair should report success');
assert(fs.existsSync(result.backupPath), 'Backup file must exist on disk');
console.log(`   ✓ Backup created successfully at: ${result.backupPath}`);

// 4. Verify post-conditions on the modified save file
console.log('4. Verifying post-repair save data integrity:');
const repairedBuf = fs.readFileSync(testSavePath);
const repairedState = parseSaveBuffer(repairedBuf);

const m208 = repairedState.monsters[208];
assert.strictEqual(m208.isCompleted, true, 'Monster #208 must now be completed');
assert.strictEqual(m208.isAnalysed, true, 'Monster #208 must now be analysed');
assert.deepStrictEqual(
  m208.revealedWeaknesses,
  [true, true, true, true],
  'All 4 weaknesses must be revealed'
);
assert.deepStrictEqual(m208.revealedByKey, {
  polearm: true,
  staff: true,
  fire: true,
  lightning: true
});
console.log('   ✓ Monster #208 weaknesses successfully flipped to 4/4 (polearm, staff, fire, lightning)');

// 5. Verify no collateral damage or corruption to adjacent data
console.log('5. Verifying adjacent save data integrity (no collateral damage):');
assert.strictEqual(repairedState.stats.playTimeSeconds, initialState.stats.playTimeSeconds, 'PlayTime unchanged');
assert.strictEqual(repairedState.stats.totalLeaf, initialState.stats.totalLeaf, 'Total Leaf unchanged');
assert.strictEqual(repairedState.party.length, initialState.party.length, 'Party unchanged');
assert.strictEqual(repairedState.stats.treasureHunter.current, initialState.stats.treasureHunter.current, 'Chests unchanged');
assert.strictEqual(repairedState.monsters[228].isCompleted, initialState.monsters[228].isCompleted, 'Buccaneer I unchanged');
console.log('   ✓ Global stats, party, chests, and adjacent monster records perfectly preserved');

// 6. Test idempotency (re-applying repair shouldn't crash or corrupt)
console.log('6. Testing Idempotency:');
const reapply = applyMercyRepair(testSavePath, 'monster', 208, staticDb);
assert.strictEqual(reapply.success, true);
const reapplyState = parseSaveBuffer(fs.readFileSync(testSavePath));
assert.strictEqual(reapplyState.monsters[208].isCompleted, true);
console.log('   ✓ Idempotent execution verified');

// 7. Cleanup temp files
fs.unlinkSync(testSavePath);
if (fs.existsSync(result.backupPath)) fs.unlinkSync(result.backupPath);
if (fs.existsSync(reapply.backupPath)) fs.unlinkSync(reapply.backupPath);
fs.rmdirSync(tempDir);
console.log('7. Cleaned up temporary test files');

console.log('\n=== ALL MERCY REPAIR AUTOMATED TESTS PASSED (100% OK) ===');
