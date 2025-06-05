-- Enable UUID extension if not already enabled
create extension if not exists "uuid-ossp";

-- Create hospitals table
create table if not exists public.hospitals (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  lat double precision not null,
  lon double precision not null,
  address text,
  phone text,
  website text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create reports table
create table if not exists public.reports (
  id uuid primary key default uuid_generate_v4(),
  hospital_id uuid references public.hospitals(id) on delete cascade,
  wait_minutes integer check (wait_minutes is null or (wait_minutes >= 0 and wait_minutes <= 720)),
  capacity_enum smallint check (capacity_enum between 0 and 2), -- 0=full, 1=limited, 2=plenty
  comment text check (comment is null or char_length(comment) <= 280),
  ip_hash text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create index for faster lookups
create index if not exists idx_reports_hospital_id on public.reports(hospital_id);
create index if not exists idx_reports_created_at on public.reports(created_at);

-- Create materialized view for aggregated wait times
create or replace view public.aggregated_wait as
select 
  hospital_id,
  round(avg(wait_minutes))::integer as est_wait,
  count(*) as report_count,
  max(created_at) as last_updated
from 
  public.reports
where 
  created_at > (now() - interval '4 hours')
  and wait_minutes is not null
group by
  hospital_id;

-- Function and trigger to sanitize comments by stripping HTML tags
create or replace function public.sanitize_comment()
returns trigger as $$
begin
  if new.comment is not null then
    new.comment := regexp_replace(new.comment, '<[^>]+>', '', 'g');
  end if;
  return new;
end;
$$ language plpgsql;

create trigger sanitize_comment before insert or update on public.reports
for each row execute function public.sanitize_comment();

-- Additional view for analytics: daily report counts and average wait time
create or replace view public.daily_report_counts as
select
  hospital_id,
  date_trunc('day', created_at) as report_date,
  count(*) as report_count,
  avg(wait_minutes) as avg_wait
from
  public.reports
group by hospital_id, report_date;

-- Enable Row Level Security
alter table public.hospitals enable row level security;
alter table public.reports enable row level security;

-- Set up policies for public read access
create policy "Public hospitals are viewable by everyone." 
on public.hospitals for select 
using (true);

create policy "Public reports are viewable by everyone." 
on public.reports for select 
using (true);

-- Allow anonymous report submissions
create policy "Enable insert for anonymous users"
on public.reports for insert
to anon, authenticated
with check (true);

-- Restrict update and delete to service_role
create policy "Allow service role to update reports"
on public.reports for update
to service_role
using (true)
with check (true);

create policy "Allow service role to delete reports"
on public.reports for delete
to service_role
using (true);

-- Create a function to get nearby hospitals
create or replace function public.nearby_hospitals(
  lat double precision,
  lng double precision,
  radius_km double precision default 10
)
returns table (
  id uuid,
  name text,
  lat double precision,
  lng double precision,
  address text,
  phone text,
  website text,
  distance_km double precision,
  est_wait integer,
  report_count integer,
  last_updated timestamp with time zone
) 
language sql 
as $$
  select 
    h.*,
    (point(lng, lat) <@> point(h.lon, h.lat)) * 1.60934 as distance_km,
    aw.est_wait,
    aw.report_count,
    aw.last_updated
  from 
    public.hospitals h
  left join 
    public.aggregated_wait aw on h.id = aw.hospital_id
  where 
    (point(lng, lat) <@> point(h.lon, h.lat)) < (radius_km / 1.60934)
  order by 
    distance_km;
$$;
