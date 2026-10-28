-- Co-work: shared /shh sessions two or more members can be in at once, working
-- a project with the AI together. The transcript lives server-side so everyone
-- in the room sees the same thing (synced by polling, since Realtime is dead
-- behind the Cloudflare proxy). The room owner's /shh instructions + files act
-- as the shared project context.
create table if not exists shh_rooms (
  id         text primary key,
  owner_id   text not null references users(id) on delete cascade,
  title      text not null default 'project',
  created_at integer not null default (unixepoch())
);

create table if not exists shh_room_msgs (
  id         integer primary key autoincrement,
  room_id    text not null references shh_rooms(id) on delete cascade,
  user_id    text,
  handle     text,            -- who said it (null for the assistant)
  role       text not null,   -- 'user' | 'assistant'
  content    text not null default '',
  steps      text,            -- json of tool steps for an assistant turn
  created_at integer not null default (unixepoch())
);
create index if not exists shh_room_msgs_idx on shh_room_msgs (room_id, id);

create table if not exists shh_room_members (
  room_id   text not null,
  user_id   text not null,
  handle    text,
  last_seen integer not null default (unixepoch()),
  primary key (room_id, user_id)
);
