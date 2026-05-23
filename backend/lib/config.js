/**
 * Echo API configuration.
 *
 * Core art generation always runs locally in this server.
 * Datamuse enrichment is server-side only and optional.
 */

function parseBool(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') return defaultValue;
  return value === 'true' || value === '1';
}

module.exports = {
  PORT: Number(process.env.PORT) || 3000,
  /** Global Datamuse enrichment for all modes. Default false. */
  USE_DATAMUSE: parseBool(process.env.USE_DATAMUSE, false),
  /**
   * Network semantic echoes via Datamuse (server-side only).
   * Enabled by default so sparse graphs fill with related words.
   * Set NETWORK_DATAMUSE=false for fully local network graphs.
   */
  NETWORK_DATAMUSE: parseBool(process.env.NETWORK_DATAMUSE, true)
};
