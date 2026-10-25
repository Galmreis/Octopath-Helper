# Octopath Helper — Project Blueprint & Architecture Guide

**Project Type:** Real-Time Gameplay Companion & 100% Achievement Tracker  
**Target Game:** Octopath Traveler (PC / Steam — Unreal Engine 4.18)  
**Tech Stack:** Node.js, C# Native Win32 RAM Helper (`ramWorker.cs`), React, Vite, WebSockets (`ws`), Electron (Planned Desktop Wrapper)  
**Architecture Mode:** 100% Read-Only (Safe for legitimate playthroughs; never writes to or modifies save files or game memory)

---

## 1. Executive Summary & Vision

**Octopath Helper** is a live second-monitor companion application designed to help players achieve 100% completion in *Octopath Traveler*—tracking all six completionist Steam achievements in real time:
1. **Strategist** — Reveal all weaknesses of all **381** achievement-required monsters.
2. **Treasure Hunter** — Open all **734** treasure chests across Osterra.
3. **Eagle-Eyed** — Obtain all **152** hidden items (via Inquire / Scrutinize).
4. **Collector** — Obtain all **580** achievement-relevant items (out of 641 total cataloged items).
5. **Globetrotter** — Visit all **177** map zones across all 8 regions, shrines, and post-game areas.
6. **Worth Your Salt** — Complete all **101** Side Stories across the 8 regions.

### Why This Project Exists
Existing community tools (`LoneWindG/OctopathTraveler-SaveDataEditor` and `SUDALV92/OctopathTraveler-TreasureChests`) are offline Windows save editors designed to troubleshoot or edit broken saves at the end of a 70-hour playthrough by manually inspecting raw binary flags alongside external spreadsheets.

**Octopath Helper** solves this by acting as a **live, automatic companion dashboard**:
1. **Live Memory Engine (`80ms` latency):** While the game is running, a lightweight `9 KB` C# Win32 helper (`ramWorker.exe`, `~13.5 MB` RAM footprint) reads the active Unreal Engine `UKSSaveGameBP_C` and `AKSMapManager` instances directly from RAM using `PROCESS_VM_READ`. Monster weaknesses revealed mid-battle, chests opened, hidden items scrutinized, and room transitions update on your dashboard within **80 milliseconds**—before the game ever writes to disk.
2. **Multi-Slot Disk Watcher Fallback (`SaveData0..24.sav`):** When the game is closed (or when inspecting other playthroughs), the backend watches the entire `SaveGames` directory for changes to any save slot (`Slot 0` Autosave and `Slots 1–24+` Manual Saves) and parses the binary Unreal Engine GVAS `.sav` files natively in Node.js.
3. **Human-Readable Context & Missable Protection:** Raw internal IDs and bitmasks are translated into structured cards for your **current zone** (including monsters, chests, hidden items, and active town Side Stories with NPC locations and solutions), while highlighting permanently **missable** monsters, chests, and items in real time.

### Ecosystem & Mod Compatibility
* **vs. Save Editors (`LoneWindG` / `SUDALV92`):** No manual file loading or spreadsheet cross-referencing; updates automatically as you play.
* **vs. Nexus `.pak` Mods (*Side Stories Helper*, *Better Descriptions*, etc.):** Internal `.pak` mods swap static text tables and conflict when modifying the same `.uexp` files. Because **Octopath Helper** runs externally, it has **zero `.pak` mod conflicts**.
* **100% Read-Only & Safe:** All file operations copy `.sav` files to a temporary buffer before parsing, and all memory operations open the process strictly with `PROCESS_VM_READ (0x0010)` permissions.

---

## 2. System Architecture & Dual-Source Pipeline

```text
                       [Octopath_Traveler-Win64-Shipping.exe]
                                  │                     │
     (Live Gameplay: 80ms Poll)   │                     │ (Map Transition / Save Point)
                                  ▼                     ▼
                     [UE4 FMallocBinned2 Heap]   [SaveData0..24.sav on Disk]
                     • UKSSaveGameBP_C           • Watched across all slots
                     • AKSMapManager             • Native GVAS Binary Parser
                                  │                     │
                                  ▼                     ▼
                        [ramWorker.exe (C#)]    [SaveFileSource (Node.js)]
                                  │                     │
                                  └──────────┬──────────┘
                                             ▼
                          [StateStore + Domain Event Diff Engine]
                          • Computes live delta events (CHEST_OPENED,
                            WEAKNESS_REVEALED, QUEST_COMPLETED, etc.)
                          • Detects in-game Save Slot switches (320ms re-attach)
                                             │
                                             ▼ (WebSocket / IPC)
                          [React + Vite Second-Monitor Dashboard]
                          • Merges live state with static data/*.json
                          • Displays Current Zone Radar & 6 Achievement Trackers
```

### 2.1 Key Engineering Highlights Under the Hood
* **320ms Unreal Engine `FMallocBinned2` Scanner (`ramWorker.cs`):**
  * Unreal Engine 4 allocates `UObject` instances (`UKSSaveGameBP_C` and `AKSMapManager`) inside private (`MEM_PRIVATE = 0x20000`), non-executable read-write (`PAGE_READWRITE = 0x04`) memory pools `<= 256 KB` in size, with `UKSSaveGameBP_C.Achievement` aligned at `(address & 0xF) == 8`.
  * Filtering out multi-megabyte GPU/audio buffers and stepping by 16 bytes allows the scanner to locate or re-attach to the active save state across the entire game process in **~320ms** (including when switching save slots at the Title Screen).
* **Save-Slot-Independent Fingerprinting:**
  * Rather than scanning for save-specific counters, `ramWorker.cs` validates `UKSSaveGameBP_C` using its 7 fixed Unreal `TArray` capacities (`ItemFlag=80`, `Backpack=2000`, `Party=4`, `SubMission=8`, `VisitedMap=10`, `MapData=220`, `EnemyInfoData=2500`).
* **Zero-Allocation Polling & Two-Tier Dirty Sync:**
  * All polling byte buffers are pre-allocated once outside the `80ms` loop, and a 64-bit FNV-1a integer hash prevents JSON serialization unless a tracked value actually changes.
  * `ramWorker.cs` is automatically compiled into a `9 KB` native `ramWorker.exe` binary via Windows' built-in `.NET` compiler (`csc.exe`), consuming only **~13.5 MB** of private RAM and **<0.4% CPU**.

---

## 3. Project Folder Structure

```text
OctopathHelper/
├── octopath_helper_project_blueprint.md   # Architecture & roadmap documentation
├── .gitignore                             # Excludes node_modules, _references, *.sav, *.exe
│
├── data/                                  # Generated Static Lookup Databases
│   ├── monsters.json                      # 381 Strategist monsters (weakness masks, missable flags)
│   ├── zones.json                         # 177 Globetrotter zones (regions, 734 chests, 152 hidden items, quests)
│   ├── items.json                         # 641 items (580 flagged isCollectorRequired: true)
│   ├── quests.json                        # 101 Side Stories mapped to (saveRegion, slotIndex), NPC, solution
│   ├── missableNotes.json                 # 42 missable / time-limited warnings
│   └── mockSaveData.json                  # Sample parsed state for offline UI testing
│
├── server/                                # Node.js Backend & Memory Worker
│   ├── package.json
│   ├── index.js                           # HTTP API (/api/static, /api/state, /api/slots) + WebSocket Server
│   ├── config.js                          # Auto-discovery for Steam SaveGames folders & SaveData0..24+.sav
│   ├── stateStore.js                      # State manager & domain diff event generator
│   ├── parser/
│   │   └── parseSave.js                   # Pure Node.js binary GVAS (.sav) parser
│   ├── sources/
│   │   ├── memorySource.js                # Compiles & manages ramWorker.exe, decodes base64 RAM snapshots
│   │   ├── ramWorker.cs                   # Native C# Win32 ReadProcessMemory scanner & 80ms poller
│   │   ├── ramWorker.ps1                  # Fallback PowerShell wrapper
│   │   └── saveFileSource.js              # Directory-wide watcher for all SaveData*.sav slots
│   └── scripts/
│       └── buildStaticData.js             # Generates data/*.json from reference tables
│
└── client/                                # React + Vite Frontend
    ├── package.json
    ├── vite.config.js
    ├── index.html
    └── src/
        ├── main.jsx
        ├── App.jsx                        # Main dashboard (scheduled for modular refactor in Phase 5)
        ├── styles.css
        └── hooks/
            └── useSaveData.js             # WebSocket state hook, slot selector API, & static DB merge
```

---

## 4. Internal Data Structures & Mappings

| Achievement / Feature | GVAS `.sav` / UE4 RAM Struct | Implementation Details |
| :--- | :--- | :--- |
| **Current Player Location** | `AKSMapManager` (`liveZoneAddr`) & `MainMemberID` (`levelId`) | Reads live room ID (`1..219`) in real time from `AKSMapManager` so non-autosaving town buildings and rooms still update the Current Zone Radar immediately. |
| **Strategist (`381`)** | `EnemyInfoData` (`offset +432`, stride `8` bytes) | Byte `0` = `IsAnalysed`, Byte `4` = `WeaponResistanceOpen` (6-bit mask), Byte `5` = `MagicResistanceOpen` (6-bit mask). |
| **Treasure Hunter (`734`) & Eagle-Eyed (`152`)** | `MapData` (`offset +416`, 220 zone headers) | For zones `12..196`, each `TreasureState` array has 1 padding byte (`index 0`), followed by `chestCount` bytes (`1..chestCount`) and `hiddenCount` bytes (`1+chestCount..summation`). |
| **Collector (`580`)** | `ItemFlag` (`offset +32`, `80 × int32` bitfield) & `BackpackItemList` | Bitfield tracking historical item acquisition across all 641 items (`580` required for the Collector achievement). |
| **Globetrotter (`177`)** | `VisitedMap` (`offset +392`, `10 × int32` bitfield) | Bit `id` corresponds to Zone ID (`12..196`), mapped across all 10 region categories (`Highlands`, `Sunlands`, `Riverlands`, `Flatlands`, `Cliftlands`, `Coastlands`, `Frostlands`, `Woodlands`, `Job Shrines`, `Post-Game (Finis)`). |
| **Worth Your Salt (`101`)** | `SubMissionData` (`offset +376`, `8 × 64-byte` regional structs) | Each of the 8 regions holds `MissionState` (`+0`) and `ClearIndex` (`+16`) `TArray<int32>` headers (`0` = Unstarted, `1` = In Progress, `2` = Completed). Mapped 1-to-1 to all 101 Side Stories in `data/quests.json`. |

---

## 5. Development Roadmap & Current Status

### Completed Phases
* [x] **Phase 1: Static Data Pipeline (`server/scripts/buildStaticData.js`)**
  * Generated complete `monsters.json` (381), `zones.json` (177 zones, 734 chests, 152 hidden items), `items.json` (580/641), `quests.json` (101 side stories with NPC, solution, and exact `(saveRegion, slotIndex)` mapping), and `missableNotes.json` (42 warnings).
* [x] **Phase 2: Native Binary `.sav` Parser (`server/parser/parseSave.js`)**
  * Built zero-dependency GVAS binary parser with safe temp-file copying and multi-slot discovery (`SaveData0..24+.sav`).
* [x] **Phase 3: Real-Time WebSocket Server & Event Diff Engine (`server/stateStore.js`)**
  * Implemented domain event diffing (`ZONE_CHANGE`, `CHEST_OPENED`, `HIDDEN_ITEM_FOUND`, `WEAKNESS_REVEALED`, `ITEM_OBTAINED`, `QUEST_STARTED`, `QUEST_COMPLETED`, `SAVE_SLOT_SWITCH`).
* [x] **Phase 4: Ultra-Fast Live RAM Engine (`server/sources/ramWorker.cs`)**
  * Built `320ms` `FMallocBinned2` memory scanner and `80ms` zero-allocation poller, compiled to a `9 KB` native `ramWorker.exe` (`~13.5 MB` RAM footprint).
  * Verified seamless hot re-attachment when switching save slots in-game or returning to the Title Screen.

### Upcoming Phases (Next Steps)
* [ ] **Phase 5: Final Live Edge-Case Testing & Usability Polish**
  * Verify live mid-battle weakness reveal, chest/scrutinize triggers, and fresh New Game (`0h 00m`) attachment.
  * Add custom SaveGames folder selection fallback for non-standard Steam installations.
* [ ] **Phase 6: Visual Assets (Enemy Sprites & Icons) + Custom UI/UX Redesign**
  * Gather and map **Enemy Sprites** for all 381 monsters alongside authentic weapon/elemental weakness icons (`sword`, `polearm`, `dagger`, `axe`, `bow`, `staff`, `fire`, `ice`, `lightning`, `wind`, `light`, `dark`) so players can visually identify enemies in battle at a glance.
  * Refactor `client/src/App.jsx` into clean, modular components (`HeaderBar`, `CurrentZoneRadar`, `StrategistView`, `ZoneExplorerView`, `CollectorView`, `SideStoriesView`).
  * Implement bespoke, intentional UI/UX directed by the user—focused on clarity, scannability, and zero visual clutter.
* [ ] **Phase 7: Standalone Electron Desktop Application**
  * Embed the Node.js backend (`StateStore`, `MemorySource`, `SaveFileSource`) directly inside Electron's Main Process using Electron IPC.
  * Package into a portable `.exe` / installer with an optional compact/always-on-top mode for single-monitor players.
