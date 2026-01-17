require("dotenv").config();
const axios = require("axios");
const db = require("./db");

const CONFIG = {
  API_URL: "https://ws.audioscrobbler.com/2.0/",
  RETRY_DELAY: 3000,
  REQUEST_DELAY: 300,
  PER_PAGE: 200
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const insertScrobble = db.prepare(`
  INSERT OR IGNORE INTO scrobbles (artist, track, album, played_at)
  VALUES (?, ?, ?, ?)
`);

const getLastPlayedAt = db.prepare(`
  SELECT MAX(played_at) as last FROM scrobbles
`);

const runSyncTransaction = db.transaction((tracks) => {
  let count = 0;
  for (const track of tracks) {
    if (!track.date) continue;

    const result = insertScrobble.run(
      track.artist["#text"],
      track.name,
      track.album["#text"] || null,
      Number(track.date.uts)
    );

    if (result.changes > 0) count++;
  }
  return count;
});



async function fetchLastfmPage(page, retries = 3) {
  let attempt = 0;
  
  while (attempt <= retries) {
    try {
      const { data } = await axios.get(CONFIG.API_URL, {
        timeout: 10000,
        params: {
          method: "user.getrecenttracks",
          user: process.env.LASTFM_USERNAME,
          api_key: process.env.LASTFM_API_KEY,
          format: "json",
          limit: CONFIG.PER_PAGE,
          page
        }
      });

      if (data.error) throw new Error(data.message);
      return data.recenttracks;

    } catch (err) {
      attempt++;
      if (attempt > retries) {
         throw new Error(`Failed to fetch Last.fm page ${page} after ${retries} retries: ${err.message}`);
      }
      
      const waitTime = CONFIG.RETRY_DELAY * Math.pow(2, attempt - 1);
      console.warn(`⚠️ Error fetching page ${page} (Attempt ${attempt}/${retries}). Retrying in ${waitTime}ms...`, err.message);
      await sleep(waitTime);
    }
  }
}

async function sync(options = {}) {
  const isFullSync = options.full === true;

  console.log(
    isFullSync
      ? "🔄 Starting FULL sync with Last.fm..."
      : "🔄 Starting incremental sync with Last.fm..."
  );

  const row = getLastPlayedAt.get();
  const lastPlayedAt = isFullSync ? 0 : (row?.last || 0);

  let page = 1;
  let shouldStop = false;

  while (!shouldStop) {
    const data = await fetchLastfmPage(page);
    const tracks = data.track || [];

    if (!tracks.length) break;

    const newTracks = [];

    for (const track of tracks) {
      if (!track.date) continue;
      const playedAt = Number(track.date.uts);
      if (!isFullSync && playedAt <= lastPlayedAt) {
        shouldStop = true;
        break;
      }
      newTracks.push(track);
    }

    runSyncTransaction(newTracks);
    page++;
    await sleep(CONFIG.REQUEST_DELAY);
  }

  console.log("✨ Sync finished");
}

module.exports = { sync };
