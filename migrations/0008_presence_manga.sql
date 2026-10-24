-- Presence can now reflect manga reading, not just anime watching. Manga ids
-- are UUID strings, so they can't reuse the integer mal_id column.
alter table presence add column manga_id text;
