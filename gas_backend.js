// ═══════════════════════════════════════════════════════════════
// PRECISION GRIND — Google Apps Script Backend
// Paste this entire file into Google Apps Script and deploy.
// ═══════════════════════════════════════════════════════════════

const SHEET_ID = SpreadsheetApp.getActiveSpreadsheet().getId();

function doGet(e) {
  const params = e.parameter;
  const action = params.action;
  let data = {};
  try { data = JSON.parse(decodeURIComponent(params.data || '{}')); } catch(err) {}

  let result = {};

  if (action === 'ping') {
    result = { ok: true, ts: new Date().toISOString() };

  } else if (action === 'getAll') {
    result = {
      clients:    getSheet('Clients'),
      materials:  getSheet('Materials'),
      laborRates: getSheet('LaborRates'),
      recentDocs: getSheet('Docs'),
      counters:   getCounters(),
      markup:     getSetting('markup') || 25,
    };

  } else if (action === 'append') {
    appendRow(data.sheet, data.row);
    result = { ok: true };

  } else if (action === 'appendBatch') {
    const rows = data.rows || [];
    for (const row of rows) {
      appendRow(data.sheet, row);
    }
    result = { ok: true, count: rows.length };

  } else if (action === 'clearSheet') {
    const sheet = getOrCreateSheet(data.sheet);
    sheet.clearContents();
    result = { ok: true };

  } else if (action === 'update') {
    updateRow(data.sheet, data.id, data.data);
    result = { ok: true };

  } else if (action === 'setCounter') {
    setSetting('counters', JSON.stringify(data));
    result = { ok: true };

  } else if (action === 'setMarkup') {
    setSetting('markup', data.value);
    result = { ok: true };

  } else {
    result = { error: 'Unknown action: ' + action };
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── SHEET HELPERS ─────────────────────────────────────────────
function getOrCreateSheet(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  return sheet;
}

function getSheet(name) {
  const sheet = getOrCreateSheet(name);
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  const headers = data[0];
  return data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    return obj;
  });
}

function appendRow(sheetName, rowObj) {
  const sheet = getOrCreateSheet(sheetName);
  const data = sheet.getDataRange().getValues();

  if (data.length === 0 || (data.length === 1 && data[0].every(c => c === ''))) {
    // Write headers from object keys
    const headers = Object.keys(rowObj);
    sheet.appendRow(headers);
  }

  // Get current headers
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const row = headers.map(h => rowObj[h] !== undefined ? rowObj[h] : '');
  sheet.appendRow(row);
}

function updateRow(sheetName, id, newData) {
  const sheet = getOrCreateSheet(sheetName);
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return;
  const headers = data[0];
  const idCol = headers.indexOf('id');
  if (idCol === -1) return;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idCol]) === String(id)) {
      headers.forEach((h, j) => {
        if (newData[h] !== undefined) sheet.getRange(i+1, j+1).setValue(newData[h]);
      });
      break;
    }
  }
}

// ── SETTINGS SHEET ────────────────────────────────────────────
function getSetting(key) {
  const sheet = getOrCreateSheet('Settings');
  const data = sheet.getDataRange().getValues();
  for (let i = 0; i < data.length; i++) {
    if (data[i][0] === key) return data[i][1];
  }
  return null;
}

function setSetting(key, value) {
  const sheet = getOrCreateSheet('Settings');
  const data = sheet.getDataRange().getValues();
  for (let i = 0; i < data.length; i++) {
    if (data[i][0] === key) {
      sheet.getRange(i+1, 2).setValue(value);
      return;
    }
  }
  sheet.appendRow([key, value]);
}

function getCounters() {
  const raw = getSetting('counters');
  if (!raw) return { year: null, quarter: null, seq: 1 };
  try { return JSON.parse(raw); } catch(e) { return { year: null, quarter: null, seq: 1 }; }
}
