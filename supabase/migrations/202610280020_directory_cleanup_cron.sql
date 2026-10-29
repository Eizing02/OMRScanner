-- Production installation requires approval. Run after 019, once.
-- pg_cron runs in the same Supabase PostgreSQL project, not a new service.
begin;
do $$ begin
 if not exists(select 1 from private.app_installation where version='202610280019') then raise exception 'INSTALL_019_FIRST'; end if;
end $$;
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('scansob-school-directory-trash','17 * * * *','select private.purge_school_directories(5)');
insert into private.app_installation(version) values('202610280020');
notify pgrst, 'reload schema';
commit;
