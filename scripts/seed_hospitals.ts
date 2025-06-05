import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { parse } from 'csv-parse/sync';
import path from 'path';

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

async function main() {
  const csvPath = path.join(__dirname, 'hospitals.csv');
  const file = readFileSync(csvPath, 'utf-8');
  const rows = parse(file, { columns: true, skip_empty_lines: true });

  for (const row of rows) {
    const { error } = await supabase.from('hospitals').insert({
      name: row.name,
      lat: parseFloat(row.lat),
      lon: parseFloat(row.lon),
      address: row.address,
      phone: row.phone,
      website: row.website
    });
    if (error) {
      console.error('Failed to insert', row.name, error.message);
    } else {
      console.log('Inserted', row.name);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
