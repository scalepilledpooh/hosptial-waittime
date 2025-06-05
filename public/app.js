// Initialize Supabase
console.log('Initializing Supabase with URL:', window.SUPABASE_URL);
if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) {
  console.error('Missing Supabase configuration. Please check config.js');
  document.getElementById('error-message').textContent = 
    'Configuration error: Missing Supabase URL or Anon Key. Please check your configuration.';
}

const supabase = window.supabase.createClient(
  window.SUPABASE_URL,
  window.SUPABASE_ANON_KEY,
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true
    }
  }
);

console.log('Supabase client initialized:', !!supabase);

// Initialize Mapbox
mapboxgl.accessToken = window.MAPBOX_TOKEN;
const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/streets-v12',
  center: [7.45, 9.07],
  zoom: 12,
});

// Global variables
const loadingEl = document.getElementById('loading');
const errorEl = document.getElementById('error-message');
const searchInput = document.getElementById('search');
const loginForm = document.getElementById('login-form');
const authStatus = document.getElementById('auth-status');
const loginEmail = document.getElementById('login-email');
const reportTemplate = document.getElementById('report-template');
let markers = [];
let currentPopup = null;

// Fetch hospitals from Supabase
async function fetchHospitals(query = '') {
  loadingEl.classList.remove('hidden');
  errorEl.textContent = '';
  try {
    console.log('Fetching hospitals with query:', query);
    
    // Use the hospital_wait_times view which includes the aggregated data
    let queryBuilder = supabase
      .from('hospital_wait_times')
      .select('*')
      .order('name');
    
    // Add search filter if query is provided
    if (query) {
      queryBuilder = queryBuilder.ilike('name', `%${query}%`);
    }
    
    const { data, error, status, statusText } = await queryBuilder;
    
    console.log('Supabase response:', { status, statusText, error, data });
    
    if (error) {
      console.error('Supabase error:', error);
      throw error;
    }
    
    // Format the data to match the expected structure
    const formattedData = (data || []).map(hospital => ({
      ...hospital,
      // Map the view columns to the expected structure
      aggregated_wait: {
        est_wait: hospital.est_wait,
        report_count: hospital.report_count || 0,
        last_updated: hospital.last_updated
      }
    }));
    
    return formattedData;
  } catch (err) {
    const errorMsg = err.message || 'Unknown error';
    console.error('Error in fetchHospitals:', {
      error: err,
      name: err.name,
      message: errorMsg,
      stack: err.stack
    });
    errorEl.textContent = `Failed to load hospitals: ${errorMsg}`;
    return [];
  } finally {
    loadingEl.classList.add('hidden');
  }
}

function renderHospitals(hospitals) {
  // Clear existing markers
  markers.forEach(marker => marker.remove());
  markers = [];

  hospitals.forEach(hospital => {
    const popupContent = document.createElement('div');
    const waitTime = hospital.aggregated_wait?.est_wait !== undefined ? 
      hospital.aggregated_wait.est_wait : 'n/a';
    const lastUpdated = hospital.aggregated_wait?.last_updated ? 
      ` (updated ${new Date(hospital.aggregated_wait.last_updated).toLocaleTimeString()})` : '';
    const reportCount = hospital.aggregated_wait?.report_count || 0;

    popupContent.innerHTML = `
      <strong>${hospital.name}</strong><br>
      Wait: ${waitTime} min${lastUpdated}<br>
      Reports: ${reportCount}
    `;

    if (reportTemplate) {
      const clone = reportTemplate.content.cloneNode(true);
      const form = clone.querySelector('form');
      
      if (form) {
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          const formData = new FormData(form);
          const wait = formData.get('wait')?.toString();
          const capacity = formData.get('capacity')?.toString();
          const comment = formData.get('comment')?.toString();

          if (!wait && !capacity) {
            errorEl.textContent = 'Please provide wait minutes or capacity.';
            return;
          }
          if (comment && comment.length > 280) {
            errorEl.textContent = 'Comment is too long (280 characters max).';
            return;
          }

          try {
            loadingEl.classList.remove('hidden');
            errorEl.textContent = '';
            
            const waitMinutes = wait ? parseInt(wait) : null;
            const capacityEnum = capacity ? parseInt(capacity) : null;
            
            console.log('Submitting report for hospital:', hospital.id, { waitMinutes, capacityEnum, comment });
            
            const { error } = await supabase
              .from('reports')
              .insert([
                {
                  hospital_id: hospital.id,
                  wait_minutes: waitMinutes,
                  capacity_enum: capacityEnum,
                  comment: comment || null
                }
              ]);

            if (error) {
              console.error('Supabase error:', error);
              throw error;
            }
            
            console.log('Report submitted successfully');
            
            // Close any open popups
            if (currentPopup) {
              currentPopup.remove();
              currentPopup = null;
            }
            
            // Refresh the hospital data
            await refresh(searchInput.value);
            
            // Show success message
            const successEl = document.createElement('div');
            successEl.textContent = 'Thank you for your report!';
            successEl.style.color = 'green';
            successEl.style.marginTop = '10px';
            popupContent.appendChild(successEl);
            
            // Clear the form
            form.reset();
            
          } catch (err) {
            console.error('Error submitting report:', err);
            errorEl.textContent = `Failed to submit report: ${err.message || 'Unknown error'}`;
          } finally {
            loadingEl.classList.add('hidden');
          }
        });
        
        popupContent.appendChild(clone);
      }
    }

    // Close any existing popup
    if (currentPopup) {
      currentPopup.remove();
    }

    const popup = new mapboxgl.Popup({ offset: 25 })
      .setDOMContent(popupContent)
      .on('close', () => {
        currentPopup = null;
      });

    const marker = new mapboxgl.Marker()
      .setLngLat([hospital.lon, hospital.lat])
      .setPopup(popup)
      .addTo(map);

    // Store reference to the current popup
    currentPopup = popup;
    markers.push(marker);
  });

  // Fit map to bounds if we have markers
  if (markers.length > 0) {
    const bounds = new mapboxgl.LngLatBounds();
    markers.forEach(marker => bounds.extend(marker.getLngLat()));
    map.fitBounds(bounds, { padding: 50 });
  }
}

async function refresh(query = '') {
  const hospitals = await fetchHospitals(query);
  renderHospitals(hospitals);
}

// Search functionality
if (searchInput) {
  searchInput.addEventListener('input', (e) => {
    refresh(e.target.value);
  });
}

// Auth
if (loginForm && loginEmail && authStatus) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = loginEmail.value;
    try {
      const { error } = await supabase.auth.signInWithOtp({ email });
      if (error) throw error;
      authStatus.textContent = 'Check your email for the login link';
    } catch (error) {
      console.error('Error sending login link', error);
      authStatus.textContent = 'Error sending login link. Please try again.';
    }
  });
}

// Handle auth state changes
supabase.auth.onAuthStateChange((event, session) => {
  if (!authStatus) return;
  
  if (session) {
    authStatus.textContent = `Signed in as ${session.user.email}`;
    if (loginForm) loginForm.style.display = 'none';
  } else {
    authStatus.textContent = '';
    if (loginForm) loginForm.style.display = 'block';
  }
});

// Realtime updates
supabase
  .channel('public:reports')
  .on(
    'postgres_changes',
    { 
      event: 'INSERT', 
      schema: 'public', 
      table: 'reports' 
    },
    () => {
      if (searchInput) refresh(searchInput.value);
      else refresh();
    }
  )
  .subscribe();

// Initial load
refresh();
