import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Initialize Supabase
const supabase = window.supabase.createClient(
  window.SUPABASE_URL,
  window.SUPABASE_ANON_KEY
);

// Initialize Mapbox
mapboxgl.accessToken = window.MAPBOX_TOKEN;
const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/streets-v12',
  center: [7.45, 9.07],
  zoom: 12,
});

navigator.geolocation.getCurrentPosition(
  (pos) => {
    map.setCenter([pos.coords.longitude, pos.coords.latitude]);
  },
  () => {}
);

interface Hospital {
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
}

const loadingEl = document.getElementById('loading') as HTMLElement;
const errorEl = document.getElementById('error-message') as HTMLElement;

async function fetchHospitals(query = ''): Promise<Hospital[]> {
  loadingEl.classList.remove('hidden');
  errorEl.textContent = '';
  try {
    const { data, error } = await supabase
      .from('hospitals')
      .select(`*, aggregated_wait(est_wait, report_count, last_updated)`) // left join view
      .ilike('name', `%${query}%`)
      .order('name');

    if (error) throw error;
    return data as Hospital[];
  } catch (err: any) {
    console.error('Error fetching hospitals', err.message ?? err);
    errorEl.textContent = 'Failed to load hospitals.';
    return [];
  } finally {
    loadingEl.classList.add('hidden');
  }
}

let markers: any[] = [];

function renderHospitals(list: Hospital[]) {
  markers.forEach((m) => m.remove());
  markers = [];
  const template = document.getElementById('report-template') as HTMLTemplateElement;

  list.forEach((h) => {
    const popupContent = document.createElement('div');

    const wait = h.aggregated_wait?.est_wait;
    const waitClass =
      wait == null ? 'wait-unknown'
      : wait <= 15 ? 'wait-short'
      : wait <= 30 ? 'wait-medium'
      : 'wait-long';

    popupContent.innerHTML = `<strong>${h.name}</strong><br />` +
      `Wait: <span class="${waitClass}">${wait ?? 'n/a'}</span> min` +
      (h.aggregated_wait?.last_updated ? ` (updated ${new Date(h.aggregated_wait.last_updated).toLocaleTimeString()})` : '') +
      `<br />Reports: ${h.aggregated_wait?.report_count ?? 0}`;

    const clone = template.content.cloneNode(true) as HTMLElement;
    const form = clone.querySelector('form') as HTMLFormElement;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(form);
      const wait = formData.get('wait')?.toString();
      const capacity = formData.get('capacity')?.toString();
      const comment = formData.get('comment')?.toString();

      if (!wait && !capacity) {
        alert('Please provide wait minutes or capacity.');
        return;
      }
      if (comment && comment.length > 280) {
        alert('Comment is too long (280 characters max).');
        return;
      }

      const { error } = await supabase.from('reports').insert({
        hospital_id: h.id,
        wait_minutes: wait ? Number(wait) : null,
        capacity_enum: capacity ? Number(capacity) : null,
        comment: comment || null,
      });
      if (error) {
        alert('Failed to submit');
        console.error(error.message);
      } else {
        form.reset();
      }
    });

    popupContent.appendChild(clone);
    const popup = new mapboxgl.Popup({ offset: 25 }).setDOMContent(popupContent);
    const marker = new mapboxgl.Marker()
      .setLngLat([h.lon, h.lat])
      .setPopup(popup)
      .addTo(map);
    markers.push(marker);
  });
}

async function refresh(query = '') {
  const hospitals = await fetchHospitals(query);
  renderHospitals(hospitals);
}

// Auth
const loginForm = document.getElementById('login-form') as HTMLFormElement;
const authStatus = document.getElementById('auth-status') as HTMLElement;

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = (document.getElementById('login-email') as HTMLInputElement).value;
  const { error } = await supabase.auth.signInWithOtp({ email });
  if (error) {
    authStatus.textContent = 'Error sending magic link';
    console.error(error.message);
  } else {
    authStatus.textContent = 'Check your email for the login link';
  }
});

supabase.auth.onAuthStateChange((_event, session) => {
  if (session) {
    authStatus.textContent = `Signed in as ${session.user.email}`;
    loginForm.style.display = 'none';
  } else {
    authStatus.textContent = '';
    loginForm.style.display = 'block';
  }
});

// Search functionality
const searchInput = document.getElementById('search') as HTMLInputElement;
searchInput.addEventListener('input', () => {
  refresh(searchInput.value);
});

// Realtime updates
supabase
  .channel('public:reports')
  .on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'reports' },
    () => refresh(searchInput.value)
  )
  .subscribe();

refresh();
