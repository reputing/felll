-- Per-user access to adult (18+) manhwa sources. Granted by admins only; the
-- /read/omega section and its proxy both require this flag.
alter table users add column adult_ok integer not null default 0;
