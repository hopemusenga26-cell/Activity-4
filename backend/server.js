const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });
const express = require('express');
const cors = require('cors');
const db = require('./db');

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// CORS_ORIGIN can be "*" or a comma-separated list of allowed origins.
const corsOrigin = (process.env.CORS_ORIGIN || '*').trim();
app.use(cors({ origin: corsOrigin === '*' ? true : corsOrigin.split(',').map((o) => o.trim()) }));
app.use(express.json({ limit: '20kb' }));

// The frontend is served from the same server so one deployed URL hosts UI + API.
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------
const TEXT_FIELDS = {
  clinic_name: 150,
  doctor_name: 150,
  specialty: 100,
  location: 150,
  phone: 20,
  email: 120,
  opening_hours: 100,
};
const FIELDS = [...Object.keys(TEXT_FIELDS), 'consultation_fee', 'accepts_walk_ins'];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+0-9 ()-]{7,20}$/;

function toBoolean(value) {
  if (value === true || value === 1 || value === '1' || value === 'true') return true;
  if (value === false || value === 0 || value === '0' || value === 'false') return false;
  return null;
}

// Returns { data, errors }. `data` holds only whitelisted, normalised columns.
function validateClinic(input) {
  const errors = {};
  const data = {};

  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return { data, errors: { body: 'Request body must be a JSON object.' } };
  }

  for (const [field, max] of Object.entries(TEXT_FIELDS)) {
    const value = input[field];
    if (value === undefined || value === null || value === '') {
      data[field] = null;
      continue;
    }
    if (typeof value !== 'string') {
      errors[field] = `${field} must be text.`;
      continue;
    }
    const trimmed = value.trim();
    if (trimmed.length > max) errors[field] = `${field} must be at most ${max} characters.`;
    data[field] = trimmed || null;
  }

  if (!data.clinic_name && !errors.clinic_name) errors.clinic_name = 'clinic_name is required.';
  if (data.email && !EMAIL_RE.test(data.email)) errors.email = 'email must be a valid email address.';
  if (data.phone && !PHONE_RE.test(data.phone)) {
    errors.phone = 'phone may only contain digits, spaces, +, - and brackets (7-20 characters).';
  }

  const fee = input.consultation_fee;
  if (fee === undefined || fee === null || fee === '') {
    data.consultation_fee = 0;
  } else {
    const num = typeof fee === 'string' ? Number(fee) : fee;
    if (typeof num !== 'number' || !Number.isFinite(num) || num < 0 || num > 999999.99) {
      errors.consultation_fee = 'consultation_fee must be a number between 0 and 999999.99.';
    } else {
      data.consultation_fee = Math.round(num * 100) / 100;
    }
  }

  if (input.accepts_walk_ins === undefined || input.accepts_walk_ins === null) {
    data.accepts_walk_ins = 1;
  } else {
    const flag = toBoolean(input.accepts_walk_ins);
    if (flag === null) errors.accepts_walk_ins = 'accepts_walk_ins must be true or false.';
    else data.accepts_walk_ins = flag ? 1 : 0;
  }

  return { data, errors };
}

function serialize(row) {
  return row && { ...row, accepts_walk_ins: Boolean(row.accepts_walk_ins) };
}

function parseId(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ success: false, error: 'id must be a positive whole number.' });
    return null;
  }
  return id;
}

// ---------------------------------------------------------------------------
// Prepared statements (parameterised: user input never reaches the SQL text)
// ---------------------------------------------------------------------------
const columns = FIELDS.join(', ');
const stmt = {
  all: db.prepare('SELECT * FROM clinic ORDER BY id'),
  search: db.prepare(`
    SELECT * FROM clinic
    WHERE clinic_name LIKE @q ESCAPE '\\' OR doctor_name LIKE @q ESCAPE '\\'
       OR specialty LIKE @q ESCAPE '\\' OR location LIKE @q ESCAPE '\\'
    ORDER BY id`),
  one: db.prepare('SELECT * FROM clinic WHERE id = ?'),
  insert: db.prepare(`INSERT INTO clinic (${columns}) VALUES (${FIELDS.map((f) => '@' + f).join(', ')})`),
  update: db.prepare(`UPDATE clinic SET ${FIELDS.map((f) => `${f} = @${f}`).join(', ')} WHERE id = @id`),
  remove: db.prepare('DELETE FROM clinic WHERE id = ?'),
};

// ---------------------------------------------------------------------------
// Routes: /api/clinic
// ---------------------------------------------------------------------------
const router = express.Router();

// GET /api/clinic -> list all records (optional ?q= filters by name, doctor, specialty, location)
router.get('/', (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const rows = q
    ? stmt.search.all({ q: `%${q.replace(/[\\%_]/g, (c) => '\\' + c)}%` })
    : stmt.all.all();
  res.json({ success: true, count: rows.length, data: rows.map(serialize) });
});

// GET /api/clinic/:id -> one record
router.get('/:id', (req, res) => {
  const id = parseId(req, res);
  if (id === null) return;
  const row = stmt.one.get(id);
  if (!row) return res.status(404).json({ success: false, error: `Clinic ${id} not found.` });
  res.json({ success: true, data: serialize(row) });
});

// POST /api/clinic -> create a record
router.post('/', (req, res) => {
  const { data, errors } = validateClinic(req.body);
  if (Object.keys(errors).length) {
    return res.status(400).json({ success: false, error: 'Validation failed.', details: errors });
  }
  const { lastInsertRowid } = stmt.insert.run(data);
  const created = stmt.one.get(lastInsertRowid);
  res.status(201).location(`/api/clinic/${created.id}`).json({
    success: true,
    message: 'Clinic created.',
    data: serialize(created),
  });
});

// PUT /api/clinic/:id -> update a record (fields left out keep their current value)
router.put('/:id', (req, res) => {
  const id = parseId(req, res);
  if (id === null) return;
  const existing = stmt.one.get(id);
  if (!existing) return res.status(404).json({ success: false, error: `Clinic ${id} not found.` });

  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : null;
  const merged = body ? { ...serialize(existing), ...body } : body;
  const { data, errors } = validateClinic(merged);
  if (Object.keys(errors).length) {
    return res.status(400).json({ success: false, error: 'Validation failed.', details: errors });
  }
  stmt.update.run({ ...data, id });
  res.json({ success: true, message: 'Clinic updated.', data: serialize(stmt.one.get(id)) });
});

// DELETE /api/clinic/:id -> delete a record
router.delete('/:id', (req, res) => {
  const id = parseId(req, res);
  if (id === null) return;
  const existing = stmt.one.get(id);
  if (!existing) return res.status(404).json({ success: false, error: `Clinic ${id} not found.` });
  stmt.remove.run(id);
  res.json({ success: true, message: `Clinic ${id} deleted.`, data: serialize(existing) });
});

app.get('/api/health', (req, res) => res.json({ success: true, status: 'ok' }));
app.use('/api/clinic', router);

// Everything that falls through is answered in JSON, as the brief requires.
app.use((req, res) => {
  res.status(404).json({ success: false, error: `Route ${req.method} ${req.originalUrl} not found.` });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, error: 'Request body is not valid JSON.' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ success: false, error: 'Request body is too large.' });
  }
  console.error(err);
  res.status(500).json({ success: false, error: 'Something went wrong on the server.' });
});

app.listen(PORT, () => {
  console.log(`Clinic API running on http://localhost:${PORT}  (endpoints under /api/clinic)`);
});
