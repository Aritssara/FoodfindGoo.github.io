// /Menu/detail.js — OSM-only version (Leaflet + OSRM + Overpass), no Google Maps/Places

// ---------- Query & DOM ----------
const qs = new URLSearchParams(location.search);
const menuNameParam = qs.get("menu");
if (!menuNameParam) {
  alert("ไม่พบชื่อเมนู");
  location.href = "/index.html";
}

const els = {
  // menu
  menuName:   document.getElementById("menuName"),
  menuImage:  document.getElementById("menuImage"),
  menuPrice:  document.getElementById("menuPrice"),
  menuType:   document.getElementById("menuType"),
  menuViews:  document.getElementById("menuViews"),
  menuDesc:   document.getElementById("menuDesc"),
  // shop & address
  shopName:   document.getElementById("shopName"),
  roadName:   document.getElementById("roadName"),
  prettyAddr: document.getElementById("prettyAddr"),
  contactPhone: document.getElementById("contactPhone"),
  contactExtraWrap: document.getElementById("contactExtraWrap"),
  contactExtra: document.getElementById("contactExtra"),
  // map controls
  recenter:   document.getElementById("recenter"),
  geoStatus:  document.getElementById("geoStatus"),
  // lists
  moreMenus:  document.getElementById("moreMenus"),
  moreMenusEmpty: document.getElementById("moreMenusEmpty"),
  otherShops: document.getElementById("otherShops"),
  otherShopsEmpty: document.getElementById("otherShopsEmpty"),
  // actions
  saveBtn:    document.getElementById("saveBtn"),
  saveHint:   document.getElementById("saveHint"),
  shareBtn:   document.getElementById("shareBtn"),
};

// ---------- State ----------
let map, userLL = null, shopLL = null, menuId = null;
let userMarker = null, shopMarker = null, routeLine = null;
let ALL_MENUS_CACHE = null;

// ---------- Utils ----------
const fmtTHB = new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB", maximumFractionDigits: 0 });
const FALLBACK_IMG = "/images/default-food.jpg";

function cuisineHintFromMenu(menu) {
  const t = `${menu?.type||''} ${menu?.cuisine||''} ${menu?.name||''}`.toLowerCase();
  if (/ก๋วยเตี๋ยว|เส้น|noodle|ก๋วยจั๊บ|ramen/.test(t)) return 'noodle|ramen|thai';
  if (/ข้าวมันไก่|ไก่/.test(t)) return 'thai|chicken';
  if (/ส้มตำ|อีสาน|ไก่ย่าง|ลาบ|น้ำตก/.test(t)) return 'thai|isaan';
  if (/กาแฟ|coffee|คาเฟ่|cafe/.test(t)) return 'coffee|cafe';
  if (/ญี่ปุ่น|ซูชิ|sushi|ทงคัตสึ|ราเมง|ramen/.test(t)) return 'japanese|sushi|ramen';
  if (/เกาหลี|korean|บาร์บีคิว|bbq|จิจิมิ|ไก่ทอด/.test(t)) return 'korean|barbecue|bbq';
  if (/หมูกระทะ|ชาบู|สุกี้|hotpot|shabu/.test(t)) return 'thai|bbq|hotpot|shabu';
  return '';
}

// ---------- API helpers (your backend) ----------
async function loadMenuDetailByName(name) {
  const res = await fetch(`/api/menus/${encodeURIComponent(name)}`);
  if (!res.ok) throw new Error("ไม่พบเมนู");
  return res.json(); // backend +1 views
}
async function loadAllMenusOnce() {
  if (ALL_MENUS_CACHE) return ALL_MENUS_CACHE;
  const res = await fetch('/api/menus');
  if (!res.ok) throw new Error('โหลดเมนูทั้งหมดไม่สำเร็จ');
  ALL_MENUS_CACHE = await res.json();
  return ALL_MENUS_CACHE;
}
async function loadRestaurantById(id) {
  const res = await fetch(`/api/restaurants/${id}`);
  if (!res.ok) throw new Error('ไม่พบร้าน');
  return res.json();
}

// ---------- Reverse geocode (Nominatim) ----------
const addrCache = new Map();
async function reverseGeocode(lat, lng) {
  const key = `${lat.toFixed(6)},${lng.toFixed(6)}`;
  if (addrCache.has(key)) return addrCache.get(key);
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
    const res = await fetch(url, { headers: { "Accept": "application/json" } });
    const json = await res.json();
    const a = json?.address || {};
    const road = a.road || a.footway || a.path || a.pedestrian || a.cycleway || a.residential || a.neighbourhood || "-";
    const parts = [road, a.suburb || a.village || a.neighbourhood, a.town || a.city || a.county, a.state || a.province].filter(Boolean);
    const pretty = Array.from(new Set(parts)).join(" • ") || (json?.name || json?.display_name || "-");
    const out = { roadName: road, pretty };
    addrCache.set(key, out);
    return out;
  } catch {
    return { roadName: "-", pretty: "ไม่ทราบที่อยู่" };
  }
}

// ---------- Leaflet Map + Markers ----------
function initMap() {
  map = L.map("map", { zoomControl: true });

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors'
  }).addTo(map);

  L.Icon.Default.mergeOptions({
    iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  });

  L.control.scale({ imperial:false }).addTo(map);
  map.setView([15.87, 100.99], 6); // ศูนย์กลางประเทศไทย
}

function drawMarkers() {
  if (userMarker) { map.removeLayer(userMarker); userMarker = null; }
  if (shopMarker) { map.removeLayer(shopMarker); shopMarker = null; }

  const group = L.featureGroup();

  if (shopLL) {
    shopMarker = L.marker(shopLL).bindPopup(els.shopName.textContent || "ร้านอาหาร");
    shopMarker.bindTooltip(els.shopName.textContent || "ร้าน", {
      permanent: true, direction: "top", offset: [0, -10], className: "pin-label"
    });
    group.addLayer(shopMarker);
  }

  if (userLL) {
    userMarker = L.marker(userLL).bindPopup("ตำแหน่งของฉัน");
    userMarker.bindTooltip("ฉัน", {
      permanent: true, direction: "top", offset: [0, -10], className: "pin-label"
    });
    group.addLayer(userMarker);
  }

  if (group.getLayers().length) {
    group.addTo(map);
    map.fitBounds(group.getBounds(), { padding: [20, 20] });
  }
}

// ---------- Routing (OSRM) ----------
async function drawRoute() {
  if (routeLine) { map.removeLayer(routeLine); routeLine = null; }
  if (!userLL || !shopLL) return;

  const url = `https://router.project-osrm.org/route/v1/driving/${userLL[1]},${userLL[0]};${shopLL[1]},${shopLL[0]}?overview=full&geometries=geojson`;
  try {
    const res = await fetch(url, { headers: { "Accept": "application/json" } });
    if (!res.ok) throw new Error("OSRM error");
    const json = await res.json();
    const route = json?.routes?.[0];
    if (!route?.geometry?.coordinates?.length) throw new Error("no route");
    const latlngs = route.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
    routeLine = L.polyline(latlngs, { color: '#2563eb', weight: 5, opacity: 0.95 }).addTo(map);
    map.fitBounds(routeLine.getBounds(), { padding: [24, 24] });

    const km = (route.distance / 1000).toFixed(1);
    const min = Math.round(route.duration / 60);
    els.geoStatus.textContent = `เส้นทางโดยประมาณ: ~${km} กม., ~${min} นาที`;
  } catch (e) {
    // fallback เส้นตรง
    routeLine = L.polyline([userLL, shopLL], { color:'#6b7280', weight:4, opacity:.8, dashArray:'8 8' }).addTo(map);
    map.fitBounds(routeLine.getBounds(), { padding: [24, 24] });
    els.geoStatus.textContent = "ไม่สามารถคำนวณเส้นทางจริงได้ แสดงเป็นเส้นตรงแทน";
    console.warn("Routing failed:", e);
  }
}

// ---------- Geolocation ----------
function getUserLocation() {
  return new Promise(resolve => {
    if (!navigator.geolocation) return resolve(false);
    navigator.geolocation.getCurrentPosition(
      pos => { userLL = [pos.coords.latitude, pos.coords.longitude]; els.geoStatus.textContent = "ระบุตำแหน่งผู้ใช้สำเร็จ"; resolve(true); },
      ()  => { els.geoStatus.textContent = "ไม่ได้รับอนุญาตให้ใช้ตำแหน่ง (ใช้ตำแหน่งประมาณแทน)"; resolve(false); },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  });
}

// ---------- Favorites (ต้องล็อกอิน) ----------
function getAuth() {
  try { return JSON.parse(localStorage.getItem("user") || "{}"); }
  catch { return {}; }
}
async function isFavorite(menuId) {
  const { userId, token } = getAuth();
  if (!userId || !token) return false;
  const res = await fetch(`/api/favorites?menuId=${menuId}`, { headers: { "x-user-id": userId, "Authorization": `Bearer ${token}` } });
  if (!res.ok) return false;
  const json = await res.json();
  return !!json?.isFavorite;
}
async function toggleFavorite(menuId) {
  const { userId, token } = getAuth();
  if (!userId || !token) {
    els.saveHint.textContent = "กรุณาเข้าสู่ระบบก่อนบันทึกเมนู";
    location.href = "/login.html";
    return;
  }
  els.saveBtn.disabled = true;
  const nowFav = await isFavorite(menuId);
  const method = nowFav ? "DELETE" : "POST";
  const res = await fetch("/api/favorites", {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-user-id": userId,
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify({ menuId })
  });
  els.saveBtn.disabled = false;
  if (!res.ok) { els.saveHint.textContent = "บันทึกไม่สำเร็จ"; return; }
  const afterFav = !nowFav;
  els.saveBtn.textContent = afterFav ? "★ บันทึกแล้ว" : "☆ บันทึกเมนู";
  els.saveHint.textContent = afterFav ? "บันทึกเมนูเรียบร้อย" : "ยกเลิกการบันทึกแล้ว";
}

// ---------- Render helpers ----------
function renderContact(shop) {
  if (shop?.phone) {
    els.contactPhone.textContent = shop.phone;
    els.contactPhone.href = `tel:${shop.phone.replace(/\s+/g,'')}`;
  } else {
    els.contactPhone.textContent = "-";
    els.contactPhone.removeAttribute("href");
  }
  const extra = [];
  if (shop?.website)  extra.push(`<a class="link" href="${shop.website}" target="_blank" rel="noopener">เว็บไซต์</a>`);
  if (shop?.facebook) extra.push(`<a class="link" href="${shop.facebook}" target="_blank" rel="noopener">Facebook</a>`);
  if (shop?.line)     extra.push(`<span class="link">LINE: ${shop.line}</span>`);
  if (extra.length) {
    els.contactExtra.innerHTML = extra.join(" · ");
    els.contactExtraWrap.style.display = "";
  } else {
    els.contactExtraWrap.style.display = "none";
  }
}

function renderMoreMenus(list) {
  if (!Array.isArray(list) || list.length === 0) {
    els.moreMenusEmpty.style.display = "";
    els.moreMenus.innerHTML = "";
    return;
  }
  els.moreMenusEmpty.style.display = "none";
  els.moreMenus.innerHTML = list.map(m => `
    <article class="tile">
      <img class="tile__img" src="${m.image||FALLBACK_IMG}" alt="${m.name||'-'}" loading="lazy"
           onerror="this.src='${FALLBACK_IMG}'" />
      <div class="tile__body">
        <div class="tile__title">${m.name||'-'}</div>
        <div class="tile__meta">
          <span>${typeof m?.price==='number' ? fmtTHB.format(m.price) : (m.price||'ราคาไม่ระบุ')}</span>
        </div>
        <button class="btn btn--outline" onclick="location.href='/Menu/detail.html?menu=${encodeURIComponent(m.name)}'">ดูรายละเอียด</button>
      </div>
    </article>
  `).join('');
}

// ---------- OSM: Overpass (ร้านใกล้เคียง ไม่ใช้ Google) ----------
function buildOverpassQL(lat, lng, radius = 2500, cuisineHint = '') {
  const amenity = 'restaurant|fast_food|cafe';
  const cuisine = cuisineHint ? `["cuisine"~"${cuisineHint}",i]` : '';
  return `[out:json][timeout:25];
    (
      node["amenity"~"${amenity}"]${cuisine}(around:${radius},${lat},${lng});
      way["amenity"~"${amenity}"]${cuisine}(around:${radius},${lat},${lng});
      relation["amenity"~"${amenity}"]${cuisine}(around:${radius},${lat},${lng});
    );
    out center 40;`;
}

async function fetchOverpassDirect(lat, lng, radius, cuisineHint) {
  const endpoint = 'https://overpass-api.de/api/interpreter';
  const ql = buildOverpassQL(lat, lng, radius, cuisineHint);
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
    body: new URLSearchParams({ data: ql })
  });
  if (!res.ok) throw new Error('Overpass direct error');
  return res.json();
}

async function loadNearbyFromOSM(lat, lng, radius = 2500, cuisineHint = '') {
  // พยายามเรียกผ่านพร็อกซีเซิร์ฟเวอร์ของคุณก่อน (ถ้ามี)
  try {
    const url = new URL('/api/osm/nearby', location.origin);
    url.searchParams.set('lat', lat);
    url.searchParams.set('lng', lng);
    url.searchParams.set('radius', radius);
    if (cuisineHint) url.searchParams.set('cuisine', cuisineHint);
    const res = await fetch(url.toString());
    if (res.ok) return await res.json();
  } catch {}

  // ถ้าไม่สำเร็จ ค่อยยิง Overpass ตรง
  return fetchOverpassDirect(lat, lng, radius, cuisineHint);
}

function toOSMItems(json) {
  const items = (json.elements || []).map(el => {
    const tags = el.tags || {};
    const latlng = el.lat && el.lon ? [el.lat, el.lon] :
                   el.center ? [el.center.lat, el.center.lon] : null;
    return {
      osm_id: el.id,
      name: tags.name || '(ไม่มีชื่อ)',
      address: tags['addr:full'] ||
               [tags['addr:housenumber'], tags['addr:street'], tags['addr:suburb'], tags['addr:city']]
                 .filter(Boolean).join(' ') || '',
      phone: tags['contact:phone'] || tags.phone || '',
      website: tags['contact:website'] || tags.website || '',
      image: '',  // ส่วนใหญ่ OSM ไม่มีรูป → ใช้ FALLBACK_IMG
      lat: latlng ? latlng[0] : null,
      lng: latlng ? latlng[1] : null
    };
  }).filter(x => x.lat && x.lng);

  // dedupe ชื่อ+พิกัดหยาบ
  const seen = new Set();
  const out = [];
  for (const it of items) {
    const key = `${(it.name||'').toLowerCase()}@${it.lat.toFixed(4)},${it.lng.toFixed(4)}`;
    if (!seen.has(key)) { seen.add(key); out.push(it); }
  }
  out.sort((a,b)=>(a.name||'').localeCompare(b.name||''));
  return out.slice(0, 12);
}

function renderOtherShopsOSM(items) {
  if (!Array.isArray(items) || items.length === 0) {
    els.otherShopsEmpty.style.display = "";
    els.otherShops.innerHTML = "";
    return;
  }
  els.otherShopsEmpty.style.display = "none";
  els.otherShops.innerHTML = items.map(i => `
    <article class="tile">
      <img class="tile__img" src="${i.image || FALLBACK_IMG}" alt="${i.name}" loading="lazy"
           onerror="this.src='${FALLBACK_IMG}'">
      <div class="tile__body">
        <div class="tile__title">${i.name}</div>
        ${i.address ? `<div class="tile__meta">${i.address}</div>` : ''}
        <div class="tile__meta">
          ${i.phone ? `<a class="link" href="tel:${i.phone.replace(/\s+/g,'')}">โทร ${i.phone}</a>` : ''}
          ${i.website ? ` ${i.phone ? '· ' : ''}<a class="link" href="${i.website}" target="_blank" rel="noopener">เว็บไซต์</a>` : ''}
        </div>
        <button class="btn btn--primary" data-lat="${i.lat}" data-lng="${i.lng}">แสดงบนแผนที่</button>
      </div>
    </article>
  `).join('');

  els.otherShops.querySelectorAll('button[data-lat]').forEach(btn=>{
    btn.addEventListener('click', async (ev)=>{
      const b = ev.currentTarget;
      const lat = parseFloat(b.getAttribute('data-lat'));
      const lng = parseFloat(b.getAttribute('data-lng'));
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      shopLL = [lat, lng];
      const r = await reverseGeocode(shopLL[0], shopLL[1]);
      els.shopName.textContent = b.closest('.tile')?.querySelector('.tile__title')?.textContent || 'ร้าน';
      els.roadName.textContent = r.roadName || '-';
      els.prettyAddr.textContent = r.pretty || '-';

      drawMarkers();
      await drawRoute();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
}

// ---------- Init ----------
(async function boot() {
  // 1) เมนูหลัก
  const m = await loadMenuDetailByName(menuNameParam);
  menuId = m?._id || null;
  const menuRestaurantId = m?.restaurant?._id || m?.restaurant;
  let shop = m?.restaurant;

  els.menuImage.onerror = () => { els.menuImage.src = FALLBACK_IMG; };
  els.menuName.textContent = m?.name || "-";
  els.menuImage.src = m?.image || FALLBACK_IMG;
  els.menuDesc.textContent = m?.description || m?.review || "";
  els.menuPrice.textContent =
    typeof m?.price === "number"
      ? fmtTHB.format(m.price)
      : (m?.price?.min
          ? `${fmtTHB.format(m.price.min)} - ${fmtTHB.format(m.price.max || m.price.min)}`
          : (m?.price || "ราคาไม่ระบุ"));
  els.menuType.textContent = `ประเภท: ${m?.type || "-"}`;
  els.menuViews.textContent = (m?.stats?.views ?? 0).toLocaleString("th-TH");

  // 2) ร้าน + ที่อยู่ + ติดต่อ
  if (!shop || !shop.location) {
    if (menuRestaurantId) shop = await loadRestaurantById(menuRestaurantId);
  }
  if (shop) {
    els.shopName.textContent = shop?.name || "ร้าน";
    renderContact(shop);

    if (shop?.location?.coordinates) {
      const [lng, lat] = shop.location.coordinates;
      shopLL = [lat, lng];
      const addr = await reverseGeocode(lat, lng);
      els.roadName.textContent = addr.roadName || "-";
      els.prettyAddr.textContent = addr.pretty || "-";
    }
  } else {
    els.shopName.textContent = "—";
  }

  // 3) แผนที่ & ตำแหน่งผู้ใช้ + เส้นทาง
  initMap();
  await getUserLocation();
  drawMarkers();
  await drawRoute();

  // 4) เมนูเพิ่มเติมของร้าน (จากฐานข้อมูลของคุณ)
  try {
    const all = await loadAllMenusOnce();
    const more = all.filter(x =>
      ((x.restaurant?._id || x.restaurant) === (menuRestaurantId || '')) &&
      (x.name !== m.name) &&
      (x.status ? x.status === 'published' : true)
    ).slice(0, 8);
    renderMoreMenus(more);
  } catch (e) {
    console.warn("โหลดรายการเพิ่มเติมไม่สำเร็จ", e);
    renderMoreMenus([]);
  }

  // 5) ร้านอื่นที่มีเมนูนี้ — ลองหาในฐานข้อมูลของคุณก่อน
  let renderedOthers = false;
  try {
    const all = ALL_MENUS_CACHE || await loadAllMenusOnce();
    const sameMenus = all.filter(x => x.name === m.name);
    const otherRestaurantIds = Array.from(new Set(
      sameMenus.map(x => (x.restaurant?._id || x.restaurant)).filter(id => id && id !== (menuRestaurantId || ''))
    )).slice(0, 10);

    if (otherRestaurantIds.length) {
      const others = [];
      for (const rid of otherRestaurantIds) {
        try { others.push(await loadRestaurantById(rid)); } catch {}
      }
      others.sort((a,b)=>(a?.name||"").localeCompare(b?.name||""));
      const items = others.map(r => ({
        name: r.name || '-',
        address: r.address || '',
        phone: r.phone || '',
        website: r.website || '',
        image: r.image || '',
        lat: r?.location?.coordinates ? r.location.coordinates[1] : null,
        lng: r?.location?.coordinates ? r.location.coordinates[0] : null
      })).filter(i => i.lat && i.lng);
      renderOtherShopsOSM(items);
      renderedOthers = true;
    }
  } catch (e) {
    console.warn("ค้นหาร้านอื่นจาก DB ไม่สำเร็จ", e);
  }

  // 6) ถ้ายังไม่มีผลลัพธ์ ให้ดึงจาก OSM / Overpass รอบตำแหน่งร้าน (หรือผู้ใช้)
  if (!renderedOthers) {
    try {
      const center = shopLL || userLL || [13.7563, 100.5018];
      const json = await loadNearbyFromOSM(center[0], center[1], 2500, cuisineHintFromMenu(m));
      const items = toOSMItems(json);
      renderOtherShopsOSM(items);
    } catch (e) {
      console.warn('โหลดร้านจาก OSM ไม่สำเร็จ', e);
      renderOtherShopsOSM([]);
    }
  }

  // 7) ปุ่ม
  els.recenter.addEventListener("click", async () => {
    if (routeLine) {
      map.fitBounds(routeLine.getBounds(), { padding: [24, 24] });
    } else if (userLL) {
      map.setView(userLL, 16);
    }
    await drawRoute();
  });

  els.shareBtn.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(location.href); els.saveHint.textContent = "คัดลอกลิงก์แล้ว"; }
    catch { els.saveHint.textContent = "คัดลอกไม่สำเร็จ"; }
    setTimeout(()=> els.saveHint.textContent = "", 2000);
  });

  if (menuId) {
    const fav = await isFavorite(menuId);
    els.saveBtn.textContent = fav ? "★ บันทึกแล้ว" : "☆ บันทึกเมนู";
  }
  els.saveBtn.addEventListener("click", () => toggleFavorite(menuId));
})();
