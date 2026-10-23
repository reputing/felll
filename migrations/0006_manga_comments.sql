-- Comments on a manga title (manga uses MangaDex UUID ids, so it can't share
-- the integer-keyed anime `comments` table). Threaded one level, with likes.
create table manga_comments (
  id         integer primary key autoincrement,
  manga_id   text not null,
  user_id    text not null references users(id) on delete cascade,
  parent_id  integer references manga_comments(id) on delete cascade,
  body       text not null,
  spoiler    integer not null default 0,
  likes      integer not null default 0,
  created_at integer not null default (unixepoch()),
  edited_at  integer,
  deleted    integer not null default 0
);
create index manga_comments_thread_idx on manga_comments (manga_id, created_at desc);
create index manga_comments_user_idx on manga_comments (user_id, created_at desc);

create table manga_comment_likes (
  comment_id integer not null references manga_comments(id) on delete cascade,
  user_id    text not null references users(id) on delete cascade,
  primary key (comment_id, user_id)
);
