-- /shh chats kept on the member's account so they follow them across devices. One row per chat, the whole chat saved as JSON in `body`.
-- `updated_at` is epoch milliseconds from the device that last changed it; the later one wins. A deleted chat stays as a tombstone
-- (deleted = 1, body emptied) until /api/warm sweeps it, so the member's other devices learn to drop their copy too.
create table if not exists shh_cloud_threads (
  user_id text not null references users(id) on delete cascade,
  id text not null,
  title text not null default 'new chat',
  updated_at integer not null,
  deleted integer not null default 0,
  body text not null default '[]',
  primary key (user_id, id)
);
create index if not exists shh_cloud_threads_user on shh_cloud_threads (user_id, updated_at desc);
