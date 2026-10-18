// Kabwe clinic directory: talks to the Express API at /api/clinic.
// When the page is opened straight from disk (file://) it falls back to the local server.
const API_ORIGIN = window.CLINIC_API_ORIGIN || (location.protocol === 'file:' ? 'http://localhost:3000' : '');
const API = `${API_ORIGIN}/api/clinic`;

const FIELDS = ['clinic_name', 'doctor_name', 'specialty', 'location', 'phone', 'email', 'opening_hours', 'consultation_fee'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+0-9 ()-]{7,20}$/;

const form = document.getElementById('clinic-form');
const idInput = document.getElementById('clinic-id');
const formTitle = document.getElementById('form-title');
const formRef = document.getElementById('form-ref');
const submitBtn = document.getElementById('submit-btn');
const cancelBtn = document.getElementById('cancel-btn');
const walkIns = document.getElementById('accepts_walk_ins');
const searchInput = document.getElementById('search');
const sortSelect = document.getElementById('sort');
const chips = [...document.querySelectorAll('.chip[data-filter]')];
const statusEl = document.getElementById('status');
const register = document.getElementById('register');
const toasts = document.getElementById('toasts');

const money = new Intl.NumberFormat('en-ZM', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

let clinics = [];
let flashId = null;
let pendingDeleteId = null;
const activeFilters = new Set();

// ---------------------------------------------------------------------------
// API helper: every response from the server is JSON
// ---------------------------------------------------------------------------
async function request(path = '', options = {}) {
  let res;
  try {
    res = await fetch(API + path, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
  } catch {
    throw new Error(`Can't reach the clinic server at ${API_ORIGIN || location.origin}. Check that it is running.`);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error || `Request failed (${res.status}).`);
    err.details = body.details;
    throw err;
  }
  return body;
}

// ---------------------------------------------------------------------------
// Small DOM helpers
// ---------------------------------------------------------------------------
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  Object.assign(node, props);
  for (const child of children) if (child != null) node.append(child);
  return node;
}

function toast(message, { tone = 'ok', action } = {}) {
  const item = el('div', { className: `toast${tone === 'bad' ? ' bad' : ''}` }, el('span', { textContent: message }));
  const buttons = el('div');
  let timer;
  const dismiss = () => { clearTimeout(timer); item.remove(); };
  const arm = () => { timer = setTimeout(dismiss, action ? 8000 : 4500); };

  if (action) {
    buttons.append(el('button', { type: 'button', textContent: action.label, onclick: () => { dismiss(); action.run(); } }));
  }
  const close = el('button', { type: 'button', textContent: '✕', onclick: dismiss });
  close.setAttribute('aria-label', 'Dismiss message');
  buttons.append(close);
  item.append(buttons);

  // Hold the toast open while the pointer or keyboard focus is on it.
  item.addEventListener('mouseenter', () => clearTimeout(timer));
  item.addEventListener('mouseleave', arm);
  item.addEventListener('focusin', () => clearTimeout(timer));
  item.addEventListener('focusout', arm);

  while (toasts.children.length >= 3) toasts.firstElementChild.remove();
  toasts.append(item);
  arm();
  return item;
}

// ---------------------------------------------------------------------------
// Opening hours -> "Open until 17:00" / "Opens tomorrow at 08:00"
// Understands "Mon-Fri 08:00-17:00", "Daily 08:00-20:00", "Tue-Sat ..." and "Open 24 hours".
// ---------------------------------------------------------------------------
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const HOURS_RE = /^(daily|sun|mon|tue|wed|thu|fri|sat)[a-z]*(?:\s*-\s*(sun|mon|tue|wed|thu|fri|sat)[a-z]*)?\s+(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/i;

// The clinics are in Kabwe, so "now" is Zambian time whatever the viewer's device is set to.
const lusakaClock = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Africa/Lusaka', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
function kabweNow(date = new Date()) {
  const parts = Object.fromEntries(lusakaClock.formatToParts(date).map((p) => [p.type, p.value]));
  return { day: DAY_KEYS.indexOf(parts.weekday.slice(0, 3).toLowerCase()), mins: Number(parts.hour) * 60 + Number(parts.minute) };
}

function openState(hours, now = kabweNow()) {
  if (!hours) return null;
  if (/24\s*(hours|hrs|h)\b/i.test(hours)) return { open: true, label: 'Open 24 hours' };
  const m = hours.trim().match(HOURS_RE);
  if (!m) return null;

  const [, from, to, h1, m1, h2, m2] = m;
  let days;
  if (from.toLowerCase() === 'daily') {
    days = [0, 1, 2, 3, 4, 5, 6];
  } else {
    const a = DAY_KEYS.indexOf(from.slice(0, 3).toLowerCase());
    const b = to ? DAY_KEYS.indexOf(to.slice(0, 3).toLowerCase()) : a;
    days = [];
    for (let d = a; ; d = (d + 1) % 7) { days.push(d); if (d === b) break; }
  }

  const start = Number(h1) * 60 + Number(m1);
  const end = Number(h2) * 60 + Number(m2);
  const nowMins = now.mins;
  const today = now.day;
  const opensAt = `${h1.padStart(2, '0')}:${m1}`;

  if (days.includes(today) && nowMins >= start && nowMins < end) {
    return { open: true, label: `Open until ${h2.padStart(2, '0')}:${m2}` };
  }
  for (let k = 0; k < 8; k++) {
    const day = (today + k) % 7;
    if (!days.includes(day) || (k === 0 && nowMins >= start)) continue;
    const when = k === 0 ? 'today' : k === 1 ? 'tomorrow' : DAY_NAMES[day];
    return { open: false, label: `Closed, opens ${when} at ${opensAt}` };
  }
  return { open: false, label: 'Closed' };
}

// ---------------------------------------------------------------------------
// Read: load, filter, sort, render
// ---------------------------------------------------------------------------
async function loadClinics() {
  const q = searchInput.value.trim();
  try {
    const { data } = await request(q ? `?q=${encodeURIComponent(q)}` : '');
    clinics = data.map((c) => ({ ...c, _open: openState(c.opening_hours) }));
    statusEl.textContent = '';
    render();
  } catch (err) {
    statusEl.textContent = err.message;
    statusEl.className = 'status bad';
    register.replaceChildren(emptyState("Clinics couldn't be loaded", err.message,
      el('button', { type: 'button', className: 'btn', textContent: 'Try again', onclick: loadClinics })));
  } finally {
    register.removeAttribute('aria-busy');
  }
}

const FILTERS = {
  open: (c) => c._open?.open === true,
  walkin: (c) => c.accepts_walk_ins,
  free: (c) => Number(c.consultation_fee) === 0,
};

const SORTS = {
  name: (a, b) => a.clinic_name.localeCompare(b.clinic_name),
  fee: (a, b) => a.consultation_fee - b.consultation_fee || SORTS.name(a, b),
  open: (a, b) => (b._open?.open === true) - (a._open?.open === true) || SORTS.name(a, b),
  recent: (a, b) => String(b.updated_at).localeCompare(String(a.updated_at)) || b.id - a.id,
};

function visibleClinics() {
  return clinics
    .filter((c) => [...activeFilters].every((f) => FILTERS[f](c)))
    .sort(SORTS[sortSelect.value] || SORTS.name);
}

function updateChips() {
  for (const chip of chips) {
    const key = chip.dataset.filter;
    chip.setAttribute('aria-pressed', String(activeFilters.has(key)));
    chip.querySelector('.n').textContent = clinics.filter(FILTERS[key]).length;
  }
}

function emptyState(title, text, action) {
  return el('div', { className: 'empty' }, el('strong', { textContent: title }), text, action ? el('div', {}, action) : null);
}

function clearFilters() {
  activeFilters.clear();
  searchInput.value = '';
  loadClinics();
  searchInput.focus();
}

function render() {
  updateChips();
  const rows = visibleClinics();

  if (!rows.length) {
    const filtered = activeFilters.size || searchInput.value.trim();
    register.replaceChildren(filtered
      ? emptyState('No clinics match', 'Try another search, or clear the filters to see every clinic.',
        el('button', { type: 'button', className: 'btn', textContent: 'Clear filters', onclick: clearFilters }))
      : emptyState('No clinics yet', 'Add the first one with the form.'));
    return;
  }

  const headers = ['Clinic', 'Doctor', 'Where & when', 'Fee (K)', 'Walk-ins', ''];
  const thead = el('thead', {}, el('tr', {}, ...headers.map((h, i) => {
    const th = el('th', { scope: 'col', textContent: h });
    if (i === 3) th.className = 'num';
    if (i === 5) th.append(el('span', { className: 'sr-only', textContent: 'Actions' }));
    return th;
  })));

  const editingId = Number(idInput.value) || null;
  const tbody = el('tbody');
  for (const c of rows) {
    const tr = el('tr');
    tr.dataset.id = c.id;
    if (c.id === editingId) tr.classList.add('is-editing');
    if (c.id === flashId) tr.classList.add('flash');

    const nameCell = el('td', { className: 'cell-name' },
      el('span', { className: 'c-name', textContent: c.clinic_name }),
      c.specialty ? el('span', { className: 'c-sub', textContent: c.specialty }) : null);

    const doctorCell = el('td', {}, c.doctor_name || '—');
    if (c.phone) doctorCell.append(el('span', { className: 'c-sub' }, el('a', { href: `tel:${c.phone.replace(/[^+0-9]/g, '')}`, textContent: c.phone })));
    if (c.email) doctorCell.append(el('span', { className: 'c-sub' }, el('a', { href: `mailto:${c.email}`, textContent: c.email })));

    const whereCell = el('td', {}, c.location || '—');
    if (c.opening_hours || c._open) {
      const hours = el('span', { className: 'hours' });
      if (c._open) hours.append(el('span', { className: `open-state ${c._open.open ? 'is-open' : 'is-closed'}`, textContent: c._open.label }));
      if (c.opening_hours && c._open?.label !== 'Open 24 hours') hours.append(el('span', { className: 'c-sub', textContent: c.opening_hours }));
      whereCell.append(hours);
    }

    const cells = [
      nameCell,
      doctorCell,
      whereCell,
      el('td', { className: 'num', textContent: Number(c.consultation_fee) === 0 ? 'Free' : money.format(c.consultation_fee) }),
      el('td', {}, el('span', { className: `walkin ${c.accepts_walk_ins ? 'yes' : ''}`, textContent: c.accepts_walk_ins ? 'Walk in' : 'Booking only' })),
      el('td', {}, rowActions(c)),
    ];
    ['Clinic', 'Doctor', 'Where', 'Fee (K)', 'Walk-ins'].forEach((label, i) => { cells[i].dataset.label = label; });
    tr.append(...cells);
    tbody.append(tr);
    if (c.id === pendingDeleteId) {
      tr.classList.add('is-confirming');
      tbody.append(confirmRow(c));
    }
  }

  const shown = rows.length === clinics.length
    ? `${rows.length} clinic${rows.length === 1 ? '' : 's'}`
    : `${rows.length} of ${clinics.length} clinics`;
  register.replaceChildren(el('table', {}, el('caption', { textContent: shown }), thead, tbody));
  flashId = null;
}

// Full-width row under the clinic, so asking doesn't resize the table's columns.
function confirmRow(c) {
  const confirm = el('button', { type: 'button', className: 'link-btn confirm', textContent: 'Yes, delete', onclick: () => deleteClinic(c) });
  const keep = el('button', { type: 'button', className: 'link-btn keep', textContent: 'Keep it', onclick: () => cancelDelete(c.id) });
  const question = el('span', { className: 'confirm-q', id: `confirm-${c.id}` },
    el('strong', { textContent: `Delete ${c.clinic_name}?` }), ' It will be removed from the directory.');
  const group = el('div', { className: 'confirm-box', role: 'group' }, question, el('div', { className: 'confirm-btns' }, confirm, keep));
  group.setAttribute('aria-labelledby', question.id);
  const td = el('td', { colSpan: 6 }, group);
  const tr = el('tr', { className: 'confirm-row' }, td);
  return tr;
}

function rowActions(c) {
  const edit = el('button', { type: 'button', className: 'link-btn', textContent: 'Edit', onclick: () => startEdit(c) });
  edit.setAttribute('aria-label', `Edit ${c.clinic_name}`);
  const del = el('button', { type: 'button', className: 'link-btn danger', textContent: 'Delete', onclick: () => askDelete(c.id) });
  del.setAttribute('aria-label', `Delete ${c.clinic_name}`);
  del.setAttribute('aria-expanded', String(pendingDeleteId === c.id));
  return el('div', { className: 'row-actions' }, edit, del);
}

// ---------------------------------------------------------------------------
// Create / Update
// ---------------------------------------------------------------------------
function readForm() {
  const data = {};
  for (const f of FIELDS) data[f] = form.elements[f].value.trim();
  data.consultation_fee = data.consultation_fee === '' ? 0 : Number(data.consultation_fee);
  data.accepts_walk_ins = walkIns.checked;
  return data;
}

function setFieldError(field, message) {
  const input = form.elements[field];
  const errEl = document.getElementById(`${field}-err`);
  if (!input || !errEl) return;
  errEl.textContent = message || '';
  input.closest('.field').classList.toggle('has-error', Boolean(message));
  if (message) {
    input.setAttribute('aria-invalid', 'true');
    input.setAttribute('aria-describedby', errEl.id);
  } else {
    input.removeAttribute('aria-invalid');
  }
}

function clearErrors() {
  for (const f of FIELDS) setFieldError(f, '');
}

function showErrors(details = {}) {
  let first = null;
  for (const [field, message] of Object.entries(details)) {
    setFieldError(field, message);
    first = first || form.elements[field];
  }
  first?.focus();
}

// Same rules as the server, checked as soon as a field is left.
function checkField(field) {
  const value = form.elements[field].value.trim();
  if (field === 'clinic_name' && !value) return 'Enter the clinic name.';
  if (field === 'email' && value && !EMAIL_RE.test(value)) return 'Enter an email like name@example.com.';
  if (field === 'phone' && value && !PHONE_RE.test(value)) return 'Use digits, spaces, + or - (7 to 20 characters).';
  if (field === 'consultation_fee' && value && (Number(value) < 0 || !Number.isFinite(Number(value)))) return 'Enter a fee of 0 or more.';
  return '';
}

for (const field of ['clinic_name', 'email', 'phone', 'consultation_fee']) {
  const input = form.elements[field];
  input.addEventListener('blur', () => { if (input.value || field === 'clinic_name' && input.dataset.touched) setFieldError(field, checkField(field)); });
  input.addEventListener('input', () => { input.dataset.touched = '1'; if (input.getAttribute('aria-invalid')) setFieldError(field, checkField(field)); });
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearErrors();
  const local = {};
  for (const f of ['clinic_name', 'email', 'phone', 'consultation_fee']) {
    const msg = checkField(f);
    if (msg) local[f] = msg;
  }
  if (Object.keys(local).length) return showErrors(local);

  const data = readForm();
  const id = idInput.value;
  submitBtn.disabled = true;
  try {
    const result = id
      ? await request(`/${id}`, { method: 'PUT', body: JSON.stringify(data) })
      : await request('', { method: 'POST', body: JSON.stringify(data) });
    flashId = result.data.id;
    resetForm();
    await loadClinics();
    toast(id ? `Saved changes to ${result.data.clinic_name}.` : `Added ${result.data.clinic_name}.`);
    register.querySelector(`tr[data-id="${flashId}"]`)?.scrollIntoView({ block: 'nearest' });
  } catch (err) {
    showErrors(err.details);
    toast(err.message, { tone: 'bad' });
  } finally {
    submitBtn.disabled = false;
  }
});

function startEdit(c) {
  pendingDeleteId = null;
  clearErrors();
  idInput.value = c.id;
  for (const f of FIELDS) form.elements[f].value = c[f] ?? '';
  walkIns.checked = Boolean(c.accepts_walk_ins);
  formTitle.textContent = 'Edit clinic';
  formRef.textContent = `Record #${c.id}`;
  submitBtn.textContent = 'Save changes';
  cancelBtn.hidden = false;
  form.classList.add('is-editing');
  render();
  form.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  form.elements.clinic_name.focus({ preventScroll: true });
}

function resetForm() {
  form.reset();
  for (const f of FIELDS) delete form.elements[f].dataset.touched;
  idInput.value = '';
  walkIns.checked = true;
  formTitle.textContent = 'Add a clinic';
  formRef.textContent = '';
  submitBtn.textContent = 'Add clinic';
  cancelBtn.hidden = true;
  form.classList.remove('is-editing');
  clearErrors();
}

function cancelEdit() {
  const id = idInput.value;
  resetForm();
  render();
  register.querySelector(`tr[data-id="${id}"] .link-btn`)?.focus();
}

cancelBtn.addEventListener('click', cancelEdit);

// ---------------------------------------------------------------------------
// Delete: ask first, then offer undo (the clinic is re-created from the copy kept here)
// ---------------------------------------------------------------------------
function askDelete(id) {
  pendingDeleteId = id;
  render();
  // Focus lands on the safe choice, so a second Enter press can't delete by accident.
  register.querySelector('.confirm-row .keep')?.focus();
}

function cancelDelete(id) {
  pendingDeleteId = null;
  render();
  register.querySelector(`tr[data-id="${id}"] .danger`)?.focus();
}

async function deleteClinic(c) {
  pendingDeleteId = null;
  try {
    await request(`/${c.id}`, { method: 'DELETE' });
    if (Number(idInput.value) === c.id) resetForm();
    await loadClinics();
    const t = toast(`Deleted ${c.clinic_name}.`, { action: { label: 'Undo', run: () => restoreClinic(c) } });
    t.querySelector('button').focus();
  } catch (err) {
    toast(err.message, { tone: 'bad' });
  }
}

async function restoreClinic(c) {
  const payload = { accepts_walk_ins: c.accepts_walk_ins };
  for (const f of FIELDS) payload[f] = c[f];
  try {
    const { data } = await request('', { method: 'POST', body: JSON.stringify(payload) });
    flashId = data.id;
    await loadClinics();
    toast(`Restored ${data.clinic_name}.`);
  } catch (err) {
    toast(`Couldn't restore ${c.clinic_name}: ${err.message}`, { tone: 'bad' });
  }
}

// ---------------------------------------------------------------------------
// Search, filters, sort, keyboard shortcuts, first load
// ---------------------------------------------------------------------------
let searchTimer;
searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(loadClinics, 250);
});

for (const chip of chips) {
  chip.addEventListener('click', () => {
    const key = chip.dataset.filter;
    if (activeFilters.has(key)) activeFilters.delete(key);
    else activeFilters.add(key);
    render();
  });
}
sortSelect.addEventListener('change', render);

document.addEventListener('keydown', (event) => {
  const typing = event.target.closest('input, select, textarea');
  if (event.key === '/' && !typing) {
    event.preventDefault();
    searchInput.focus();
  } else if (event.key === 'Escape' && pendingDeleteId !== null) {
    cancelDelete(pendingDeleteId);
  } else if (event.key === 'Escape' && idInput.value && form.contains(event.target)) {
    cancelEdit();
  }
});

loadClinics();
