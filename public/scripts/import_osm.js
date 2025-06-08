import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';
import * as dotenv from 'dotenv';
dotenv.config();
const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
    console.error('Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.');
    process.exit(1);
}
const supabase = createClient(supabaseUrl, serviceKey);
async function fetchHospitals() {
    const query = `
[out:json][timeout:25];
node["amenity"="hospital"](8.8,7.1,9.5,7.8);
out body;
  `;
    const res = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: query
    });
    if (!res.ok) {
        throw new Error(`Overpass error: ${res.status} ${res.statusText}`);
    }
    const data = await res.json();
    return data.elements;
}
function buildAddress(tags) {
    if (tags['addr:full'])
        return tags['addr:full'];
    const parts = [tags['addr:housenumber'], tags['addr:street'], tags['addr:city']];
    const addr = parts.filter(Boolean).join(' ');
    return addr || null;
}
async function main() {
    const hospitals = await fetchHospitals();
    for (const item of hospitals) {
        const row = {
            name: item.tags.name || 'Unnamed hospital',
            lat: item.lat,
            lon: item.lon,
            address: buildAddress(item.tags),
            phone: item.tags.phone || null,
            website: item.tags.website || null
        };
        const { error } = await supabase.from('hospitals').insert(row);
        if (error) {
            console.error('Failed to insert', row.name, error.message);
        }
        else {
            console.log('Inserted', row.name);
        }
    }
}
main().catch((err) => {
    console.error(err);
    process.exit(1);
});
