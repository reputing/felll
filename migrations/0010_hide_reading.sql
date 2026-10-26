-- Let a member hide what they're reading. When on, the presence heartbeat stops
-- broadcasting the manga title/id to the online list, so nobody can see what
-- they're reading (adult 18+ reading via /read/* is never broadcast regardless).
alter table users add column hide_reading integer not null default 0;
