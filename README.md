# Abuja Hospital Wait Time Tracker

A web application that helps users find hospitals in Abuja with the shortest emergency room wait times.

## Features

- View hospital locations on an interactive map
- See current wait times and bed availability
- Submit anonymous wait time reports
- Filter hospitals by distance and current wait times

## Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/hosptial-waittime.git
   cd hosptial-waitime
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   Create a `.env` file in the root directory with your Supabase credentials:
   ```
   SUPABASE_URL=your_supabase_url
   SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
   ```

4. Set up the database:
   - Run the SQL in `scripts/setup_db.sql` in your Supabase SQL editor
   - Import initial hospital data:
     ```bash
     npm run import-osm
     ```

## Development

Start the development server:
```bash
npm run dev
```

## Project Structure

- `/scripts/` - Database setup and data import scripts
- `/public/` - Static files
- `/src/` - Application source code (to be implemented)

## License

MIT

---

# Abuja ER Wait-Time Map – Product Requirements Document (MVP)

## 1. Problem & Goal
Residents and visitors in Abuja often waste **30 – 180 min** driving to an Emergency Department (ED) that is already full.  
Hospitals publish no real-time capacity data.

**Goal:** Ship a public, mobile-friendly website (or PWA) that lets anyone

1. **See** current / last-reported wait times or bed availability for each major ED in Abuja.  
2. **Contribute** a quick, anonymous report (minutes waited, “beds full / some / plenty”, optional comment).  
3. **Decide quickly** which hospital to head to by glancing at a map overlay.

Success = People routinely check the site before leaving home *and* self-report afterward, smoothing demand and reducing wasted travel.

---

## 2. Target Users

| Persona          | Core Need                                      | Mobile-first |
|------------------|------------------------------------------------|--------------|
| **Stressed Parent** | Find the fastest ED in \< 60 s                | ✅           |
| **Good Samaritan**  | Post a quick update after a visit            | ✅           |
| **Hospital Admin**  | Monitor crowding & reputational data (v2)    | ✅ / ❌      |

---

## 3. Key User Stories (MVP)

1. **As a patient** I open the site, allow geolocation, and see pins coloured by “current” wait tier.  
2. I tap a pin and view: name, address, phone, link to Google Maps, last-reported wait, # reports today, and a **“Report Wait Time”** button.  
3. **As a contributor** I hit that button, enter minutes waited (or “was turned away”), choose capacity tier, add an optional note, and submit — no login required.  
4. My report is instantly visible; the aggregate wait estimate updates in real time.

---

## 4. Scope

| Feature | **Must** | **Should** | **Won’t (Now)** |
|---------|:--------:|:----------:|:---------------:|
| Base map of Abuja + pins for ~30 hospitals | ✅ | | |
| Crowd report form (minutes, beds, comment) | ✅ | “photo of queue” upload (v2) | |
| Last-report timestamp & simple average | ✅ | Time-decay model | |
| Basic spam guard (hCaptcha) | ✅ | SMS / phone auth | |
| Hospital directory (address, phone, website) | ✅ | | |
| Fast PWA shell (installable) | ✅ | Offline cache | |
| Admin dashboard to flag spam | | ✅ | |
| Native push alerts (“ED near you \< 20 min”) | | | ❌ |

**Algorithm v1**: arithmetic mean of all reports in the last 4 h.  
**Algorithm v2** (future): time-decay weight `e^(-Δt/τ)` with τ ≈ 2 h plus user-reputation weighting.

---

## 5. Non-Functional Requirements

* **Load time:** \< 2 s on 3G (median Abuja ~8 Mbps).  
* **Hosting cost:** \< $25 / month at 10 k daily hits.  
* **Privacy:** store only coarse lat/long (3 decimal places); no PII unless user opts in to SMS verification.  
* **Legal:** prominent disclaimer – “Information is crowdsourced and may be inaccurate; call 112 for life-threatening emergencies.”

---

## 6. Metrics & KPIs

| Metric                       | 90-Day Target | Why it matters |
|------------------------------|---------------|----------------|
| Monthly Active Users (MAU)   | ≥ 2 000       | Adoption       |
| Median Time-to-First-Paint   | \< 1.5 s      | Retention      |
| Crowd Reports per Day        | ≥ 50          | Data freshness |
| Median Report Age on Map     | \< 90 min     | Decision utility |

---

## 7. Data Model (Postgres / Supabase)

```sql
-- hospitals table
id  SERIAL PRIMARY KEY
name TEXT
lat  DECIMAL
lon  DECIMAL
address TEXT
phone TEXT
website TEXT
created_at TIMESTAMPTZ DEFAULT now()

-- reports table
id  SERIAL PRIMARY KEY
hospital_id INT REFERENCES hospitals(id)
wait_minutes INT            -- nullable if turned-away flag used
capacity_enum SMALLINT      -- 0 = full, 1 = limited, 2 = plenty
comment TEXT
created_at TIMESTAMPTZ DEFAULT now()
ip_hash TEXT                -- SHA-256(ip) for rate-limiting

-- materialised view (or table updated by cron)
aggregated_wait
  hospital_id INT PRIMARY KEY
  est_wait INT
  report_count INT
  updated_at TIMESTAMPTZ


⸻

8. Suggested Tech Stack

Layer	“Code-light” Option	“DIY” Option
Front-end	Next.js + TypeScript + Mapbox GL	React Native Web + Expo
Back-end/API	Supabase (Postgres, Auth, edge functions)	Node.js (Express) + PostgreSQL
Map Tiles	Mapbox Streets (free < 50 k tiles/mo)	Leaflet + OpenStreetMap
Hosting	Supabase (DB) + Vercel (front-end)	Fly.io or AWS Lightsail
Analytics	Plausible (EU-hosted)	PostHog

Estimated probability this stack ships MVP in < 4 weeks with one junior developer: ~70 %.

⸻

9. Build Roadmap

Sprint	Length	Deliverable
0 – Kick-off	2 d	Compile master list of Abuja hospitals (Google Places → CSV → DB).
1 – API & DB	1 wk	Supabase project; REST endpoints /hospitals & /reports.
2 – Map UI	1 wk	Next.js page with Mapbox markers & pop-ups.
3 – Submit Flow	1 wk	Report modal, hCaptcha, optimistic cache update.
4 – Aggregation	0.5 wk	Edge-function cron job recalculates aggregated_wait every 15 min.
5 – Polish & Launch	0.5 wk	PWA manifest, shareable URL, minimal SEO.

Total: ~4 calendar weeks.
Add +50 % buffer if brand-new to JS.

⸻

10. Open Questions / Risks
	1.	Data accuracy / trolling — Plan: IP-hash rate-limit, flag outliers >\ 4σ, lightweight moderation queue.
	2.	Liability — Mitigate via strong disclaimers, show report age prominently.
	3.	Hospital buy-in — Might object; consider outreach once traction proven.
	4.	Mapping costs — Monitor Mapbox tile usage; fall back to OSM if needed.
	5.	Offline gaps — Future SMS bot could handle low-data users.

⸻

11. Next Actions for You
	1.	Choose stack (Supabase vs classic Express).
	2.	Reserve domain (e.g., abujarooms.ng).
	3.	Create repo (GitHub private) and enable Supabase CI.
	4.	Write hospital seed script (/scripts/seed_hospitals.ts).
	5.	Sketch simple wireframes (Figma or PowerPoint).
	6.	Ping for help when you hit coding roadblocks.

⸻

Footnotes
	•	Several Nigerian studies report tertiary-hospital outpatient waits of 60 – 160 min; ample head-room for improvement.
        •       FCT Ministry of Health PDF lists > 300 facilities; filter to ≈ 30 with 24 h ED service for launch.


## Local Setup

1. Install [Node.js](https://nodejs.org/) 18 or later.
2. Run `npm install` to fetch dependencies.
3. Create a `.env` file with your `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
4. Put hospital info in `scripts/hospitals.csv` (see example row).
5. Execute `npm run seed` to upload hospitals to Supabase.
6. Or run `npm run import-osm` to fetch hospital data from OpenStreetMap and upload it automatically.
