-- The /shh AI's persistent setup: per-member custom instructions / memory, and
-- reference files it always has in context. Both are prepended to every chat.
alter table users add column shh_instructions text;

create table shh_docs (
  id         text primary key,
  user_id    text not null references users(id) on delete cascade,
  name       text not null,
  content    text not null,
  created_at integer not null default (unixepoch())
);
create index shh_docs_user_idx on shh_docs (user_id, created_at);
