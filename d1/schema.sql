-- Cupcake catalog on Cloudflare D1 (SQLite). Port of the former Supabase
-- Postgres schema: catalog, episodes, self-hosted video sources, view counters
-- and the search engine. Arrays are stored as JSON text; booleans as 0/1;
-- timestamps as ISO-8601 text.
--
-- Apply with:
--   wrangler d1 execute cupcake --remote --file d1/schema.sql
--   wrangler d1 execute cupcake --local  --file d1/schema.sql   (for `next dev`)

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS anime (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  -- "<title-slug>-<6 char id>", e.g. "frieren-beyond-journeys-end-k3x9qa".
  slug               TEXT NOT NULL UNIQUE,
  anilist_id         INTEGER UNIQUE,
  mal_id             INTEGER,
  title_english      TEXT,
  title_romaji       TEXT NOT NULL,
  title_native       TEXT,
  synonyms           TEXT NOT NULL DEFAULT '[]',   -- JSON array
  description        TEXT,
  format             TEXT CHECK (format IN ('TV','TV_SHORT','MOVIE','SPECIAL','OVA','ONA','MUSIC')),
  status             TEXT CHECK (status IN ('FINISHED','RELEASING','NOT_YET_RELEASED','CANCELLED','HIATUS')),
  season             TEXT CHECK (season IN ('WINTER','SPRING','SUMMER','FALL')),
  season_year        INTEGER,
  country_of_origin  TEXT,
  age_rating         TEXT CHECK (age_rating IN ('G','PG','PG-13','R','R+','Rx')),
  is_adult           INTEGER NOT NULL DEFAULT 0,
  episodes_total     INTEGER,
  duration_minutes   INTEGER,
  genres             TEXT NOT NULL DEFAULT '[]',    -- JSON array
  tags               TEXT NOT NULL DEFAULT '[]',    -- JSON array
  studios            TEXT NOT NULL DEFAULT '[]',    -- JSON array
  characters         TEXT NOT NULL DEFAULT '[]',    -- JSON array
  staff              TEXT NOT NULL DEFAULT '[]',    -- JSON array
  cover_url          TEXT,
  banner_url         TEXT,
  color              TEXT,
  trailer_youtube_id TEXT,
  average_score      INTEGER,
  popularity         INTEGER NOT NULL DEFAULT 0,
  anilist_trending   INTEGER NOT NULL DEFAULT 0,
  next_episode       INTEGER,
  next_episode_at    TEXT,
  -- Maintained from your own uploads by the video_sources triggers.
  sub_episodes       INTEGER NOT NULL DEFAULT 0,
  dub_episodes       INTEGER NOT NULL DEFAULT 0,
  latest_episode_at  TEXT,
  is_published       INTEGER NOT NULL DEFAULT 1,
  -- Every title variant, lowercased, space-joined — indexed by anime_fts for
  -- trigram (typo-tolerant, substring) matching. Set by the sync script.
  search_titles      TEXT NOT NULL DEFAULT '',
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS anime_popularity_idx    ON anime (popularity DESC);
CREATE INDEX IF NOT EXISTS anime_score_idx         ON anime (average_score DESC);
CREATE INDEX IF NOT EXISTS anime_season_idx        ON anime (season_year DESC, season);
CREATE INDEX IF NOT EXISTS anime_next_episode_idx  ON anime (next_episode_at);
CREATE INDEX IF NOT EXISTS anime_latest_ep_idx     ON anime (latest_episode_at DESC);

-- Full-text / trigram index over the title variants. A plain (self-contained)
-- FTS5 table so ordinary INSERT/UPDATE/DELETE work from triggers. The trigram
-- tokenizer gives substring and typo-tolerant matching ("naurto" → "Naruto").
CREATE VIRTUAL TABLE IF NOT EXISTS anime_fts USING fts5(text, tokenize = 'trigram');

CREATE TRIGGER IF NOT EXISTS anime_fts_ai AFTER INSERT ON anime BEGIN
  INSERT INTO anime_fts (rowid, text) VALUES (NEW.id, NEW.search_titles);
END;
CREATE TRIGGER IF NOT EXISTS anime_fts_au AFTER UPDATE OF search_titles ON anime BEGIN
  DELETE FROM anime_fts WHERE rowid = OLD.id;
  INSERT INTO anime_fts (rowid, text) VALUES (NEW.id, NEW.search_titles);
END;
CREATE TRIGGER IF NOT EXISTS anime_fts_ad AFTER DELETE ON anime BEGIN
  DELETE FROM anime_fts WHERE rowid = OLD.id;
END;

-- ---------------------------------------------------------------------------
-- Episodes and the video sources ("servers") that can play them
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS episodes (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  anime_id         INTEGER NOT NULL REFERENCES anime(id) ON DELETE CASCADE,
  number           REAL NOT NULL,
  title            TEXT,
  synopsis         TEXT,
  thumbnail_url    TEXT,
  duration_seconds INTEGER,
  intro_start      INTEGER,
  intro_end        INTEGER,
  outro_start      INTEGER,
  is_filler        INTEGER NOT NULL DEFAULT 0,
  is_published     INTEGER NOT NULL DEFAULT 1,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (anime_id, number)
);

CREATE TABLE IF NOT EXISTS video_sources (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  episode_id  INTEGER NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  provider    TEXT NOT NULL CHECK (provider IN ('cloudflare_stream','hls_url')),
  label       TEXT NOT NULL DEFAULT 'Main',
  audio       TEXT NOT NULL DEFAULT 'sub' CHECK (audio IN ('sub','dub','raw')),
  stream_uid  TEXT,
  hls_url     TEXT,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','ready','error')),
  priority    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK ((provider = 'cloudflare_stream' AND stream_uid IS NOT NULL)
      OR (provider = 'hls_url' AND hls_url IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS video_sources_episode_idx ON video_sources (episode_id, priority);

CREATE TABLE IF NOT EXISTS subtitles (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  episode_id  INTEGER NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  language    TEXT NOT NULL,
  label       TEXT NOT NULL,
  url         TEXT NOT NULL,
  is_default  INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS subtitles_episode_idx ON subtitles (episode_id);

-- Keep anime.sub_episodes / dub_episodes / latest_episode_at in step with the
-- playable sources, so cards and the Audio filter need no joins. SQLite can't
-- call a shared function from a trigger, so each trigger recomputes inline for
-- the affected anime.
CREATE TRIGGER IF NOT EXISTS video_sources_ai AFTER INSERT ON video_sources BEGIN
  UPDATE anime SET
    sub_episodes = (SELECT COUNT(DISTINCT e.id) FROM episodes e JOIN video_sources s ON s.episode_id = e.id
                    WHERE e.anime_id = anime.id AND e.is_published = 1 AND s.status = 'ready' AND s.audio IN ('sub','raw')),
    dub_episodes = (SELECT COUNT(DISTINCT e.id) FROM episodes e JOIN video_sources s ON s.episode_id = e.id
                    WHERE e.anime_id = anime.id AND e.is_published = 1 AND s.status = 'ready' AND s.audio = 'dub'),
    latest_episode_at = (SELECT MAX(s.created_at) FROM episodes e JOIN video_sources s ON s.episode_id = e.id
                    WHERE e.anime_id = anime.id AND e.is_published = 1 AND s.status = 'ready')
  WHERE anime.id = (SELECT anime_id FROM episodes WHERE id = NEW.episode_id);
END;

CREATE TRIGGER IF NOT EXISTS video_sources_au AFTER UPDATE ON video_sources BEGIN
  UPDATE anime SET
    sub_episodes = (SELECT COUNT(DISTINCT e.id) FROM episodes e JOIN video_sources s ON s.episode_id = e.id
                    WHERE e.anime_id = anime.id AND e.is_published = 1 AND s.status = 'ready' AND s.audio IN ('sub','raw')),
    dub_episodes = (SELECT COUNT(DISTINCT e.id) FROM episodes e JOIN video_sources s ON s.episode_id = e.id
                    WHERE e.anime_id = anime.id AND e.is_published = 1 AND s.status = 'ready' AND s.audio = 'dub'),
    latest_episode_at = (SELECT MAX(s.created_at) FROM episodes e JOIN video_sources s ON s.episode_id = e.id
                    WHERE e.anime_id = anime.id AND e.is_published = 1 AND s.status = 'ready')
  WHERE anime.id = (SELECT anime_id FROM episodes WHERE id = NEW.episode_id);
END;

CREATE TRIGGER IF NOT EXISTS video_sources_ad AFTER DELETE ON video_sources BEGIN
  UPDATE anime SET
    sub_episodes = (SELECT COUNT(DISTINCT e.id) FROM episodes e JOIN video_sources s ON s.episode_id = e.id
                    WHERE e.anime_id = anime.id AND e.is_published = 1 AND s.status = 'ready' AND s.audio IN ('sub','raw')),
    dub_episodes = (SELECT COUNT(DISTINCT e.id) FROM episodes e JOIN video_sources s ON s.episode_id = e.id
                    WHERE e.anime_id = anime.id AND e.is_published = 1 AND s.status = 'ready' AND s.audio = 'dub'),
    latest_episode_at = (SELECT MAX(s.created_at) FROM episodes e JOIN video_sources s ON s.episode_id = e.id
                    WHERE e.anime_id = anime.id AND e.is_published = 1 AND s.status = 'ready')
  WHERE anime.id = (SELECT anime_id FROM episodes WHERE id = OLD.episode_id);
END;

-- ---------------------------------------------------------------------------
-- View counters for "trending"
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS anime_daily_views (
  anime_id INTEGER NOT NULL REFERENCES anime(id) ON DELETE CASCADE,
  day      TEXT NOT NULL DEFAULT (date('now')),
  views    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (anime_id, day)
);
