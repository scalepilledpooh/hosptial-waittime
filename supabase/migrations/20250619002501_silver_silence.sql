/*
  # Hospital Wait Times Database Schema

  1. New Tables
    - `hospitals` - Store hospital information (name, location, contact details)
    - `reports` - Store user-submitted wait time reports
    - `aggregated_wait` - Materialized view for calculated wait times

  2. Security
    - Enable RLS on all tables
    - Allow public read access to hospitals and reports
    - Allow public insert access to reports
    - Restrict update/delete to service role only

  3. Features
    - Automatic comment sanitization
    - Rate limiting via IP hash
    - Real-time aggregation of wait times
    - Geospatial queries for nearby hospitals
*/

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create hospitals table
CREATE TABLE IF NOT EXISTS public.hospitals (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  lat decimal NOT NULL,
  lon decimal NOT NULL,
  address text,
  phone text,
  website text,
  created_at timestamptz DEFAULT now()
);

-- Create reports table
CREATE TABLE IF NOT EXISTS public.reports (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  hospital_id uuid REFERENCES public.hospitals(id) NOT NULL,
  wait_minutes integer CHECK (wait_minutes IS NULL OR (wait_minutes >= 0 AND wait_minutes <= 720)),
  capacity_enum smallint CHECK (capacity_enum BETWEEN 0 AND 2), -- 0 = full, 1 = limited, 2 = plenty
  comment text CHECK (comment IS NULL OR char_length(comment) <= 280),
  created_at timestamptz DEFAULT now(),
  ip_hash text -- SHA-256(ip) for rate-limiting
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS reports_created_at_idx ON public.reports(created_at);
CREATE INDEX IF NOT EXISTS reports_hospital_id_idx ON public.reports(hospital_id);
CREATE INDEX IF NOT EXISTS hospitals_location_idx ON public.hospitals(lat, lon);

-- Create materialized view for aggregated wait times
CREATE MATERIALIZED VIEW IF NOT EXISTS public.aggregated_wait AS
SELECT 
  hospital_id,
  round(avg(wait_minutes))::integer as est_wait,
  count(*)::integer as report_count,
  max(created_at) as last_updated
FROM public.reports
WHERE created_at > now() - interval '4 hours'
  AND wait_minutes IS NOT NULL
GROUP BY hospital_id;

-- Create unique index for concurrent refresh
CREATE UNIQUE INDEX IF NOT EXISTS aggregated_wait_hospital_id_idx 
ON public.aggregated_wait(hospital_id);

-- Enable RLS
ALTER TABLE public.hospitals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- RLS Policies for hospitals
CREATE POLICY "Anyone can read hospitals"
  ON public.hospitals FOR SELECT
  USING (true);

CREATE POLICY "Only service role can modify hospitals"
  ON public.hospitals FOR ALL
  USING (auth.role() = 'service_role');

-- RLS Policies for reports
CREATE POLICY "Anyone can read reports"
  ON public.reports FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert reports"
  ON public.reports FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Only service role can update reports"
  ON public.reports FOR UPDATE
  USING (auth.role() = 'service_role');

CREATE POLICY "Only service role can delete reports"
  ON public.reports FOR DELETE
  USING (auth.role() = 'service_role');

-- Function to refresh aggregated wait times
CREATE OR REPLACE FUNCTION public.refresh_aggregated_wait()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.aggregated_wait;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to sanitize comments
CREATE OR REPLACE FUNCTION public.sanitize_comment()
RETURNS trigger AS $$
BEGIN
  IF NEW.comment IS NOT NULL THEN
    NEW.comment := regexp_replace(NEW.comment, '<[^>]+>', '', 'g');
    NEW.comment := trim(NEW.comment);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to sanitize comments
DROP TRIGGER IF EXISTS sanitize_comment ON public.reports;
CREATE TRIGGER sanitize_comment 
  BEFORE INSERT OR UPDATE ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.sanitize_comment();

-- Create view for hospital wait times (combines hospitals with aggregated wait data)
CREATE OR REPLACE VIEW public.hospital_wait_times AS
SELECT 
  h.*,
  COALESCE(aw.est_wait, NULL) as est_wait,
  COALESCE(aw.report_count, 0) as report_count,
  aw.last_updated
FROM public.hospitals h
LEFT JOIN public.aggregated_wait aw ON h.id = aw.hospital_id;

-- Function to get nearby hospitals
CREATE OR REPLACE FUNCTION public.nearby_hospitals(
  lat double precision,
  lng double precision,
  radius_km double precision DEFAULT 10
)
RETURNS TABLE (
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
LANGUAGE sql STABLE
AS $$
  SELECT 
    h.id,
    h.name,
    h.lat::double precision,
    h.lon::double precision,
    h.address,
    h.phone,
    h.website,
    (point(lng, lat) <@> point(h.lon::double precision, h.lat::double precision)) * 1.60934 as distance_km,
    aw.est_wait,
    COALESCE(aw.report_count, 0) as report_count,
    aw.last_updated
  FROM 
    public.hospitals h
  LEFT JOIN 
    public.aggregated_wait aw ON h.id = aw.hospital_id
  WHERE 
    (point(lng, lat) <@> point(h.lon::double precision, h.lat::double precision)) < (radius_km / 1.60934)
  ORDER BY 
    distance_km;
$$;

-- Create view for analytics
CREATE OR REPLACE VIEW public.daily_report_counts AS
SELECT
  hospital_id,
  date_trunc('day', created_at)::date as report_date,
  count(*)::integer as report_count,
  round(avg(wait_minutes))::integer as avg_wait
FROM
  public.reports
WHERE wait_minutes IS NOT NULL
GROUP BY hospital_id, report_date
ORDER BY report_date DESC;