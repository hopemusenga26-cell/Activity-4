// Opens the SQLite database named in .env (DB_FILE) and seeds it from schema.sql
// the first time it runs. `npm run seed` drops and re-creates the table.
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });

const dbFile = path.resolve(__dirname, process.env.DB_FILE || './data/clinic.db');
fs.mkdirSync(path.dirname(dbFile), { recursive: true });

const db = new Database(dbFile);
db.pragma('journal_mode = WAL');

function runSchema() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(sql);
}

const tableExists = db
  .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'clinic'")
  .get();

if (!tableExists || process.argv.includes('--reset')) {
  runSchema();
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM clinic').get();
  console.log(`Database ready at ${dbFile} (${count} clinics seeded)`);
}

module.exports = db;
