-- A local copy of the MyAnimeList catalog, filled by `npm run sync`
-- (scripts/sync-jikan.ts) from outside Cloudflare.
--
-- Jikan (like AniList) refuses or throttles requests from Cloudflare's shared
-- Worker IPs, so the Worker can't count on reaching it. When it can't, every
-- page falls back to this table: search, seasons, schedule, rankings, random,
-- and show pages.

create table catalog (
  mal_id        integer primary key,
  search        text not null,              -- every title variant, lowercased
  members       integer not null default 0,
  favorites     integer not null default 0,
  score         real,
  year          integer,
  season        text,                       -- winter | spring | summer | fall
  kind          text,                       -- TV, Movie, OVA, ONA, Special, ...
  status        text,                       -- Currently Airing | Finished Airing | Not yet aired
  airing        integer not null default 0,
  broadcast_day text,                       -- Mondays, Tuesdays, ...
  genres        text not null default '',   -- "|Action|Fantasy|Isekai|"
  start_date    text,
  body          text not null,              -- the Jikan anime object, trimmed
  updated_at    integer not null default (unixepoch())
);
create index catalog_members_idx on catalog (members desc);
create index catalog_score_idx on catalog (score desc);
create index catalog_season_idx on catalog (year, season);
create index catalog_airing_idx on catalog (airing, broadcast_day);
