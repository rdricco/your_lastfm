require('dotenv').config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const path = require("path");
const db = require("./db");
const { getActiveFilter } = require("./utils/filters");

const { buildRangeFilter, fillMissingDates } = require("./utils/dateRange");
const { ensureAlbumCover } = require("./services/albumCoverCache");
const { ensureArtistImage } = require("./services/artistImageCache");

const SettingsService = require("./services/settings");

const app = express();
const PORT = process.env.PORT || 1533;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

// Settings Endpoints
app.get("/api/settings", (req, res) => {
  const settings = SettingsService.getAll();
  // Mask sensitive data for UI
  const masked = {
    ...settings,
    LASTFM_API_KEY: settings.LASTFM_API_KEY ? "●●●●●●●●" : "",
    LASTFM_USERNAME: settings.LASTFM_USERNAME
  };
  res.json(masked);
});

app.post("/api/settings", (req, res) => {
  try {
    const { LASTFM_API_KEY, LASTFM_USERNAME, AVG_TRACK_SECONDS } = req.body;
    
    // Only update provided fields (partial update not supported by simple UI yet, but robust)
    const updates = {};
    // If masking is sent back, ignore it. Only update if it looks like a real new value.
    if (LASTFM_API_KEY && !LASTFM_API_KEY.includes("●")) updates.LASTFM_API_KEY = LASTFM_API_KEY;
    if (LASTFM_USERNAME) updates.LASTFM_USERNAME = LASTFM_USERNAME;
    if (AVG_TRACK_SECONDS) updates.AVG_TRACK_SECONDS = AVG_TRACK_SECONDS;

    SettingsService.updateAll(updates);
    
    console.log("⚙️ Settings updated:", Object.keys(updates));
    res.json({ success: true });
  } catch (err) {
    console.error("Failed to update settings:", err);
    res.status(500).json({ error: "Internal error" });
  }
});


app.get("/api/top-artists", async (req, res) => {
  res.set('Cache-Control', 'no-store');

  try {
    const filter = getActiveFilter(req.query);
    
    console.log(`[Top Artists] Filter: "${filter.where}" | Params: ${filter.params}`);

    const query = `
      SELECT artist, COUNT(*) plays
      FROM scrobbles
      ${filter.where ? `WHERE ${filter.where}` : ""}
      GROUP BY artist
      ORDER BY plays DESC
      LIMIT 10
    `;

    const rows = db.prepare(query).all(...filter.params);

    await Promise.all(rows.map(async (r) => {
      try {
        r.image = await ensureArtistImage(r.artist);
      } catch {
        r.image = null;
      }
    }));

    res.json(rows);

  } catch (err) {
    console.error("[ERROR Top Artists]", err);
    res.status(500).json({ error: "Internal error" });
  }
});

app.get("/api/top-tracks", async (req, res) => {
  const filter = getActiveFilter(req.query);
  const avgSeconds = SettingsService.get("AVG_TRACK_SECONDS") || 180;

  const rows = db.prepare(`
    SELECT
      track, artist, album, album_image,
      COUNT(*) plays,
      COUNT(*) * ? total_seconds
    FROM scrobbles
    WHERE album IS NOT NULL
    ${filter.where ? `AND ${filter.where}` : ""}
    GROUP BY track, artist, album
    ORDER BY plays DESC
    LIMIT 20
  `).all(avgSeconds, ...(filter.params || []));

  await Promise.all(rows.map(async (row) => {
    if (!row.album_image) {
      row.album_image = await ensureAlbumCover(row.artist, row.album);
    }
  }));

  res.json(rows);
});

app.get("/api/plays-per-day", (req, res) => {
  const filter = getActiveFilter(req.query);

  const rows = db.prepare(`
    SELECT
      date(played_at, 'unixepoch') day,
      COUNT(*) plays
    FROM scrobbles
    ${filter.where ? `WHERE ${filter.where}` : ""}
    GROUP BY day
    ORDER BY day
  `).all(...(filter.params || []));

  const result = req.query.range ? fillMissingDates(rows, req.query.range) : rows;
  res.json(result);
});

app.get("/api/summary", (req, res) => {
  const filter = getActiveFilter(req.query);
  const avgSeconds = SettingsService.get("AVG_TRACK_SECONDS") || 180;

  const row = db.prepare(`
    SELECT
      COUNT(*) totalPlays,
      COUNT(DISTINCT date(played_at, 'unixepoch')) days
    FROM scrobbles
    ${filter.where ? `WHERE ${filter.where}` : ""}
  `).get(...(filter.params || []));

  const totalMinutes = Math.round((row.totalPlays * avgSeconds) / 60);
  const avgPerDay = row.days ? (row.totalPlays / row.days).toFixed(1) : 0;

  res.json({
    totalPlays: row.totalPlays,
    totalMinutes,
    avgPerDay
  });
});

app.get("/api/top-albums", async (req, res) => {
  const filter = getActiveFilter(req.query);
  const filterClause = filter.where ? `AND ${filter.where}` : '';

  const albums = db.prepare(`
    SELECT artist, album, album_image, COUNT(*) plays
    FROM scrobbles
    WHERE album IS NOT NULL
    ${filterClause} 
    GROUP BY artist, album
    ORDER BY plays DESC
    LIMIT 12
  `).all(...(filter.params || []));

  await Promise.all(albums.map(async (a) => {
    if (!a.album_image) {
      a.album_image = await ensureAlbumCover(a.artist, a.album);
    }
  }));

  res.json(albums);
});

app.get("/api/recent-scrobbles", async (req, res) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = 20;

    const response = await axios.get("https://ws.audioscrobbler.com/2.0/", {
      params: {
        method: "user.getrecenttracks",
        user: SettingsService.get("LASTFM_USERNAME"),
        api_key: SettingsService.get("LASTFM_API_KEY"),
        format: "json",
        limit,
        page
      }
    });

    const recentTracks = response.data?.recenttracks;
    const tracks = recentTracks?.track || [];
    const attr = recentTracks?.["@attr"];

    const parsed = tracks
      .filter(t => !(page > 1 && t["@attr"]?.nowplaying))
      .map(t => ({
        track: t.name,
        artist: t.artist["#text"],
        image: t.image?.find(i => i.size === "extralarge")?.["#text"] ||
               t.image?.find(i => i.size === "large")?.["#text"] || null,
        nowPlaying: Boolean(t["@attr"]?.nowplaying),
        date: t.date ? Number(t.date.uts) * 1000 : null
      }));

    res.json({
      tracks: parsed,
      hasMore: page < Number(attr?.totalPages || 1)
    });

  } catch (err) {
    console.error("[recent-scrobbles ERROR]", err.response?.data || err.message);
    res.status(500).json({ error: "Failed to fetch recent scrobbles" });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Dashboard running in http://localhost:${PORT}`);
});