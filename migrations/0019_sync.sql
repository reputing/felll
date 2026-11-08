-- Syncing with AniList, and rewatching.
--
-- sync_links: one row per member who linked an AniList account. `token` is optional: with a
-- username alone we can only read their (public) list; with a personal access token we also
-- write progress back. last_pull / last_push are unix seconds.
create table if not exists sync_links (
  user_id    text primary key references users(id) on delete cascade,
  provider   text not null default 'anilist',
  username   text not null,
  token      text,
  last_pull  integer,
  last_push  integer,
  note       text
);

-- Manga tracked on AniList. Our own manga ids are MangaDex uuids, which an AniList list does
-- not have, so these are kept apart and resolved to a MangaDex title when opened.
create table if not exists manga_tracked (
  user_id    text not null references users(id) on delete cascade,
  anilist_id integer not null,
  title      text not null,
  cover      text,
  status     text,
  progress   integer not null default 0,   -- chapters read
  updated_at integer not null default (unixepoch()),
  primary key (user_id, anilist_id)
);
create index if not exists manga_tracked_user_idx on manga_tracked (user_id, updated_at desc);

-- Watching an episode of something already completed marks it as a rewatch; finishing the last
-- episode again counts it and clears the flag.
alter table library add column rewatching integer not null default 0;
alter table library add column rewatches integer not null default 0;
