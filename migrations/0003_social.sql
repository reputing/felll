-- Watch-experience social features: crowd-sourced skip markers, timeline
-- "moment" reactions, and airing-show follows for new-episode alerts.

-- Crowd-sourced intro/outro skip markers. One submission per member per
-- episode per kind; the API resolves them to a single marker by median.
create table skip_markers (
  mal_id     integer not null,
  episode    integer not null,
  kind       text not null check (kind in ('intro','outro')),
  user_id    text not null references users(id) on delete cascade,
  start_s    real not null,
  end_s      real not null,
  created_at integer not null default (unixepoch()),
  primary key (mal_id, episode, kind, user_id)
);
create index skip_markers_ep_idx on skip_markers (mal_id, episode, kind);

-- Reactions pinned to a second of an episode, drawn on the seek bar.
create table episode_moments (
  id         integer primary key autoincrement,
  mal_id     integer not null,
  episode    integer not null,
  user_id    text not null references users(id) on delete cascade,
  at_s       real not null,
  emoji      text not null,
  created_at integer not null default (unixepoch())
);
create index episode_moments_ep_idx on episode_moments (mal_id, episode);

-- Airing shows a member follows. last_ep is the highest episode we've already
-- alerted them about, so the cron notifies once per new episode.
create table show_follows (
  user_id    text not null references users(id) on delete cascade,
  mal_id     integer not null,
  last_ep    integer not null default 0,
  created_at integer not null default (unixepoch()),
  primary key (user_id, mal_id)
);
create index show_follows_mal_idx on show_follows (mal_id);
