/**
 * Echo works — validation, title generation, Supabase CRUD helpers.
 */

const { supabase, isSupabaseConfigured } = require('../supabaseClient');

const VALID_MODES = new Set(['network', 'soup', 'ascii', 'vortex', 'orbit']);

function clampUnit(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0, n));
}

function ensureArray(value, fieldName) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new ValidationError(`${fieldName} must be an array`);
  }
  return value;
}

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.status = 400;
  }
}

function generateTitle({ title, coreWords, originalText }) {
  if (title && String(title).trim()) {
    return String(title).trim().slice(0, 120);
  }

  const fromCore = ensureArray(coreWords, 'coreWords')
    .slice(0, 5)
    .map((w) => (typeof w === 'string' ? w : w?.text))
    .filter(Boolean);

  if (fromCore.length >= 3) {
    return fromCore.slice(0, Math.min(5, fromCore.length)).join(' · ').slice(0, 120);
  }

  if (fromCore.length > 0) {
    return fromCore.join(' · ').slice(0, 120);
  }

  const words = String(originalText || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5);

  if (words.length) {
    return words.join(' ').slice(0, 120);
  }

  return 'untitled echo';
}

function validateWorkPayload(body) {
  if (!body || typeof body !== 'object') {
    throw new ValidationError('Request body is required');
  }

  const originalText = String(body.originalText || '').trim();
  if (!originalText) {
    throw new ValidationError('originalText is required');
  }

  const mode = String(body.mode || '').toLowerCase();
  if (!VALID_MODES.has(mode)) {
    throw new ValidationError(`mode must be one of: ${[...VALID_MODES].join(', ')}`);
  }

  const coreWords = ensureArray(body.coreWords, 'coreWords');
  const relatedWords = ensureArray(body.relatedWords, 'relatedWords');
  const particles = ensureArray(body.particles, 'particles');

  const density = clampUnit(body.density, 0.6);
  const motion = clampUnit(body.motion, 0.4);
  const intensity = clampUnit(body.intensity, 0.4);

  const options = body.options && typeof body.options === 'object' ? body.options : {};
  const analysisData = body.analysisData && typeof body.analysisData === 'object' ? body.analysisData : {};

  const title = generateTitle({ title: body.title, coreWords, originalText });

  return {
    title,
    original_text: originalText,
    core_words: coreWords,
    related_words: relatedWords,
    particles,
    mode,
    density,
    motion,
    intensity,
    options,
    analysis_data: analysisData
  };
}

function toCamel(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    originalText: row.original_text,
    coreWords: row.core_words ?? [],
    relatedWords: row.related_words ?? [],
    particles: row.particles ?? [],
    mode: row.mode,
    density: Number(row.density),
    motion: Number(row.motion),
    intensity: Number(row.intensity),
    options: row.options ?? {},
    analysisData: row.analysis_data ?? {},
    createdAt: row.created_at
  };
}

function requireSupabase(res) {
  if (!isSupabaseConfigured()) {
    res.status(503).json({
      error: 'Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the server.'
    });
    return false;
  }
  return true;
}

async function createWork(body) {
  const record = validateWorkPayload(body);
  const { data, error } = await supabase
    .from('echo_works')
    .insert(record)
    .select()
    .single();

  if (error) throw error;
  return toCamel(data);
}

async function listWorks() {
  const { data, error } = await supabase
    .from('echo_works')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []).map(toCamel);
}

async function getWorkById(id) {
  const { data, error } = await supabase
    .from('echo_works')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return toCamel(data);
}

async function deleteWorkById(id) {
  const { error } = await supabase
    .from('echo_works')
    .delete()
    .eq('id', id);

  if (error) throw error;
  return { id, deleted: true };
}

module.exports = {
  ValidationError,
  createWork,
  listWorks,
  getWorkById,
  deleteWorkById,
  requireSupabase,
  toCamel
};
