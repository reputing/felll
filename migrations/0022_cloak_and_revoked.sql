-- 1. Signing a device out from another device keeps a marker instead of deleting the row, so that device can be told why it
--    was signed out the next time it loads the sign-in (lib/auth.ts, app/page.tsx). Rows are cleared a week after.
alter table sessions add column revoked_at integer;

-- 2. The /shh "cloak" settings (decoy screen and content, tab disguise, boss key, anti-flip) follow the member to every device
--    and survive a cleared browser: stored as one JSON blob on the member's row (app/api/cloak/route.ts).
alter table users add column cloak text;
