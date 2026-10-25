# Octopath Helper

A real-time telemetry companion and 100% completion tracker for *Octopath Traveler* (Steam / PC).

Designed for dual-monitor setups or mobile/tablet browsers placed next to your screen while playing with a controller.

---

## Why this exists

Tracking 100% completion in *Octopath Traveler* is notoriously frustrating due to how the game handles memory and world progression:

1. **Combat Weaknesses Are Not Saved During Battle:** When you hit an enemy's weakness with Cyrus or a weapon strike, the game stores that reveal temporarily inside the battle actor's memory. It does not write to the save file until the encounter concludes. Traditional save-file watchers cannot show weakness reveals in real time.
2. **Permanent Danger-Level Missables:** Once you advance past Chapter 2/3 milestones, ambient danger levels in the Coastlands permanently scale past Level 31. Enemies like *Sea Birdian IV* (#208) and *Buccaneer I* (#228) are permanently replaced by higher-tier spawns, locking players out of the *Strategist* achievement late in an 80-hour playthrough.
3. **No In-Game Zone Checklists:** There is no in-game ledger telling you if a dungeon still has an unopened purple chest, a missed hidden item, or an unstarted side story.

Octopath Helper hooks into the running game process via read-only Windows APIs, streaming live coordinates, active battle reveals, and achievement matrices directly to a local dashboard.

---

## Core Capabilities

### Live Zone Radar
Automatically detects your current room (`LevelID`) as you travel across Orsterra:
* **Treasure Chests:** Displays all chests in the zone with opened/unopened status and Therion purple-chest lock indicators.
* **Hidden Items:** Tracks all items discoverable through Inquire / Scrutinize path actions.
* **Zone Monsters:** Lists all indigenous enemies and their vulnerability matrices.
* **Side Stories:** Highlights side stories whose quest-givers are present in that specific zone.
* **Inspector Mode:** Browse any other zone's contents from a dropdown menu, then tap **F** to immediately snap back to your live character location.

### Mid-Combat Weakness Sync
A lightweight native background worker monitors battle actor pools in RAM. When you reveal a weakness in combat, the dashboard marks it immediately rather than waiting for the battle to end.

### Point-of-No-Return Protection (Mercy Repair)
If your save has already crossed the Coastlands scaling threshold and missed *Sea Birdian IV* or *Buccaneer I*, the dashboard detects their extinct state. A guarded, optional **Save File Mercy Repair** button creates an automatic timestamped `.bak` backup and writes the missing weakness bitmasks to your save file so the legitimate Steam achievement can pop when you finish your run.

### 100% Completion Matrices
* **Strategist:** 381 monsters with elemental and weapon vulnerability matrices.
* **Treasure Hunter:** 734 chests across 179 mapped zones (including post-game Ruins of Hornburg).
* **Eagle-Eyed:** 152 hidden items.
* **Collector:** 578 items, adjusted for Primrose Chapter 2's mutually exclusive theater masks (where only 1 of 3 can be obtained per save).
* **Worth Your Salt:** 101 side stories mapped across all 8 regions.

---

## Download & Running

### Windows Release (Quickest)
1. Download the latest `OctopathHelper-v0.1-win64.zip` from the [Releases](https://github.com/Galmreis/Octopath-Helper/releases) page.
2. Extract the archive anywhere on your PC.
3. Launch **`OctopathHelper.exe`**.
4. The companion will boot and automatically open `http://localhost:3001` in your default browser.

*(Optional: To view the tracker on a tablet or phone on the same Wi-Fi, simply open `http://<YOUR-PC-IP>:3001` in your mobile browser).*

### Running From Source
Requirements: Node.js 18+

```bash
# Clone repository
git clone https://github.com/Galmreis/Octopath-Helper.git
cd Octopath-Helper

# Install dependencies and build client
npm install
npm --prefix client install
npm --prefix client run build

# Start the unified server
node server/index.js
```

---

## Keyboard Shortcuts

Designed for zero-mouse operation while holding a controller:

| Key | Function |
| :---: | :--- |
| `1` | Switch to **Current Zone Radar** |
| `2` | Switch to **Strategist Monsters** |
| `3` | Switch to **Zones, Chests & Hidden** |
| `4` | Switch to **Collector Items** |
| `5` | Switch to **Side Stories** |
| `F` | Snap back to **Live Location** (Exit Inspector mode) |
| `Esc` | Clear active search filter |

---

## Safety & Performance

* **Zero Memory Injection:** Memory reads use standard Win32 `OpenProcess(PROCESS_VM_READ)` calls. The app does not write to game memory, inject DLLs, or modify assembly instructions.
* **System Footprint:** The combined background worker and server consume approximately 23 MB of RAM and 0.0% CPU during active gameplay.
* **Save Protection:** Saves are read non-destructively. Any repair action automatically creates an exact `.bak` backup prior to touching any byte.

---

## Development & Credits

* **Architecture & Product Direction:** Reis
* **Implementation:** Developed using an AI-augmented engineering workflow with Google Antigravity (DeepMind).

---

## Acknowledgments & Community Credits

This project stands on the shoulders of years of collaborative data mining, documentation, and reverse engineering conducted by the *Octopath Traveler* community:

* **[Octopath Traveler Resource Spreadsheet](https://docs.google.com/spreadsheets/d/14Kz5mTAYdxqdgjbkbotAMGC2aoiJBbrBUiLeh8Pwu0Q)** by **marcv666** and the community — the foundational dataset for chest checklists, hidden item locations, monster weaknesses, quest solutions, and missable item warnings.
* **[OctopathTraveler-SaveDataEditor](https://github.com/LoneWindG/OctopathTraveler-SaveDataEditor)** by **LoneWindG** — foundational research on Unreal Engine 4 GVAS save structures, `KSAchievementSaveGameData` bitfields (`ItemFlag`), quest slots (`MissionState`), and data dictionaries (`info.xlsx`).
* **[OctopathTraveler](https://github.com/turtle-insect/OctopathTraveler)** & **[GvasViewer](https://github.com/turtle-insect/GvasViewer)** by **turtle-insect** — initial format discovery and parsing of Switch and PC save data.
* **Save Research Pioneers on GBAtemp:** [SleepyPrince](https://gbatemp.net/members/sleepyprince.94652/), [Takumah](https://gbatemp.net/members/takumah.456165/), [gen212](https://github.com/gen212/OctopathTraveler), and [SUDALV92](https://github.com/SUDALV92/OctopathTraveler-TreasureChests-).
* **[GVAS Converter](https://github.com/januwA/gvas-converter)** by **januwA** — insights into Unreal Engine 4 serialized UObject properties.

---

## License

MIT License. See [LICENSE](LICENSE) for full details.
