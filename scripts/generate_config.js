const fs = require('fs');
const path = require('path');
require('dotenv').config();

const configJs = `window.SUPABASE_URL = '${process.env.SUPABASE_URL}';\nwindow.SUPABASE_ANON_KEY = '${process.env.SUPABASE_ANON_KEY}';\nwindow.MAPBOX_TOKEN = '${process.env.MAPBOX_TOKEN}';\n`;

fs.writeFileSync(path.join(__dirname, '../public/config.js'), configJs);
console.log('public/config.js generated from .env'); 