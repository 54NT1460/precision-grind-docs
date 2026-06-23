// ═══════════════════════════════════════════════════════════
// PRECISION GRIND — App Logic
// ═══════════════════════════════════════════════════════════

// ── STATE ──────────────────────────────────────────────────
const STATE = {
  clients: [],
  materials: [],
  laborRates: [],
  recentDocs: [],
  markup: 25,
  counters: { year: null, quarter: null, seq: 1 },
  gasUrl: '',
};

const CO = { // Company constants
  name: 'PRECISION GRIND',
  holding: 'BG The Holding Company · Corp. No. 511263',
  address: 'P.O. Box 1921 | Moca, P.R. 00676',
  phone: '939.218.2827',
  email: 'bgtheholdingcompany@gmail.com',
  bank: 'Banco Popular de Puerto Rico',
  cuenta: '178-417505',
  ruta: '021502011',
  latePayment: 'Todo pago tendrá una penalidad por atraso de 15% sobre el monto original si excede los 30 días y un 20% si excede los 60 días. ¡Gracias por su patrocinio!',
};

// ── INIT ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadLocal();
  updateDocNumber();
  renderAllLists();
  setTodayDates();
  document.getElementById('markupInput').value = STATE.markup;
  document.getElementById('markupDisplay').textContent = STATE.markup;
  if (STATE.gasUrl) {
    document.getElementById('gasUrl').value = STATE.gasUrl;
    checkSync();
  }
  addItem('cot');
  addItem('fac');
  // material price preview
  document.getElementById('m-matprice').addEventListener('input', updateMatCalc);
});

// ── LOCAL STORAGE ───────────────────────────────────────────
function loadLocal() {
  const keys = ['clients','materials','laborRates','recentDocs','markup','counters','gasUrl'];
  keys.forEach(k => {
    const v = localStorage.getItem('pg_' + k);
    if (v !== null) {
      try { STATE[k] = JSON.parse(v); } catch(e) { STATE[k] = v; }
    }
  });
}

function saveLocal(key) {
  localStorage.setItem('pg_' + key, JSON.stringify(STATE[key]));
}

function saveAll() {
  ['clients','materials','laborRates','recentDocs','markup','counters','gasUrl'].forEach(k => saveLocal(k));
}

// ── GOOGLE SHEETS SYNC ──────────────────────────────────────
let _autoSyncTimer = null;
let _isSyncing = false;

async function gasRequest(action, data = {}) {
  if (!STATE.gasUrl) return null;
  try {
    // Use POST for batch operations (avoids URL length limits on iOS Safari)
    const bigActions = ['appendBatch', 'clearSheet', 'deleteRow', 'append', 'update', 'setCounter', 'setMarkup'];
    if (bigActions.includes(action)) {
      const resp = await fetch(STATE.gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ action, data }),
      });
      return await resp.json();
    } else {
      // GET for read operations (ping, getAll, getSheet)
      const url = STATE.gasUrl + '?action=' + action + '&data=' + encodeURIComponent(JSON.stringify(data));
      const resp = await fetch(url);
      return await resp.json();
    }
  } catch (e) {
    console.warn('GAS error:', e);
    return null;
  }
}

async function checkSync() {
  const res = await gasRequest('ping');
  const dot = document.getElementById('syncDot');
  const label = document.getElementById('syncLabel');
  const btn = document.getElementById('syncBtn');
  if (res && res.ok) {
    dot.classList.add('connected');
    label.textContent = 'Conectado';
    btn.style.display = 'inline-block';
    document.getElementById('sheetsStatus').className = 'alert alert-info';
    document.getElementById('sheetsStatus').textContent = '✓ Conectado y sincronizando con Google Sheets.';
    await pullFromSheets();
    startAutoSync();
  } else {
    dot.classList.remove('connected');
    label.textContent = 'Sin conexión';
    btn.style.display = 'none';
  }
}

function startAutoSync() {
  if (_autoSyncTimer) clearInterval(_autoSyncTimer);
  // Pull fresh data from Sheets every 30 seconds
  _autoSyncTimer = setInterval(async () => {
    if (_isSyncing) return;
    _isSyncing = true;
    await pullFromSheets(true); // silent = true
    _isSyncing = false;
  }, 30000);
}

async function forcSync() {
  if (_isSyncing) return;
  const btn = document.getElementById('syncBtn');
  btn.textContent = '↻ …';
  _isSyncing = true;
  await pullFromSheets(false, true); // silent=false, force=true
  _isSyncing = false;
  btn.textContent = '↻ Sync';
}

async function pullFromSheets(silent = false, force = false) {
  // Step 1: small data — clients, docs, counters, markup
  const res = await gasRequest('getAll');
  if (!res) {
    if (!silent) showToast('Sin conexión con Sheets', true);
    return;
  }

  let changed = false;

  if (res.clients && Array.isArray(res.clients)) {
    // force=true: always replace. force=false: only if Sheets has more
    if (force || res.clients.length > STATE.clients.length) {
      STATE.clients = res.clients; saveLocal('clients'); changed = true;
    }
  }
  if (res.recentDocs && Array.isArray(res.recentDocs)) {
    if (force || res.recentDocs.length > STATE.recentDocs.length) {
      STATE.recentDocs = res.recentDocs; saveLocal('recentDocs'); changed = true;
    }
  }
  if (res.counters && (force || res.counters.seq > STATE.counters.seq)) {
    STATE.counters = res.counters; saveLocal('counters'); changed = true;
  }
  if (res.markup) {
    const m = parseFloat(res.markup);
    if (m !== STATE.markup) {
      STATE.markup = m; saveLocal('markup');
      document.getElementById('markupInput').value = m;
      document.getElementById('markupDisplay').textContent = m;
      changed = true;
    }
  }

  // Step 2: Materials — separate call (avoids URL size limit)
  const matRes = await gasRequest('getSheet', { sheet: 'Materials' });
  if (matRes && Array.isArray(matRes.rows) && matRes.rows.length > 0) {
    if (force || matRes.rows.length > STATE.materials.length) {
      STATE.materials = matRes.rows; saveLocal('materials'); changed = true;
    }
  }

  // Step 3: LaborRates — separate call
  const labRes = await gasRequest('getSheet', { sheet: 'LaborRates' });
  if (labRes && Array.isArray(labRes.rows) && labRes.rows.length > 0) {
    if (force || labRes.rows.length > STATE.laborRates.length) {
      STATE.laborRates = labRes.rows; saveLocal('laborRates'); changed = true;
    }
  }

  if (changed) {
    renderAllLists();
    updateDocNumber();
  }

  const mat = STATE.materials.length;
  const lab = STATE.laborRates.length;
  const cli = STATE.clients.length;

  if (!silent) {
    showToast(changed
      ? `Sincronizado ✓ — ${mat} mat · ${lab} tarifas · ${cli} clientes`
      : `Al día — ${mat} mat · ${lab} tarifas · ${cli} clientes`
    );
  }

  const now = new Date();
  const t = now.toLocaleTimeString('es-PR', { hour: '2-digit', minute: '2-digit' });
  document.getElementById('syncLabel').textContent = `Sync ${t}`;
}

// Push the full local catalog up to Sheets
async function writeAllToSheets() {
  if (!STATE.gasUrl) { showToast('No conectado a Sheets', true); return; }

  const matCount = STATE.materials.length;
  const labCount = STATE.laborRates.length;

  if (matCount === 0 && labCount === 0) {
    showToast('Sin datos locales para subir', true);
    return;
  }

  showToast(`Subiendo ${matCount} mat + ${labCount} tarifas…`);

  // Materials — clear then write in batches of 25
  await gasRequest('clearSheet', { sheet: 'Materials' });
  for (let i = 0; i < STATE.materials.length; i += 25) {
    const batch = STATE.materials.slice(i, i + 25);
    const res = await gasRequest('appendBatch', { sheet: 'Materials', rows: batch });
    if (!res || !res.ok) {
      showToast(`Error al subir materiales (batch ${i/25 + 1})`, true);
      return;
    }
  }

  // LaborRates — clear then write in batches of 25
  await gasRequest('clearSheet', { sheet: 'LaborRates' });
  for (let i = 0; i < STATE.laborRates.length; i += 25) {
    const batch = STATE.laborRates.slice(i, i + 25);
    const res = await gasRequest('appendBatch', { sheet: 'LaborRates', rows: batch });
    if (!res || !res.ok) {
      showToast(`Error al subir tarifas (batch ${i/25 + 1})`, true);
      return;
    }
  }

  showToast(`✓ ${matCount} materiales + ${labCount} tarifas subidas a Sheets`);
}

async function pushToSheets(sheet, row) {
  return await gasRequest('append', { sheet, row });
}

async function updateSheets(sheet, id, data) {
  return await gasRequest('update', { sheet, id, data });
}

// ── DOCUMENT NUMBERING ──────────────────────────────────────
function getCurrentYQ() {
  const now = new Date();
  const yr = String(now.getFullYear()).slice(-2);
  const mo = now.getMonth() + 1;
  const q = mo <= 3 ? 1 : mo <= 6 ? 2 : mo <= 9 ? 3 : 4;
  return { yr, q };
}

function updateDocNumber() {
  const { yr, q } = getCurrentYQ();
  // Reset counter if year/quarter changed
  if (STATE.counters.year !== yr || STATE.counters.quarter !== q) {
    STATE.counters = { year: yr, quarter: q, seq: 1 };
    saveLocal('counters');
  }
  const num = docNumString();
  document.getElementById('cotNumLabel').textContent = `# ${num}`;
  document.getElementById('facNumLabel').textContent = `# ${num}`;
  document.getElementById('woNumLabel').textContent = `# ${num}`;
  document.getElementById('dashDocNum').textContent = num;
  document.getElementById('counterInfo').textContent = `Próximo: ${num}`;
}

function docNumString() {
  const { yr, q } = getCurrentYQ();
  const seq = String(STATE.counters.seq).padStart(2, '0');
  return `${yr}-${q}${seq}`;
}

function incrementCounter() {
  STATE.counters.seq++;
  saveLocal('counters');
  if (STATE.gasUrl) gasRequest('setCounter', STATE.counters);
  updateDocNumber();
}

// ── VIEW NAVIGATION ─────────────────────────────────────────
function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.bn-item').forEach(n => n.classList.remove('active'));
  document.getElementById('view-' + id).classList.add('active');
  document.querySelectorAll(`[data-view="${id}"]`).forEach(el => el.classList.add('active'));
  if (id === 'home') renderRecentDocs();
}

// ── DATES ────────────────────────────────────────────────────
function setTodayDates() {
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('fac-date').value = today;
  document.getElementById('wo-date').value = today;
}

// ── LINE ITEMS ───────────────────────────────────────────────
let itemCounts = { cot: 0, fac: 0 };

function addItem(prefix, opts = {}) {
  const tbody = document.getElementById(prefix + '-items');
  const id = prefix + '_item_' + (++itemCounts[prefix]);
  const row = document.createElement('tr');
  row.className = 'item-row';
  row.id = id;
  row.innerHTML = `
    <td class="col-desc"><input type="text" placeholder="Descripción" value="${opts.desc||''}" oninput="calcRowTotal('${id}','${prefix}')"></td>
    <td class="col-type">
      <select onchange="calcRowTotal('${id}','${prefix}')">
        <option value="labor" ${opts.type==='labor'?'selected':''}>Labor</option>
        <option value="material" ${opts.type==='material'?'selected':''}>Material</option>
        <option value="otro" ${opts.type==='otro'?'selected':''}>Otro</option>
      </select>
    </td>
    <td class="col-qty"><input type="number" value="${opts.qty||1}" min="0" step="any" oninput="calcRowTotal('${id}','${prefix}')"></td>
    <td class="col-unit"><input type="text" value="${opts.unit||''}" placeholder="Each"></td>
    <td class="col-hd"><input type="number" value="${opts.hdPrice||''}" min="0" step="0.01" placeholder="HD $" oninput="calcHdPrice('${id}','${prefix}')"></td>
    <td class="col-price"><input type="number" value="${opts.price||''}" min="0" step="0.01" oninput="calcRowTotal('${id}','${prefix}')"></td>
    <td class="col-total item-total" id="${id}_total">$0.00</td>
    <td class="col-del"><button class="del-btn" onclick="removeItem('${id}','${prefix}')">✕</button></td>
  `;
  tbody.appendChild(row);
  if (opts.price) calcRowTotal(id, prefix);
}

function calcHdPrice(rowId, prefix) {
  const row = document.getElementById(rowId);
  const hdInput = row.querySelector('.col-hd input');
  const priceInput = row.querySelector('.col-price input');
  const hdVal = parseFloat(hdInput.value) || 0;
  if (hdVal > 0) {
    const markup = (STATE.markup / 100) + 1;
    const final = hdVal * 1.115 * markup;
    priceInput.value = final.toFixed(2);
  }
  calcRowTotal(rowId, prefix);
}

function calcRowTotal(rowId, prefix) {
  const row = document.getElementById(rowId);
  const qty   = parseFloat(row.querySelector('.col-qty input').value) || 0;
  const price = parseFloat(row.querySelector('.col-price input').value) || 0;
  const total = qty * price;
  document.getElementById(rowId + '_total').textContent = '$' + total.toFixed(2);
  if (prefix === 'cot') calcCotTotal();
  if (prefix === 'fac') calcFacTotal();
}

function removeItem(rowId, prefix) {
  document.getElementById(rowId).remove();
  if (prefix === 'cot') calcCotTotal();
  if (prefix === 'fac') calcFacTotal();
}

function getItemsData(prefix) {
  const rows = document.querySelectorAll(`#${prefix}-items .item-row`);
  return Array.from(rows).map(row => ({
    desc:    row.querySelector('.col-desc input').value,
    type:    row.querySelector('.col-type select').value,
    qty:     parseFloat(row.querySelector('.col-qty input').value) || 0,
    unit:    row.querySelector('.col-unit input').value,
    hdPrice: parseFloat(row.querySelector('.col-hd input').value) || 0,
    price:   parseFloat(row.querySelector('.col-price input').value) || 0,
    total:   (parseFloat(row.querySelector('.col-qty input').value)||0) *
             (parseFloat(row.querySelector('.col-price input').value)||0),
  }));
}

function getSubtotal(prefix) {
  return getItemsData(prefix).reduce((s, i) => s + i.total, 0);
}

// ── COT TOTALS ───────────────────────────────────────────────
function calcCotTotal() {
  const sub = getSubtotal('cot');
  document.getElementById('cot-subtotal').textContent = '$' + sub.toFixed(2);
  document.getElementById('cot-total').textContent = '$' + sub.toFixed(2);
}

function toggleDepositCot() {
  const show = document.getElementById('cot-depositRequired').checked;
  document.getElementById('cot-depositFields').style.display = show ? '' : 'none';
}

// ── FAC TOTALS ───────────────────────────────────────────────
function calcFacTotal() {
  const sub = getSubtotal('fac');
  const dep = parseFloat(document.getElementById('fac-deposit').value) || 0;
  const total = Math.max(0, sub - dep);
  document.getElementById('fac-subtotal').textContent = '$' + sub.toFixed(2);
  const depRow = document.getElementById('fac-deposit-row');
  if (dep > 0) {
    depRow.style.display = '';
    document.getElementById('fac-deposit-display').textContent = '-$' + dep.toFixed(2);
  } else {
    depRow.style.display = 'none';
  }
  document.getElementById('fac-total').textContent = '$' + total.toFixed(2);
}

// ── CLIENTS ──────────────────────────────────────────────────
function openClientModal() {
  ['m-cname','m-cphone','m-cemail','m-caddress'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('modal-client-title').textContent = 'Nuevo Cliente';
  document.getElementById('modal-client-save').textContent = 'Guardar';
  document.getElementById('modal-client-save').removeAttribute('data-edit-id');
  document.getElementById('modal-client').classList.add('open');
}


function loadClientCot() {
  const sel = document.getElementById('cot-clientSelect');
  const c = STATE.clients.find(x => x.id == sel.value);
  if (!c) return;
  document.getElementById('cot-clientName').value = c.name;
  document.getElementById('cot-address').value = c.address;
  document.getElementById('cot-phone').value = c.phone;
  document.getElementById('cot-email').value = c.email;
}

function loadClientFac() {
  const sel = document.getElementById('fac-clientSelect');
  const c = STATE.clients.find(x => x.id == sel.value);
  if (!c) return;
  document.getElementById('fac-clientName').value = c.name;
  document.getElementById('fac-address').value = c.address;
  document.getElementById('fac-phone').value = c.phone;
  document.getElementById('fac-email').value = c.email;
}

function loadClientWo() {
  const sel = document.getElementById('wo-clientSelect');
  const c = STATE.clients.find(x => x.id == sel.value);
  if (!c) return;
  document.getElementById('wo-client').value = c.name;
  document.getElementById('wo-address').value = c.address;
  document.getElementById('wo-phone').value = c.phone;
}

function renderClientSelects() {
  const opts = `<option value="">— Seleccionar —</option>` +
    STATE.clients.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  ['cot-clientSelect','fac-clientSelect','wo-clientSelect'].forEach(id => {
    document.getElementById(id).innerHTML = opts;
  });
}

function renderClientList() {
  const el = document.getElementById('clientList');
  if (!STATE.clients.length) {
    el.innerHTML = '<div style="color:var(--muted);font-size:13px;">Sin clientes guardados.</div>';
    document.getElementById('clientCountLabel').textContent = '0 guardados';
    return;
  }
  document.getElementById('clientCountLabel').textContent = STATE.clients.length + ' guardados';
  el.innerHTML = STATE.clients.map(c => `
    <div class="client-item">
      <div>
        <div class="client-name">${c.name}</div>
        <div class="client-detail">${c.phone || '—'} · ${c.email || '—'}</div>
        <div class="client-detail">${c.address || '—'}</div>
      </div>
      <div style="display:flex;gap:6px">
        <button class="btn btn-ghost btn-sm" onclick="openEditClient(${c.id})">✏️</button>
        <button class="btn btn-ghost btn-sm" style="color:var(--accent)" onclick="deleteClient(${c.id})">✕</button>
      </div>
    </div>
  `).join('');
}

function deleteClient(id) {
  // No confirm() — Safari iOS blocks it. Button tap is intentional enough.
  STATE.clients = STATE.clients.filter(c => c.id !== id);
  saveLocal('clients');
  renderAllLists();
  if (STATE.gasUrl) gasRequest('deleteRow', { sheet: 'Clients', id });
  showToast('Cliente eliminado');
}

function openEditClient(id) {
  const c = STATE.clients.find(x => x.id === id);
  if (!c) return;
  document.getElementById('m-cname').value = c.name || '';
  document.getElementById('m-cphone').value = c.phone || '';
  document.getElementById('m-cemail').value = c.email || '';
  document.getElementById('m-caddress').value = c.address || '';
  document.getElementById('modal-client-title').textContent = 'Editar Cliente';
  document.getElementById('modal-client-save').setAttribute('data-edit-id', id);
  document.getElementById('modal-client-save').textContent = 'Actualizar';
  document.getElementById('modal-client').classList.add('open');
}

async function saveClient() {
  const editId = parseInt(document.getElementById('modal-client-save').getAttribute('data-edit-id') || '0');
  const isEdit = !!editId;

  const data = {
    id: isEdit ? editId : Date.now(),
    name:    document.getElementById('m-cname').value.trim(),
    phone:   document.getElementById('m-cphone').value.trim(),
    email:   document.getElementById('m-cemail').value.trim(),
    address: document.getElementById('m-caddress').value.trim(),
  };
  if (!data.name) { showToast('Ingresa el nombre del cliente', true); return; }

  if (isEdit) {
    STATE.clients = STATE.clients.map(c => c.id === editId ? data : c);
    saveLocal('clients');
    if (STATE.gasUrl) {
      await gasRequest('deleteRow', { sheet: 'Clients', id: editId });
      await pushToSheets('Clients', data);
    }
    showToast('Cliente actualizado ✓');
  } else {
    STATE.clients.push(data);
    saveLocal('clients');
    if (STATE.gasUrl) await pushToSheets('Clients', data);
    showToast('Cliente guardado ✓');
  }

  renderAllLists();
  closeModal('client');
}

// ── MATERIALS ────────────────────────────────────────────────
function openMaterialModal() {
  ['m-matname','m-matunit','m-matsku'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('m-matprice').value = '';
  document.getElementById('m-matvendor').value = 'HD';
  document.getElementById('m-matcalc').textContent = '';
  document.getElementById('modal-material').classList.add('open');
}

function updateMatCalc() {
  const hd = parseFloat(document.getElementById('m-matprice').value) || 0;
  if (hd > 0) {
    const markup = (STATE.markup / 100) + 1;
    const final = hd * 1.115 * markup;
    document.getElementById('m-matcalc').textContent =
      `$${hd.toFixed(2)} × 1.115 IVU × ${markup.toFixed(2)} markup = $${final.toFixed(2)} precio final`;
  }
}

async function saveMaterial() {
  const hd = parseFloat(document.getElementById('m-matprice').value) || 0;
  const markup = (STATE.markup / 100) + 1;
  const mat = {
    id: Date.now(),
    name:    document.getElementById('m-matname').value.trim(),
    sku:     document.getElementById('m-matsku').value.trim(),
    vendor:  document.getElementById('m-matvendor').value,
    hdPrice: hd,
    unit:    document.getElementById('m-matunit').value.trim() || 'Each',
    finalPrice: parseFloat((hd * 1.115 * markup).toFixed(2)),
  };
  if (!mat.name) { showToast('Ingresa el nombre del material', true); return; }
  STATE.materials.push(mat);
  saveLocal('materials');
  if (STATE.gasUrl) await pushToSheets('Materials', mat);
  renderAllLists();
  closeModal('material');
  showToast('Material guardado ✓');
}

function vendorBadge(vendor) {
  const colors = { HD: '#f96302', HQJ: '#c0392b', Otro: '#8a8577' };
  const c = colors[vendor] || colors.Otro;
  return `<span style="background:${c};color:white;font-size:9px;font-weight:700;padding:1px 6px;border-radius:3px;font-family:'DM Mono',monospace;margin-right:6px">${vendor||'—'}</span>`;
}

function renderMaterialList() {
  const el = document.getElementById('materialList');
  const searchEl = document.getElementById('materialSearch');
  const vendorEl = document.getElementById('vendorFilter');
  const search = (searchEl ? searchEl.value : '').toLowerCase().trim();
  const vendorFilter = vendorEl ? vendorEl.value : '';

  let list = STATE.materials;
  if (search) {
    list = list.filter(m =>
      m.name.toLowerCase().includes(search) ||
      (m.sku || '').toLowerCase().includes(search)
    );
  }
  if (vendorFilter) {
    list = list.filter(m => (m.vendor || 'HD') === vendorFilter);
  }

  if (!STATE.materials.length) {
    el.innerHTML = '<div style="color:var(--muted);font-size:13px;">Sin materiales en catálogo. Usa "Importar" para cargar tu lista.</div>';
    return;
  }
  if (!list.length) {
    el.innerHTML = '<div style="color:var(--muted);font-size:13px;">Sin resultados.</div>';
    return;
  }
  el.innerHTML = `<div style="font-size:11px;color:var(--muted);margin-bottom:8px;font-family:'DM Mono',monospace">${list.length} de ${STATE.materials.length} materiales</div>` +
    list.map(m => `
    <div class="material-item">
      <div>${vendorBadge(m.vendor||'HD')}<strong>${m.name}</strong> <span style="color:var(--muted);font-size:11px">${m.unit}${m.sku ? ' · SKU ' + m.sku : ''}</span></div>
      <div style="font-family:'DM Mono',monospace;font-size:12px;color:var(--muted)">$${m.hdPrice.toFixed(2)}</div>
      <div style="font-family:'DM Mono',monospace;font-size:13px;font-weight:600;color:var(--accent)">$${m.finalPrice.toFixed(2)}</div>
      <button class="btn btn-ghost btn-sm" onclick="deleteMaterial(${m.id})">✕</button>
    </div>
  `).join('');
}

function deleteMaterial(id) {
  STATE.materials = STATE.materials.filter(m => m.id !== id);
  saveLocal('materials');
  renderMaterialList();
  if (STATE.gasUrl) gasRequest('deleteRow', { sheet: 'Materials', id });
}

function clearMaterials() {
  if (!confirm(`¿Eliminar los ${STATE.materials.length} materiales del catálogo? Esto no afecta Google Sheets.`)) return;
  STATE.materials = [];
  saveLocal('materials');
  renderAllLists();
  showToast('Catálogo limpiado ✓');
}

// ── IMPORT MATERIALS ─────────────────────────────────────────
async function importMaterials(event) {
  const file = event.target.files[0];
  if (!file) return;
  const text = await file.text();
  let items;
  try { items = JSON.parse(text); }
  catch (e) { showToast('Archivo inválido', true); return; }
  if (!Array.isArray(items)) { showToast('Formato inválido', true); return; }

  showToast('Importando… por favor espera');

  let added = 0, skipped = 0;
  const existingKeys = new Set(
    STATE.materials.map(m => (m.sku||'') + '|' + (m.vendor||'HD')).filter(k => k !== '|HD')
  );

  for (const item of items) {
    const key = (item.sku||'') + '|' + (item.vendor||'HD');
    if (item.sku && existingKeys.has(key)) { skipped++; continue; }
    STATE.materials.push({
      id: item.id || (Date.now() + added),
      name: item.name,
      sku: item.sku || '',
      vendor: item.vendor || 'HD',
      hdPrice: item.hdPrice,
      unit: item.unit || 'Each',
      finalPrice: item.finalPrice || parseFloat((item.hdPrice * 1.115 * (1 + STATE.markup/100)).toFixed(2)),
    });
    if (item.sku) existingKeys.add(key);
    added++;
  }

  // Save locally first — all at once, no network calls during bulk load
  saveLocal('materials');
  renderAllLists();
  showToast(`${added} materiales importados${skipped ? `, ${skipped} ya existían` : ''} ✓`);
  event.target.value = '';

  // Push the FULL catalog to Sheets (overwrites any partial data there)
  if (STATE.gasUrl) await writeAllToSheets();
}

// ── IMPORT LABOR RATES ───────────────────────────────────────
async function importLaborRates(event) {
  const file = event.target.files[0];
  if (!file) return;
  const text = await file.text();
  let items;
  try { items = JSON.parse(text); }
  catch (e) { showToast('Archivo inválido', true); return; }
  if (!Array.isArray(items)) { showToast('Formato inválido', true); return; }

  showToast('Importando tarifas…');

  let added = 0, skipped = 0;
  const existingDescs = new Set(STATE.laborRates.map(l => l.desc.toLowerCase().trim()));

  for (const item of items) {
    const key = (item.desc || '').toLowerCase().trim();
    if (existingDescs.has(key)) { skipped++; continue; }
    STATE.laborRates.push({
      id: item.id || (Date.now() + added),
      desc: item.desc,
      price: item.price,
      unit: item.unit || 'Por servicio',
    });
    existingDescs.add(key);
    added++;
  }

  saveLocal('laborRates');
  renderAllLists();
  showToast(`${added} tarifas importadas${skipped ? `, ${skipped} ya existían` : ''} ✓`);
  event.target.value = '';

  // Push the FULL catalog to Sheets
  if (STATE.gasUrl) await writeAllToSheets();
}

function openMaterialPicker() {
  const el = document.getElementById('materialPickerList');
  if (!STATE.materials.length) {
    el.innerHTML = '<div style="color:var(--muted);font-size:13px;">No hay materiales. Añade en la sección Materiales.</div>';
  } else {
    el.innerHTML = STATE.materials.map(m => `
      <div class="client-item" style="cursor:pointer" onclick="pickMaterial(${m.id})">
        <div>
          <div class="client-name">${m.name}</div>
          <div class="client-detail">${m.unit} · HD $${m.hdPrice.toFixed(2)} → <strong>$${m.finalPrice.toFixed(2)}</strong></div>
        </div>
        <button class="btn btn-primary btn-sm">+ Añadir</button>
      </div>
    `).join('');
  }
  document.getElementById('modal-materialpicker').classList.add('open');
}

function pickMaterial(id) {
  const m = STATE.materials.find(x => x.id === id);
  if (!m) return;
  addItem('fac', { desc: m.name, type: 'material', qty: 1, unit: m.unit, hdPrice: m.hdPrice, price: m.finalPrice });
  calcFacTotal();
  closeModal('materialpicker');
}

// ── LABOR RATES ──────────────────────────────────────────────
function openLaborModal() {
  ['m-labdesc','m-labunit'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('m-labprice').value = '';
  document.getElementById('modal-labor').classList.add('open');
}

async function saveLabor() {
  const lab = {
    id: Date.now(),
    desc:  document.getElementById('m-labdesc').value.trim(),
    price: parseFloat(document.getElementById('m-labprice').value) || 0,
    unit:  document.getElementById('m-labunit').value.trim() || 'Por servicio',
  };
  if (!lab.desc) { showToast('Ingresa descripción de la tarifa', true); return; }
  STATE.laborRates.push(lab);
  saveLocal('laborRates');
  if (STATE.gasUrl) await pushToSheets('LaborRates', lab);
  renderAllLists();
  closeModal('labor');
  showToast('Tarifa guardada ✓');
}

function renderLaborList() {
  const el = document.getElementById('laborList');
  if (!STATE.laborRates.length) {
    el.innerHTML = '<div style="color:var(--muted);font-size:13px;">Sin tarifas. Añade tus tarifas fijas.</div>';
    return;
  }
  el.innerHTML = STATE.laborRates.map(l => `
    <div class="material-item">
      <div><strong>${l.desc}</strong> <span style="color:var(--muted);font-size:11px">${l.unit}</span></div>
      <div></div>
      <div style="font-family:'DM Mono',monospace;font-size:13px;font-weight:600;color:var(--accent)">$${l.price.toFixed(2)}</div>
      <button class="btn btn-ghost btn-sm" onclick="deleteLabor(${l.id})">✕</button>
    </div>
  `).join('');
}

function deleteLabor(id) {
  if (!confirm('¿Eliminar esta tarifa?')) return;
  STATE.laborRates = STATE.laborRates.filter(l => l.id !== id);
  saveLocal('laborRates');
  renderLaborList();
  if (STATE.gasUrl) gasRequest('deleteRow', { sheet: 'LaborRates', id });
}

function openLaborPicker() {
  const el = document.getElementById('laborPickerList');
  if (!STATE.laborRates.length) {
    el.innerHTML = '<div style="color:var(--muted);font-size:13px;">No hay tarifas. Añade en Tarifas Labor.</div>';
  } else {
    el.innerHTML = STATE.laborRates.map(l => `
      <div class="client-item" style="cursor:pointer" onclick="pickLabor(${l.id})">
        <div>
          <div class="client-name">${l.desc}</div>
          <div class="client-detail">${l.unit}</div>
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          <strong style="font-family:'DM Mono',monospace">$${l.price.toFixed(2)}</strong>
          <button class="btn btn-primary btn-sm">+ Añadir</button>
        </div>
      </div>
    `).join('');
  }
  document.getElementById('modal-laborpicker').classList.add('open');
}

function pickLabor(id) {
  const l = STATE.laborRates.find(x => x.id === id);
  if (!l) return;
  addItem('fac', { desc: l.desc, type: 'labor', qty: 1, unit: l.unit, price: l.price });
  calcFacTotal();
  closeModal('laborpicker');
}

// ── RECENT DOCS ──────────────────────────────────────────────
function renderRecentDocs() {
  const el = document.getElementById('recentList');
  if (!STATE.recentDocs.length) {
    el.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:12px 0;">No hay documentos aún.</div>';
    return;
  }
  const sorted = [...STATE.recentDocs].reverse().slice(0, 10);
  el.innerHTML = sorted.map(d => `
    <div class="recent-item">
      <div class="recent-num">${d.num}</div>
      <div class="recent-client">${d.client}</div>
      <div class="recent-type">${d.type}</div>
      <div class="recent-amount">$${(d.total||0).toFixed(2)}</div>
      <span class="badge badge-${d.paid?'paid':'pending'}">${d.paid?'PAGADO':'Pendiente'}</span>
    </div>
  `).join('');
}

// ── RENDER ALL ───────────────────────────────────────────────
function renderAllLists() {
  renderClientSelects();
  renderClientList();
  renderMaterialList();
  renderLaborList();
  renderRecentDocs();
}

// ── CLEAR FORMS ──────────────────────────────────────────────
function clearForm(prefix) {
  if (!confirm('¿Limpiar el formulario?')) return;
  if (prefix === 'cot') {
    ['cot-clientName','cot-project','cot-address','cot-phone','cot-email',
     'cot-leader','cot-contact','cot-startDate','cot-endDate','cot-duration',
     'cot-summary','cot-responsibilities','cot-depositDesc','cot-budgetDesc'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    document.getElementById('cot-items').innerHTML = '';
    itemCounts.cot = 0;
    addItem('cot');
    calcCotTotal();
  }
  if (prefix === 'fac') {
    ['fac-clientName','fac-project','fac-address','fac-phone','fac-email',
     'fac-deposit','fac-notes','guar-tipo','guar-fechas','guar-desc'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    setTodayDates();
    document.getElementById('fac-items').innerHTML = '';
    itemCounts.fac = 0;
    addItem('fac');
    calcFacTotal();
  }
  if (prefix === 'wo') {
    ['wo-client','wo-tech','wo-address','wo-phone','wo-problem',
     'wo-materials','wo-workdone','wo-extra','wo-warranty','wo-arrival','wo-departure'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    document.querySelectorAll('input[name="wo-type"]').forEach(cb => cb.checked = false);
    document.getElementById('wo-complete').checked = false;
    document.getElementById('wo-followup').checked = false;
    setTodayDates();
  }
}

// ── SAVE DOC ─────────────────────────────────────────────────
async function saveDoc(type) {
  const num = docNumString();
  let docData = { num, type, date: new Date().toISOString() };

  if (type === 'cotizacion') {
    docData.client = document.getElementById('cot-clientName').value;
    docData.total = getSubtotal('cot');
    docData.paid = false;
  } else if (type === 'factura') {
    docData.client = document.getElementById('fac-clientName').value;
    const sub = getSubtotal('fac');
    const dep = parseFloat(document.getElementById('fac-deposit').value) || 0;
    docData.total = Math.max(0, sub - dep);
    docData.paid = document.getElementById('fac-paid').checked;
  } else if (type === 'workorder') {
    docData.client = document.getElementById('wo-client').value;
    docData.total = 0;
    docData.paid = false;
  }

  STATE.recentDocs.push(docData);
  saveLocal('recentDocs');

  // Increment counter and push BOTH the doc AND the new counter to Sheets
  // so all other devices know the next available number immediately
  incrementCounter();

  if (STATE.gasUrl) {
    await pushToSheets('Docs', docData);
    await gasRequest('setCounter', STATE.counters);
  }
  showToast(`${num} guardado ✓`);
}

// ── SETTINGS ─────────────────────────────────────────────────
function setCounter() {
  const input = document.getElementById('counterInput');
  const val = parseInt(input.value);
  if (!val || val < 1 || val > 99) {
    showToast('Ingresa un número entre 1 y 99', true);
    return;
  }
  STATE.counters.seq = val;
  saveLocal('counters');
  if (STATE.gasUrl) gasRequest('setCounter', STATE.counters);
  updateDocNumber();
  input.value = '';
  showToast(`Contador ajustado → ${docNumString()} ✓`);
}

function saveMarkup() {
  STATE.markup = parseFloat(document.getElementById('markupInput').value) || 25;
  saveLocal('markup');
  document.getElementById('markupDisplay').textContent = STATE.markup;
  // Recalculate material prices
  STATE.materials = STATE.materials.map(m => ({
    ...m,
    finalPrice: parseFloat((m.hdPrice * 1.115 * (1 + STATE.markup / 100)).toFixed(2))
  }));
  saveLocal('materials');
  renderMaterialList();
  showToast('Markup actualizado ✓');
}

async function saveGasUrl() {
  STATE.gasUrl = document.getElementById('gasUrl').value.trim();
  saveLocal('gasUrl');
  showToast('Conectando…');
  await checkSync();
}

// ── MODALS ───────────────────────────────────────────────────
function closeModal(name) {
  document.getElementById('modal-' + name).classList.remove('open');
}

// ── TOAST ────────────────────────────────────────────────────
function showToast(msg, error = false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast' + (error ? ' error' : '') + ' show';
  setTimeout(() => t.classList.remove('show'), 3000);
}

// ══════════════════════════════════════════════════════════════
// PDF GENERATION
// ══════════════════════════════════════════════════════════════

async function generatePDF(type) {
  showToast('Generando PDF…');
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });

  if (type === 'cotizacion') await buildCotizacionPDF(doc);
  else if (type === 'factura') {
    await buildFacturaPDF(doc);
    doc.addPage();
    await buildGarantiaPDF(doc);
  }
  else if (type === 'workorder') await buildWorkOrderPDF(doc);

  const num = docNumString();
  const filename = `PG_${type}_${num}.pdf`;
  doc.save(filename);
  showToast(`PDF generado: ${filename} ✓`);
}

// ── PDF HELPERS ───────────────────────────────────────────────
function pdfHeader(doc, title) {
  // Dark header bar
  doc.setFillColor(44, 62, 80);
  doc.rect(0, 0, 216, 22, 'F');
  // Accent line
  doc.setFillColor(192, 57, 43);
  doc.rect(0, 22, 216, 2, 'F');
  // Company name
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('PRECISION GRIND', 14, 10);
  // Title
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(title, 14, 17);
  // Contact line
  doc.setFontSize(7.5);
  doc.setTextColor(200, 200, 200);
  doc.text(`${CO.address}  ·  ${CO.phone}  ·  ${CO.email}`, 216 - 14, 10, { align: 'right' });
  doc.setTextColor(0, 0, 0);
}

function pdfSectionBar(doc, text, y) {
  doc.setFillColor(44, 62, 80);
  doc.rect(14, y, 188, 6, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text(text, 17, y + 4.2);
  doc.setTextColor(0, 0, 0);
}

function pdfField(doc, label, value, x, y, w = 85) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 100, 100);
  doc.text(label.toUpperCase(), x, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);
  doc.text(String(value || '—'), x, y + 4);
}

function pdfLine(doc, y) {
  doc.setDrawColor(212, 207, 196);
  doc.line(14, y, 202, y);
}

// ── COTIZACIÓN PDF ────────────────────────────────────────────
async function buildCotizacionPDF(doc) {
  const num = docNumString();
  pdfHeader(doc, 'COTIZACIÓN');

  // Number + date
  doc.setFillColor(26, 26, 24);
  doc.rect(155, 26, 47, 10, 'F');
  doc.setTextColor(255,255,255);
  doc.setFont('helvetica','bold');
  doc.setFontSize(9);
  doc.text('# ' + num, 178.5, 33, { align: 'center' });
  doc.setTextColor(0,0,0);

  let y = 30;

  // Client block
  pdfSectionBar(doc, 'DATOS DEL CLIENTE', y);
  y += 9;

  const cName   = document.getElementById('cot-clientName').value;
  const cProj   = document.getElementById('cot-project').value;
  const cAddr   = document.getElementById('cot-address').value;
  const cPhone  = document.getElementById('cot-phone').value;
  const cEmail  = document.getElementById('cot-email').value;
  const cLeader = document.getElementById('cot-leader').value;
  const cContact= document.getElementById('cot-contact').value;

  pdfField(doc, 'Título del Proyecto', cProj, 14, y);
  pdfField(doc, 'Dirección', cAddr, 110, y);
  y += 9;
  pdfField(doc, 'Líder del Proyecto', cLeader, 14, y);
  pdfField(doc, 'Teléfono', cPhone, 110, y);
  y += 9;
  pdfField(doc, 'Persona de Contacto', cContact || cName, 14, y);
  pdfField(doc, 'Email', cEmail, 110, y);
  y += 11;

  // Dates/Budget bar
  doc.setFillColor(44, 62, 80);
  doc.rect(14, y, 60, 14, 'F');
  doc.rect(75, y, 60, 14, 'F');
  doc.rect(136, y, 66, 14, 'F');
  doc.setTextColor(180, 180, 180);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.text('FECHA INICIO', 44, y + 4, { align: 'center' });
  doc.text('FECHA DE ENTREGA', 105, y + 4, { align: 'center' });
  doc.text('PRESUPUESTO TOTAL', 169, y + 4, { align: 'center' });
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.text(document.getElementById('cot-startDate').value || 'TBD', 44, y + 11, { align: 'center' });
  doc.text(document.getElementById('cot-endDate').value || 'TBD', 105, y + 11, { align: 'center' });
  doc.setFont('helvetica', 'bold');
  doc.text('$' + getSubtotal('cot').toFixed(2), 169, y + 11, { align: 'center' });
  doc.setTextColor(0, 0, 0);
  y += 18;

  // Summary
  const summary = document.getElementById('cot-summary').value;
  if (summary) {
    pdfSectionBar(doc, 'RESUMEN DEL PROYECTO', y);
    y += 8;
    doc.setFont('helvetica','normal');
    doc.setFontSize(8.5);
    const lines = doc.splitTextToSize(summary, 184);
    doc.text(lines, 14, y);
    y += lines.length * 4.5 + 4;
  }

  // Line items
  pdfSectionBar(doc, 'DESCRIPCIÓN DE TRABAJO', y);
  y += 8;

  // Table header
  doc.setFillColor(240, 237, 231);
  doc.rect(14, y - 1, 188, 6, 'F');
  doc.setFont('helvetica','bold');
  doc.setFontSize(7.5);
  doc.setTextColor(80,80,80);
  doc.text('DESCRIPCIÓN', 16, y + 3.5);
  doc.text('CANT.', 120, y + 3.5);
  doc.text('UNIDAD', 135, y + 3.5);
  doc.text('P/UNIDAD', 158, y + 3.5);
  doc.text('TOTAL', 190, y + 3.5, { align: 'right' });
  doc.setTextColor(0,0,0);
  y += 8;

  const items = getItemsData('cot');
  items.forEach((item, i) => {
    if (i % 2 === 0) { doc.setFillColor(250, 249, 246); doc.rect(14, y-3, 188, 7, 'F'); }
    doc.setFont('helvetica','normal');
    doc.setFontSize(8.5);
    const descLines = doc.splitTextToSize(item.desc || '—', 100);
    doc.text(descLines, 16, y + 1);
    doc.setFont('helvetica','normal');
    doc.text(String(item.qty), 122, y + 1);
    doc.text(item.unit || '', 137, y + 1);
    doc.text('$' + item.price.toFixed(2), 160, y + 1);
    doc.setFont('helvetica','bold');
    doc.text('$' + item.total.toFixed(2), 200, y + 1, { align: 'right' });
    y += Math.max(7, descLines.length * 4.5);
    if (y > 240) { doc.addPage(); y = 20; }
  });

  pdfLine(doc, y);
  y += 6;

  // Totals
  doc.setFont('helvetica','bold');
  doc.setFontSize(11);
  doc.text('PRESUPUESTO TOTAL', 130, y);
  doc.text('$' + getSubtotal('cot').toFixed(2), 200, y, { align: 'right' });
  y += 12;

  // Time estimate
  const duration = document.getElementById('cot-duration').value;
  if (duration) {
    pdfSectionBar(doc, 'ESTIMADO DE TIEMPO', y);
    y += 8;
    doc.setFont('helvetica','normal');
    doc.setFontSize(9);
    doc.text(duration, 16, y + 1);
    y += 10;
  }

  // Responsibilities
  const resp = document.getElementById('cot-responsibilities').value;
  if (resp) {
    pdfSectionBar(doc, 'RESPONSABILIDADES', y);
    y += 8;
    doc.setFont('helvetica','normal');
    doc.setFontSize(8.5);
    const lines = doc.splitTextToSize(resp, 184);
    doc.text(lines, 14, y);
    y += lines.length * 4.5 + 4;
  }

  // Budget desc
  const budDesc = document.getElementById('cot-budgetDesc').value;
  const depRequired = document.getElementById('cot-depositRequired').checked;
  const depDesc = document.getElementById('cot-depositDesc').value;
  if (budDesc || depDesc) {
    pdfSectionBar(doc, 'DESCRIPCIÓN DE PRESUPUESTO', y);
    y += 8;
    doc.setFont('helvetica','normal');
    doc.setFontSize(8.5);
    if (depRequired && depDesc) doc.text('• ' + depDesc, 16, y); y += 5;
    if (budDesc) { const lines = doc.splitTextToSize('• ' + budDesc, 180); doc.text(lines, 16, y); y += lines.length * 4.5 + 4; }
  }

  // Signature block
  if (y > 230) { doc.addPage(); y = 20; }
  y += 8;
  doc.setDrawColor(0);
  doc.line(120, y, 200, y);
  doc.line(14, y, 94, y);
  doc.setFont('helvetica','normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100,100,100);
  doc.text('Firma del Técnico / Empresa', 14, y + 4);
  doc.text('Nombre: ______________________', 14, y + 9);
  doc.text('Posición: ________________', 14, y + 14);
  doc.text('Fecha: ________________', 110, y + 14);
  doc.text('Firma del Cliente', 120, y + 4);
  doc.text('Nombre: ______________________', 120, y + 9);
  doc.setTextColor(0,0,0);
}

// ── FACTURA PDF ───────────────────────────────────────────────
async function buildFacturaPDF(doc) {
  const num = docNumString();
  pdfHeader(doc, 'FACTURA');

  // PAID watermark
  if (document.getElementById('fac-paid').checked) {
    doc.saveGraphicsState();
    doc.setGState(new doc.GState({ opacity: 0.12 }));
    doc.setTextColor(192, 57, 43);
    doc.setFont('helvetica','bold');
    doc.setFontSize(80);
    doc.text('PAID', 108, 160, { align: 'center', angle: 35 });
    doc.restoreGraphicsState();
    doc.setTextColor(0,0,0);
  }

  let y = 29;

  // Invoice number & date
  doc.setFont('helvetica','bold');
  doc.setFontSize(9);
  doc.setTextColor(192, 57, 43);
  doc.text('# Factura:', 14, y + 4);
  doc.setTextColor(0,0,0);
  doc.setFont('helvetica','normal');
  doc.text(num, 38, y + 4);
  doc.setFont('helvetica','bold');
  doc.setTextColor(192, 57, 43);
  doc.text('Fecha:', 14, y + 10);
  doc.setTextColor(0,0,0);
  doc.setFont('helvetica','normal');
  const d = document.getElementById('fac-date').value;
  doc.text(d ? new Date(d+'T12:00:00').toLocaleDateString('es-PR') : '—', 30, y + 10);

  // Client block (right side)
  const cName  = document.getElementById('fac-clientName').value;
  const cAddr  = document.getElementById('fac-address').value;
  const cPhone = document.getElementById('fac-phone').value;
  const cEmail = document.getElementById('fac-email').value;
  const cProj  = document.getElementById('fac-project').value;

  doc.setFont('helvetica','bold');
  doc.setFontSize(11);
  doc.text(cName || '—', 110, y + 4);
  doc.setFont('helvetica','normal');
  doc.setFontSize(8.5);
  if (cAddr)  { const l = doc.splitTextToSize('Dirección: ' + cAddr, 92); doc.text(l, 110, y + 10); y += (l.length - 1) * 4; }
  doc.text('Tel: ' + (cPhone || '—'), 110, y + 16);
  if (cEmail) doc.text('Email: ' + cEmail, 110, y + 21);

  y += 30;
  pdfLine(doc, y);
  y += 6;

  // Table header
  doc.setFillColor(44, 62, 80);
  doc.rect(14, y, 188, 7, 'F');
  doc.setTextColor(255,255,255);
  doc.setFont('helvetica','bold');
  doc.setFontSize(7.5);
  const cols = [{t:'DESCRIPCIÓN',x:16}, {t:'CANT.',x:120}, {t:'UNIDAD',x:135}, {t:'P/UNIDAD',x:158}, {t:'COSTO',x:200,r:true}];
  cols.forEach(c => doc.text(c.t, c.x, y + 4.8, c.r ? {align:'right'}:{}));
  doc.setTextColor(0,0,0);
  y += 10;

  const items = getItemsData('fac');
  items.forEach((item, i) => {
    if (i % 2 === 0) { doc.setFillColor(250,249,246); doc.rect(14,y-3,188,7,'F'); }
    doc.setFont('helvetica','normal');
    doc.setFontSize(8.5);
    const dl = doc.splitTextToSize(item.desc||'—', 100);
    doc.text(dl, 16, y+1);
    doc.text(String(item.qty), 122, y+1);
    doc.text(item.unit||'', 137, y+1);
    doc.text('$'+item.price.toFixed(2), 160, y+1);
    doc.setFont('helvetica','bold');
    doc.text('$'+item.total.toFixed(2), 200, y+1, {align:'right'});
    y += Math.max(7, dl.length*4.5);
    if (y > 240) { doc.addPage(); y = 20; }
  });

  pdfLine(doc, y + 2);
  y += 8;

  // Totals
  const sub = getSubtotal('fac');
  const dep = parseFloat(document.getElementById('fac-deposit').value) || 0;
  const total = Math.max(0, sub - dep);
  const notes = document.getElementById('fac-notes').value;

  const totRows = [];
  totRows.push(['Subtotal', '$' + sub.toFixed(2)]);
  if (dep > 0) totRows.push(['Depósito', '-$' + dep.toFixed(2)]);
  if (notes && dep > 0) totRows.push([notes, '']);

  totRows.forEach(([label, val]) => {
    doc.setFont('helvetica','normal');
    doc.setFontSize(9);
    doc.text(label, 140, y);
    doc.setFont('helvetica','bold');
    doc.text(val, 200, y, {align:'right'});
    y += 7;
  });

  // Total box
  doc.setFillColor(44,62,80);
  doc.rect(130, y, 72, 10, 'F');
  doc.setTextColor(255,255,255);
  doc.setFont('helvetica','bold');
  doc.setFontSize(11);
  doc.text('TOTAL', 140, y + 7);
  doc.text('$' + total.toFixed(2), 200, y + 7, {align:'right'});
  doc.setTextColor(0,0,0);
  y += 18;

  pdfLine(doc, y);
  y += 8;

  // Footer
  const pay = document.getElementById('fac-payment').value;
  doc.setFont('helvetica','bold');
  doc.setFontSize(8);
  doc.setTextColor(192,57,43);
  doc.text('Método de Pago:', 14, y);
  doc.setFont('helvetica','normal');
  doc.setTextColor(0,0,0);
  doc.text(pay, 14, y + 5);

  if (cProj) {
    doc.setFont('helvetica','bold');
    doc.setTextColor(192,57,43);
    doc.text('Proyecto:', 80, y);
    doc.setFont('helvetica','normal');
    doc.setTextColor(0,0,0);
    doc.text(cProj, 80, y + 5);
  }

  // Bank info
  doc.setFont('helvetica','bold');
  doc.setFontSize(7.5);
  doc.setTextColor(60,60,60);
  doc.text('Nombre: ' + CO.name, 14, y + 12);
  doc.text('# Cuenta: ' + CO.cuenta, 14, y + 17);
  doc.text('# Ruta: ' + CO.ruta, 14, y + 22);
  doc.text(CO.bank, 14, y + 27);
  doc.setFont('helvetica','normal');
  doc.setFontSize(7);
  doc.setTextColor(100,100,100);
  const lp = doc.splitTextToSize(CO.latePayment, 120);
  doc.text(lp, 80, y + 12);
}

// ── GARANTÍA PDF ──────────────────────────────────────────────
async function buildGarantiaPDF(doc) {
  const num = docNumString() + 'C';

  // Header
  doc.setFillColor(31, 97, 141);
  doc.rect(0, 0, 216, 20, 'F');
  doc.setFillColor(192, 57, 43);
  doc.rect(0, 20, 216, 2, 'F');
  doc.setTextColor(255,255,255);
  doc.setFont('helvetica','bold');
  doc.setFontSize(16);
  doc.text('🔧  CERTIFICADO DE GARANTÍA', 14, 14);
  doc.setFont('helvetica','normal');
  doc.setFontSize(9);
  doc.text('Servicios Profesionales', 14, 19);
  doc.setFontSize(13);
  doc.text('PRECISION GRIND', 200, 14, {align:'right'});
  doc.setTextColor(0,0,0);

  let y = 28;

  // Cert number + date
  doc.setFillColor(240,240,240);
  doc.rect(14, y, 90, 10, 'F');
  doc.rect(115, y, 87, 10, 'F');
  doc.setFont('helvetica','bold');
  doc.setFontSize(8);
  doc.text('No. de Certificado:', 16, y+4);
  doc.setFont('helvetica','normal');
  doc.text(num, 50, y+4);
  doc.setFont('helvetica','bold');
  doc.text('Fecha de emisión:', 117, y+4);
  doc.setFont('helvetica','normal');
  const dv = document.getElementById('fac-date').value;
  doc.text(dv ? new Date(dv+'T12:00:00').toLocaleDateString('es-PR') : '—', 155, y+4);
  y += 16;

  // Section 1
  doc.setFont('helvetica','bold');
  doc.setFontSize(10);
  doc.setTextColor(31,97,141);
  doc.text('1. DATOS DEL PRESTADOR DE SERVICIO', 14, y);
  doc.setTextColor(0,0,0);
  y += 6;

  const fields1 = [
    ['Empresa / Técnico', CO.name],
    ['Teléfono', CO.phone],
    ['Correo electrónico', CO.email],
    ['Dirección', CO.address],
  ];
  fields1.forEach(([label, val]) => {
    doc.setFont('helvetica','bold');
    doc.setFontSize(8.5);
    doc.setTextColor(31,97,141);
    doc.text(label + ':', 14, y);
    doc.setFillColor(245,245,245);
    doc.rect(55, y-4, 147, 6, 'F');
    doc.setTextColor(0,0,0);
    doc.setFont('helvetica','normal');
    doc.text(val, 57, y);
    y += 9;
  });

  y += 4;
  doc.setFont('helvetica','bold');
  doc.setFontSize(10);
  doc.setTextColor(31,97,141);
  doc.text('2. DATOS DEL CLIENTE', 14, y);
  doc.setTextColor(0,0,0);
  y += 6;

  const cName  = document.getElementById('fac-clientName').value;
  const cPhone = document.getElementById('fac-phone').value;
  const cAddr  = document.getElementById('fac-address').value;

  const fields2 = [
    ['Nombre completo', cName],
    ['Teléfono', cPhone],
    ['Dirección del servicio', cAddr],
    ['Ciudad / Municipio', ''],
  ];
  fields2.forEach(([label, val]) => {
    doc.setFont('helvetica','bold');
    doc.setFontSize(8.5);
    doc.setTextColor(31,97,141);
    doc.text(label + ':', 14, y);
    doc.setFillColor(245,245,245);
    doc.rect(55, y-4, 147, 6, 'F');
    doc.setTextColor(0,0,0);
    doc.setFont('helvetica','normal');
    doc.text(String(val||''), 57, y);
    y += 9;
  });

  y += 4;
  doc.setFont('helvetica','bold');
  doc.setFontSize(10);
  doc.setTextColor(31,97,141);
  doc.text('3. DESCRIPCIÓN DEL SERVICIO REALIZADO', 14, y);
  doc.setTextColor(0,0,0);
  y += 6;

  const sFields = [
    ['Fecha del servicio', document.getElementById('guar-fechas').value || '—'],
    ['Tipo de instalación', document.getElementById('guar-tipo').value || '—'],
  ];
  sFields.forEach(([label, val]) => {
    doc.setFont('helvetica','bold');
    doc.setFontSize(8.5);
    doc.setTextColor(31,97,141);
    doc.text(label + ':', 14, y);
    doc.setFillColor(245,245,245);
    doc.rect(55, y-4, 147, 6, 'F');
    doc.setTextColor(0,0,0);
    doc.setFont('helvetica','normal');
    doc.text(val, 57, y);
    y += 9;
  });

  // Description box
  doc.setFont('helvetica','bold');
  doc.setFontSize(8.5);
  doc.setTextColor(31,97,141);
  doc.text('Descripción detallada:', 14, y);
  doc.setTextColor(0,0,0);
  const desc = document.getElementById('guar-desc').value || '';
  doc.setFillColor(245,245,245);
  doc.rect(55, y-4, 147, 24, 'F');
  doc.setFont('helvetica','normal');
  const descLines = doc.splitTextToSize(desc, 142);
  doc.text(descLines, 57, y);
  y += 30;

  // Terms section
  doc.setFillColor(173, 216, 230);
  doc.rect(14, y, 188, 10, 'F');
  doc.setFont('helvetica','bold');
  doc.setFontSize(11);
  doc.setTextColor(31,97,141);
  doc.text('PERÍODO DE GARANTÍA: 30 DÍAS CALENDARIO', 108, y+7, {align:'center'});
  doc.setTextColor(0,0,0);
  y += 13;
  doc.setFont('helvetica','italic');
  doc.setFontSize(8);
  doc.text('a partir de la fecha de realización del servicio', 108, y, {align:'center'});
  y += 8;

  // Covers / doesn't cover
  doc.setFont('helvetica','bold');
  doc.setFontSize(9);
  doc.setTextColor(31,97,141);
  doc.text('Esta garantía CUBRE:', 14, y);
  doc.setTextColor(0,0,0);
  y += 5;
  const covers = [
    'Defectos en la mano de obra derivados de una instalación incorrecta.',
    'Fugas o fallas que sean consecuencia directa del trabajo realizado.',
    'Mal funcionamiento del sistema instalado por causas imputables al servicio.',
  ];
  covers.forEach(c => { doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.text('• ' + c, 16, y); y += 5; });

  y += 3;
  doc.setFont('helvetica','bold');
  doc.setFontSize(9);
  doc.setTextColor(192,57,43);
  doc.text('Esta garantía NO CUBRE:', 14, y);
  doc.setTextColor(0,0,0);
  y += 5;
  const noCovers = [
    'Materiales, refacciones ni equipos instalados (tuberías, llaves, válvulas, etc.).',
    'Daños por mal uso, accidentes o modificaciones realizadas por terceros.',
    'Desgaste natural de los materiales con el tiempo.',
    'Problemas en instalaciones previas no intervenidas en el servicio actual.',
    'Daños por sismo, inundación u otros fenómenos externos.',
  ];
  noCovers.forEach(c => { doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.text('• ' + c, 16, y); y += 5; });

  y += 4;
  doc.setFont('helvetica','bold');
  doc.setFontSize(9);
  doc.setTextColor(31,97,141);
  doc.text('5. CONDICIONES PARA HACER VÁLIDA LA GARANTÍA', 14, y);
  doc.setTextColor(0,0,0);
  y += 5;
  const conditions = [
    '1. Reportar el problema dentro del período de vigencia de 30 días.',
    '2. Presentar este certificado al momento de reclamar la garantía.',
    '3. El inmueble debe encontrarse en las mismas condiciones que al momento del servicio.',
    '4. No se aceptará la garantía si el cliente o un tercero intervino en el área de trabajo.',
    '5. La garantía se hará efectiva en un plazo máximo de 72 horas hábiles tras el reporte.',
  ];
  conditions.forEach(c => {
    doc.setFont('helvetica','italic');
    doc.setFontSize(8);
    doc.text(c, 16, y);
    y += 5;
  });

  y += 6;
  // Signature boxes
  doc.setFillColor(31,97,141);
  doc.rect(14, y, 85, 6, 'F');
  doc.rect(115, y, 87, 6, 'F');
  doc.setTextColor(255,255,255);
  doc.setFont('helvetica','bold');
  doc.setFontSize(8.5);
  doc.text('Firma del Técnico / Empresa', 16, y+4.5);
  doc.text('Firma del Cliente', 117, y+4.5);
  doc.setTextColor(0,0,0);
  y += 10;
  doc.setFillColor(250,249,246);
  doc.rect(14, y, 85, 16, 'F');
  doc.rect(115, y, 87, 16, 'F');
  doc.setFont('helvetica','normal');
  doc.setFontSize(8);
  doc.text('Nombre: _______________________', 16, y + 12);
  doc.text('Nombre: _______________________', 117, y + 12);
  y += 22;

  // Disclaimer
  doc.setFillColor(240,240,240);
  doc.rect(14, y, 188, 8, 'F');
  doc.setFont('helvetica','italic');
  doc.setFontSize(7.5);
  doc.setTextColor(80,80,80);
  doc.text('Este certificado es un documento oficial. Consérvelo para cualquier reclamación dentro del período de garantía.', 108, y+5, {align:'center'});
}

// ── WORK ORDER PDF ────────────────────────────────────────────
async function buildWorkOrderPDF(doc) {
  const num = docNumString();
  pdfHeader(doc, 'ORDEN DE TRABAJO');

  let y = 28;

  // Top info
  doc.setFillColor(240,237,231);
  doc.rect(14, y, 188, 8, 'F');
  doc.setFont('helvetica','bold');
  doc.setFontSize(8);
  doc.text('# ORDEN:', 16, y+5.5);
  doc.setFont('helvetica','normal');
  doc.text(num, 36, y+5.5);
  doc.setFont('helvetica','bold');
  doc.text('TÉCNICO:', 80, y+5.5);
  doc.setFont('helvetica','normal');
  doc.text(document.getElementById('wo-tech').value||'—', 100, y+5.5);
  doc.setFont('helvetica','bold');
  doc.text('FECHA:', 148, y+5.5);
  doc.setFont('helvetica','normal');
  const wd = document.getElementById('wo-date').value;
  doc.text(wd ? new Date(wd+'T12:00:00').toLocaleDateString('es-PR') : '—', 163, y+5.5);
  y += 12;

  pdfField(doc, 'Cliente / Proyecto', document.getElementById('wo-client').value, 14, y);
  pdfField(doc, 'Dirección', document.getElementById('wo-address').value, 110, y);
  y += 9;
  pdfField(doc, 'Teléfono', document.getElementById('wo-phone').value, 14, y);
  pdfField(doc, 'Hora Llegada', document.getElementById('wo-arrival').value||'—', 110, y);
  pdfField(doc, 'Hora Salida', document.getElementById('wo-departure').value||'—', 155, y);
  y += 12;

  // Tipo de trabajo checkboxes
  pdfSectionBar(doc, 'TIPO DE TRABAJO', y);
  y += 9;
  const types = Array.from(document.querySelectorAll('input[name="wo-type"]:checked')).map(cb => cb.value);
  const allTypes = ['Plomería','Electricidad','Destape','Instalación','Reparación','Inspección','Mantenimiento','Otro'];
  let cx = 14;
  allTypes.forEach(t => {
    const checked = types.includes(t);
    doc.setDrawColor(100,100,100);
    doc.rect(cx, y-3, 4, 4);
    if (checked) { doc.setFont('helvetica','bold'); doc.text('✓', cx+0.5, y); }
    doc.setFont('helvetica','normal');
    doc.setFontSize(8);
    doc.text(t, cx+6, y);
    cx += 28;
    if (cx > 185) { cx = 14; y += 7; }
  });
  y += 10;

  // Problem
  pdfSectionBar(doc, 'PROBLEMA REPORTADO', y);
  y += 8;
  doc.setFillColor(250,249,246);
  doc.rect(14, y-3, 188, 18, 'F');
  doc.setFont('helvetica','normal');
  doc.setFontSize(8.5);
  const prob = doc.splitTextToSize(document.getElementById('wo-problem').value||'', 184);
  doc.text(prob, 16, y+1);
  y += 22;

  // Materials
  pdfSectionBar(doc, 'MATERIALES Y/O PIEZAS UTILIZADAS', y);
  y += 8;
  doc.setFillColor(250,249,246);
  doc.rect(14, y-3, 188, 18, 'F');
  doc.setFont('helvetica','normal');
  doc.setFontSize(8.5);
  const mats = doc.splitTextToSize(document.getElementById('wo-materials').value||'', 184);
  doc.text(mats, 16, y+1);
  y += 22;

  // Work done
  pdfSectionBar(doc, 'DESCRIPCIÓN DE TRABAJO REALIZADO', y);
  y += 8;
  doc.setFillColor(250,249,246);
  doc.rect(14, y-3, 188, 28, 'F');
  doc.setFont('helvetica','normal');
  doc.setFontSize(8.5);
  const wd2 = doc.splitTextToSize(document.getElementById('wo-workdone').value||'', 184);
  doc.text(wd2, 16, y+1);
  y += 32;

  // Extra/unaccounted
  pdfSectionBar(doc, 'TRABAJOS NO CONTEMPLADOS / CAMBIOS DE ORDEN', y);
  y += 8;
  doc.setFillColor(255,252,240);
  doc.rect(14, y-3, 188, 22, 'F');
  doc.setFont('helvetica','normal');
  doc.setFontSize(8.5);
  const ex = doc.splitTextToSize(document.getElementById('wo-extra').value||'', 184);
  doc.text(ex, 16, y+1);
  y += 26;

  // Status
  const complete  = document.getElementById('wo-complete').checked;
  const followup  = document.getElementById('wo-followup').checked;
  const warranty  = document.getElementById('wo-warranty').value;

  doc.setFillColor(240,237,231);
  doc.rect(14, y, 188, 8, 'F');
  doc.setFont('helvetica','bold');
  doc.setFontSize(8);
  doc.setDrawColor(100,100,100);
  doc.rect(16, y+2, 4, 4);
  if (complete) doc.text('✓', 16.5, y+5.5);
  doc.text('Trabajo completado', 22, y+5.5);
  doc.rect(100, y+2, 4, 4);
  if (followup) doc.text('✓', 100.5, y+5.5);
  doc.text('Se requiere visita de seguimiento', 106, y+5.5);
  y += 12;

  if (warranty) {
    doc.setFont('helvetica','bold');
    doc.setFontSize(8);
    doc.setTextColor(31,97,141);
    doc.text('Garantía: ', 14, y);
    doc.setTextColor(0,0,0);
    doc.setFont('helvetica','normal');
    doc.text(warranty, 35, y);
    y += 8;
  }

  // Signatures
  y = Math.max(y, 225);
  pdfLine(doc, y);
  y += 8;
  doc.line(14, y+12, 90, y+12);
  doc.line(120, y+12, 200, y+12);
  doc.setFont('helvetica','normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100,100,100);
  doc.text('Firma del Técnico', 14, y+17);
  doc.text('Nombre: ______________________', 14, y+22);
  doc.text('Firma del Cliente', 120, y+17);
  doc.text('Nombre: ______________________', 120, y+22);
}

// ══════════════════════════════════════════════════════════════
// LABEL PRINTING
// ══════════════════════════════════════════════════════════════

function renderLabelPicker() {
  const el = document.getElementById('labelPickList');
  if (!STATE.materials.length) {
    el.innerHTML = '<div style="color:var(--muted);font-size:13px;">Sin materiales. Añade o importa primero.</div>';
    return;
  }
  el.innerHTML = STATE.materials.map(m => `
    <label class="material-item" style="cursor:pointer">
      <div style="display:flex;align-items:center;gap:10px">
        <input type="checkbox" class="label-pick" value="${m.id}" style="width:16px;height:16px;accent-color:var(--steel)">
        <div>${vendorBadge(m.vendor||'HD')}<strong>${m.name}</strong> <span style="color:var(--muted);font-size:11px">${m.sku ? 'SKU '+m.sku : 'sin SKU'}</span></div>
      </div>
      <div></div>
      <div style="font-family:'DM Mono',monospace;font-size:13px;font-weight:600">$${m.finalPrice.toFixed(2)}</div>
      <div></div>
    </label>
  `).join('');
}

function selectAllLabels(state) {
  document.querySelectorAll('.label-pick').forEach(cb => cb.checked = state);
}

async function generateLabelsPDF() {
  const checked = Array.from(document.querySelectorAll('.label-pick:checked')).map(cb => cb.value);
  if (!checked.length) { showToast('Selecciona al menos un material', true); return; }
  const items = STATE.materials.filter(m => checked.includes(String(m.id)));

  showToast('Generando etiquetas…');
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'in', format: [4, 2] });

  for (let i = 0; i < items.length; i++) {
    if (i > 0) doc.addPage([4, 2], 'landscape');
    const m = items[i];
    buildLabelPage(doc, m);
  }

  doc.save(`PG_etiquetas_${new Date().toISOString().split('T')[0]}.pdf`);
  showToast(`${items.length} etiquetas generadas ✓`);
}

function buildLabelPage(doc, m) {
  // Border
  doc.setDrawColor(0);
  doc.setLineWidth(0.01);
  doc.rect(0.05, 0.05, 3.9, 1.9);

  // Company name top
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('PRECISION GRIND', 0.15, 0.25);

  // Vendor tag
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(150, 150, 150);
  doc.text(m.vendor || 'HD', 3.75, 0.25, { align: 'right' });
  doc.setTextColor(0, 0, 0);

  // Material name
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  const nameLines = doc.splitTextToSize(m.name, 3.6);
  doc.text(nameLines.slice(0, 2), 0.15, 0.45);

  // Price
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(192, 57, 43);
  doc.text('$' + m.finalPrice.toFixed(2), 0.15, 1.15);
  doc.setTextColor(0, 0, 0);

  // Unit + SKU
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`Unidad: ${m.unit}`, 0.15, 1.35);
  doc.text(`SKU: ${m.sku || '—'}`, 0.15, 1.48);

  // Barcode
  if (m.sku) {
    try {
      const canvas = document.createElement('canvas');
      JsBarcode(canvas, m.sku, {
        format: 'CODE128',
        width: 2,
        height: 40,
        displayValue: false,
        margin: 0,
      });
      const imgData = canvas.toDataURL('image/png');
      doc.addImage(imgData, 'PNG', 0.15, 1.55, 3.6, 0.3);
    } catch (e) {
      console.warn('Barcode generation failed for SKU', m.sku, e);
    }
  }
}

// Hook into navigation to render label picker when shown
const _origShowView = showView;
showView = function(id) {
  _origShowView(id);
  if (id === 'labels') renderLabelPicker();
};
