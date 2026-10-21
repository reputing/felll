-- cupcake.gg on Cloudflare D1.
--
-- Anime metadata is not stored here: it comes from Jikan (MyAnimeList) and is
-- cached in jikan_cache. Everything keyed by an anime uses its MAL id.
-- Members are kuro accounts; users.id is the kuro (Supabase auth) uid.

-- ---------------------------------------------------------------------------
-- Members and sessions
-- ---------------------------------------------------------------------------

create table users (
  id            text primary key,              -- kuro uid
  handle        text not null unique collate nocase,
  display_name  text not null,
  avatar_url    text,
  banner_url    text,
  bio           text not null default '',
  pronouns      text not null default '',
  accent        text not null default '#e8679a',
  theme         text not null default 'midnight',
  status_text   text not null default '',      -- "rewatching bebop", shown on the profile
  showcase      text not null default '[]',    -- JSON array of up to 4 MAL ids
  is_plus       integer not null default 0,    -- kuro+ when they last signed in
  is_admin      integer not null default 0,
  private_lists integer not null default 0,
  created_at    integer not null default (unixepoch()),
  last_seen     integer not null default (unixepoch())
);

create table sessions (
  id          text primary key,                -- sha-256 of the cookie value
  user_id     text not null references users(id) on delete cascade,
  created_at  integer not null default (unixepoch()),
  expires_at  integer not null,
  user_agent  text not null default ''
);
create index sessions_user_idx on sessions (user_id);

-- One-time kuro sign-in codes that have been spent.
create table sso_burned (
  nonce       text primary key,
  expires_at  integer not null
);

-- ---------------------------------------------------------------------------
-- Library: saved / watching / completed, ratings and favourites
-- ---------------------------------------------------------------------------

create table library (
  user_id     text not null references users(id) on delete cascade,
  mal_id      integer not null,
  -- null = only rated or favourited, not on a list
  status      text check (status in ('watching','planning','completed','paused','dropped')),
  score       integer check (score between 1 and 10),
  favorite    integer not null default 0,
  progress    integer not null default 0,      -- episodes watched
  -- denormalised so lists and profiles render without hitting Jikan
  title       text not null,
  image       text,
  episodes    integer,
  kind        text,
  started_at  integer,
  finished_at integer,
  updated_at  integer not null default (unixepoch()),
  primary key (user_id, mal_id)
);
create index library_anime_idx on library (mal_id);
create index library_user_updated_idx on library (user_id, updated_at desc);

-- Resume points, one row per episode watched.
create table watch_progress (
  user_id     text not null references users(id) on delete cascade,
  mal_id      integer not null,
  episode     integer not null,
  position    real not null default 0,
  duration    real not null default 0,
  title       text not null,
  image       text,
  updated_at  integer not null default (unixepoch()),
  primary key (user_id, mal_id, episode)
);
create index watch_progress_recent_idx on watch_progress (user_id, updated_at desc);

-- ---------------------------------------------------------------------------
-- Comments (per anime, or per episode when episode is set)
-- ---------------------------------------------------------------------------

create table comments (
  id          integer primary key autoincrement,
  mal_id      integer not null,
  episode     integer,
  user_id     text not null references users(id) on delete cascade,
  parent_id   integer references comments(id) on delete cascade,
  body        text not null,
  spoiler     integer not null default 0,
  likes       integer not null default 0,
  created_at  integer not null default (unixepoch()),
  edited_at   integer,
  deleted     integer not null default 0
);
create index comments_thread_idx on comments (mal_id, episode, created_at desc);
create index comments_user_idx on comments (user_id, created_at desc);

create table comment_likes (
  comment_id  integer not null references comments(id) on delete cascade,
  user_id     text not null references users(id) on delete cascade,
  primary key (comment_id, user_id)
);

-- Quick one-tap reactions under an episode.
create table episode_reactions (
  mal_id      integer not null,
  episode     integer not null,
  user_id     text not null references users(id) on delete cascade,
  emoji       text not null,
  primary key (mal_id, episode, user_id)
);

-- ---------------------------------------------------------------------------
-- Social
-- ---------------------------------------------------------------------------

create table follows (
  follower_id text not null references users(id) on delete cascade,
  followee_id text not null references users(id) on delete cascade,
  created_at  integer not null default (unixepoch()),
  primary key (follower_id, followee_id)
);
create index follows_followee_idx on follows (followee_id);

-- What members did, for the feed and profile timelines.
create table activity (
  id          integer primary key autoincrement,
  user_id     text not null references users(id) on delete cascade,
  kind        text not null,      -- status | rated | favorite | comment | finished_episode | follow
  mal_id      integer,
  episode     integer,
  title       text,
  image       text,
  detail      text,               -- status name, score, comment excerpt, followed handle
  created_at  integer not null default (unixepoch())
);
create index activity_user_idx on activity (user_id, created_at desc);
create index activity_recent_idx on activity (created_at desc);

create table notifications (
  id          integer primary key autoincrement,
  user_id     text not null references users(id) on delete cascade,
  actor_id    text references users(id) on delete cascade,
  kind        text not null,      -- reply | like | follow | request_filled
  mal_id      integer,
  episode     integer,
  comment_id  integer,
  text        text not null default '',
  read        integer not null default 0,
  created_at  integer not null default (unixepoch())
);
create index notifications_user_idx on notifications (user_id, read, created_at desc);

-- Who is online, and what they are watching. A heartbeat every 30s.
create table presence (
  user_id     text primary key references users(id) on delete cascade,
  path        text not null default '/',
  mal_id      integer,
  episode     integer,
  title       text,
  updated_at  integer not null default (unixepoch())
);
create index presence_recent_idx on presence (updated_at desc);

-- Members asking for a show to be added to the vault, with votes.
create table requests (
  mal_id      integer primary key,
  title       text not null,
  image       text,
  requested_by text not null references users(id) on delete cascade,
  votes       integer not null default 1,
  status      text not null default 'open' check (status in ('open','filled','declined')),
  created_at  integer not null default (unixepoch())
);
create table request_votes (
  mal_id      integer not null references requests(mal_id) on delete cascade,
  user_id     text not null references users(id) on delete cascade,
  primary key (mal_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Video: episodes you hold the rights to, and where they play from
-- ---------------------------------------------------------------------------

create table episodes (
  id               integer primary key autoincrement,
  mal_id           integer not null,
  number           real not null,
  title            text,
  thumbnail_url    text,
  duration_seconds integer,
  intro_start      integer,
  intro_end        integer,
  outro_start      integer,
  created_at       integer not null default (unixepoch()),
  unique (mal_id, number)
);

create table video_sources (
  id           integer primary key autoincrement,
  episode_id   integer not null references episodes(id) on delete cascade,
  provider     text not null check (provider in ('cloudflare_stream','hls_url')),
  label        text not null default 'Main',
  audio        text not null default 'sub' check (audio in ('sub','dub','raw')),
  stream_uid   text,
  hls_url      text,
  status       text not null default 'pending' check (status in ('pending','ready','error')),
  priority     integer not null default 0,
  created_at   integer not null default (unixepoch()),
  check ((provider = 'cloudflare_stream' and stream_uid is not null)
      or (provider = 'hls_url' and hls_url is not null))
);
create index video_sources_episode_idx on video_sources (episode_id, priority);

create table subtitles (
  id          integer primary key autoincrement,
  episode_id  integer not null references episodes(id) on delete cascade,
  language    text not null,
  label       text not null,
  url         text not null,
  is_default  integer not null default 0
);

-- Daily plays, for "popular on cupcake".
create table daily_views (
  mal_id  integer not null,
  day     text not null,              -- YYYY-MM-DD (UTC)
  views   integer not null default 0,
  title   text,
  image   text,
  primary key (mal_id, day)
);

-- ---------------------------------------------------------------------------
-- Jikan response cache: survives Jikan outages and rate limits.
-- ---------------------------------------------------------------------------

create table jikan_cache (
  key         text primary key,       -- request path + query
  body        text not null,
  fetched_at  integer not null
);
