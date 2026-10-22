-- Manga reading progress: where each member left off in a title, so they can
-- tab out, swap devices, and pick the chapter + page back up.
create table manga_progress (
  user_id     text not null references users(id) on delete cascade,
  manga_id    text not null,
  chapter_id  text not null,
  chapter_num text not null default '',
  page        integer not null default 0,
  title       text not null default '',
  cover       text,
  updated_at  integer not null default (unixepoch()),
  primary key (user_id, manga_id)
);
create index manga_progress_user_idx on manga_progress (user_id, updated_at desc);
