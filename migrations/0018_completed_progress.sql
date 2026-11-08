-- Completed shows should read as fully watched. Rows that were completed before their
-- episode total was known kept progress 0, so My List showed an empty bar ("0/291").
update library set progress = episodes
 where status = 'completed' and episodes is not null and episodes > 0 and progress < episodes;
