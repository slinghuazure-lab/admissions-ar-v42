-- Read-only checks after running migrations/202611160001_ar.sql.
select tablename as table_name, rowsecurity as rls_enabled
from pg_tables
where schemaname = 'public'
  and tablename in ('ar_models', 'ar_venues', 'ar_launches', 'ar_admins')
order by tablename;

select id, name, model_id, active from public.ar_venues where id = 'demo';

select id, public, file_size_limit from storage.buckets where id = 'ar-models';
