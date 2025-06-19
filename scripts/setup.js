const fs = require('fs');
const path = require('path');

console.log('🏥 Setting up Abuja Hospital Wait Times App...\n');

// Check if .env file exists
const envPath = path.join(__dirname, '../.env');
const envExamplePath = path.join(__dirname, '../.env.example');

if (!fs.existsSync(envPath)) {
  console.log('❌ .env file not found!');
  console.log('📋 Please follow these steps:');
  console.log('1. Copy .env.example to .env');
  console.log('2. Fill in your Supabase credentials');
  console.log('3. Run npm run setup again\n');
  
  if (fs.existsSync(envExamplePath)) {
    console.log('💡 You can copy the example file with:');
    console.log('   cp .env.example .env\n');
  }
  
  process.exit(1);
}

// Load environment variables
require('dotenv').config();

const requiredVars = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY'
];

const missingVars = requiredVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.log('❌ Missing required environment variables:');
  missingVars.forEach(varName => {
    console.log(`   - ${varName}`);
  });
  console.log('\n📝 Please update your .env file with the missing values.\n');
  process.exit(1);
}

// Generate config.js
const configPath = path.join(__dirname, '../public/config.js');
const configContent = `window.SUPABASE_URL = '${process.env.SUPABASE_URL}';
window.SUPABASE_ANON_KEY = '${process.env.SUPABASE_ANON_KEY}';
window.MAPBOX_TOKEN = '${process.env.MAPBOX_TOKEN || 'pk.eyJ1Ijoicnlhbi1zaGFyayIsImEiOiJjbWJqeTlrbTIwa3M4MmlzZDh2angyb3o0In0.SmMHpdCg773r-ChA3xZYXA'}';`;

fs.writeFileSync(configPath, configContent);
console.log('✅ Generated public/config.js');

// Check if database is set up
console.log('\n🗄️  Database Setup:');
console.log('1. Go to your Supabase project dashboard');
console.log('2. Open the SQL Editor');
console.log('3. Run the SQL script from: supabase/migrations/create_hospital_schema.sql');
console.log('4. Import hospital data with: npm run import-osm');

console.log('\n🚀 Setup complete! You can now:');
console.log('   npm run dev    - Start development server');
console.log('   npm run build  - Build for production');

console.log('\n📱 For production deployment:');
console.log('1. Set up the database schema in Supabase');
console.log('2. Import hospital data');
console.log('3. Deploy the public/ folder to any static hosting service');
console.log('4. Set up the refresh function to run every 15 minutes');