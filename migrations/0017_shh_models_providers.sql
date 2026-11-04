-- The /shh provider changed to Inception Labs. Probe results from the earlier
-- providers mean nothing now, so remove them; the next refresh re-probes Inception.
-- The __lock row (the refresh lease) is kept.
delete from shh_models where id != '__lock' and id not like 'inception:%';
