/**
 * Weekly EP/GP report, in two steps, after the addon's events are in History.
 *
 *   Import history   Adds the events of the addon's JSON export at the bottom of History (or paste them).
 *   Process history  Takes the event log from the addon (History tab). The unprocessed entries
 *                    (no week id) get their main and the current week id; processed entries are left
 *                    alone. Then it builds the current week in the Weeks tab from the previous week
 *                    and all history with that week id: previous balances, EP earned, GP spent. No
 *                    decay yet. Run it after every paste.
 *   Finalize week    Applies the decay to the current week, moves the current week id on by 1 and
 *                    sets the last update date.
 *
 * Any problem stops the action with an Error; runLocked shows its message. Everything is checked
 * before the first write, so a stopped action has written nothing.
 *
 * This file has the flow and the calculation. Everything that reads or writes cells, or shows a
 * message, is in sheet.js.
 */

/** Menu: Process history. */
function runProcessHistoryReport() {
  runLocked(processHistoryOfCurrentWeek);
}

/** Menu: Finalize week. */
function runFinalizeWeekReport() {
  runLocked(finalizeCurrentWeek);
}

function processHistoryOfCurrentWeek() {
  const config = getConfig();
  checkConfig(config);
  const weekId = config.currentWeek;

  const question = 'Process history for week ' + weekId + '?\n\n' +
    'The rows of this week in Weeks are rebuilt; manual edits to them are lost.';
  if (!confirmAction(question)) {
    return;
  }

  // Gives the unprocessed history its main and the week id. Processed history is left alone.
  processHistory(weekId);

  // Reads the previous week and the history of the week, and replaces the week in Weeks. No decay.
  processWeek(weekId, config);

  showMessage('History processed for week ' + weekId + '.');
}

function finalizeCurrentWeek() {
  const config = getConfig();
  checkConfig(config);
  const weekId = config.currentWeek;

  const question = 'Finalize week ' + weekId + '?\n\n' +
    'This applies the decay to week ' + weekId + ' and moves current week to week ' + (weekId + 1) + '.';
  if (!confirmAction(question)) {
    return;
  }

  const stamped = stampDecay(weekId, config.decay);
  if (stamped === 0) {
    throw new Error('No data found in Weeks for week ' + weekId + '. Run Process history first.');
  }

  setCurrentWeek(weekId + 1);
  setLastUpdate(new Date());
  showMessage('Week ' + weekId + ' is finalized. The current week is now ' + (weekId + 1) + '.');
}

/** Called by the Import history dialog. Returns the message for the dialog; an Error is shown there too. */
function importJson(text) {
  return withLock(function () {
    return importHistoryJson(text);
  });
}

/**
 * Runs a menu action under the document lock. An Error from the action is shown as a message; its
 * stack goes to the execution log.
 */
function runLocked(task) {
  try {
    withLock(task);
  } catch (e) {
    console.error(e.stack);
    showMessage(e.message);
  }
}

/** Runs a task under the document lock, so two people cannot run an action at once. Returns its result. */
function withLock(task) {
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(30000)) {
    throw new Error('Another EP/GP action is running. Try again in a minute.');
  }

  try {
    return task();
  } finally {
    lock.releaseLock();
  }
}

/**
 * Adds the events of the addon's JSON export at the bottom of History. Only "events" is used; the rest
 * of the export is ignored. Throws when the text is not a valid export or an event is wrong; then
 * nothing is added. Returns the message for the dialog.
 */
function importHistoryJson(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error('This is not valid JSON: ' + e.message);
  }
  if (data === null || !Array.isArray(data.events) || data.events.length === 0) {
    throw new Error('The JSON has no "events" to import.');
  }

  const errors = [];
  const rows = [];
  for (let i = 0; i < data.events.length; i++) {
    const event = data.events[i];
    const problem = checkImportedEvent(event);
    if (problem !== '') {
      errors.push('Event ' + (i + 1) + ': ' + problem);
      continue;
    }
    rows.push([event.event_time, event.raid_name, event.player_name, event.event_type, event.amount,
      event.item_name || '', event.bid || '']);
  }
  throwErrors(errors);

  appendHistory(rows);
  return 'Imported ' + rows.length + ' events into History. Run Process history to process them.';
}

/** What is wrong with an event of the JSON export, or '' when it is fine. */
function checkImportedEvent(event) {
  if (event === null || typeof event !== 'object') {
    return 'is not an object';
  }
  for (const field of ['event_time', 'raid_name', 'player_name']) {
    if (typeof event[field] !== 'string' || event[field].trim() === '') {
      return field + ' is missing';
    }
  }
  return checkEvent({eventType: lower(event.event_type), amount: event.amount});
}

/**
 * Every name that counts for a roster player, lower-cased, mapped to the roster name:
 *   rosterName -> rosterName
 *   altName    -> rosterName   (approved alts of rostered players only)
 * The roster names come first, so the order of the distinct values is the roster's order.
 */
function getRosterMap() {
  const rosterMap = new Map();
  for (const name of getRoster()) {
    rosterMap.set(lower(name), name);
  }
  for (const [alt, main] of getAltMap()) {
    const rosterName = rosterMap.get(lower(main));
    if (rosterName !== undefined && !rosterMap.has(alt)) {
      rosterMap.set(alt, rosterName);
    }
  }
  return rosterMap;
}

/**
 * Gives the unprocessed history entries (no week id) their main and the week id. Entries that already
 * have a week id are left alone. Throws when an entry is wrong; then nothing is written and the
 * entries stay unprocessed.
 */
function processHistory(weekId) {
  const unprocessedHistory = [];
  for (const entry of getHistory()) {
    if (entry.weekId === '') {
      unprocessedHistory.push(entry);
    }
  }
  if (unprocessedHistory.length === 0) {
    return;
  }

  const rosterMap = getRosterMap();
  for (const entry of unprocessedHistory) {
    entry.main = rosterMap.get(lower(entry.player)) || '';
  }

  validatePlayers(unprocessedHistory);
  validateEvents(unprocessedHistory);

  for (const entry of unprocessedHistory) {
    entry.weekId = weekId;
  }
  appendWeekIdAndMainToHistory(unprocessedHistory);
}

/** Throws when players are not on the Roster or an approved alt (entry.main is empty). */
function validatePlayers(history) {
  const errors = [];
  for (const entry of history) {
    if (entry.main === '') {
      errors.push('History row ' + entry.row + ': "' + entry.player + '" is not on the Roster or an approved alt of a rostered player');
    }
  }
  throwErrors(errors);
}

/** Throws when entries have an unknown event_type, or an amount that is not a number. */
function validateEvents(history) {
  const errors = [];
  for (const entry of history) {
    const problem = checkEvent(entry);
    if (problem !== '') {
      errors.push('History row ' + entry.row + ': ' + problem);
    }
  }
  throwErrors(errors);
}

/** What is wrong with a history entry, or '' when it is fine. */
function checkEvent(entry) {
  if (entry.eventType !== 'ep_earn' && entry.eventType !== 'gp_spend') {
    return 'event_type "' + entry.eventType + '" is not ep_earn or gp_spend';
  }
  if (typeof entry.amount !== 'number') {
    return 'amount "' + entry.amount + '" is not a number';
  }
  return '';
}

/**
 * Reads the previous week and all the history with this week id, and replaces the week in Weeks.
 * The mains come from the history as processed; they are not looked up again.
 */
function processWeek(weekId, config) {
  const currentWeekHistory = [];
  for (const entry of getHistory()) {
    if (entry.weekId === weekId) {
      currentWeekHistory.push(entry);
    }
  }
  if (currentWeekHistory.length === 0) {
    throw new Error('No history data found for week ' + weekId + '. Did you forget to paste the addon data?');
  }

  const rosterMap = getRosterMap();
  const previousWeek = getWeek(weekId - 1);
  const rows = aggregateEpGp(rosterMap, previousWeek, currentWeekHistory, config);
  writeWeek(weekId, rows);
}

/**
 * One row per roster player. prev is the player's row in the previous week, or the Config start values
 * when there is none. EP earned is the sum of the amounts of the main's ep_earn events, counted once per
 * main per raid per date per amount (a main and an alt in the same raid both produce an event; a
 * correction has a negative amount, so it is not a duplicate of the entry it corrects). GP spent is the
 * sum of the amounts of the main's gp_spend events.
 * Returns the rows; throws when a previous row has no new values to start from.
 */
function aggregateEpGp(rosterMap, previousWeek, currentWeekHistory, config) {
  const roster = new Set(rosterMap.values());   // each roster player once, in roster order
  const errors = [];
  const earned = new Map();
  const spent = new Map();
  const attended = new Set();

  for (const entry of currentWeekHistory) {
    if (entry.eventType === 'ep_earn') {
      const attendance = entry.main + '|' + lower(entry.raid) + '|' + entry.date + '|' + entry.amount;
      if (attended.has(attendance)) {
        continue;
      }
      attended.add(attendance);
      earned.set(entry.main, (earned.get(entry.main) || 0) + entry.amount);
    } else if (entry.eventType === 'gp_spend') {
      spent.set(entry.main, (spent.get(entry.main) || 0) + entry.amount);
    }
  }

  const rows = [];
  for (const name of roster) {
    const previous = previousWeek.get(lower(name));
    if (previous && (typeof previous.newEp !== 'number' || typeof previous.newGp !== 'number')) {
      errors.push(name + ': the previous week has no new_ep / new_gp to start from');
      continue;
    }
    rows.push({
      player: name,
      prevEp: previous ? previous.newEp : config.startEp,
      prevGp: previous ? previous.newGp : config.startGp,
      earnedEp: earned.get(name) || 0,
      spentGp: spent.get(name) || 0
    });
  }
  throwErrors(errors);
  return rows;
}

/** Throws when Config values cannot be used by the calculation. */
function checkConfig(config) {
  const errors = [];
  if (typeof config.startEp !== 'number') errors.push('Config start_ep is not a number');
  if (typeof config.startGp !== 'number') errors.push('Config start_gp is not a number');
  if (typeof config.decay !== 'number' || config.decay < 0 || config.decay >= 1) {
    errors.push('Config decay must be a number from 0 up to 1, for example 0.15');
  }
  if (!Number.isInteger(config.currentWeek) || config.currentWeek < 1) {
    errors.push('Config current_week must be a whole number from 1');
  }
  throwErrors(errors);
}

/** Lower-cases and trims, so "thrall " matches "Thrall". */
function lower(text) {
  return String(text).trim().toLowerCase();
}

/** Throws one Error listing the problems (the first ten). Does nothing when there are none. */
function throwErrors(errors) {
  if (errors.length === 0) {
    return;
  }
  let message = 'Found ' + errors.length + ' problem(s). Nothing more was done.\n\n' + errors.slice(0, 10).join('\n');
  if (errors.length > 10) {
    message += '\n...and ' + (errors.length - 10) + ' more';
  }
  throw new Error(message);
}
