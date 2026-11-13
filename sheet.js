/**
 * The spreadsheet side of the weekly EP/GP report: the menu, the messages, and everything that reads
 * or writes cells and rows. The flow and the calculation are in logic.js.
 *
 * Tabs and columns this file relies on (do not move them):
 *   Config   B2 current_week, B3 last_update (both set by Finalize week), B4 start_ep, B5 start_gp,
 *            B6 base_gp, B7 decay
 *   Roster   A player_name, B class, C role   (mains only; everyone listed gets a row every week)
 *   Alts     A alt_name, B main_name, C approved (checkbox; only approved alts are used)
 *   History  A event_time, B raid_name, C player_name, D event_type, E amount, F item_name, G bid
 *            (imported from the addon's JSON, or pasted: ep_earn and gp_spend events; amount is EP or
 *            GP by event_type)
 *            H week_id, I main   (written by Process history; an entry without a week_id is unprocessed)
 *            J note   (for the loot master; a correction is a copy of the wrong entry with a negative amount)
 *            A row with no raid, player, event_type or amount (only a time, or nothing) is a divider.
 *   Weeks    oldest week first; each week is added at the bottom, after a dark empty row.
 *            A week_id (a number), B player_name, C prev_ep, D prev_gp, E earned_ep, F spent_gp,
 *            G adjust_ep, H adjust_gp, I ep_decay_pct, J gp_decay_pct (filled in by Finalize week),
 *            K ep_decay, L gp_decay, M new_ep, N new_gp, O ratio, P note
 */

// In the order of the tabs (setup.js creates them in this order).
const SHEET = {
  epgp: 'EP/GP', current: 'Current', config: 'Config', alts: 'Alts', weeks: 'Weeks', history: 'History',
  roster: 'Roster'
};
const WEEKS_COLUMNS = 16;
const HISTORY_COLUMNS = 9;
const SEPARATOR_COLOR = '#434343';   // the empty row between two weeks in Weeks

/** Adds the menu when the spreadsheet opens. */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('EP/GP')
    .addItem('Import history', 'showImportDialog')
    .addItem('Process history', 'runProcessHistoryReport')
    .addItem('Finalize week', 'runFinalizeWeekReport')
    .addSeparator()
    .addItem('Set up sheet', 'runSetupSheet')
    .addToUi();
}

/** Shows a message. */
function showMessage(text) {
  SpreadsheetApp.getUi().alert(text);
}

/** Menu: Import history. Opens the dialog (ImportDialog.html), which sends the pasted text to importJson. */
function showImportDialog() {
  const html = HtmlService.createHtmlOutputFromFile('ImportDialog').setWidth(640).setHeight(440);
  SpreadsheetApp.getUi().showModalDialog(html, 'Import history');
}

/** Asks a yes/no question. Returns true when the answer is Yes. */
function confirmAction(text) {
  const ui = SpreadsheetApp.getUi();
  return ui.alert(text, ui.ButtonSet.YES_NO) === ui.Button.YES;
}

// ---- reading -----------------------------------------------------------------------------------

/** The Config values: start_ep, start_gp, decay and current_week. */
function getConfig() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET.config);
  const values = sheet.getRange('B2:B7').getValues();
  return {
    currentWeek: values[0][0],
    startEp: values[2][0],
    startGp: values[3][0],
    decay: values[5][0]
  };
}

/** The names on the Roster tab. */
function getRoster() {
  const names = [];
  for (const r of readRows(SHEET.roster, 1)) {
    if (String(r[0]).trim() !== '') {
      names.push(String(r[0]).trim());
    }
  }
  return names;
}

/** The approved alts: lower-case alt name -> main name. */
function getAltMap() {
  const altMap = new Map();
  for (const r of readRows(SHEET.alts, 3)) {
    if (String(r[0]).trim() !== '' && String(r[1]).trim() !== '' && r[2] === true) {
      altMap.set(lower(r[0]), String(r[1]).trim());
    }
  }
  return altMap;
}

/**
 * Every entry of the History tab: {row, date, raid, player, eventType, amount, weekId, main}.
 * date is the day of event_time (yyyy-mm-dd). weekId is '' for an entry that has not been processed.
 * Blank and divider rows are left out.
 */
function getHistory() {
  const history = [];
  const rows = readRows(SHEET.history, HISTORY_COLUMNS);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const isDivider = String(r[1]).trim() === '' && String(r[2]).trim() === '' && String(r[3]).trim() === '' &&
      String(r[4]).trim() === '';
    if (isDivider) {
      continue;
    }
    const eventTime = timeText(r[0]);
    history.push({
      row: i + 2,
      date: eventTime.slice(0, 10),
      raid: String(r[1]).trim(),
      player: String(r[2]).trim(),
      eventType: lower(r[3]),
      amount: r[4],
      weekId: r[7],
      main: String(r[8]).trim()
    });
  }
  return history;
}

/** The rows of a week: lower-case player name -> {newEp, newGp}. Empty when the week is not there. */
function getWeek(weekId) {
  const rows = new Map();
  for (const r of readRows(SHEET.weeks, WEEKS_COLUMNS)) {
    if (r[0] === weekId) {
      rows.set(lower(r[1]), {newEp: r[12], newGp: r[13]});
    }
  }
  return rows;
}

// ---- writing -----------------------------------------------------------------------------------

/** Adds rows (event_time … bid, columns A to G) at the bottom of History. event_time is kept as text. */
function appendHistory(rows) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET.history);
  const start = sheet.getLastRow() + 1;
  sheet.getRange(start, 1, rows.length, 1).setNumberFormat('@');
  sheet.getRange(start, 1, rows.length, 7).setValues(rows);
}

/** Writes entry.weekId and entry.main of each history entry into the week_id and main columns (H and I). */
function appendWeekIdAndMainToHistory(history) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET.history);
  let lastRow = 0;
  for (const entry of history) {
    lastRow = Math.max(lastRow, entry.row);
  }
  const block = sheet.getRange(2, 8, lastRow - 1, 2);
  const values = block.getValues();
  for (const entry of history) {
    values[entry.row - 2][0] = entry.weekId;
    values[entry.row - 2][1] = entry.main;
  }
  block.setValues(values);
}

/**
 * Adds the week at the bottom of the Weeks tab, after a dark empty row that separates it from the week
 * above. If the week already exists, it is replaced.
 */
function writeWeek(weekId, rows) {
  deleteWeek(weekId);

  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET.weeks);
  const lastRow = sheet.getLastRow();
  const start = lastRow < 2 ? 2 : lastRow + 2;   // the first week starts right under the header
  const values = [];
  for (let i = 0; i < rows.length; i++) {
    values.push(weekRow(start + i, weekId, rows[i]));
  }
  sheet.getRange(start, 1, values.length, WEEKS_COLUMNS).setValues(values);

  // The first week in the tab has no week above it to be separated from.
  if (start === 2) {
    return;
  }
  sheet.getRange(start - 1, 1, 1, WEEKS_COLUMNS).setBackground(SEPARATOR_COLOR);
}

/**
 * Deletes the rows of a week from the Weeks tab, with the empty separator row above them, so redoing an
 * older week leaves no extra empty rows behind. Does nothing if the week is not there.
 */
function deleteWeek(weekId) {
  const block = findWeekRows(weekId);
  if (block === null) {
    return;
  }

  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET.weeks);
  let first = block.first;
  let count = block.count;
  if (first > 2 && sheet.getRange(first - 1, 1).getValue() === '') {
    first--;
    count++;
  }
  sheet.deleteRows(first, count);
}

/** Puts the decay in the two decay-percentage columns of the week's rows. Returns the number of rows. */
function stampDecay(weekId, decay) {
  const block = findWeekRows(weekId);
  if (block === null) {
    return 0;
  }
  SpreadsheetApp.getActive().getSheetByName(SHEET.weeks).getRange(block.first, 9, block.count, 2).setValue(decay);
  return block.count;
}

/** Sets the current week in Config. */
function setCurrentWeek(weekId) {
  SpreadsheetApp.getActive().getSheetByName(SHEET.config).getRange('B2').setValue(weekId);
}

/** Sets the last update date in Config (shown on the EP/GP tab). */
function setLastUpdate(date) {
  SpreadsheetApp.getActive().getSheetByName(SHEET.config).getRange('B3').setValue(date);
}

/**
 * One row of the Weeks tab. The decay percentages stay empty until the week is finalized. Decay and the
 * new totals are formulas that only use cells of the same row, so editing earned, adjust or a decay
 * percentage recalculates the row, and a later change of the Config decay never changes a finalized week.
 */
function weekRow(r, weekId, p) {
  return [
    weekId, p.player, p.prevEp, p.prevGp, p.earnedEp, p.spentGp, '', '',
    '', '',
    '=(C' + r + '+E' + r + '+G' + r + ')*I' + r,
    '=(D' + r + '+F' + r + '+H' + r + ')*J' + r,
    '=C' + r + '+E' + r + '+G' + r + '-K' + r,
    '=D' + r + '+F' + r + '+H' + r + '-L' + r,
    '=IF(ISNUMBER(M' + r + '),IFERROR(M' + r + '/(N' + r + '+Config!$B$6),"No GP"),"")',
    ''
  ];
}

// ---- helpers -----------------------------------------------------------------------------------

/** The first sheet row and the number of rows of a week in the Weeks tab, or null if it is not there. */
function findWeekRows(weekId) {
  const rows = [];
  const values = readRows(SHEET.weeks, 1);
  for (let i = 0; i < values.length; i++) {
    if (values[i][0] === weekId) {
      rows.push(i + 2);
    }
  }
  if (rows.length === 0) {
    return null;
  }

  // The rows of a week are one block; the latest week is the last block in the tab.
  const first = rows[0];
  if (rows[rows.length - 1] - first + 1 !== rows.length) {
    throw new Error('The rows of week ' + weekId + ' are not together in Weeks.');
  }
  return {first: first, count: rows.length};
}

/** All rows below the header of a tab, limited to the first `columns` columns. */
function readRows(sheetName, columns) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(sheetName);
  const last = sheet.getLastRow();
  return last < 2 ? [] : sheet.getRange(2, 1, last - 1, columns).getValues();
}

/** The event_time cell as text, 'yyyy-mm-dd hh:mm:ss', also when Sheets turned it into a date. */
function timeText(value) {
  if (value instanceof Date) {
    const timeZone = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
    return Utilities.formatDate(value, timeZone, 'yyyy-MM-dd HH:mm:ss');
  }
  return String(value).trim();
}
