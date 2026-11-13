/**
 * Builds a new EP/GP spreadsheet: every tab with its headers, formulas, formats and colours, and no
 * player data. Run it once, from the menu (EP/GP > Set up sheet), in a new empty spreadsheet.
 *
 * The layout built here is the one sheet.js relies on; a change to a tab's columns must be made in both.
 */

const HEADER_COLOR = '#1f3863';     // header row of the data tabs
const SCRIPT_COLUMN_COLOR = '#666666';   // header of columns the script fills in or that are only notes
const CONFIG_VALUE_COLOR = '#0000ff';

const CLASS_COLORS = {
  Warrior: '#783f04', Paladin: '#ff00ff', Hunter: '#38761d', Shaman: '#4a86e8', Rogue: '#ffd966',
  Druid: '#ff9900', Mage: '#00ffff', Warlock: '#9900ff', Priest: '#d9d9d9'
};

const ROLES = [
  {role: 'Tank', title: 'Tanks', color: '#bf9000'},
  {role: 'Melee', title: '⚔️ Melee ⚔️', color: '#f9cb9c'},
  {role: 'Healer', title: '🚑 Healers 🚑', color: '#b4a7d6'},
  {role: 'Caster', title: '🧙🏻 Casters 🧙🏻', color: '#a4c2f4'},
  {role: 'Ranged', title: '🏹 Ranged 🏹', color: '#b6d7a8'}
];

/** Menu: Set up sheet. */
function runSetupSheet() {
  runLocked(setupSheet);
}

function setupSheet() {
  const spreadsheet = SpreadsheetApp.getActive();
  for (const name of Object.values(SHEET)) {
    if (spreadsheet.getSheetByName(name) !== null) {
      throw new Error('Set up sheet only works in a new spreadsheet: the tab "' + name + '" already exists.');
    }
  }
  if (!confirmAction('Set up the EP/GP tabs in this spreadsheet?')) {
    return;
  }

  // All tabs are created first, so the formulas that point at other tabs find them.
  const unused = spreadsheet.getSheets();
  const tabs = Object.values(SHEET);
  for (let i = 0; i < tabs.length; i++) {
    spreadsheet.insertSheet(tabs[i], i);
  }
  setupConfig(spreadsheet.getSheetByName(SHEET.config));
  setupRoster(spreadsheet.getSheetByName(SHEET.roster));
  setupAlts(spreadsheet.getSheetByName(SHEET.alts));
  setupHistory(spreadsheet.getSheetByName(SHEET.history));
  setupWeeks(spreadsheet.getSheetByName(SHEET.weeks));
  setupCurrent(spreadsheet.getSheetByName(SHEET.current));
  setupEpGp(spreadsheet.getSheetByName(SHEET.epgp));

  // The empty tab a new spreadsheet starts with ("Sheet1").
  for (const sheet of unused) {
    if (sheet.getLastRow() === 0) {
      spreadsheet.deleteSheet(sheet);
    }
  }

  spreadsheet.getSheetByName(SHEET.epgp).activate();
  showMessage('The EP/GP tabs are set up. Fill in the Roster, check Config, then import the first history.');
}

// ---- data tabs ---------------------------------------------------------------------------------

function setupConfig(sheet) {
  writeHeader(sheet, ['setting', 'value', 'notes']);
  sheet.getRange('A2:C7').setValues([
    ['current_week', 1, 'The week that Process history and Finalize week work on. Incremented automatically by ' +
      'Finalize week; edit it manually only if you know what you are doing.'],
    ['last_update', '', 'The date the last week was finalized, shown as Last Update on the EP/GP tab. Set ' +
      'automatically by Finalize week.'],
    ['start_ep', 1000, 'EP given to a player who has no earlier row in Weeks'],
    ['start_gp', 20, 'GP given to a player who has no earlier row in Weeks'],
    ['base_gp', 10, 'Added to GP in the ratio: EP / (GP + base_gp)'],
    ['decay', 0.15, 'Share of EP and GP lost each week, applied to previous + earned + adjust']
  ]);
  sheet.getRange('B2:B7').setFontColor(CONFIG_VALUE_COLOR);
  sheet.getRange('B2').setNote('Incremented automatically by Finalize week. Edit it manually only if you know what you are doing.');
  sheet.getRange('B3').setNote('Set automatically by Finalize week.').setNumberFormat('dd/mm/yyyy').setHorizontalAlignment('right');
  sheet.getRange('B7').setNumberFormat('0%');
  setColumnWidths(sheet, [110, 80, 430]);
}

function setupRoster(sheet) {
  writeHeader(sheet, ['player_name', 'class', 'role']);
  sheet.getRange('E1').setValue('notes').setBackground(SCRIPT_COLUMN_COLOR).setFontColor('#ffffff').setFontWeight('bold');
  sheet.getRange('E2:E3').setValues([
    ['List mains only; alts go on the Alts tab.'],
    ['A player who leaves is removed from this list. Their rows in Weeks and History stay.']
  ]);

  const roles = [];
  for (const r of ROLES) {
    roles.push(r.role);
  }
  const roleRule = SpreadsheetApp.newDataValidation().requireValueInList(roles, true).setAllowInvalid(false).build();
  sheet.getRange('C2:C').setDataValidation(roleRule);

  const rules = [];
  for (const className of Object.keys(CLASS_COLORS)) {
    rules.push(classRule('=$B2="' + className + '"', className, [sheet.getRange('A2:A')]));
  }
  sheet.setConditionalFormatRules(rules);
  setColumnWidths(sheet, [160, 100, 100, 100, 520]);
}

function setupAlts(sheet) {
  writeHeader(sheet, ['alt_name', 'main_name', 'approved']);
  sheet.getRange('C2:C').insertCheckboxes();
  setColumnWidths(sheet, [160, 160, 90]);
}

function setupHistory(sheet) {
  writeHeader(sheet, ['event_time', 'raid_name', 'player_name', 'event_type', 'amount', 'item_name', 'bid',
    'week_id', 'main', 'note']);
  sheet.getRange('H1:I1').setBackground(SCRIPT_COLUMN_COLOR);
  sheet.getRange('A2:A').setNumberFormat('@');
  sheet.getRange('E2:E').setNumberFormat('0.00');
  sheet.getRange('H2:H').setNumberFormat('0');
  setColumnWidths(sheet, [150, 140, 140, 100, 70, 260, 100, 80, 140, 260]);
}

function setupWeeks(sheet) {
  writeHeader(sheet, ['week_id', 'player_name', 'prev_ep', 'prev_gp', 'earned_ep', 'spent_gp', 'adjust_ep',
    'adjust_gp', 'ep_decay_pct', 'gp_decay_pct', 'ep_decay', 'gp_decay', 'new_ep', 'new_gp', 'ratio', 'note']);
  sheet.getRange('A2:A').setNumberFormat('0');
  sheet.getRange('C2:H').setNumberFormat('0.00');
  sheet.getRange('I2:J').setNumberFormat('0%');
  sheet.getRange('K2:O').setNumberFormat('0.00');

  // Every other week is shaded, so the weeks are easy to tell apart.
  const shading = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=AND($A2<>"",ISEVEN(ROUND(SUMPRODUCT(($A$2:$A2<>"")/COUNTIF($A$2:$A2,$A$2:$A2&"")),0)))')
    .setBackground('#ededed')
    .setRanges([sheet.getRange('A2:P')])
    .build();
  sheet.setConditionalFormatRules([shading]);
  setColumnWidths(sheet, [100, 160, 85, 85, 85, 85, 85, 85, 85, 85, 85, 85, 85, 85, 85, 260]);
}

// ---- display tabs ------------------------------------------------------------------------------

/** Current: the latest week in Weeks, sorted by ratio. The EP/GP tab reads from here. */
function setupCurrent(sheet) {
  writeHeader(sheet, ['player_name', 'ep', 'gp', 'ratio', '', 'week_id']);
  sheet.getRange('E1').setBackground(null);
  sheet.getRange('A2').setFormula('=IFERROR(SORT(FILTER({Weeks!B2:B,Weeks!M2:M,Weeks!N2:N,Weeks!O2:O},' +
    'Weeks!A2:A=$F$2),4,FALSE),"")');
  sheet.getRange('F2').setFormula('=IF(COUNT(Weeks!A2:A)=0,"",MAX(Weeks!A2:A))')
    .setNumberFormat('0').setHorizontalAlignment('left');
  sheet.getRange('B2:D').setNumberFormat('0.00');

  const rules = [];
  for (const className of Object.keys(CLASS_COLORS)) {
    rules.push(classRule(rosterClassFormula('$A2', className), className, [sheet.getRange('A2:A')]));
  }
  sheet.setConditionalFormatRules(rules);
  setColumnWidths(sheet, [160, 80, 80, 80, 100, 100]);
}

/** EP/GP: the players of the latest week in one block per role, and the info panel in column U. */
function setupEpGp(sheet) {
  sheet.deleteRows(59, sheet.getMaxRows() - 58);
  sheet.deleteColumns(22, sheet.getMaxColumns() - 21);
  sheet.getRange('A1:U58').setFontFamily('Arial').setFontSize(10);

  const nameRanges = [];
  const prioRanges = [];
  for (let i = 0; i < ROLES.length; i++) {
    const r = ROLES[i];
    const column = 1 + i * 4;
    const letter = columnLetter(column);
    sheet.getRange(1, column, 1, 4).merge().setValue(r.title).setBackground(r.color).setFontSize(24)
      .setHorizontalAlignment('center').setVerticalAlignment('bottom');
    sheet.getRange(2, column, 1, 4).setValues([[
      '="Raider ("&COUNTIF(' + letter + '3:' + letter + ',"?*")&")"', 'EP', 'GP', 'Prio']]);
    sheet.getRange(3, column).setFormula('=IFERROR(FILTER(Current!$A$2:$D,ARRAYFORMULA(IFERROR(VLOOKUP(' +
      'Current!$A$2:$A,Roster!$A:$C,3,FALSE),""))="' + r.role + '"),"")');
    sheet.getRange(3, column + 1, 54, 3).setNumberFormat('0.00');
    sheet.setColumnWidth(column, 110);
    sheet.setColumnWidth(column + 1, 55);
    sheet.setColumnWidth(column + 2, 40);
    sheet.setColumnWidth(column + 3, 48);
    nameRanges.push(sheet.getRange(3, column, 54, 1));
    prioRanges.push(sheet.getRange(3, column + 3, 54, 1));
  }
  sheet.getRange('A2:T2').setBackground('#d9d9d9').setFontWeight('bold').setHorizontalAlignment('center');
  sheet.getRange('A1:T56').setBorder(true, true, true, true, true, true, '#000000', SpreadsheetApp.BorderStyle.SOLID);
  sheet.getRange('A57:T58').merge().setBackground('#999999');

  const rules = [];
  for (const className of Object.keys(CLASS_COLORS)) {
    rules.push(classRule(rosterClassFormula('A3', className), className, nameRanges));
  }
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .setGradientMinpoint('#e06666')
    .setGradientMaxpoint('#57bb8a')
    .setRanges(prioRanges)
    .build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()   // some players are missing from the blocks
    .whenFormulaSatisfied('=AND($U$6<>"",LEFT($U$6,3)<>"All")')
    .setBackground('#f4cccc')
    .setRanges([sheet.getRange('U6')])
    .build());
  sheet.setConditionalFormatRules(rules);

  setupPanel(sheet);
}

/** The info panel in column U of the EP/GP tab. */
function setupPanel(sheet) {
  const shown = 'COUNTIF(A3:A,"?*")+COUNTIF(E3:E,"?*")+COUNTIF(I3:I,"?*")+COUNTIF(M3:M,"?*")+COUNTIF(Q3:Q,"?*")';
  const players = 'COUNTIF(Current!A2:A,"?*")';
  sheet.getRange('U1:U36').setValues([
    ['="💀 "&IF(Current!F2="","No weeks yet","Week "&Current!F2)&" 💀"'],
    ['=IF(Config!B3="","Last Update: -","Last Update: "&TEXT(Config!B3,"dd/mm/yyyy"))'],
    ['🌋 Molten Core 🔥'],
    ['🐲 Onyxia 🔥'],
    ['🔥BWL🔥'],
    ['=IF(' + players + '=0,"",IF(' + players + '=' + shown + ',"All "&' + players + '&" players shown",' +
      players + '-(' + shown + ')&" players not shown: missing role on the Roster tab"))'],
    ['GP earned is immediate. EP earned is after raids.'], [''], [''], [''],
    ['Weekly Decay:'],
    ['=TEXT(Config!B7,"0%")&" EP & "&TEXT(Config!B7,"0%")&" GP"'],
    ['Medians (50th Percentile)'],
    ['(Latest week, Roster only)'],
    ['Median EP'],
    ['=IFERROR(MEDIAN(Current!B2:B),"")'],
    ['Median GP'],
    ['=IFERROR(MEDIAN(Current!C2:C),"")'],
    ['Median Prio'],
    ['=IFERROR(MEDIAN(Current!D2:D),"")'],
    ['Must be above median prio to MAX'],
    ['Priority:'],
    ['EP / (GP + Base GP)'],
    ['Base GP'],
    ['=Config!B6'],
    ['="All Players Start at "&Config!B5&"GP"'],
    [''], [''],
    ['EP awards'], [''],
    ['BWL'], [1000],
    ['MC'], [450],
    ['Onyxia'], [150]
  ]);

  sheet.setColumnWidth(21, 231);
  sheet.getRange('U1:U58').setHorizontalAlignment('center').setVerticalAlignment('middle').setBackground('#ffffff');
  sheet.getRange('U1').setBackground('#ff0000').setFontSize(20).setFontWeight('bold').setFontStyle('italic')
    .setVerticalAlignment('bottom').setWrap(true);
  sheet.getRange('U3:U5').setFontWeight('bold');
  sheet.getRange('U6').setFontSize(9).setFontStyle('italic').setWrap(true);
  sheet.getRange('U7:U10').merge().setFontSize(12).setWrap(true);
  sheet.getRange('U16:U20').setNumberFormat('0.00');
  sheet.getRange('U20').setFontWeight('bold');
  sheet.getRange('U24').setFontSize(13);
  sheet.getRange('U26').setFontSize(12);
  sheet.getRange('U27:U28').merge().setBackground('#999999');
  sheet.getRange('U29:U30').merge().setBackground('#fce5cd').setFontSize(12).setFontWeight('bold');
  sheet.getRange('U32').setFontSize(12).setFontWeight('bold').setFontStyle('italic');
  sheet.getRange('U34').setFontSize(12).setFontWeight('bold').setFontStyle('italic');
  sheet.getRange('U36').setFontSize(12).setFontWeight('bold').setFontStyle('italic');
  sheet.getRange('U37:U58').setBackground('#999999');

  for (const cell of ['U11', 'U22', 'U24', 'U31', 'U33', 'U35']) {
    sheet.getRange(cell).setBackground('#b7b7b7').setFontWeight('bold');
  }
  for (const cell of ['U13', 'U14']) {
    sheet.getRange(cell).setBackground('#b7b7b7').setFontStyle('italic');
  }
  for (const cell of ['U15', 'U17']) {
    sheet.getRange(cell).setBackground('#b7b7b7');
  }
  for (const cell of ['U2', 'U7', 'U19', 'U21', 'U26']) {
    sheet.getRange(cell).setBackground('#000000').setFontColor('#ffffff').setFontWeight('bold');
  }

  sheet.getRange('U1:U36').setBorder(true, true, true, true, null, true, '#000000', SpreadsheetApp.BorderStyle.SOLID);
}

// ---- helpers -----------------------------------------------------------------------------------

/** Writes the header row of a data tab and freezes it. */
function writeHeader(sheet, labels) {
  sheet.getRange(1, 1, 1, labels.length).setValues([labels])
    .setBackground(HEADER_COLOR).setFontColor('#ffffff').setFontWeight('bold');
  sheet.setFrozenRows(1);
}

/** A rule that colours the ranges in the class colour when the formula is true. */
function classRule(formula, className, ranges) {
  return SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied(formula)
    .setBackground(CLASS_COLORS[className])
    .setRanges(ranges)
    .build();
}

/** Formula that is true when the player in `cell` has this class on the Roster. */
function rosterClassFormula(cell, className) {
  return '=IFERROR(VLOOKUP(' + cell + ',INDIRECT("Roster!$A:$B"),2,FALSE),"")="' + className + '"';
}

function setColumnWidths(sheet, widths) {
  for (let i = 0; i < widths.length; i++) {
    sheet.setColumnWidth(i + 1, widths[i]);
  }
}

/** The letter of a column number (1 = A). Only for A to Z. */
function columnLetter(column) {
  return String.fromCharCode(64 + column);
}
