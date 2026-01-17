const Database = require("better-sqlite3");
const path = require("path");

const db = new Database(path.join(__dirname, "../data/stats.db"));

// Enable WAL mode for better concurrency (readers don't block writers)
db.pragma('journal_mode = WAL');

const MIGRATIONS = [
  // Version 1: Initial Schema
  `
  CREATE TABLE IF NOT EXISTS scrobbles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    artist TEXT NOT NULL,
    track TEXT NOT NULL,
    album TEXT,
    album_image TEXT,
    played_at INTEGER NOT NULL,
    UNIQUE(artist, track, played_at)
  );
  CREATE TABLE IF NOT EXISTS artists (
    artist TEXT PRIMARY KEY,
    artist_image TEXT,
    updated_at INTEGER
  );
  `,
  // Version 2: Ensure album_image column exists (for existing DBs from before v1 was cleaner)
  `
  ALTER TABLE scrobbles ADD COLUMN album_image TEXT;
  `
];

// Handle migration for adding album_image if it already exists (idempotency check for v2)
// Since SQLite doesn't support IF NOT EXISTS for ADD COLUMN easily in a single statement without error,
// we process migrations carefully.

const migrate = () => {
  const currentVersion = db.pragma('user_version', { simple: true });
  console.log(`[DB] Current version: ${currentVersion}`);

  for (let v = 0; v < MIGRATIONS.length; v++) {
    const version = v + 1;
    if (currentVersion < version) {
      console.log(`[DB] Applying migration v${version}...`);
      
      const migrationSql = MIGRATIONS[v];
      
      // Special handling for V2 if needed, but better-sqlite3 throws if column exists.
      // However, our previous code was loose.
      // Let's wrap in transaction.
      
      try {
        db.transaction(() => {
           // For specific migrations that might fail if already applied (like V2 which was blindly run in try-catch before),
           // we can check schema.
           if (version === 2) {
             const colInfo = db.prepare("PRAGMA table_info(scrobbles)").all();
             if (colInfo.some(c => c.name === 'album_image')) {
               console.log("[DB] Skipping V2: column album_image already exists.");
               return; 
             }
           }
           
           db.exec(migrationSql);
           db.pragma(`user_version = ${version}`);
        })();
        console.log(`[DB] Migration v${version} applied.`);
      } catch (err) {
        console.error(`[DB] Migration v${version} failed:`, err);
        process.exit(1);
      }
    }
  }
};

migrate();

module.exports = db;
