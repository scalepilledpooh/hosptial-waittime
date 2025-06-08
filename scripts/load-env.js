const fs = require('fs');
const path = require('path');
require('dotenv').config();

const configPath = path.join(__dirname, '../public/config.js');

// Ensure the URL is properly formatted
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials in environment variables');
    process.exit(1);
}

const configContent = `window.SUPABASE_URL = '${supabaseUrl}';
window.SUPABASE_ANON_KEY = '${supabaseKey}';
window.MAPBOX_TOKEN = 'pk.eyJ1Ijoicnlhbi1zaGFyayIsImEiOiJjbWJqeTlrbTIwa3M4MmlzZDh2angyb3o0In0.SmMHpdCg773r-ChA3xZYXA';`;

fs.writeFileSync(configPath, configContent);
console.log('Config file updated with environment variables'); 