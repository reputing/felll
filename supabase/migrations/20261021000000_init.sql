-- Catalog, episodes, video sources, view counters and the search engine.
--
-- The catalog mirrors AniList's Media model (plus MyAnimeList's age rating),
-- so every AniList title can be listed and filtered even before you have
-- uploaded episodes for it. Playback availability (sub/dub counts) comes only
-- from your own video_sources.

create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------------

create table public.anime (
  id                  bigint generated always as identity primary key,
  -- "<title-slug>-<6 char id>", e.g. "frieren-beyond-journeys-end-k3x9qa".
  slug                text not null unique,
  anilist_id          integer unique,
  mal_id              integer,
  title_english       text,
  title_romaji        text not null,
  title_native        text,
  synonyms            text[] not null default '{}',
  description         text,
  format              text check (format in ('TV','TV_SHORT','MOVIE','SPECIAL','OVA','ONA','MUSIC')),
  status              text check (status in ('FINISHED','RELEASING','NOT_YET_RELEASED','CANCELLED','HIATUS')),
  season              text check (season in ('WINTER','SPRING','SUMMER','FALL')),
  season_year         integer,
  country_of_origin   text,
  age_rating          text check (age_rating in ('G','PG','PG-13','R','R+','Rx')),
  is_adult            boolean not null default false,
  episodes_total      integer,
  duration_minutes    integer,
  genres              text[] not null default '{}',
  tags                text[] not null default '{}',
  studios             text[] not null default '{}',
  characters          text[] not null default '{}',
  staff               text[] not null default '{}',
  cover_url           text,
  banner_url          text,
  color               text,
  trailer_youtube_id  text,
  average_score       integer,
  popularity          integer not null default 0,
  anilist_trending    integer not null default 0,
  next_episode        integer,
  next_episode_at     timestamptz,
  -- Maintained from your own uploads by refresh_episode_counts().
  sub_episodes        integer not null default 0,
  dub_episodes        integer not null default 0,
  latest_episode_at   timestamptz,
  is_published        boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  -- Maintained by anime_search_fields(): every title variant, lowercased,
  -- for trigram (typo-tolerant) matching.
  search_titles       text not null default '',
  -- Maintained by anime_search_fields(): weighted full-text document.
  search_vector       tsvector not null default ''::tsvector
);

create index anime_search_vector_idx on public.anime using gin (search_vector);
create index anime_search_titles_trgm_idx on public.anime using gin (search_titles gin_trgm_ops);
create index anime_genres_idx on public.anime using gin (genres);
create index anime_tags_idx on public.anime using gin (tags);
create index anime_studios_idx on public.anime using gin (studios);
create index anime_popularity_idx on public.anime (popularity desc);
create index anime_score_idx on public.anime (average_score desc nulls last);
create index anime_season_idx on public.anime (season_year desc, season);
create index anime_next_episode_idx on public.anime (next_episode_at) where next_episode_at is not null;
create index anime_latest_episode_idx on public.anime (latest_episode_at desc) where latest_episode_at is not null;

create function public.anime_search_fields() returns trigger
language plpgsql as $$
declare
  titles text := concat_ws(' ',
    new.title_english, new.title_romaji, new.title_native,
    array_to_string(new.synonyms, ' '));
begin
  new.search_titles := lower(titles);
  new.search_vector :=
    setweight(to_tsvector('simple', coalesce(new.title_english, '') || ' ' || new.title_romaji), 'A') ||
    setweight(to_tsvector('simple', coalesce(new.title_native, '')), 'A') ||
    setweight(to_tsvector('simple', array_to_string(new.synonyms, ' ')), 'B') ||
    setweight(to_tsvector('simple', array_to_string(new.studios || new.characters, ' ')), 'C') ||
    setweight(to_tsvector('english', coalesce(new.description, '')), 'D');
  new.updated_at := now();
  return new;
end;
$$;

create trigger anime_search_fields
before insert or update on public.anime
for each row execute function public.anime_search_fields();

-- ---------------------------------------------------------------------------
-- Episodes and the video sources ("servers") that can play them
-- ---------------------------------------------------------------------------

create table public.episodes (
  id               bigint generated always as identity primary key,
  anime_id         bigint not null references public.anime(id) on delete cascade,
  number           numeric(6,1) not null,
  title            text,
  synopsis         text,
  thumbnail_url    text,
  duration_seconds integer,
  -- Skip intro/outro buttons, in seconds from the start.
  intro_start      integer,
  intro_end        integer,
  outro_start      integer,
  is_filler        boolean not null default false,
  is_published     boolean not null default true,
  created_at       timestamptz not null default now(),
  unique (anime_id, number)
);

-- One episode can have several sources: different hosts (failover), or
-- different audio tracks (sub/dub). The player lists them as servers and
-- tries them in priority order.
create table public.video_sources (
  id           bigint generated always as identity primary key,
  episode_id   bigint not null references public.episodes(id) on delete cascade,
  provider     text not null check (provider in ('cloudflare_stream','hls_url')),
  label        text not null default 'Main',
  audio        text not null default 'sub' check (audio in ('sub','dub','raw')),
  -- Cloudflare Stream video UID, or null for hls_url.
  stream_uid   text,
  -- R2-hosted (or other self-hosted) .m3u8, or null for cloudflare_stream.
  hls_url      text,
  status       text not null default 'pending' check (status in ('pending','ready','error')),
  priority     integer not null default 0,
  created_at   timestamptz not null default now(),
  check ((provider = 'cloudflare_stream' and stream_uid is not null)
      or (provider = 'hls_url' and hls_url is not null))
);

create index video_sources_episode_idx on public.video_sources (episode_id, priority);

-- Subtitle tracks (WebVTT) for an episode.
create table public.subtitles (
  id          bigint generated always as identity primary key,
  episode_id  bigint not null references public.episodes(id) on delete cascade,
  language    text not null,
  label       text not null,
  url         text not null,
  is_default  boolean not null default false
);

-- Keeps anime.sub_episodes / dub_episodes / latest_episode_at in step with
-- the playable sources, so cards and the Audio filter need no joins.
create function public.refresh_episode_counts(p_anime_id bigint) returns void
language sql security definer set search_path = public as $$
  update anime a set
    sub_episodes = c.sub, dub_episodes = c.dub, latest_episode_at = c.latest
  from (
    select count(distinct e.id) filter (where s.audio in ('sub','raw')) as sub,
           count(distinct e.id) filter (where s.audio = 'dub') as dub,
           max(s.created_at) as latest
    from episodes e
    join video_sources s on s.episode_id = e.id and s.status = 'ready'
    where e.anime_id = p_anime_id and e.is_published
  ) c
  where a.id = p_anime_id;
$$;

create function public.video_sources_changed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform refresh_episode_counts(e.anime_id)
  from episodes e
  where e.id in (coalesce(new.episode_id, old.episode_id), coalesce(old.episode_id, new.episode_id));
  return null;
end;
$$;

create trigger video_sources_changed
after insert or update or delete on public.video_sources
for each row execute function public.video_sources_changed();

create function public.episodes_changed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform refresh_episode_counts(coalesce(new.anime_id, old.anime_id));
  return null;
end;
$$;

create trigger episodes_changed
after update of is_published or delete on public.episodes
for each row execute function public.episodes_changed();

-- ---------------------------------------------------------------------------
-- View counters for "trending"
-- ---------------------------------------------------------------------------

create table public.anime_daily_views (
  anime_id bigint not null references public.anime(id) on delete cascade,
  day      date not null default current_date,
  views    integer not null default 0,
  primary key (anime_id, day)
);

create function public.record_view(p_anime_id bigint) returns void
language sql security definer set search_path = public as $$
  insert into anime_daily_views (anime_id, day, views)
  select p_anime_id, current_date, 1
  where exists (select 1 from anime where id = p_anime_id and is_published)
  on conflict (anime_id, day) do update set views = anime_daily_views.views + 1;
$$;

-- Your own views over the last 14 days, each day worth 85% of the next,
-- plus AniList's trending number so a new site isn't empty on day one.
create view public.anime_trending with (security_invoker = true) as
select a.id as anime_id,
       coalesce(v.score, 0) * 10 + a.anilist_trending as score
from public.anime a
left join (
  select anime_id, sum(views * power(0.85, current_date - day))::real as score
  from public.anime_daily_views
  where day > current_date - 14
  group by anime_id
) v on v.anime_id = a.id;

-- ---------------------------------------------------------------------------
-- Search
-- ---------------------------------------------------------------------------
--
-- Relevance blends four signals:
--   * full-text rank (titles weighted far above description)
--   * trigram word similarity, so typos and partial titles still match
--   * a prefix bonus, so "jujutsu" ranks "Jujutsu Kaisen" first while typing
--   * a small log-scaled popularity boost to break ties
-- With no query, the default order is popularity, like an AniList browse.

create function public.search_anime(
  q            text    default null,
  p_genres     text[]  default null,
  p_tags       text[]  default null,
  p_year       integer default null,
  p_season     text    default null,
  p_format     text    default null,
  p_status     text    default null,
  p_origin     text    default null,
  p_audio      text    default null,
  p_rating     text    default null,
  p_studio     text    default null,
  p_character  text    default null,
  p_staff      text    default null,
  p_sort       text    default null,
  p_page       integer default 1,
  p_page_size  integer default 24
) returns table (
  id bigint, slug text, title_english text, title_romaji text,
  format text, status text, season_year integer, age_rating text,
  episodes_total integer, duration_minutes integer, genres text[],
  cover_url text, color text, average_score integer, popularity integer,
  sub_episodes integer, dub_episodes integer,
  rank real, total_count bigint
)
language sql stable
set search_path = public
-- 0.6 by default; 0.3 still matches swapped or dropped letters ("fireren").
-- Weak matches sort to the bottom because relevance includes the similarity.
set pg_trgm.word_similarity_threshold = 0.3
as $$
  with params as (
    select nullif(trim(lower(q)), '') as term,
           case when nullif(trim(q), '') is null then null
                else websearch_to_tsquery('simple', q) end as tsq,
           coalesce(nullif(p_sort, ''),
                    case when nullif(trim(q), '') is null then 'popularity' else 'relevance' end) as sort
  ),
  matches as (
    select a.*, p.sort,
           case when p.term is null then 0 else
             ts_rank_cd(a.search_vector, p.tsq, 1) * 2
             + word_similarity(p.term, a.search_titles) * 3
             + case when a.search_titles like p.term || '%'
                      or a.search_titles like '% ' || p.term || '%' then 1 else 0 end
           end
           + ln(1 + a.popularity) / 40 as relevance
    from anime a
    cross join params p
    where a.is_published
      and not a.is_adult
      and (p.term is null
           or a.search_vector @@ p.tsq
           or p.term <% a.search_titles
           or a.search_titles like '%' || p.term || '%')
      and (p_genres is null or a.genres @> p_genres)
      and (p_tags   is null or a.tags @> p_tags)
      and (p_year   is null or a.season_year = p_year)
      and (p_season is null or a.season = p_season)
      and (p_format is null or a.format = p_format)
      and (p_status is null or a.status = p_status)
      and (p_origin is null or a.country_of_origin = p_origin)
      and (p_rating is null or a.age_rating = p_rating)
      and (p_audio  is null
           or (p_audio = 'sub'  and a.sub_episodes > 0)
           or (p_audio = 'dub'  and a.dub_episodes > 0)
           or (p_audio = 'both' and a.sub_episodes > 0 and a.dub_episodes > 0))
      and (p_studio    is null or exists (select 1 from unnest(a.studios) x where x ilike p_studio || '%'))
      and (p_character is null or exists (select 1 from unnest(a.characters) x where x ilike '%' || p_character || '%'))
      and (p_staff     is null or exists (select 1 from unnest(a.staff) x where x ilike '%' || p_staff || '%'))
  )
  select m.id, m.slug, m.title_english, m.title_romaji,
         m.format, m.status, m.season_year, m.age_rating,
         m.episodes_total, m.duration_minutes, m.genres,
         m.cover_url, m.color, m.average_score, m.popularity,
         m.sub_episodes, m.dub_episodes,
         m.relevance::real as rank,
         count(*) over () as total_count
  from matches m
  left join anime_trending t on t.anime_id = m.id
  order by
    case when m.sort = 'trending'   then t.score end desc nulls last,
    case when m.sort = 'popularity' then m.popularity end desc nulls last,
    case when m.sort = 'score'      then m.average_score end desc nulls last,
    case when m.sort = 'year'       then m.season_year end desc nulls last,
    case when m.sort = 'updated'    then m.latest_episode_at end desc nulls last,
    case when m.sort = 'title'      then coalesce(m.title_english, m.title_romaji) end asc,
    m.relevance desc,
    m.popularity desc,
    m.id
  limit least(greatest(p_page_size, 1), 100)
  offset (greatest(p_page, 1) - 1) * least(greatest(p_page_size, 1), 100);
$$;

-- Distinct values among published titles, for the filter UI.
create function public.list_filter_values() returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'genres',  (select coalesce(jsonb_agg(g order by g), '[]') from
                 (select distinct unnest(genres) g from anime where is_published and not is_adult) x),
    'tags',    (select coalesce(jsonb_agg(t order by t), '[]') from
                 (select distinct unnest(tags) t from anime where is_published and not is_adult) x),
    'years',   (select coalesce(jsonb_agg(y order by y desc), '[]') from
                 (select distinct season_year y from anime where season_year is not null) x)
  );
$$;

-- Airing schedule between two instants, for the schedule page.
create function public.airing_schedule(p_from timestamptz, p_to timestamptz)
returns table (
  id bigint, slug text, title_english text, title_romaji text,
  cover_url text, next_episode integer, next_episode_at timestamptz
)
language sql stable set search_path = public as $$
  select id, slug, title_english, title_romaji, cover_url, next_episode, next_episode_at
  from anime
  where is_published and not is_adult
    and next_episode_at >= p_from and next_episode_at < p_to
  order by next_episode_at;
$$;

-- ---------------------------------------------------------------------------
-- Row level security: the public can read published rows; all writes go
-- through the service role (sync/upload scripts).
-- ---------------------------------------------------------------------------

alter table public.anime enable row level security;
alter table public.episodes enable row level security;
alter table public.video_sources enable row level security;
alter table public.subtitles enable row level security;
alter table public.anime_daily_views enable row level security;

create policy "published anime are public" on public.anime
  for select using (is_published);

create policy "published episodes are public" on public.episodes
  for select using (
    is_published and exists (
      select 1 from public.anime a where a.id = anime_id and a.is_published));

-- Source rows are readable so the player can list servers, but they hold
-- only UIDs; playable URLs are signed per request by /api/play.
create policy "ready sources of published episodes are public" on public.video_sources
  for select using (
    status = 'ready' and exists (
      select 1 from public.episodes e where e.id = episode_id and e.is_published));

create policy "subtitles of published episodes are public" on public.subtitles
  for select using (
    exists (select 1 from public.episodes e where e.id = episode_id and e.is_published));

create policy "trending counters are public" on public.anime_daily_views
  for select using (true);

revoke execute on function public.refresh_episode_counts from public, anon, authenticated;
grant execute on function public.search_anime to anon, authenticated;
grant execute on function public.list_filter_values to anon, authenticated;
grant execute on function public.airing_schedule to anon, authenticated;
grant execute on function public.record_view to anon, authenticated;
