-- /shh clipboard box: text a member pastes once and copies back with one tap, kept on their account so it follows them across devices.
create table if not exists shh_clips (
  user_id text not null references users(id) on delete cascade,
  id text not null,
  title text not null default '',
  body text not null,
  updated_at integer not null,
  primary key (user_id, id)
);
create index if not exists shh_clips_user on shh_clips (user_id, updated_at desc);
