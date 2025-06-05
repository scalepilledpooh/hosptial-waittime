import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Simple edge function that refreshes the materialized view
Deno.serve(async () => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    console.error("Missing Supabase env vars");
    return new Response("Missing env vars", { status: 500 });
  }

  const client = createClient(supabaseUrl, serviceKey);
  const { error } = await client.rpc('refresh_aggregated_wait');
  if (error) {
    console.error(error.message);
    return new Response(`Error: ${error.message}`, { status: 500 });
  }
  return new Response("ok", { status: 200 });
});
