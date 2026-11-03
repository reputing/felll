-- /shh model health. Hybra fronts free upstreams that go up and down by the hour,
-- so the model picker only lists models a real request recently got an answer
-- from. One row per model, written by the probe in lib/hybra.ts:
--   ok / vision / tools  1 when a live probe passed (answered; read an image; called a tool)
--   ms                   how long the text probe took
--   err                  why the last probe failed (shown nowhere, kept for debugging)
--   checked_at           unix seconds of the last probe (0 = never probed)
-- The row with id '__lock' is a lease so only one refresh runs at a time.
create table if not exists shh_models (
  id         text primary key,
  ok         integer not null default 0,
  vision     integer not null default 0,
  tools      integer not null default 0,
  ms         integer,
  err        text,
  checked_at integer not null default 0
);
