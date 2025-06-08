declare global {
  interface Window {
    supabase: {
      createClient: (url: string, key: string) => any;
    };
    SUPABASE_URL: string;
    SUPABASE_ANON_KEY: string;
    MAPBOX_TOKEN: string;
  }
}

export interface Hospital {
  id: string;
  name: string;
  lat: number;
  lon: number;
  address: string | null;
  phone: string | null;
  website: string | null;
  aggregated_wait?: {
    est_wait: number | null;
    report_count: number | null;
    last_updated: string | null;
  } | null;
  recent_reports?: {
    wait_minutes: number | null;
    capacity_enum: number | null;
    comment: string | null;
    created_at: string;
  }[];
}

export interface Report {
  id: string;
  hospital_id: string;
  wait_minutes: number | null;
  capacity_enum: number | null;
  comment: string | null;
  created_at: string;
} 