// db.js
// SQLite storage for saved gallery works

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const dataDir = path.join(__dirname, '..', 'data');
const dbPath = path.join(dataDir, 'echo.db');

let db;

function initDb() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS echo_works (
      id TEXT PRIMARY KEY,
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

    CREATE INDEX IF NOT EXISTS echo_works_created_at_idx ON echo_works (created_at DESC);
    CREATE INDEX IF NOT EXISTS echo_works_mode_idx ON echo_works (mode);
  `);

  return db;
}

function getDb() {
  if (!db) {
    initDb();
  }

  return db;
}

function parseJson(value, fallback) {
  if (value == null || value === '') {
    return fallback;
  }

  if (typeof value === 'object') {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function rowToRecord(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    title: row.title,
    original_text: row.original_text,
    core_words: parseJson(row.core_words, []),
    related_words: parseJson(row.related_words, []),
    particles: parseJson(row.particles, []),
    mode: row.mode,
    density: row.density,
    motion: row.motion,
    intensity: row.intensity,
    options: parseJson(row.options, {}),
    analysis_data: parseJson(row.analysis_data, {}),
    created_at: row.created_at
  };
}

function insertWork(work) {
  const id = crypto.randomUUID();
  const database = getDb();

  database.prepare(`
    INSERT INTO echo_works (
      id, title, original_text, core_words, related_words, particles,
      mode, density, motion, intensity, options, analysis_data
    ) VALUES (
      @id, @title, @original_text, @core_words, @related_words, @particles,
      @mode, @density, @motion, @intensity, @options, @analysis_data
    )
  `).run({
    id: id,
    title: work.title,
    original_text: work.original_text,
    core_words: JSON.stringify(work.core_words || []),
    related_words: JSON.stringify(work.related_words || []),
    particles: JSON.stringify(work.particles || []),
    mode: work.mode,
    density: work.density,
    motion: work.motion,
    intensity: work.intensity,
    options: JSON.stringify(work.options || {}),
    analysis_data: JSON.stringify(work.analysis_data || {})
  });

  return rowToRecord(database.prepare('SELECT * FROM echo_works WHERE id = ?').get(id));
}

function getAllWorks() {
  const rows = getDb()
    .prepare('SELECT * FROM echo_works ORDER BY datetime(created_at) DESC')
    .all();

  return rows.map(rowToRecord);
}

function getWorkById(id) {
  const row = getDb().prepare('SELECT * FROM echo_works WHERE id = ?').get(id);
  return rowToRecord(row);
}

function updateWork(id, patch) {
  const sets = [];
  const values = {};

  if (patch.density !== undefined) {
    sets.push('density = @density');
    values.density = patch.density;
  }

  if (patch.motion !== undefined) {
    sets.push('motion = @motion');
    values.motion = patch.motion;
  }

  if (patch.intensity !== undefined) {
    sets.push('intensity = @intensity');
    values.intensity = patch.intensity;
  }

  if (patch.options !== undefined) {
    sets.push('options = @options');
    values.options = JSON.stringify(patch.options);
  }

  if (sets.length === 0) {
    return null;
  }

  values.id = id;

  const database = getDb();
  const result = database
    .prepare(`UPDATE echo_works SET ${sets.join(', ')} WHERE id = @id`)
    .run(values);

  if (result.changes === 0) {
    return null;
  }

  return getWorkById(id);
}

function deleteWork(id) {
  const result = getDb().prepare('DELETE FROM echo_works WHERE id = ?').run(id);
  return result.changes > 0;
}

module.exports = {
  dbPath,
  initDb,
  insertWork,
  getAllWorks,
  getWorkById,
  updateWork,
  deleteWork
};
