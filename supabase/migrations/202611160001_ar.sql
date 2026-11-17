-- Apply only to this application's independent Supabase project.
-- No photos, GPS coordinates, IP addresses, names, or visitor accounts are collected.
begin;
create table if not exists public.ar_models (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  data jsonb not null,
  created_at timestamptz not null default now()
);
create table if not exists public.ar_venues (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  name text not null check (length(name) between 1 and 100),
  model_id text not null references public.ar_models(id),
  active boolean not null default true
);
create table if not exists public.ar_launches (
  id uuid primary key,
  venue_id text not null references public.ar_venues(id),
  venue_name text not null,
  model_id text not null,
  model_version text not null,
  platform text not null check(platform in ('ios','android')),
  created_at timestamptz not null default now()
);
create index if not exists ar_launches_created_at on public.ar_launches(created_at);
create index if not exists ar_launches_venue_created_at on public.ar_launches(venue_id,created_at);
create table if not exists public.ar_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.ar_models enable row level security;
alter table public.ar_venues enable row level security;
alter table public.ar_launches enable row level security;
alter table public.ar_admins enable row level security;

create or replace function public.is_ar_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.ar_admins where user_id=auth.uid());
$$;
revoke all on function public.is_ar_admin() from public;
grant execute on function public.is_ar_admin() to authenticated;

-- Public access is restricted to the two narrow RPC functions below.
revoke all on public.ar_models,public.ar_venues,public.ar_launches,public.ar_admins from anon,authenticated;
grant select on public.ar_models,public.ar_venues,public.ar_launches to authenticated;
drop policy if exists ar_admin_models_read on public.ar_models;
create policy ar_admin_models_read on public.ar_models for select to authenticated using (public.is_ar_admin());
drop policy if exists ar_admin_venues_read on public.ar_venues;
create policy ar_admin_venues_read on public.ar_venues for select to authenticated using (public.is_ar_admin());
drop policy if exists ar_admin_launches_read on public.ar_launches;
create policy ar_admin_launches_read on public.ar_launches for select to authenticated using (public.is_ar_admin());

create or replace function public.ar_get_activity(p_venue text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('venue',jsonb_build_object('id',v.id,'name',v.name),'model',m.data,'mode','cloud')
  from public.ar_venues v join public.ar_models m on m.id=v.model_id
  where v.id=p_venue and v.active;
$$;
revoke all on function public.ar_get_activity(text) from public;
grant execute on function public.ar_get_activity(text) to anon,authenticated;

create or replace function public.ar_record_launch(p_id uuid,p_venue text,p_model text,p_platform text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v public.ar_venues%rowtype; m public.ar_models%rowtype;
begin
  if p_platform not in ('ios','android') or p_platform is null then raise exception '手機類別不正確'; end if;
  if exists(select 1 from public.ar_launches where id=p_id) then return jsonb_build_object('recorded',true,'duplicate',true); end if;
  select * into v from public.ar_venues where id=p_venue and active;
  if not found or v.model_id<>p_model then raise exception '展場設定已更新，請重新整理活動頁'; end if;
  select * into strict m from public.ar_models where id=p_model;
  insert into public.ar_launches(id,venue_id,venue_name,model_id,model_version,platform)
    values(p_id,v.id,v.name,m.id,m.data->>'version',p_platform) on conflict(id) do nothing;
  return jsonb_build_object('recorded',true);
end;
$$;
revoke all on function public.ar_record_launch(uuid,text,text,text) from public;
grant execute on function public.ar_record_launch(uuid,text,text,text) to anon,authenticated;

create or replace function public.ar_admin_catalog() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_ar_admin() then raise exception '此帳號未獲管理權限' using errcode='42501'; end if;
  return jsonb_build_object('mode','cloud',
    'models',(select coalesce(jsonb_agg(data order by created_at desc),'[]'::jsonb) from public.ar_models),
    'venues',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'modelId',model_id,'active',active) order by id),'[]'::jsonb) from public.ar_venues));
end;
$$;
revoke all on function public.ar_admin_catalog() from public;
grant execute on function public.ar_admin_catalog() to authenticated;

create or replace function public.ar_save_model(p_model jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare key text; value text; duration numeric; clean jsonb;
begin
  if not public.is_ar_admin() then raise exception '此帳號未獲管理權限' using errcode='42501'; end if;
  if coalesce(p_model->>'id','') !~ '^[a-z0-9][a-z0-9_-]{0,63}$' then raise exception '模型版本代碼格式不正確'; end if;
  if length(coalesce(p_model->>'name','')) not between 1 and 80 or length(coalesce(p_model->>'version','')) not between 1 and 80 then raise exception '請填寫模型名稱與版本（80 字內）'; end if;
  duration=(p_model->>'duration')::numeric;
  if duration is null or duration not between 1 and 600 then raise exception '循環長度須介於 1 至 600 秒'; end if;
  foreach key in array array['glb','usdz','poster'] loop
    value=p_model->>key;
    if value is null or length(value)>2000 or value !~ '^(/[a-zA-Z0-9_./-]+|https://[^[:space:]<>]+)$' then raise exception '檔案須使用站內路徑或 HTTPS 網址'; end if;
    if (key='glb' and split_part(value,'?',1) !~* '\.glb$') or
       (key='usdz' and split_part(value,'?',1) !~* '\.usdz$') or
       (key='poster' and split_part(value,'?',1) !~* '\.(png|jpg|jpeg|webp)$') then raise exception '檔案格式不正確'; end if;
  end loop;
  clean=jsonb_build_object('id',p_model->>'id','name',p_model->>'name','version',p_model->>'version',
    'description',left(coalesce(p_model->>'description',''),240),'glb',p_model->>'glb','usdz',p_model->>'usdz','poster',p_model->>'poster','duration',duration);
  if exists(select 1 from public.ar_models where id=clean->>'id') then raise exception '版本代碼已存在，請使用新代碼保留歷史'; end if;
  insert into public.ar_models(id,data) values(clean->>'id',clean);
  return clean;
end;
$$;
revoke all on function public.ar_save_model(jsonb) from public;
grant execute on function public.ar_save_model(jsonb) to authenticated;

create or replace function public.ar_save_venue(p_venue jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_ar_admin() then raise exception '此帳號未獲管理權限' using errcode='42501'; end if;
  if coalesce(p_venue->>'id','') !~ '^[a-z0-9][a-z0-9_-]{0,63}$' or length(coalesce(p_venue->>'name','')) not between 1 and 100 or jsonb_typeof(p_venue->'active') is distinct from 'boolean' then raise exception '請確認展場代碼、名稱及啟用狀態'; end if;
  if not exists(select 1 from public.ar_models where id=p_venue->>'modelId') then raise exception '找不到指定模型'; end if;
  insert into public.ar_venues(id,name,model_id,active) values(p_venue->>'id',p_venue->>'name',p_venue->>'modelId',(p_venue->>'active')::boolean)
    on conflict(id) do update set name=excluded.name,model_id=excluded.model_id,active=excluded.active;
  return p_venue;
end;
$$;
revoke all on function public.ar_save_venue(jsonb) from public;
grant execute on function public.ar_save_venue(jsonb) to authenticated;

create or replace function public.ar_get_stats(p_from date,p_to date,p_venue text default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not public.is_ar_admin() then raise exception '此帳號未獲管理權限' using errcode='42501'; end if;
  if p_from is null or p_to is null or p_from>p_to then raise exception '請確認統計日期範圍'; end if;
  with filtered as (
    select *,created_at at time zone 'Asia/Taipei' as local_time from public.ar_launches
    where created_at >= (p_from::timestamp at time zone 'Asia/Taipei')
      and created_at < ((p_to+1)::timestamp at time zone 'Asia/Taipei')
      and (p_venue is null or p_venue='' or venue_id=p_venue)
  ) select jsonb_build_object('from',p_from,'to',p_to,'mode','cloud','timezone','Asia/Taipei',
    'total',(select count(*) from filtered),
    'daily',(select coalesce(jsonb_agg(x order by x.label),'[]'::jsonb) from (select to_char(local_time,'YYYY-MM-DD') as label,count(*) as count from filtered group by 1) x),
    'hourly',(select coalesce(jsonb_agg(x order by x.label),'[]'::jsonb) from (select to_char(local_time,'HH24') as label,count(*) as count from filtered group by 1) x),
    'venues',(select coalesce(jsonb_agg(x order by x.count desc),'[]'::jsonb) from (select venue_id as id,venue_name as label,count(*) as count from filtered group by 1,2) x),
    'models',(select coalesce(jsonb_agg(x order by x.count desc),'[]'::jsonb) from (select model_id as id,model_version as label,count(*) as count from filtered group by 1,2) x),
    'platforms',(select coalesce(jsonb_agg(x order by x.count desc),'[]'::jsonb) from (select platform as label,count(*) as count from filtered group by 1) x)
  ) into result;
  return result;
end;
$$;
revoke all on function public.ar_get_stats(date,date,text) from public;
grant execute on function public.ar_get_stats(date,date,text) to authenticated;

insert into public.ar_models(id,data) values ('owl-v42-1',
  '{"id":"owl-v42-1","name":"小菁鷹運動版","version":"V42 · 60 秒循環","description":"半愛心、YA、全愛心，和小菁鷹一起留下展場回憶。","glb":"/models/v42-loop.glb","usdz":"/models/v42-loop.usdz","poster":"/posters/v42.png","duration":60,"clips":[{"name":"半愛心","seconds":20},{"name":"YA","seconds":20},{"name":"全愛心","seconds":20}]}'::jsonb)
  on conflict(id) do nothing;
insert into public.ar_venues(id,name,model_id,active) values('demo','招生展覽體驗區','owl-v42-1',true) on conflict(id) do nothing;

-- This bucket stores replacement MODEL files and covers only, never visitor photos.
insert into storage.buckets(id,name,public,file_size_limit)
  values('ar-models','ar-models',true,52428800) on conflict(id) do nothing;
drop policy if exists ar_model_admin_upload on storage.objects;
create policy ar_model_admin_upload on storage.objects for insert to authenticated
  with check(bucket_id='ar-models' and public.is_ar_admin() and lower(storage.extension(name)) in ('glb','usdz','png','jpg','webp'));
-- Immutable filenames: updates/deletes deliberately not granted through the website.

notify pgrst, 'reload schema';
commit;
