-- The private AI corner (/shh). A per-member custom label for its nav tab, and a
-- toggle to hide the cupcake.gg wordmark in the header.
alter table users add column shh_label text;
alter table users add column hide_slogan integer not null default 0;
