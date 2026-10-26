-- Time spent on the site, for the leaderboard. Accrued from the 30s presence
-- heartbeat and bucketed by UTC day, so a rolling window can be summed. Each
-- heartbeat credits the gap since the user's last one, capped (see /api/presence)
-- so a reopened or long-idle tab can't inflate it.
create table time_spent (
  user_id  text not null references users(id) on delete cascade,
  day      text not null,              -- 'YYYY-MM-DD' (UTC)
  seconds  integer not null default 0,
  primary key (user_id, day)
);
create index time_spent_day_idx on time_spent (day);
