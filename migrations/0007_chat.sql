-- One global chat room every member can talk in. Kept small (the warm cron
-- trims it to the most recent messages); it's a live lounge, not an archive.
create table chat_messages (
  id         integer primary key autoincrement,
  user_id    text not null references users(id) on delete cascade,
  body       text not null,
  created_at integer not null default (unixepoch())
);
create index chat_messages_id_idx on chat_messages (id desc);
