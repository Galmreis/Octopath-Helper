const fs = require('fs');
const path = require('path');
const { parseSaveBuffer } = require('../parser/parseSave');

// Point of no return: 4+ travelers have completed Ch 4 or post-game quests active
function isCoastlandsScaledPast31(saveState) {
  const highlandsSideStories = saveState?.sideStoriesByRegion?.Highlands || [];
  const atJourneysEnd = highlandsSideStories.find(e => e.slotIndex === 18 && e.state >= 1);
  const globetrotterHigh = (saveState?.stats?.globetrotter?.current || 0) >= 90;
  const questsHigh = (saveState?.stats?.worthYourSalt?.completed || 0) >= 30;
  return Boolean(atJourneysEnd || (globetrotterHigh && questsHigh));
}

// Known permanently missable entities and their extinction conditions
const MISSABLE_TARGETS = {
  monster: {
    208: {
      id: 208,
      name: 'Sea Birdian IV',
      reason: 'Coastlands danger level permanently scales past 31 after advancing mid/late-game story chapters, making this enemy extinct in random encounters.',
      isExtinctCondition: isCoastlandsScaledPast31
    },
    228: {
      id: 228,
      name: 'Buccaneer I',
      reason: 'Coastlands danger level permanently scales past 31 after advancing mid/late-game story chapters, making this enemy extinct in random encounters.',
      isExtinctCondition: isCoastlandsScaledPast31
    }
  }
};

function getMercyStatus(saveState, staticDb) {
  const eligible = [];
  if (!saveState) return eligible;

  for (const [type, targets] of Object.entries(MISSABLE_TARGETS)) {
    for (const [idStr, targetDef] of Object.entries(targets)) {
      const id = Number(idStr);
      if (type === 'monster') {
        const mState = saveState.monsters?.[id];
        const isCompleted = Boolean(mState?.isCompleted);
        const isExtinct = targetDef.isExtinctCondition(saveState);

        if (isExtinct && !isCompleted) {
          eligible.push({
            type: 'monster',
            id,
            name: targetDef.name,
            reason: targetDef.reason,
            canRepair: true
          });
        }
      }
    }
  }

  return eligible;
}

function findAll(buffer, targetStr, start = 0) {
  const target = Buffer.from(targetStr, 'ascii');
  const results = [];
  let index = start;
  while ((index = buffer.indexOf(target, index)) !== -1) {
    results.push(index);
    index += target.length;
  }
  return results;
}

function applyMercyRepair(saveFilePath, targetType, targetId, staticDb) {
  if (!fs.existsSync(saveFilePath)) {
    throw new Error(`Target save file does not exist: ${saveFilePath}`);
  }

  const def = MISSABLE_TARGETS[targetType]?.[targetId];
  if (!def) {
    throw new Error(`Unsupported or non-extinct mercy repair target: ${targetType} #${targetId}`);
  }

  // 1. Create a non-destructive timestamped backup
  const backupPath = `${saveFilePath}.backup_${Date.now()}`;
  fs.copyFileSync(saveFilePath, backupPath);

  // 2. Read and dynamically locate binary UObject properties
  const buf = fs.readFileSync(saveFilePath);

  if (targetType === 'monster') {
    const isAnalyseAddrs = findAll(buf, 'IsAnalyse_');
    const addr = isAnalyseAddrs[targetId];
    if (addr === undefined) {
      throw new Error(`Monster #${targetId} struct not found in save buffer`);
    }

    const mInfo = staticDb.monsters[targetId];
    if (!mInfo) {
      throw new Error(`Monster #${targetId} definition missing from static database`);
    }

    // Set IsAnalyse = true
    const analyseKeyLen = buf.readUInt32LE(addr - 4);
    const analyseTypeLen = buf.readUInt32LE(addr + analyseKeyLen);
    const isAnalyseValAddr = addr + analyseKeyLen + 4 + analyseTypeLen + 9;
    buf.writeUInt8(1, isAnalyseValAddr);

    // Set WeaknessOpen to target weaponMask and magicMask
    const weakAddr = buf.indexOf(Buffer.from('WeaknessOpen_', 'ascii'), addr);
    if (weakAddr === -1) {
      throw new Error(`WeaknessOpen property not found for monster #${targetId}`);
    }
    const weakKeyLen = buf.readUInt32LE(weakAddr - 4);
    const weakTypeLen = buf.readUInt32LE(weakAddr + weakKeyLen);
    const valAddr = weakAddr + weakKeyLen + 4 + weakTypeLen + 9;

    buf.writeUInt8(mInfo.weaponMask, valAddr);
    buf.writeUInt8(mInfo.magicMask, valAddr + 1);

    // Write surgically back to disk
    fs.writeFileSync(saveFilePath, buf);

    const updatedState = parseSaveBuffer(buf);
    return {
      success: true,
      targetType,
      targetId,
      name: def.name,
      backupPath,
      updatedState
    };
  }

  throw new Error(`Unhandled target type: ${targetType}`);
}

module.exports = {
  MISSABLE_TARGETS,
  getMercyStatus,
  applyMercyRepair
};
