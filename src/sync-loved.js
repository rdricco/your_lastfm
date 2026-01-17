const axios = require("axios");
const db = require("./db");
const SettingsService = require("./services/settings");

const CONFIG = {
  API_URL: "https://ws.audioscrobbler.com/2.0/",
  PER_PAGE: 50
};

const insertLovedTrack = db.prepare(`
  INSERT OR REPLACE INTO loved_tracks (artist, track, url, image, loved_at)
  VALUES (?, ?, ?, ?, ?)
`);

async function fetchLovedTracksPage(page) {
  const { data } = await axios.get(CONFIG.API_URL, {
    params: {
      method: "user.getlovedtracks",
      user: SettingsService.get("LASTFM_USERNAME"),
      api_key: SettingsService.get("LASTFM_API_KEY"),
      format: "json",
      limit: CONFIG.PER_PAGE,
      page
    }
  });

  return data.lovedtracks;
}

async function syncLovedTracks() {
  console.log("❤️ Starting Loved Tracks sync...");
  
  try {
    let page = 1;
    let totalPages = 1;

    do {
      const data = await fetchLovedTracksPage(page);
      const tracks = data.track || [];
      const attr = data["@attr"];
      totalPages = Number(attr.totalPages);

      const transaction = db.transaction((pageTracks) => {
        for (const t of pageTracks) {
          insertLovedTrack.run(
            t.artist.name,
            t.name,
            t.url,
            t.image?.find(i => i.size === "extralarge")?.["#text"] || null,
            Number(t.date.uts)
          );
        }
      });

      transaction(tracks);
      console.log(`   Fetched page ${page}/${totalPages}`);
      page++;

    } while (page <= totalPages);

    console.log("❤️ Loved Tracks sync finished!");

  } catch (err) {
    console.error("❌ Loved Tracks sync failed:", err.message);
  }
}

module.exports = { syncLovedTracks };
