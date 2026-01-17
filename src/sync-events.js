const axios = require("axios");
const db = require("./db");
const SettingsService = require("./services/settings");

const CONFIG = {
  API_URL: "https://ws.audioscrobbler.com/2.0/",
  PER_PAGE: 50
};

const insertEvent = db.prepare(`
  INSERT OR REPLACE INTO events (id, title, artists, venue, start_date, url, image)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const clearEvents = db.prepare("DELETE FROM events");

async function syncEvents() {
  console.log("📅 Starting Events sync...");

  try {
    const { data } = await axios.get(CONFIG.API_URL, {
      params: {
        method: "user.getrecommendedevents",
        user: SettingsService.get("LASTFM_USERNAME"),
        api_key: SettingsService.get("LASTFM_API_KEY"),
        format: "json",
        limit: CONFIG.PER_PAGE
      }
    });

    const events = data.events?.event || [];

    // Clear old events before inserting new ones (since recommendations change)
    clearEvents.run();

    const transaction = db.transaction((eventsList) => {
      for (const e of eventsList) {
        const artists = Array.isArray(e.artists.artist) 
          ? e.artists.artist.join(", ") 
          : e.artists.artist;

        insertEvent.run(
          Number(e.id),
          e.title,
          artists,
          e.venue?.name,
          new Date(e.startDate).getTime(),
          e.url,
          e.image?.find(i => i.size === "extralarge")?.["#text"] || null
        );
      }
    });

    transaction(events);
    console.log(`📅 Events sync finished! Imported ${events.length} events.`);

  } catch (err) {
    console.error("❌ Events sync failed:", err.message);
  }
}

module.exports = { syncEvents };
