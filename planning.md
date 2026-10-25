# Octopath Helper — Project Trajectory & Architecture Plan

## 1. Executive Summary & Vision
**Octopath Helper** is a real-time, second-monitor companion and 100% completionist tracker for *Octopath Traveler* (PC/Steam).
Unlike traditional static checklists, Octopath Helper hooks directly into the running game process in real-time, displaying current zone radar, opened chests, hidden items, and battle weakness discoveries the split-second they happen on screen.

---

## 2. Architectural Evolution

### Phase 1: Pure Disk Save File Polling (Deprecated Baseline)
- **Initial Idea**: Poll `C:\Users\<User>\Documents\My Games\Octopath_Traveler\<SteamId>\SaveGames\SaveData*.sav` on disk every 1–2 seconds.
- **Shortcomings**:
  1. The game only flushes autosave upon zone transitions or manual save points.
  2. Weaknesses revealed during battle were completely invisible on the second monitor until the battle ended and the player walked through a loading screen.
  3. Zone detection lagged behind actual gameplay.

### Phase 2: Live Dual-Engine Architecture (Current State)
We engineered a **Zero-Impact Dual Engine**:
1. **SaveFileSource (`server/sources/saveFileSource.js`)**:
   - Watches all save slots (`SaveData1.sav` through `SaveData9.sav` and `SaveDataAuto.sav`).
   - Parses the complete UE4 `GVAS` binary format to extract baseline achievements, chest flags, and item flags.
2. **Native C# Memory Reader Worker (`server/sources/ramWorker.cs` -> `ramWorker.exe`)**:
   - Compiled via native `.NET Framework 64-bit csc.exe` into a headless background worker.
   - Attaches to `Octopath_Traveler-Win64-Shipping.exe` with strict **read-only permissions** (`PROCESS_QUERY_INFORMATION | PROCESS_VM_READ`). Zero code injection, zero write access, completely anti-cheat safe.
   - **Performance Profile**: **0.0% CPU**, **18 MB** RAM.
   - **Live Zone Pointer**: Discovered and hooked the live level ID in UE4 UWorld memory (`0x19ACB36B14C`), updating the dashboard instantly on zone transitions.
   - **Canonical Enemy Discovery Array**: Reads directly from `UKSSaveGameBP_C.EnemyInfoData` at `achAddr + 0x1B0` (stride 8). This avoids stale/ghost actor remnants left in uncompacted UE4 FMallocBinned2 memory pools from past encounters.

---

## 3. Data Pipeline & Normalization
The static game database is automatically generated from official reference sheets (`info.xlsx` and `Enemies.csv`) by [`server/scripts/buildStaticData.js`](file:///D:/webProjects/OctopathHelper/server/scripts/buildStaticData.js):
- **Strategist Monsters**: 381 monsters required for the achievement.
- **Roman Numeral Normalization**: Converted Roman numerals (`I`..`VI`) to Arabic numbers (`1`..`6`) and merged duplicate CSV entries across multiple regional encounter tables. 100% of all 381 Strategist monsters now have validated spawn zones.
- **Zones & Dungeons**: 177 zones mapped with danger levels, chest offsets, and hidden item flags.
- **Collector Items**: 580 collector-eligible equipment, consumables, and quest items tracked via `ItemFlag` bitmasks.

---

## 4. Current Milestone Status

| Feature | Status | Notes |
| :--- | :---: | :--- |
| **Real-time Zone Detection** |  Done | Instantly syncs upon entering any zone via live RAM pointer |
| **Zone Chest & Hidden Item Radar** |  Done | Tracks individual chest opens and Scrutinize/Inquire items |
| **Live Weakness Discovery** |  Done | Updates immediately in battle via `ramWorker.exe` actor merging |
| **Strategist Monster Spawn List** |  Done | 381/381 monsters mapped to zones, including Roman numeral variants |
| **Low Resource Overhead** |  Done | Event-driven architecture; verified at 0.0% CPU / <20MB RAM |
| **Multi-Slot Save Sync** |  Done | Dynamic slot switching with monotonic safeguard |

---

## 5. Upcoming Roadmap

### Phase 3: In-Battle Combat Overlay & Visual Sprites
- [ ] **Active Encounter Panel**: Display an "⚔️ In This Encounter" section at the top of the Current Zone Radar showing the exact monsters currently on screen, their current shields, and their weakness states.
- [ ] **Enemy Sprite Integration**: Extract and bundle monster battle sprites (transparent PNGs) for all 381 enemies to make identification instantaneous on a second monitor.

### Phase 4: Full Achievement Completion Engine
- [ ] **Collector (All Items)**: Real-time visual inventory checklist highlighting missable equipment before leaving temporary story dungeons.
- [ ] **Worth Your Salt (All 101 Side Stories)**: Step-by-step quest guide and status tracker hooked to `SubMissionData` flags.
- [ ] **Path Action Tracker**: Track Inquire/Scrutinize and Allure/Guide targets per NPC across all 8 regions.
