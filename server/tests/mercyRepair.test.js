const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { parseSaveBuffer } = require('../parser/parseSave');
const { getMercyStatus, applyMercyRepair } = require('../repair/mercyRepair');
const { SAVE_FILE_PATH } = require('../config');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const staticDb = {
  monsters: JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'monsters.json'), 'utf8')),
  zones: JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'zones.json'), 'utf8')),
  items: JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'items.json'), 'utf8')),
  quests: JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'quests.json'), 'utf8'))
};

// Dynamically resolved active save file path
const originalSavePath = SAVE_FILE_PATH;
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

// 6. Test repair on Buccaneer I (#228) as well (simulating a player who missed it)
console.log('6. Testing Mercy Repair on Buccaneer I (#228):');
// Zero out 228 in the test buffer
const buf228 = fs.readFileSync(testSavePath);
function findAllTags(buffer, targetStr) {
  const target = Buffer.from(targetStr, 'ascii');
  const results = [];
  let index = 0;
  while ((index = buffer.indexOf(target, index)) !== -1) {
    results.push(index);
    index += target.length;
  }
  return results;
}
const addrs = findAllTags(buf228, 'IsAnalyse_');
const a228 = addrs[228];
const weakAddr228 = buf228.indexOf(Buffer.from('WeaknessOpen_', 'ascii'), a228);
const wKeyLen228 = buf228.readUInt32LE(weakAddr228 - 4);
const wTypeLen228 = buf228.readUInt32LE(weakAddr228 + wKeyLen228);
const valAddr228 = weakAddr228 + wKeyLen228 + 4 + wTypeLen228 + 9;
buf228.writeUInt8(0, valAddr228);
buf228.writeUInt8(0, valAddr228 + 1);
fs.writeFileSync(testSavePath, buf228);

const preState228 = parseSaveBuffer(buf228);
assert.strictEqual(preState228.monsters[228].isCompleted, false, 'Buccaneer I should now be incomplete');

const repair228 = applyMercyRepair(testSavePath, 'monster', 228, staticDb);
assert.strictEqual(repair228.success, true);
const postState228 = parseSaveBuffer(fs.readFileSync(testSavePath));
assert.strictEqual(postState228.monsters[228].isCompleted, true, 'Buccaneer I must now be completed');
assert.deepStrictEqual(postState228.monsters[228].revealedWeaknesses, [true, true]);
assert.deepStrictEqual(postState228.monsters[228].revealedByKey, { polearm: true, fire: true });
console.log('   ✓ Buccaneer I (#228) weaknesses successfully repaired to 2/2 (polearm, fire)');

// 7. Cleanup temp files
if (fs.existsSync(tempDir)) {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
console.log('7. Cleaned up temporary test files');

console.log('\n=== ALL MERCY REPAIR AUTOMATED TESTS PASSED (100% OK) ===');
