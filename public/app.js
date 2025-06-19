// Initialize Supabase
console.log('Initializing Supabase with URL:', window.SUPABASE_URL);
if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY || window.SUPABASE_URL === 'undefined') {
  console.error('Missing Supabase configuration. Please check config.js');
  const errorEl = document.getElementById('error-message');
  if (errorEl) {
    errorEl.textContent = 'Configuration error: Missing Supabase credentials. Please set up your environment variables.';
    errorEl.classList.remove('hidden');
  }
}

const supabase = window.supabase.createClient(
  window.SUPABASE_URL,
  window.SUPABASE_ANON_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    }
  }
);

console.log('Supabase client initialized:', !!supabase);

// Initialize Mapbox
if (!window.MAPBOX_TOKEN) {
  console.error('Missing Mapbox token');
}

mapboxgl.accessToken = window.MAPBOX_TOKEN;
const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/streets-v12',
  center: [7.45, 9.07], // Abuja coordinates
  zoom: 11,
});

// Try to get user's location
navigator.geolocation.getCurrentPosition(
  (position) => {
    const { longitude, latitude } = position.coords;
    map.setCenter([longitude, latitude]);
    map.setZoom(13);
  },
  (error) => {
    console.log('Geolocation not available or denied:', error.message);
  },
  { timeout: 5000 }
);

// Global variables
const loadingEl = document.getElementById('loading');
const errorEl = document.getElementById('error-message');
const searchInput = document.getElementById('search');
const reportTemplate = document.getElementById('report-template');
let markers = [];
let currentPopup = null;

// Utility functions
function showError(message) {
  if (errorEl) {
    errorEl.textContent = message;
    errorEl.classList.remove('hidden');
  }
}

function hideError() {
  if (errorEl) {
    errorEl.classList.add('hidden');
  }
}

function showLoading() {
  if (loadingEl) {
    loadingEl.classList.remove('hidden');
  }
}

function hideLoading() {
  if (loadingEl) {
    loadingEl.classList.add('hidden');
  }
}

function getMarkerColor(waitTime) {
  if (waitTime === null || waitTime === undefined) return '#6c757d'; // gray for no data
  if (waitTime <= 30) return '#28a745'; // green for short wait
  if (waitTime <= 60) return '#ffc107'; // yellow for medium wait
  if (waitTime <= 120) return '#fd7e14'; // orange for long wait
  return '#dc3545'; // red for very long wait
}

function getCapacityText(capacity) {
  const capacityMap = {
    0: 'Full - no beds available',
    1: 'Limited beds available', 
    2: 'Plenty of beds available'
  };
  return capacityMap[capacity] || 'Unknown capacity';
}

function formatTimeAgo(dateString) {
  const now = new Date();
  const date = new Date(dateString);
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleDateString();
}

// Fetch hospitals from Supabase
async function fetchHospitals(query = '') {
  showLoading();
  hideError();
  
  try {
    console.log('Fetching hospitals with query:', query);
    
    // Use the hospital_wait_times view which includes the aggregated data
    let queryBuilder = supabase
      .from('hospital_wait_times')
      .select('*')
      .order('name');
    
    // Add search filter if query is provided
    if (query.trim()) {
      queryBuilder = queryBuilder.ilike('name', `%${query.trim()}%`);
    }
    
    const { data, error } = await queryBuilder;
    
    console.log('Supabase response:', { error, dataCount: data?.length });
    
    if (error) {
      console.error('Supabase error:', error);
      throw new Error(`Database error: ${error.message}`);
    }
    
    return data || [];
  } catch (err) {
    const errorMsg = err.message || 'Unknown error occurred';
    console.error('Error in fetchHospitals:', err);
    showError(`Failed to load hospitals: ${errorMsg}`);
    return [];
  } finally {
    hideLoading();
  }
}

// Fetch recent reports for a hospital
async function fetchRecentReports(hospitalId, limit = 5) {
  try {
    const { data, error } = await supabase
      .from('reports')
      .select('wait_minutes, capacity_enum, comment, created_at')
      .eq('hospital_id', hospitalId)
      .order('created_at', { ascending: false })
      .limit(limit);
      
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('Error fetching recent reports:', err);
    return [];
  }
}

// Render hospitals on map
function renderHospitals(hospitals) {
  // Clear existing markers
  markers.forEach(marker => marker.remove());
  markers = [];

  if (!hospitals.length) {
    showError('No hospitals found. Try a different search term.');
    return;
  }

  hospitals.forEach(hospital => {
    const waitTime = hospital.est_wait;
    const markerColor = getMarkerColor(waitTime);
    
    // Create custom marker element
    const markerEl = document.createElement('div');
    markerEl.className = 'custom-marker';
    markerEl.style.cssText = `
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background-color: ${markerColor};
      border: 3px solid white;
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
      cursor: pointer;
      transition: transform 0.2s ease;
    `;
    
    markerEl.addEventListener('mouseenter', () => {
      markerEl.style.transform = 'scale(1.2)';
    });
    
    markerEl.addEventListener('mouseleave', () => {
      markerEl.style.transform = 'scale(1)';
    });

    // Create popup content
    const popupContent = document.createElement('div');
    popupContent.className = 'hospital-popup';
    
    // Hospital header
    const header = document.createElement('div');
    header.innerHTML = `
      <div style="padding: 16px; border-bottom: 1px solid #eee;">
        <h3 style="margin: 0 0 8px 0; color: #333; font-size: 18px;">${hospital.name}</h3>
        <div style="color: #666; font-size: 14px;">
          ${waitTime !== null ? 
            `<span style="color: ${markerColor}; font-weight: bold;">~${waitTime} min wait</span>` : 
            '<span style="color: #999;">No recent wait data</span>'
          }
          ${hospital.last_updated ? 
            `<br><small>Updated ${formatTimeAgo(hospital.last_updated)}</small>` : 
            ''
          }
        </div>
        ${hospital.address ? `<div style="color: #666; font-size: 13px; margin-top: 4px;">${hospital.address}</div>` : ''}
        ${hospital.phone ? `<div style="color: #666; font-size: 13px;"><a href="tel:${hospital.phone}" style="color: #007bff;">${hospital.phone}</a></div>` : ''}
      </div>
    `;
    popupContent.appendChild(header);

    // Recent reports section (will be loaded async)
    const reportsSection = document.createElement('div');
    reportsSection.style.cssText = 'padding: 16px; border-bottom: 1px solid #eee; max-height: 200px; overflow-y: auto;';
    reportsSection.innerHTML = '<div style="color: #666; font-size: 14px;">Loading recent reports...</div>';
    popupContent.appendChild(reportsSection);

    // Report form
    if (reportTemplate) {
      const formContainer = document.createElement('div');
      formContainer.style.padding = '16px';
      
      const clone = reportTemplate.content.cloneNode(true);
      const form = clone.querySelector('form');
      
      if (form) {
        // Style the form
        form.style.cssText = 'margin: 0;';
        const inputs = form.querySelectorAll('input, select');
        inputs.forEach(input => {
          input.style.cssText = `
            width: 100%;
            padding: 8px 12px;
            margin-bottom: 12px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 14px;
            box-sizing: border-box;
          `;
        });
        
        const button = form.querySelector('button');
        if (button) {
          button.style.cssText = `
            width: 100%;
            padding: 10px;
            background-color: #007bff;
            color: white;
            border: none;
            border-radius: 4px;
            font-size: 14px;
            cursor: pointer;
            transition: background-color 0.2s;
          `;
          button.addEventListener('mouseenter', () => {
            button.style.backgroundColor = '#0056b3';
          });
          button.addEventListener('mouseleave', () => {
            button.style.backgroundColor = '#007bff';
          });
        }
        
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          await handleReportSubmission(form, hospital.id);
        });
        
        formContainer.appendChild(clone);
      }
      
      popupContent.appendChild(formContainer);
    }

    // Create popup
    const popup = new mapboxgl.Popup({ 
      offset: 25,
      maxWidth: '350px',
      className: 'hospital-popup-container'
    })
    .setDOMContent(popupContent)
    .on('open', async () => {
      // Load recent reports when popup opens
      const reports = await fetchRecentReports(hospital.id);
      
      if (reports.length === 0) {
        reportsSection.innerHTML = '<div style="color: #999; font-size: 14px; font-style: italic;">No recent reports</div>';
      } else {
        const reportsHtml = reports.map(report => `
          <div style="margin-bottom: 12px; padding: 8px; background: #f8f9fa; border-radius: 4px;">
            <div style="font-size: 12px; color: #666; margin-bottom: 4px;">
              ${formatTimeAgo(report.created_at)}
            </div>
            <div style="font-size: 13px; color: #333;">
              ${report.wait_minutes ? `${report.wait_minutes} min wait` : ''}
              ${report.capacity_enum !== null ? 
                `${report.wait_minutes ? ' • ' : ''}${getCapacityText(report.capacity_enum)}` : 
                ''
              }
              ${report.comment ? `<br><em style="color: #666;">"${report.comment}"</em>` : ''}
            </div>
          </div>
        `).join('');
        
        reportsSection.innerHTML = `
          <h4 style="margin: 0 0 12px 0; font-size: 14px; color: #666;">Recent Reports</h4>
          ${reportsHtml}
        `;
      }
    })
    .on('close', () => {
      currentPopup = null;
    });

    // Create marker
    const marker = new mapboxgl.Marker(markerEl)
      .setLngLat([hospital.lon, hospital.lat])
      .setPopup(popup)
      .addTo(map);

    markers.push(marker);
  });

  // Fit map to show all markers
  if (markers.length > 0) {
    const bounds = new mapboxgl.LngLatBounds();
    markers.forEach(marker => bounds.extend(marker.getLngLat()));
    map.fitBounds(bounds, { 
      padding: { top: 50, bottom: 50, left: 50, right: 50 },
      maxZoom: 14
    });
  }
}

// Handle report submission
async function handleReportSubmission(form, hospitalId) {
  const formData = new FormData(form);
  const wait = formData.get('wait')?.toString().trim();
  const capacity = formData.get('capacity')?.toString();
  const comment = formData.get('comment')?.toString().trim();

  // Validation
  if (!wait && !capacity) {
    alert('Please provide either wait time or capacity information.');
    return;
  }

  if (wait && (isNaN(wait) || parseInt(wait) < 0 || parseInt(wait) > 720)) {
    alert('Please enter a valid wait time between 0 and 720 minutes.');
    return;
  }

  if (comment && comment.length > 280) {
    alert('Comment is too long (280 characters maximum).');
    return;
  }

  try {
    showLoading();
    hideError();
    
    const reportData = {
      hospital_id: hospitalId,
      wait_minutes: wait ? parseInt(wait) : null,
      capacity_enum: capacity ? parseInt(capacity) : null,
      comment: comment || null
    };
    
    console.log('Submitting report:', reportData);
    
    const { error } = await supabase
      .from('reports')
      .insert([reportData]);

    if (error) {
      console.error('Supabase error:', error);
      throw new Error(error.message);
    }
    
    console.log('Report submitted successfully');
    
    // Close popup and refresh data
    if (currentPopup) {
      currentPopup.remove();
      currentPopup = null;
    }
    
    // Show success message
    const successDiv = document.createElement('div');
    successDiv.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #28a745;
      color: white;
      padding: 12px 20px;
      border-radius: 4px;
      z-index: 10000;
      box-shadow: 0 2px 10px rgba(0,0,0,0.2);
    `;
    successDiv.textContent = 'Thank you for your report!';
    document.body.appendChild(successDiv);
    
    setTimeout(() => {
      document.body.removeChild(successDiv);
    }, 3000);
    
    // Refresh hospital data
    await refresh(searchInput?.value || '');
    
  } catch (err) {
    console.error('Error submitting report:', err);
    showError(`Failed to submit report: ${err.message}`);
  } finally {
    hideLoading();
  }
}

// Main refresh function
async function refresh(query = '') {
  const hospitals = await fetchHospitals(query);
  renderHospitals(hospitals);
}

// Search functionality
if (searchInput) {
  let searchTimeout;
  searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      refresh(e.target.value);
    }, 300); // Debounce search
  });
}

// Real-time updates
supabase
  .channel('public:reports')
  .on(
    'postgres_changes',
    { 
      event: 'INSERT', 
      schema: 'public', 
      table: 'reports' 
    },
    (payload) => {
      console.log('New report received:', payload);
      // Refresh data when new reports come in
      refresh(searchInput?.value || '');
    }
  )
  .subscribe((status) => {
    console.log('Realtime subscription status:', status);
  });

// Initial load
document.addEventListener('DOMContentLoaded', () => {
  refresh();
});

// Load immediately if DOM is already ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', refresh);
} else {
  refresh();
}