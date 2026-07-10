/**
 * Shared config loading for Aido scripts.
 */

const fs = require('fs');

/**
 * Load a JSON config file and merge it over defaults.
 * Falls back to defaults if the file is missing or invalid.
 *
 * @param {string} configPath absolute path to the JSON config
 * @param {object} defaults default configuration
 * @param {string[]} deepKeys one-level nested objects to merge key-wise (e.g. 'model', 'include')
 * @param {string} logPrefix label used in error logs
 */
function loadConfig(configPath, defaults, deepKeys = ['model', 'include'], logPrefix = 'Aido') {
  try {
    if (fs.existsSync(configPath)) {
      const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      const merged = { ...defaults, ...parsed };
      for (const key of deepKeys) {
        if (defaults[key] && typeof defaults[key] === 'object') {
          merged[key] = { ...defaults[key], ...(parsed[key] || {}) };
        }
      }
      return merged;
    }
  } catch (e) {
    console.error(`[${logPrefix}] Failed to read/parse ${configPath}:`, e.message || e);
  }
  return defaults;
}

module.exports = { loadConfig };
