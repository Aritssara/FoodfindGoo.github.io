// เวอร์ชันมืออาชีพ: ใช้ /api/restaurants/near ก่อน ถ้าไม่ได้ค่อย fallback ไป Overpass (OSM)

const els = {
  status: document.getElementById('status'),
  list: document.getElementById('list'),
  resultCount: document.getElementById('resultCount'),
  radius: document.getElementById('radius'),
  radiusLabel: document.getElementById('radiusLabel'),
  cuisine: document.getElementById('cuisine'),
  sort: document.getElementById('sort'),
  recenter: document.getElementById('recenter'),
  snackbar: document.getElementById('snackbar'),
};

let user = { lat: 13.7563, lng: 100.5018 }; // default: กรุงเทพ
let circle = null;
let markers = L.markerClusterGroup();
let rawPlaces = [];
let currentRadius = parseInt(els.radius.value, 10);

const map = L.map('map', { scrollWheelZoom: true }).setView([user.lat, user.lng], 13);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19, attribution: '© OpenStreetMap',
}).addTo(map);
markers.addTo(map);

const setStatus = (msg) => els.status.textContent = msg;
const toast = (t) => { els.snackbar.textContent = t; els.snackbar.classList.add('show'); setTimeout(()=>els.snackbar.classList.remove('show'), 2200); };
const metersToKm = (m) => (m/1000).toFixed(2);

function haversine(lat1, lon1, lat2, lon2) {
  const toRad = (d) => d * Math.PI / 180;
  const R = 6371e3;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function drawUserAndCircle() {
  if (circle) map.removeLayer(circle);
  L.marker([user.lat, user.lng]).addTo(map).bindPopup("ตำแหน่งของคุณ");
  circle = L.circle([user.lat, user.lng], { radius: currentRadius }).addTo(map);
}

function fitBoundsToAll() {
  const bounds = [];
  if (circle) bounds.push(circle.getBounds());
  markers.eachLayer(layer => bounds.push(layer.getLatLng()));
  bounds.push([user.lat, user.lng]);
  try { map.fitBounds(L.latLngBounds(bounds), { padding: [20,20] }); }
  catch { map.setView([user.lat, user.lng], 15); }
}

// Backend first
async function fetchFromBackend() {
  const url = `/api/restaurants/near?lat=${user.lat}&lng=${user.lng}&radius=${currentRadius}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Backend error');
  const arr = await res.json();
  return arr.map(x => ({
    id: x._id || `${x.location?.coordinates?.[1]},${x.location?.coordinates?.[0]}`,
    name: x.name || 'ไม่ระบุชื่อร้าน',
    cuisine: x.cuisine || x.tags?.cuisine || '',
    opening: x.opening_hours || '',
    lat: x.location?.coordinates?.[1],
    lng: x.location?.coordinates?.[0],
    distanceM: x.distance ?? (x.location?.coordinates ? haversine(user.lat, user.lng, x.location.coordinates[1], x.location.coordinates[0]) : null),
    source: 'db',
  })).filter(p => p.lat && p.lng);
}

// Overpass fallback
async function fetchFromOverpass() {
  const query = `[out:json][timeout:25];
    (
      node["amenity"="restaurant"](around:${currentRadius},${user.lat},${user.lng});
      way["amenity"="restaurant"](around:${currentRadius},${user.lat},${user.lng});
      relation["amenity"="restaurant"](around:${currentRadius},${user.lat},${user.lng});
    ); out center;`;
  const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Overpass error');
  const data = await res.json();
  return (data.elements || []).map(el => {
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    return {
      id: el.id,
      name: el.tags?.name || 'ไม่ระบุชื่อร้าน',
      cuisine: el.tags?.cuisine || '',
      opening: el.tags?.opening_hours || '',
      lat, lng,
      distanceM: lat && lng ? haversine(user.lat, user.lng, lat, lng) : null,
      source: 'osm',
    };
  }).filter(p => p.lat && p.lng);
}

function renderList(places) {
  els.list.innerHTML = '';
  if (!places.length) {
    els.list.innerHTML = `<p class="muted">ไม่พบร้านในรัศมี ${Math.round(currentRadius/1000)} กม.</p>`;
    els.resultCount.textContent = '0 ร้าน';
    return;
  }
  const frag = document.createDocumentFragment();
  places.forEach(p => {
    const item = document.createElement('div');
    item.className = 'place';
    item.innerHTML = `
      <div class="title">${p.name}</div>
      <div class="meta">
        <span class="chip">${p.cuisine || 'ไม่ระบุประเภท'}</span>
        <span><i class="fa-regular fa-clock"></i> ${p.opening || 'ไม่ทราบเวลาเปิด-ปิด'}</span>
        <span><i class="fa-solid fa-route"></i> ~ ${metersToKm(p.distanceM)} กม.</span>
        <a class="chip" target="_blank" href="https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}">นำทาง</a>
      </div>
    `;
    item.addEventListener('click', () => {
      const ll = L.latLng(p.lat, p.lng);
      map.setView(ll, 16);
      markers.eachLayer(layer => { if (layer.getLatLng && layer.getLatLng().equals(ll)) layer.openPopup(); });
    });
    frag.appendChild(item);
  });
  els.list.appendChild(frag);
  els.resultCount.textContent = `${places.length} ร้าน`;
}

function renderMarkers(places) {
  markers.clearLayers();
  places.forEach(p => {
    const popup = `<b>${p.name}</b><br/>ประเภท: ${p.cuisine || '—'}<br/>เวลาเปิด: ${p.opening || '—'}<br/>ระยะทาง ~ ${metersToKm(p.distanceM)} กม.`;
    markers.addLayer(L.marker([p.lat, p.lng]).bindPopup(popup));
  });
}

function applyFiltersAndSort() {
  const cuisine = (els.cuisine.value || '').toLowerCase();
  let arr = rawPlaces.filter(p => p.distanceM != null && p.distanceM <= currentRadius);
  if (cuisine) arr = arr.filter(p => (p.cuisine || '').toLowerCase().includes(cuisine));
  if (els.sort.value === 'name') arr.sort((a,b) => (a.name||'').localeCompare(b.name||'', 'th'));
  else arr.sort((a,b) => a.distanceM - b.distanceM);
  renderMarkers(arr);
  renderList(arr);
  fitBoundsToAll();
}

async function loadData() {
  els.list.innerHTML = `<div class="skeleton"><div class="sk-row"></div><div class="sk-row"></div><div class="sk-row"></div></div>`;
  setStatus(`กำลังค้นหาร้านในรัศมี ${Math.round(currentRadius/1000)} กม.…`);
  try {
    const db = await fetchFromBackend();
    if (db.length > 0) { rawPlaces = db; setStatus(`ข้อมูลจากฐานข้อมูล • ${db.length} ร้าน`); }
    else { const osm = await fetchFromOverpass(); rawPlaces = osm; setStatus(`ข้อมูลจาก OSM • ${osm.length} ร้าน`); }
  } catch (e) {
    console.warn('Backend failed, fallback OSM', e);
    try { const osm = await fetchFromOverpass(); rawPlaces = osm; setStatus(`ข้อมูลจาก OSM • ${osm.length} ร้าน`); toast('สลับไปใช้ข้อมูลสาธารณะ (OSM)'); }
    catch (err) { console.error(err); els.list.innerHTML = `<p class="muted">โหลดข้อมูลไม่สำเร็จ โปรดลองอีกครั้ง</p>`; setStatus('เกิดข้อผิดพลาดในการโหลดข้อมูล'); return; }
  }
  applyFiltersAndSort();
}

async function initLocation() {
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      pos => { user.lat = pos.coords.latitude; user.lng = pos.coords.longitude; resolve(true); },
      err => { console.warn(err); toast('ใช้ตำแหน่งค่าเริ่มต้น (กรุงเทพ)'); resolve(false); },
      { enableHighAccuracy: true, timeout: 12000 }
    );
  });
}

els.radius.addEventListener('change', () => {
  currentRadius = parseInt(els.radius.value, 10);
  els.radiusLabel.textContent = Math.round(currentRadius/1000);
  drawUserAndCircle(); loadData();
});
els.cuisine.addEventListener('change', applyFiltersAndSort);
els.sort.addEventListener('change', applyFiltersAndSort);
els.recenter.addEventListener('click', () => map.setView([user.lat, user.lng], 15));

(async function boot() {
  drawUserAndCircle();
  const got = await initLocation();
  drawUserAndCircle();
  map.setView([user.lat, user.lng], got ? 15 : 13);
  await loadData();
})();
