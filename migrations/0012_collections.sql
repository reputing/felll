-- Member-curated lists ("collections") that mix anime and manga. Public ones
-- show on the member's profile and at /collections/<id>; private ones are owner
-- only. Items reference an anime by MAL id or a manga by its MangaDex uuid, with
-- a denormalised title/cover so a card renders without a live lookup.
create table collections (
  id         text primary key,
  user_id    text not null references users(id) on delete cascade,
  name       text not null,
  visibility text not null default 'public',   -- 'public' | 'private'
  created_at integer not null default (unixepoch()),
  updated_at integer not null default (unixepoch())
);
create index collections_user_idx on collections (user_id, updated_at desc);

create table collection_items (
  collection_id text not null references collections(id) on delete cascade,
  kind          text not null,                 -- 'anime' | 'manga'
  ref_id        text not null,                 -- MAL id (anime) or MangaDex uuid (manga)
  title         text not null default '',
  cover         text,                          -- image url
  added_at      integer not null default (unixepoch()),
  primary key (collection_id, kind, ref_id)
);
create index collection_items_coll_idx on collection_items (collection_id, added_at desc);
