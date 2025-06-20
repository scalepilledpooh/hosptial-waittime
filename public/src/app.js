// Initialize Supabase
const supabase = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
// Initialize Mapbox
mapboxgl.accessToken = window.MAPBOX_TOKEN;
const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/streets-v12',
    center: [7.45, 9.07],
    zoom: 12,
});
navigator.geolocation.getCurrentPosition((pos) => {
    map.setCenter([pos.coords.longitude, pos.coords.latitude]);
}, () => { });
const loadingEl = document.getElementById('loading');
const errorEl = document.getElementById('error-message');
const hospitalListEl = document.getElementById('hospital-list');
async function fetchHospitals(query = '') {
    loadingEl.classList.remove('hidden');
    errorEl.textContent = '';
    try {
        const { data, error } = await supabase
            .from('hospitals')
            .select(`
        *,
        aggregated_wait(est_wait, report_count, last_updated),
        recent_reports:reports(
          wait_minutes,
          capacity_enum,
          comment,
          created_at
        )
      `)
            .ilike('name', `%${query}%`)
            .order('name')
            .order('created_at', { foreignTable: 'reports', ascending: false })
            .limit(5, { foreignTable: 'reports' });
        if (error)
            throw error;
        return data;
    }
    catch (err) {
        console.error('Error fetching hospitals', err.message ?? err);
        errorEl.textContent = 'Failed to load hospitals.';
        return [];
    }
    finally {
        loadingEl.classList.add('hidden');
    }
}
let markers = new Map();
function getMarkerColor(waitTime) {
    if (waitTime === null)
        return '#808080'; // gray for no data
    if (waitTime <= 30)
        return '#4CAF50'; // green for short wait
    if (waitTime <= 60)
        return '#FFC107'; // yellow for medium wait
    if (waitTime <= 120)
        return '#FF9800'; // orange for long wait
    return '#F44336'; // red for very long wait
}
// Simplified red/yellow/green scheme for popup indicator
function getPopupColor(waitTime) {
    if (waitTime === null)
        return '#808080';
    if (waitTime <= 30)
        return '#4CAF50'; // green
    if (waitTime <= 60)
        return '#FFC107'; // yellow
    return '#F44336'; // red
}
function getCapacityText(capacity) {
    if (capacity === null)
        return 'Unknown';
    return ['Full - no beds available', 'Limited beds available', 'Plenty of beds available'][capacity] || 'Unknown';
}
function renderHospitals(list) {
    for (const m of markers.values())
        m.remove();
    markers.clear();
    hospitalListEl.innerHTML = '';
    const template = document.getElementById('report-template');
    list.forEach((h) => {
        const waitTime = h.aggregated_wait?.est_wait ?? null;
        const markerColor = getMarkerColor(waitTime);
        const popupContent = document.createElement('div');
        popupContent.className = 'hospital-popup';
        // Header with hospital name and wait time
        const header = document.createElement('div');
        header.className = 'popup-header';
        const indicatorColor = getPopupColor(waitTime);
        header.innerHTML = `
      <h3>${h.name}</h3>
      <div class="wait-time ${waitTime === null ? 'no-data' : ''}">
        ${waitTime !== null ? `<span class="wait-indicator" style="background:${indicatorColor}"></span>` : ''}
        ${waitTime === null ? 'No wait time data' : `Average wait: ${waitTime} min`}
        ${h.aggregated_wait?.last_updated ?
            `<br><small>Updated ${new Date(h.aggregated_wait.last_updated).toLocaleTimeString()}</small>` : ''}
      </div>
    `;
        popupContent.appendChild(header);
        // Recent reports section
        if (h.recent_reports && h.recent_reports.length > 0) {
            const reportsSection = document.createElement('div');
            reportsSection.className = 'recent-reports';
            reportsSection.innerHTML = '<h4>Recent Reports</h4>';
            const reportsList = document.createElement('ul');
            h.recent_reports.slice(0, 5).forEach(report => {
                const li = document.createElement('li');
                li.innerHTML = `
          <div class="report-time">${new Date(report.created_at).toLocaleTimeString()}</div>
          <div class="report-details">
            ${report.wait_minutes ? `${report.wait_minutes} min wait` : ''}
            ${report.capacity_enum !== null ? ` • ${getCapacityText(report.capacity_enum)}` : ''}
            ${report.comment ? `<br><em>${report.comment}</em>` : ''}
          </div>
        `;
                reportsList.appendChild(li);
            });
            reportsSection.appendChild(reportsList);
            popupContent.appendChild(reportsSection);
        }
        // Report form
        const clone = template.content.cloneNode(true);
        const form = clone.querySelector('form');
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
            }
            else {
                form.reset();
                alert('Thank you for your report!');
            }
        });
        popupContent.appendChild(clone);
        const popup = new mapboxgl.Popup({ offset: 25 }).setDOMContent(popupContent);
        // Create custom marker with color
        const el = document.createElement('div');
        el.className = 'marker';
        el.style.backgroundColor = markerColor;
        el.style.width = '20px';
        el.style.height = '20px';
        el.style.borderRadius = '50%';
        el.style.border = '2px solid white';
        el.style.boxShadow = '0 0 4px rgba(0,0,0,0.3)';
        const marker = new mapboxgl.Marker(el)
            .setLngLat([h.lon, h.lat])
            .setPopup(popup)
            .addTo(map);
        markers.set(h.id, marker);
        const li = document.createElement('li');
        li.textContent = h.name;
        li.addEventListener('click', () => {
            map.flyTo({ center: [h.lon, h.lat], zoom: 14 });
            marker.togglePopup();
        });
        hospitalListEl.appendChild(li);
    });
}
async function refresh(query = '') {
    const hospitals = await fetchHospitals(query);
    renderHospitals(hospitals);
}
// Search functionality
const searchInput = document.getElementById('search');
searchInput.addEventListener('input', () => {
    refresh(searchInput.value);
});
// Realtime updates
supabase
    .channel('public:reports')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reports' }, () => refresh(searchInput.value))
    .subscribe();
refresh();
export {};
