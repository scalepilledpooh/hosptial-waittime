-- Enable UUID extension if not already enabled
create extension if not exists "uuid-ossp";

-- Enable RLS
alter table public.hospitals enable row level security;
alter table public.reports enable row level security;

-- Create hospitals table if it doesn't exist
create table if not exists public.hospitals (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  lat decimal not null,
  lon decimal not null,
  address text,
  phone text,
  website text,
  created_at timestamptz default now()
);

-- Create reports table if it doesn't exist
create table if not exists public.reports (
  id uuid default gen_random_uuid() primary key,
  hospital_id uuid references public.hospitals(id) not null,
  wait_minutes integer check (wait_minutes is null or (wait_minutes >= 0 and wait_minutes <= 720)),
  capacity_enum smallint check (capacity_enum between 0 and 2), -- 0 = full, 1 = limited, 2 = plenty
  comment text check (comment is null or char_length(comment) <= 280),
  created_at timestamptz default now(),
  ip_hash text -- SHA-256(ip) for rate-limiting
);

-- Create materialized view for aggregated wait times
create materialized view if not exists public.aggregated_wait as
select 
  hospital_id,
  round(avg(wait_minutes)) as est_wait,
  count(*) as report_count,
  max(created_at) as last_updated
from public.reports
where created_at > now() - interval '4 hours'
group by hospital_id;

-- Create index on reports for faster aggregation
create index if not exists reports_created_at_idx on public.reports(created_at);
create index if not exists reports_hospital_id_idx on public.reports(hospital_id);

-- RLS Policies
-- Anyone can read hospitals
create policy "Anyone can read hospitals"
  on public.hospitals for select
  using (true);

-- Anyone can read reports
create policy "Anyone can read reports"
  on public.reports for select
  using (true);

-- Anyone can insert reports
create policy "Anyone can insert reports"
  on public.reports for insert
  with check (true);

-- Only service role can update/delete reports
create policy "Only service role can update reports"
  on public.reports for update
  using (auth.role() = 'service_role');

create policy "Only service role can delete reports"
  on public.reports for delete
  using (auth.role() = 'service_role');

-- Function to refresh aggregated wait times
create or replace function public.refresh_aggregated_wait()
returns void as $$
begin
  refresh materialized view concurrently public.aggregated_wait;
end;
$$ language plpgsql;

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
