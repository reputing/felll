-- Subtitle files members upload for an episode, kept on their account so they are waiting on
-- every device ("on standby"). key is "a:<mal id>:<episode>" for anime, "m:<slug>" for movies and shows. body is the file as uploaded
-- (SRT, VTT or ASS); the player parses it. One file per member per episode.
create table if not exists user_subs (
  user_id    text not null references users(id) on delete cascade,
  key        text not null,
  name       text not null,
  body       text not null,
  updated_at integer not null default (unixepoch()),
  primary key (user_id, key)
);
