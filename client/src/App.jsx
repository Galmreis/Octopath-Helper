import React, { useState, useMemo, useCallback } from 'react';
import { useSaveData } from './hooks/useSaveData';
import { useHotkeys } from './hooks/useHotkeys';
import { useMercyRepair } from './hooks/useMercyRepair';

import TitleBar from './components/TitleBar';
import Header from './components/Header';
import StatsGrid from './components/StatsGrid';
import TabsBar from './components/TabsBar';
import ActivityFeed from './components/ActivityFeed';

import RadarTab from './components/tabs/RadarTab';
import MonstersTab from './components/tabs/MonstersTab';
import ZonesTab from './components/tabs/ZonesTab';
import CollectorTab from './components/tabs/CollectorTab';
import QuestsTab from './components/tabs/QuestsTab';

export default function App() {
  const {
    staticDb,
    saveState,
    saveFilePath,
    availableSlots,
    selectSaveSlot,
    connected,
    lastFlashIds
  } = useSaveData();

  const [activeTab, setActiveTab] = useState('radar');
  const [selectedZoneId, setSelectedZoneId] = useState(null);

  const { repairingId, repair } = useMercyRepair();

  const handleReturnToLive = useCallback(() => {
    setSelectedZoneId(null);
  }, []);

  useHotkeys({
    onTab: setActiveTab,
    onReturnToLive: handleReturnToLive
  });

  const obtainedSet = useMemo(
    () => new Set(saveState?.itemsObtained || []),
    [saveState?.itemsObtained]
  );

  if (!staticDb || !saveState) {
    return (
      <div className="desktop-app-container">
        <TitleBar saveState={{}} connected={connected} />
        <div className="app-shell">
          <div className="panel">Loading your save…</div>
        </div>
      </div>
    );
  }

  return (
    <div className="desktop-app-container">
      <TitleBar saveState={saveState} connected={connected} />
      <div className="app-shell">
        <Header
          saveState={saveState}
          saveFilePath={saveFilePath}
          availableSlots={availableSlots}
          selectSaveSlot={selectSaveSlot}
          connected={connected}
        />

      <StatsGrid saveState={saveState} />

      <div className="main-layout">
        <main className="panel">
          <TabsBar
            activeTab={activeTab}
            onSelectTab={setActiveTab}
            stats={saveState.stats || {}}
          />

          {activeTab === 'radar' && (
            <RadarTab
              staticDb={staticDb}
              saveState={saveState}
              selectedZoneId={selectedZoneId}
              onSelectZoneId={setSelectedZoneId}
              lastFlashIds={lastFlashIds}
            />
          )}

          {activeTab === 'monsters' && (
            <MonstersTab
              staticDb={staticDb}
              saveState={saveState}
              onMercyRepair={repair}
              repairingId={repairingId}
            />
          )}

          {activeTab === 'zones' && (
            <ZonesTab
              staticDb={staticDb}
              saveState={saveState}
              onSelectZone={zoneId => {
                setSelectedZoneId(zoneId);
                setActiveTab('radar');
              }}
            />
          )}

          {activeTab === 'collector' && (
            <CollectorTab
              staticDb={staticDb}
              obtainedSet={obtainedSet}
              collectorStats={saveState.stats?.collector}
            />
          )}

          {activeTab === 'quests' && (
            <QuestsTab staticDb={staticDb} saveState={saveState} />
          )}
        </main>

        <ActivityFeed events={saveState.recentEvents || []} />
      </div>
    </div>
  </div>
  );
}
