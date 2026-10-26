import { useState } from 'react';

/**
 * Asks for confirmation, then calls the backend to patch the save file
 * (the server writes a timestamped .bak first).
 */
export function useMercyRepair() {
  const [repairingId, setRepairingId] = useState(null);

  async function repair(targetType, targetId, name) {
    const ok = window.confirm(
      `Point of No Return Mercy Repair:\n\n` +
        `This will create an automatic timestamped backup (.bak) of your save file and surgically unlock all weaknesses for #${targetId} ${name}.\n\n` +
        `This enables the legitimate 100% Strategist Steam achievement to unlock when you finish your run.\n\n` +
        `Do you want to proceed?`
    );
    if (!ok) return;

    try {
      setRepairingId(targetId);
      const res = await fetch('/api/mercy/repair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetType, targetId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to apply repair');

      alert(
        `✓ Mercy repair applied successfully!\n\n` +
          `Backup created at:\n${data.repairResult.backupPath}\n\n` +
          `Your save file has been updated. Weaknesses for ${name} are now complete.`
      );
    } catch (err) {
      alert(`Error applying mercy repair: ${err.message}`);
    } finally {
      setRepairingId(null);
    }
  }

  return { repairingId, repair };
}
