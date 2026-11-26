-- Movies and series: the same things anime and manga have (a list with a status, favourites, a rating, continue watching,
-- episode history and comments), keyed by IMDb id (tt0111161) because that is what the catalog uses.
--
-- movie_library: the equivalent of `library`. One row per title a member has saved, rated or favourited.
create table if not exists movie_library (
  user_id     text not null references users(id) on delete cascade,
  imdb_id     text not null,
  media       text not null check (media in ('movie','tv')),
  status      text check (status in ('watching','planning','completed','paused','dropped')),
  score       integer check (score between 1 and 10),
  favorite    integer not null default 0,
  progress    integer not null default 0,        -- episodes watched (series)
  -- denormalised so lists and profiles render without asking the catalog
  title       text not null,
  poster      text,
  year        integer,
  episodes    integer,                           -- total aired episodes, when known
  started_at  integer,
  finished_at integer,
  updated_at  integer not null default (unixepoch()),
  primary key (user_id, imdb_id)
);
create index if not exists movie_library_user_idx on movie_library (user_id, updated_at desc);
create index if not exists movie_library_title_idx on movie_library (imdb_id);

-- movie_progress: the equivalent of `watch_progress`. One row per film, or per episode of a series (season 0, episode 0
-- stands for a film). `watched` is set once 90% is played or the member says so; position/duration are seconds and only
-- known when the player reports them.
create table if not exists movie_progress (
  user_id    text not null references users(id) on delete cascade,
  imdb_id    text not null,
  season     integer not null default 0,
  episode    integer not null default 0,
  media      text not null check (media in ('movie','tv')),
  position   real not null default 0,
  duration   real not null default 0,
  watched    integer not null default 0,
  title      text not null,
  poster     text,
  year       integer,
  ep_title   text,
  updated_at integer not null default (unixepoch()),
  primary key (user_id, imdb_id, season, episode)
);
create index if not exists movie_progress_recent_idx on movie_progress (user_id, updated_at desc);

-- movie_comments: threaded one level, with likes, like manga_comments. season/episode are 0 for a thread on the title
-- itself and set for an episode's own thread.
create table if not exists movie_comments (
  id         integer primary key autoincrement,
  imdb_id    text not null,
  season     integer not null default 0,
  episode    integer not null default 0,
  user_id    text not null references users(id) on delete cascade,
  parent_id  integer references movie_comments(id) on delete cascade,
  body       text not null,
  spoiler    integer not null default 0,
  likes      integer not null default 0,
  created_at integer not null default (unixepoch()),
  edited_at  integer,
  deleted    integer not null default 0
);
create index if not exists movie_comments_thread_idx on movie_comments (imdb_id, season, episode, created_at desc);
create index if not exists movie_comments_user_idx on movie_comments (user_id, created_at desc);

create table if not exists movie_comment_likes (
  comment_id integer not null references movie_comments(id) on delete cascade,
  user_id    text not null references users(id) on delete cascade,
  primary key (comment_id, user_id)
);
