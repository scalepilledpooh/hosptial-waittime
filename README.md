# Abuja Hospital Wait Times

A community-driven web application that helps users find hospitals in Abuja with the shortest emergency room wait times.

## 🚀 Features

- **Interactive Map**: View hospital locations with color-coded wait time indicators
- **Real-time Data**: Community-reported wait times updated in real-time
- **Search & Filter**: Find hospitals by name or location
- **Anonymous Reporting**: Submit wait times and capacity reports without registration
- **Mobile-Friendly**: Responsive design optimized for mobile devices
- **PWA Ready**: Can be installed as a Progressive Web App

## 🏥 How It Works

1. **View**: See hospitals on an interactive map with current wait time estimates
2. **Report**: Submit anonymous reports about wait times and bed availability
3. **Decide**: Choose the best hospital based on community data

## 🛠️ Setup & Installation

### Prerequisites

- Node.js 18 or later
- A Supabase account
- A Mapbox account (optional, uses included token by default)

### Quick Start

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd abj-waittime
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and add your Supabase credentials:
   ```
   SUPABASE_URL=your_supabase_project_url
   SUPABASE_ANON_KEY=your_supabase_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
   MAPBOX_TOKEN=your_mapbox_token (optional)
   ```

4. **Run setup**
   ```bash
   npm run setup
   ```

5. **Set up the database**
   - Go to your Supabase project dashboard
   - Open the SQL Editor
   - Run the SQL script from `supabase/migrations/create_hospital_schema.sql`

6. **Import hospital data**
   ```bash
   npm run import-osm
   ```

7. **Start development server**
   ```bash
   npm run dev
   ```

The app will be available at `http://localhost:3000`

## 📊 Database Schema

The app uses three main tables:

- **hospitals**: Store hospital information (name, location, contact details)
- **reports**: Store user-submitted wait time reports
- **aggregated_wait**: Materialized view with calculated average wait times

## 🔧 Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `SUPABASE_URL` | Your Supabase project URL | Yes |
| `SUPABASE_ANON_KEY` | Your Supabase anonymous key | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Your Supabase service role key | Yes |
| `MAPBOX_TOKEN` | Mapbox access token for maps | No* |

*A default Mapbox token is included for development

### Supabase Setup

1. Create a new Supabase project
2. Run the migration script to set up tables and policies
3. Enable Row Level Security (RLS) - this is handled by the migration
4. Set up the refresh function for real-time aggregation

## 🚀 Deployment

### Static Hosting (Recommended)

The app is a static web application that can be deployed to any static hosting service:

1. **Build the app**
   ```bash
   npm run build
   ```

2. **Deploy the `public/` folder** to your hosting service:
   - Netlify
   - Vercel
   - GitHub Pages
   - AWS S3 + CloudFront
   - Any static hosting service

### Environment Variables for Production

Make sure to set your production environment variables in your hosting service's dashboard.

### Database Maintenance

Set up a cron job or scheduled function to refresh the aggregated wait times:

1. Deploy the refresh function to Supabase Edge Functions
2. Schedule it to run every 15 minutes
3. Or use any external cron service to call the function URL

## 📱 Progressive Web App (PWA)

The app includes PWA capabilities:

- Installable on mobile devices
- Offline-ready manifest
- App-like experience

To customize the PWA:
1. Update `public/manifest.json`
2. Add your own app icons (`icon-192.png`, `icon-512.png`)

## 🔒 Security & Privacy

- **Anonymous Reporting**: No user registration required
- **Rate Limiting**: IP-based rate limiting for report submissions
- **Data Sanitization**: Comments are automatically sanitized
- **Row Level Security**: Database access controlled by RLS policies

## 📈 Analytics & Monitoring

The app includes views for analytics:
- Daily report counts per hospital
- Average wait times over time
- Hospital popularity metrics

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## ⚠️ Disclaimer

This application provides community-reported data that may be inaccurate or outdated. In medical emergencies, always call 112 or go to the nearest hospital immediately. The developers are not responsible for decisions made based on this information.

## 📄 License

MIT License - see LICENSE file for details

## 🆘 Support

For issues and questions:
1. Check the GitHub issues
2. Create a new issue with detailed information
3. Include error messages and steps to reproduce

---

**Made with ❤️ for the Abuja community**