-- Manga library: a member's saved manga — the manga equivalent of `library`.
-- MangaDex ids are UUID strings, so this can't share the anime `library` table.
create table manga_library (
  user_id    text not null references users(id) on delete cascade,
  manga_id   text not null,
  status     text check (status in ('reading','planning','completed','paused','dropped')),
  favorite   integer not null default 0,
  title      text not null default '',
  cover      text,
  updated_at integer not null default (unixepoch()),
  primary key (user_id, manga_id)
);
create index manga_library_user_idx on manga_library (user_id, updated_at desc);
