const db = require("../db");

const DEFAULTS = {
  LASTFM_API_KEY: process.env.LASTFM_API_KEY,
  LASTFM_USERNAME: process.env.LASTFM_USERNAME,
  AVG_TRACK_SECONDS: "180" // stored as string in DB
};

const getSetting = db.prepare("SELECT value FROM settings WHERE key = ?");
const setSetting = db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");

const SettingsService = {
  get(key) {
    const row = getSetting.get(key);
    if (row && row.value !== null && row.value !== undefined) {
      return row.value;
    }
    return DEFAULTS[key];
  },

  getAll() {
    return {
      LASTFM_API_KEY: this.get("LASTFM_API_KEY"),
      LASTFM_USERNAME: this.get("LASTFM_USERNAME"),
      AVG_TRACK_SECONDS: Number(this.get("AVG_TRACK_SECONDS") || 180)
    };
  },

  set(key, value) {
    setSetting.run(key, String(value));
  },

  updateAll(settings) {
    const transaction = db.transaction((updates) => {
      for (const [key, value] of Object.entries(updates)) {
        if (value !== undefined) {
          setSetting.run(key, String(value));
        }
      }
    });
    transaction(settings);
  }
};

module.exports = SettingsService;
