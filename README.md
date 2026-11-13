# EP/GP for Google Sheets

A weekly EP/GP loot system for World of Warcraft raid guilds, running entirely in a Google Sheet.

Your raid addon exports what happened in a raid: who was there, who got which item for how much GP. You
import that into the sheet, and once a week the sheet works out everyone's EP, GP and priority, applies
decay, and shows the standings per role.

- **EP** (effort points) is earned by raiding.
- **GP** (gear points) is spent on loot.
- **Priority** is `EP / (GP + base GP)`. The higher it is, the earlier a player gets loot.
- Every week, both EP and GP **decay** by a percentage (15% by default), so recent raids count more
  than old ones.

Everything stays in the sheet: every event the addon reported, every weekly result, and every formula. The
loot master can see and fix anything by hand.

---

## Contents

- [Setup](#setup)
- [The tabs](#the-tabs)
- [Weekly use](#weekly-use)
- [Alts](#alts)
- [Fixing mistakes](#fixing-mistakes)
- [Corner cases](#corner-cases)
- [History format](#history-format)
- [Files](#files)

---

## Setup

You need a Google account. Nothing is installed on your computer.

1. **Create a new, empty Google Sheet.**
2. Open **Extensions → Apps Script**. An editor opens with one file, `Code.gs`. Delete its contents (or
   the whole file).
3. Add the files from this repository (or push them all at once with clasp, see
   [Adding the files with clasp](#adding-the-files-with-clasp)):
   - Click **+ → Script** and create `logic`, `sheet` and `setup`. Paste the contents of `logic.js`,
     `sheet.js` and `setup.js` into them. Apps Script names them `.gs`; that is fine.
   - Click **+ → HTML** and create `ImportDialog` (exactly that name). Paste the contents of
     `ImportDialog.html`.
   - Save (Ctrl+S).
4. Go back to the sheet and **reload the page**. A new menu, **EP/GP**, appears after a few seconds.
5. Run **EP/GP → Set up sheet**. The first time you run anything, Google asks you to allow the script:
   - "Authorization required" → **Continue**, pick your account.
   - "Google hasn't verified this app" → **Advanced → Go to … (unsafe)** → **Allow**.
     This warning shows for every personal script. The script only reads and writes this one sheet.
6. Set up builds all the tabs, empty. Then:
   - Fill in the **Roster** (your mains, their class and role).
   - Add alts to **Alts** and tick **approved**.
   - Check the numbers in **Config** (start EP/GP, base GP, decay).
   - Edit the raid names and EP values in the panel on the right of the **EP/GP** tab. They are only
     there for people to read; the actual EP comes from the addon.

**Set up sheet** only works in a new spreadsheet. If any of its tabs already exists, it stops and changes
nothing.

**Do not rename the tabs or move their columns.** The script finds tabs by name and columns by position.
You can reorder the tabs.

### Updating the code

When a new version comes out, open **Extensions → Apps Script**, replace the contents of each file with the
new version, save, and reload the sheet. Your data is not touched. With clasp, it is `git pull` and
`clasp push`.

### Adding the files with clasp

[clasp](https://github.com/google/clasp) is Google's command-line tool for Apps Script. It uploads all the
files of this repository to your sheet's script in one go, instead of copying them one by one. It needs
[Node.js](https://nodejs.org).

One-time setup:

1. Install clasp and log in with your Google account (a browser window opens):
   ```bash
   npm install -g @google/clasp
   clasp login
   ```
2. Allow clasp to change your scripts: open <https://script.google.com/home/usersettings> and switch
   **Google Apps Script API** on.
3. Get the code:
   ```bash
   git clone https://github.com/praylorswift/epgp-sheets.git
   cd epgp-sheets
   ```
4. Link the folder to your sheet's script. In the sheet, open **Extensions → Apps Script → Project
   Settings** (the gear) and copy the **Script ID**. Create a file `.clasp.json` in the folder:
   ```json
   {"scriptId": "paste the script id here"}
   ```
   `.clasp.json` is yours; it is not committed (see `.gitignore`).

Then, every time:

```bash
clasp push
```

Answer **yes** when it asks to overwrite the manifest. Reload the sheet to see the menu.

`clasp push` makes the script exactly like the folder: files that are only in the online editor (such as
the default `Code.gs`) are removed, and edits you made in the online editor are overwritten. Make changes
in the files, not in the editor.

---

## The tabs

| Tab | What it is | Who edits it |
|---|---|---|
| **EP/GP** | The standings everyone looks at | Nobody, except the panel text on the right |
| **Current** | The latest week, sorted by priority | Nobody (formulas) |
| **Config** | Settings and the current week | Loot master, rarely |
| **Alts** | Which alt belongs to which main | Loot master |
| **Weeks** | The result of every week | The script; the loot master may correct it |
| **History** | Every event from the addon | The import; the loot master adds corrections |
| **Roster** | The mains of the guild, with class and role | Loot master |

### EP/GP

The page raiders look at. One block per role (Tanks, Melee, Healers, Casters, Ranged), each listing the
players of that role from **Current** with their EP, GP and priority. Names are coloured by class, and
priority runs from red (lowest) to green (highest).

The panel on the right shows:

- the week and the date of the last Finalize week;
- the raids and their EP (plain text, edit it to match your raids);
- whether every player is shown: a player whose Roster row has no role is not in any block, and the panel
  says how many are missing;
- the decay, the median EP, GP and priority, base GP, and the starting GP.

### Current

The rows of the latest week in **Weeks** (player, new EP, new GP, priority), sorted by priority. EP/GP
reads from here. All formulas.

### Config

| Setting | What it does |
|---|---|
| `current_week` | The week that Process history and Finalize week work on. Finalize week moves it on by 1. Only change it by hand to redo weeks (see [Fixing mistakes](#fixing-mistakes)). |
| `last_update` | The date of the last Finalize week. Set by the script. |
| `start_ep` | EP a player starts with when they have no row in the previous week (new players). |
| `start_gp` | GP a player starts with, the same way. |
| `base_gp` | Added to GP in the priority, so a player with 0 GP does not get infinite priority. |
| `decay` | The share of EP and GP lost each week, for example 15%. |

### Roster

One row per **main**: name, class and role. Every player on the Roster gets a row in Weeks every week,
also when they did not raid (their EP and GP just decay).

- The **class** gives the name its colour. Use the class names as written: Warrior, Paladin, Hunter,
  Shaman, Rogue, Druid, Mage, Warlock, Priest.
- The **role** decides which block of the EP/GP tab the player is in: Tank, Melee, Healer, Caster or
  Ranged.
- A player who leaves is removed from the Roster. Their old rows in Weeks and History stay.

### Alts

`alt_name`, `main_name`, `approved`. When an approved alt raids or gets loot, it counts for the main. An
alt that is not approved is not used: its events stop Process history with an error until you approve it
or remove the events.

### Weeks

One block of rows per week, oldest at the top, separated by a dark empty row. For each Roster player:

| Column | Meaning |
|---|---|
| `week_id` | The week number |
| `prev_ep`, `prev_gp` | The player's new EP and GP of the previous week, or Config's start values for a new player |
| `earned_ep` | EP from this week's `ep_earn` events |
| `spent_gp` | GP from this week's `gp_spend` events |
| `adjust_ep`, `adjust_gp` | Empty. The loot master can type a correction here |
| `ep_decay_pct`, `gp_decay_pct` | Empty until Finalize week fills them in with Config's decay |
| `ep_decay`, `gp_decay` | `(prev + earned + adjust) × decay pct` |
| `new_ep`, `new_gp` | `prev + earned + adjust − decay`. These are the player's standings |
| `ratio` | The priority: `new_ep / (new_gp + base_gp)` |
| `note` | Free text |

Decay, new EP/GP and ratio are formulas on the row itself. Editing earned, spent, adjust or a decay
percentage updates the row straight away. Changing Config's decay later does not change weeks that are
already finalized.

### History

Every event the addon reported, one per row. Imported or pasted, never changed by the script except for
two columns:

| Column | Filled in by |
|---|---|
| `event_time`, `raid_name`, `player_name`, `event_type`, `amount`, `item_name`, `bid` | The import (see [History format](#history-format)) |
| `week_id` | Process history: the week this event was counted in |
| `main` | Process history: the main the player counts for (themselves, or the main of an approved alt) |
| `note` | The loot master, for anything worth remembering |

An event **without** a `week_id` is new and is picked up by the next Process history. An event **with** a
`week_id` has been processed and is left alone.

Empty rows, and rows with only a time in them, are ignored. Use them to separate raids if you like.

---

## Weekly use

The menu **EP/GP** has four items:

| Item | What it does |
|---|---|
| **Import history** | Opens a box to paste the addon's JSON export. Its events are added at the bottom of History. |
| **Process history** | Gives the new History events the current week id and their main, then rebuilds the current week in Weeks. No decay yet. |
| **Finalize week** | Applies the decay to the current week and moves on to the next week. |
| **Set up sheet** | Only for a new spreadsheet, see [Setup](#setup). |

### After every raid

1. **Import history**, paste the addon's export, **Import**.
2. **Process history**.

The EP/GP tab now shows the week so far: previous standings plus what was earned and spent, without decay.
You can run Process history as often as you like; it always rebuilds the week from all its history.

### At the end of the week

3. **Finalize week**.

The decay is applied to the week, and `current_week` moves on by one. The next import starts the new week.

That is all. A typical week is: import + process after each raid night, finalize once at the end.

### What Process history checks

Nothing is written when any of these is wrong; you get a list of the problems instead:

- a player that is not on the Roster and not an approved alt of a Roster player;
- an `event_type` that is not `ep_earn` or `gp_spend`;
- an `amount` that is not a number;
- no history at all for the current week ("Did you forget to paste the addon data?").

### Duplicate attendance

When a main and their alt are both in the same raid, both get an `ep_earn` event. The main only gets the EP
once: `ep_earn` events count once per main, raid, day and amount. GP is never merged; every `gp_spend` event
counts.

---

## Alts

- Add the alt to **Alts** with its main, and tick **approved**.
- From the next Process history on, the alt's events count for the main.
- The main is written into History's `main` column when an event is processed. Unapproving or removing
  an alt later does not change events that were already processed.
- Events of an alt that is not on the Alts tab, or not approved, stop Process history with an error. Add
  or approve the alt, or remove the events, and process again.
- An alt that was mapped to the wrong main: see [A player was counted wrong](#a-player-was-counted-wrong).

---

## Fixing mistakes

### A wrong event in the current week

The week is not finalized yet, so just fix the history and process again.

- **Add a correction line**: copy the wrong line to the bottom of History, without its `week_id` and
  `main`, and make the amount negative. For example, a `gp_spend` of 15 that should have been 5:

  | event_time | raid_name | player_name | event_type | amount | item_name | bid | week_id | main | note |
  |---|---|---|---|---|---|---|---|---|---|
  | 2026-11-08 20:02:52 | Blackwing Lair | Jaina | gp_spend | 15 | Dragonstalker's Breastplate | NEED | 12 | Jaina | |
  | 2026-11-08 20:02:52 | Blackwing Lair | Jaina | gp_spend | **-10** | Dragonstalker's Breastplate | NEED | | | was MIN, not NEED |

  The same works for EP: an `ep_earn` with a negative amount takes EP away.
- Then **Process history**.

Correction lines keep the history honest: you can always see what the addon reported and what was changed.

You can also edit the `adjust_ep` / `adjust_gp` columns of the week in Weeks directly, but these are lost
the next time that week is processed (see [Corner cases](#corner-cases)). A correction line in History is
safer.

### A mistake in an older week: the quick way

Add the correction line now, in the current week. The player's standings are right again from this week
on. The only difference to fixing it exactly is a little decay: the old weeks decayed the wrong amount for
a few weeks. For most mistakes, that does not matter.

### A mistake in an older week: the exact way

Say you made a mistake in week 12, and the current week is now 15. You can redo weeks 12, 13 and 14, so
every week from 12 on is exactly as if the mistake had never happened.

1. Set Config `current_week` to **12**.
2. Add your correction lines at the bottom of History, without `week_id` and `main`.
3. **Process history** (week 12). The correction lines get week 12, and week 12 is rebuilt from all its
   history.
4. **Finalize week** (week 12 → 13).
5. **Process history** (week 13). Week 13 is rebuilt, now starting from the corrected week 12.
6. **Finalize week** (13 → 14).
7. **Process history** (week 14), **Finalize week** (14 → 15).

You are back in week 15, and every week from 12 on is right.

**Do not clear the `week_id` of weeks 13 and 14 in History.** Process history gives *every* event without a
week id the current week. If you clear weeks 12–14 and process week 12, all three weeks of events end up in
week 12. Events that already have a week id simply count for their week again when that week is rebuilt.

Also, while redoing:

- Each rebuilt week loses anything typed into its rows in Weeks (`adjust_ep`, `adjust_gp`, `note`).
  Write those down first, or turn them into correction lines.
- Finalize week uses the decay in Config **now**. If you changed the decay since week 12, set it back for
  the redo.
- If week 15 already has events (raids happened this week), they keep `week_id` 15 only if they were
  processed. Unprocessed events would end up in week 12. Process week 15 *before* you start, or import
  them after the redo.

### A player was counted wrong

For example, an alt was listed under the wrong main when its events were processed. The `main` in History
is what counts, so:

1. Fix the Alts tab.
2. In History, clear `week_id` and `main` of **only** the events that went wrong.
3. Process history while `current_week` is the week of those events (redo the weeks after it as above), or
   just process them in the current week.

### Undoing a Finalize week

Finalize week only filled in the decay percentages and moved the week on. To undo it:

1. Clear `ep_decay_pct` and `gp_decay_pct` of that week's rows in Weeks.
2. Set Config `current_week` back by one.

### Removing a processed week completely

1. Delete the week's rows in Weeks (and the empty row above them).
2. Clear `week_id` and `main` of that week's events in History, or delete the events.
3. Set Config `current_week` to that week.

---

## Corner cases

- **A week without raids.** Weeks cannot be skipped, and Process history needs at least one event in the
  week. Finalize week alone does not work either: the week has no rows to finalize. Paste one event (for
  example an `ep_earn` of 0 for one player), process, and finalize; everyone's EP and GP just decay.
- **A new player.** Add them to the Roster. They start from Config's `start_ep` / `start_gp` in the first
  week they have no row in the previous week.
- **A player leaves.** Remove them from the Roster. They have no row from the next processed week on; their
  old rows stay.
- **A player has no role.** They are counted in Weeks, but are not shown on the EP/GP tab. The panel says how
  many players are missing.
- **The same export imported twice.** Every event is then in History twice. `ep_earn` duplicates are ignored
  (same main, raid, day and amount), but every `gp_spend` counts, so GP is doubled. Delete the second copy
  in History before you process, or, if it was processed already, delete it and process again.
- **Two people press a menu item at the same time.** Only one action runs at a time; the other waits up to
  30 seconds and then says "Another EP/GP action is running".
- **Editing a finalized week by hand.** Allowed: change earned, spent, adjust or a decay percentage and the
  row recalculates. The week after it does **not** update by itself, because its `prev_ep` / `prev_gp` were
  copied when it was processed. Redo the weeks after it (see above) to carry the change forward.
- **Manual edits in the current week.** Process history rebuilds the whole week and loses them. Use
  correction lines in History instead.

---

## History format

### Import history (JSON)

The addon exports a JSON object. Only its `events` list is used; anything else in the export is ignored.

```json
{
  "events": [
    {
      "event_time": "2026-11-08 20:02:52",
      "raid_name": "Blackwing Lair",
      "player_name": "Jaina",
      "event_type": "gp_spend",
      "amount": 15,
      "item_name": "Dragonstalker's Breastplate",
      "bid": "NEED"
    },
    {
      "event_time": "2026-11-08 20:10:27",
      "raid_name": "Molten Core",
      "player_name": "Arthas",
      "event_type": "ep_earn",
      "amount": 450,
      "item_name": "",
      "bid": ""
    }
  ]
}
```

| Field | Required | Meaning |
|---|---|---|
| `event_time` | yes | `yyyy-mm-dd hh:mm:ss`. The day is used to tell raids apart. |
| `raid_name` | yes | The raid |
| `player_name` | yes | The character, main or alt |
| `event_type` | yes | `ep_earn` (EP for attending) or `gp_spend` (GP for an item) |
| `amount` | yes | The EP or GP. Negative to take EP or GP away. |
| `item_name` | no | The item, for `gp_spend` |
| `bid` | no | How the item was won (NEED, MIN, ROLL, …). Only for reading. |

The import checks every event first and adds nothing if one of them is wrong. One `ep_earn` per player per
raid, and one `gp_spend` per item, is what the addon should produce. A player who got nothing still has an
`ep_earn` for being there.

### Pasting instead

Sheets splits tab-separated text into columns. Text with the same columns in the same order, separated by
tabs, can be pasted straight into the first empty row of History, column A:

```
2026-11-08 20:02:52	Blackwing Lair	Jaina	gp_spend	15	Dragonstalker's Breastplate	NEED
```

---

## Files

| File | What it is |
|---|---|
| `logic.js` | The flow of each menu item and the calculation |
| `sheet.js` | Everything that reads or writes the sheet: the menu, the tabs and their columns |
| `setup.js` | Set up sheet: builds all tabs, formulas and formatting in a new spreadsheet |
| `ImportDialog.html` | The Import history dialog |
| `appsscript.json` | The Apps Script project settings (V8), used by clasp |
| `.claspignore` | Which files clasp uploads |

The tab and column layout is described at the top of `sheet.js`. A change to a tab's columns has to be
made in `sheet.js` and `setup.js`.
