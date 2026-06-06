// db.js
// SQLite storage for saved Echo gallery works

const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const dbPath = path.join(__dirname, 'echo.db');

// open the database right away
// if echo.db does not exist yet, SQLite will create it
const db = new DatabaseSync(dbPath);

// create the table when the server starts
// IF NOT EXISTS means this will not erase old saved works
db.exec(`
  CREATE TABLE IF NOT EXISTS echo_works (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    title TEXT NOT NULL,
    original_text TEXT NOT NULL,

    core_words TEXT NOT NULL DEFAULT '[]',
    related_words TEXT NOT NULL DEFAULT '[]',
    particles TEXT NOT NULL DEFAULT '[]',

    mode TEXT NOT NULL,
    density REAL NOT NULL DEFAULT 0.6,
    motion REAL NOT NULL DEFAULT 0.4,
    intensity REAL NOT NULL DEFAULT 0.4,

    options TEXT NOT NULL DEFAULT '{}',
    analysis_data TEXT NOT NULL DEFAULT '{}',

    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS echo_works_created_at_idx
  ON echo_works (created_at DESC);

  CREATE INDEX IF NOT EXISTS echo_works_mode_idx
  ON echo_works (mode);
`);

// for this project, all functions can just use the same db
function getDb() {
  return db;
}

// SQLite stores arrays/objects as text, so this turns them back
function parseJson(value, fallback) {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

// convert one database row into the shape the frontend expects
function rowToRecord(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    title: row.title,
    original_text: row.original_text,

    // these were saved as JSON strings, so turn them back into arrays
    core_words: parseJson(row.core_words, []),
    related_words: parseJson(row.related_words, []),
    particles: parseJson(row.particles, []),

    mode: row.mode,
    density: row.density,
    motion: row.motion,
    intensity: row.intensity,

    // these were saved as JSON strings, so turn them back into objects
    options: parseJson(row.options, {}),
    analysis_data: parseJson(row.analysis_data, {}),

    created_at: row.created_at
  };
}

// save a new gallery work
function insertWork(work) {
  const database = getDb();

  const result = database.prepare(`
    INSERT INTO echo_works (
      title, original_text, core_words, related_words, particles,
      mode, density, motion, intensity, options, analysis_data
    ) VALUES (
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?
    )
  `).run(
    work.title,
    work.original_text,

    // SQLite cannot directly store arrays/objects, so save them as strings
    JSON.stringify(work.core_words || []),
    JSON.stringify(work.related_words || []),
    JSON.stringify(work.particles || []),

    work.mode,
    work.density,
    work.motion,
    work.intensity,

    JSON.stringify(work.options || {}),
    JSON.stringify(work.analysis_data || {})
  );

  // SQLite gives us the new autoincrement id
  return getWorkById(result.lastInsertRowid);
}

// get all saved works for the Gallery page
function getAllWorks() {
  const rows = getDb()
    .prepare('SELECT * FROM echo_works ORDER BY datetime(created_at) DESC')
    .all();

  return rows.map(rowToRecord);
}

// get one saved work by id
function getWorkById(id) {
  const row = getDb()
    .prepare('SELECT * FROM echo_works WHERE id = ?')
    .get(id);

  return rowToRecord(row);
}

// update only the settings that were sent in
function updateWork(id, patch) {
  const sets = [];
  const values = [];

  if (patch.density !== undefined) {
    sets.push('density = ?');
    values.push(patch.density);
  }

  if (patch.motion !== undefined) {
    sets.push('motion = ?');
    values.push(patch.motion);
  }

  if (patch.intensity !== undefined) {
    sets.push('intensity = ?');
    values.push(patch.intensity);
  }

  if (patch.options !== undefined) {
    sets.push('options = ?');
    values.push(JSON.stringify(patch.options));
  }

  // if nothing was sent, there is nothing to update
  if (sets.length === 0) {
    return null;
  }

  values.push(id);

  const result = getDb()
    .prepare(`UPDATE echo_works SET ${sets.join(', ')} WHERE id = ?`)
    .run(...values);

  if (result.changes === 0) {
    return null;
  }

  return getWorkById(id);
}

// delete one saved work
function deleteWork(id) {
  const result = getDb()
    .prepare('DELETE FROM echo_works WHERE id = ?')
    .run(id);

  return result.changes > 0;
}

module.exports = {
  dbPath,
  getDb,
  insertWork,
  getAllWorks,
  getWorkById,
  updateWork,
  deleteWork
};