// nearby.js — ปรับระเบียบ + เพิ่ม skeleton + รองรับทั้ง /near และ /restaurants?lat=...
const API_BASE = "";
const RADIUS_M = 2000;

const els = {
  summary: document.getElementById("summary"),
  foundText: document.getElementById("foundText"),
  sortSelect: document.getElementById("sortSelect"),
  cards: document.getElementById("cards"),
};
els.sortSelect && (els.sortSelect.value = (localStorage.getItem('nearbySort') || 'distance-asc'));


let state = { lat: null, lng: null, shops: [], sort: localStorage.getItem('nearbySort') || 'distance-asc', filters: { openNow:false, minRating:0, maxDistance:RADIUS_M } };

/* ===== Events ===== */
els.sortSelect?.addEventListener("change", () => { state.sort = els.sortSelect.value; localStorage.setItem('nearbySort', state.sort); render(); });

/* ===== Init ===== */

/* ===== Filter sheet bindings ===== */
const sheet = document.getElementById('filterSheet');
const fOpenNow = document.getElementById('fOpenNow');
const fMinRating = document.getElementById('fMinRating');
const fMaxDist = document.getElementById('fMaxDist');
const fMaxDistLabel = document.getElementById('fMaxDistLabel');
document.getElementById('btnFilter')?.addEventListener('click', ()=> sheet?.classList.toggle('show'));
document.getElementById('fReset')?.addEventListener('click', ()=>{
  if(!fOpenNow||!fMinRating||!fMaxDist||!fMaxDistLabel) return;
  fOpenNow.checked=false; fMinRating.value='0'; fMaxDist.value=String(RADIUS_M);
  fMaxDistLabel.textContent = `${(RADIUS_M/1000).toFixed(0)} กม.`;
});
fMaxDist?.addEventListener('input', ()=>{
  const km = (Number(fMaxDist.value)/1000).toFixed(1);
  fMaxDistLabel.textContent = `${km} กม.`;
});
document.getElementById('fApply')?.addEventListener('click', ()=>{
  state.filters = {
    openNow: !!fOpenNow?.checked,
    minRating: Number(fMinRating?.value || 0),
    maxDistance: Number(fMaxDist?.value || RADIUS_M)
  };
  sheet?.classList.remove('show');
  render();
});
initGeolocation();

function initGeolocation(){
  if (!navigator.geolocation){
    els.summary.textContent = "เบราว์เซอร์ไม่รองรับระบุตำแหน่ง";
    return;
  }
  navigator.geolocation.getCurrentPosition(onGeoSuccess, onGeoError, { enableHighAccuracy:true, timeout:12000 });
}

async function onGeoSuccess(pos){
  state.lat = pos.coords.latitude;
  state.lng = pos.coords.longitude;
  els.summary.textContent = "พิกัดของคุณพร้อมแล้ว";
  await fetchNearby();
}

function onGeoError(err){
  console.warn(err);
  els.summary.innerHTML = `ต้องอนุญาตตำแหน่งก่อน 
    <button id="retry" class="btn" style="padding:6px 10px;margin-left:8px;">ลองอีกครั้ง</button>`;
  document.getElementById("retry")?.addEventListener("click", initGeolocation);
}

/* ===== Fetch & Normalize ===== */
async function fetchNearby(){
  els.foundText.textContent = "กำลังค้นหาร้าน...";
  // พยายามเรียก /near ก่อน -> /restaurants?lat=... -> /restaurants
  const urls = [
    `${API_BASE}/api/restaurants?lat=${state.lat}&lng=${state.lng}&radius=${RADIUS_M}`,
    `${API_BASE}/api/restaurants`
  ];

  let list = [];
  for (const u of urls){
    try{
      const res = await fetch(u);
      if (res.ok){
        const data = await res.json();
        if (Array.isArray(data)){ list = data; break; }
      }
    }catch{ /* try next */ }
  }
  if (!list.length){ els.foundText.textContent = "ดึงข้อมูลไม่สำเร็จ"; return; }

  const normalized = list.map(normalizeShop)
    .filter(s => Number.isFinite(s.distance) && s.distance <= RADIUS_M);

  state.shops = normalized;
  els.foundText.textContent = `พบ ${state.shops.length} ร้านในรัศมี ${(RADIUS_M/1000).toFixed(0)} กม.`;
  render();
}

function normalizeShop(s){
  const lng = s?.location?.coordinates?.[0];
  const lat = s?.location?.coordinates?.[1];
  const dist = Number.isFinite(s?.distance) ? s.distance :
    (Number.isFinite(lat) && Number.isFinite(lng) && Number.isFinite(state.lat) && Number.isFinite(state.lng)
      ? haversineMeters(state.lat, state.lng, lat, lng) : NaN);

  return {
    id: s._id || s.id,
    name: s.name || "ไม่ทราบชื่อร้าน",
    addressShort: s.addressShort || s.address || "",
    phone: s.phone || "",
    image: (Array.isArray(s.photos) && s.photos[0]) || s.image || "/assets/img/placeholder-shop.jpg",
    ratingAvg: Number.isFinite(s.ratingAvg) ? s.ratingAvg : (Number.isFinite(s.avgRating) ? s.avgRating : 0),
    ratingCount: Number.isFinite(s.ratingCount) ? s.ratingCount :
                 (Number.isFinite(s.reviewCount) ? s.reviewCount : 0),
    priceLevel: s.priceLevel || null,
    openingHours: s.openingHours || null,
    lat, lng,
    distance: dist
  };
}

/* ===== Render ===== */
function render(){
  const sorted = sortList([...state.shops], state.sort);
  const list = sorted.filter(applyFilter);
  els.cards.innerHTML = list.length ? list.map(cardHTML).join("") : emptyHTML();
  bindShare(list);
}
function applyFilter(s){
  const passDist = !Number.isFinite(state.filters.maxDistance) ? true : (s.distance||Infinity) <= state.filters.maxDistance;
  const passRate = (s.ratingAvg||0) >= (state.filters.minRating||0);
  const passOpen = state.filters.openNow ? (getOpenStatus(s.openingHours).class === 'open') : true;
  return passDist && passRate && passOpen;
}

function sortList(list, mode){
  switch (mode){
    case "distance-desc": return list.sort((a,b)=>(b.distance||0)-(a.distance||0));
    case "rating-desc":   return list.sort((a,b)=>(b.ratingAvg||0)-(a.ratingAvg||0));
    case "review-desc":   return list.sort((a,b)=>(b.ratingCount||0)-(a.ratingCount||0));
    default:              return list.sort((a,b)=>(a.distance||0)-(b.distance||0));
  }
}

function cardHTML(s){
  const priceBadge = s.priceLevel ? `<span class="badge"><i class="fa-solid fa-b"></i> ${s.priceLevel}</span>` : "";
  const distBadge  = Number.isFinite(s.distance) ? `<span class="badge"><i class="fa-solid fa-route"></i> ${fmtDistance(s.distance)}</span>` : "";
  const openInfo   = getOpenStatus(s.openingHours);

  return `
  <article class="card" data-id="${s.id}" role="button" tabindex="0" aria-label="ดูรายละเอียด ${esc(s.name)}" onclick="location.href='/Menu/shop.html?id=${s.id}'" onkeydown="if(event.key==='Enter'||event.key===' '){location.href='/Menu/shop.html?id=${s.id}'}">
    <div class="thumb">
      <img src="${s.image}" alt="${esc(s.name)}" loading="lazy" decoding="async" onerror="this.src='/assets/img/placeholder-shop.jpg'"/>
      <div class="badges">${priceBadge}${distBadge}</div>
    </div>
    <div class="body">
      <h3 class="title">${esc(s.name)}</h3>
      <div class="row subtle">
        <span class="rating"><i class="fa-solid fa-star"></i> ${(s.ratingAvg||0).toFixed(1)}</span>
        <span>(${s.ratingCount||0} รีวิว)</span>
        <span>•</span>
        <span class="status ${openInfo.class}">${openInfo.text}</span>
      </div>
      <div class="address"><i class="fa-solid fa-location-dot"></i>
        <span>${esc(s.addressShort || "—")}</span>
      </div>
    </div>
    <div class="actions">
      <a class="btn primary" href="/Menu/shop.html?id=${s.id}"><i class="fa-regular fa-eye"></i> ดูรายละเอียด</a>
    </div>
  </article>`;
}

function emptyHTML(){
  return `<div class="card" style="grid-column:1/-1; text-align:center; padding:28px;">ยังไม่พบร้านในรัศมี ${(RADIUS_M/1000).toFixed(0)} กม.</div>`;
}

function bindShare(list){
  document.querySelectorAll("[data-share]").forEach(btn=>{
    btn.onclick = ()=>{
      const id = btn.getAttribute("data-share");
      const s = list.find(x=> x.id===id);
      const url = location.origin + `/Menu/shop.html?id=${s.id}`;
      const text = `${s.name} • คะแนน ${(s.ratingAvg||0).toFixed(1)} (${s.ratingCount||0} รีวิว)`;
      if (navigator.share){ navigator.share({ title:s.name, text, url }).catch(()=>{}); }
      else { navigator.clipboard.writeText(`${text}\n${url}`).then(()=> alert("คัดลอกลิงก์แล้ว")); }
    };
  });
}

/* ===== Helpers ===== */
function esc(str=""){ return str.replace(/[&<>"']/g, s=>({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;" }[s])); }
function fmtDistance(m){ if (!Number.isFinite(m)) return "—"; return m<1000? `${Math.round(m)} m` : `${(m/1000).toFixed(1)} km`; }
function haversineMeters(lat1, lon1, lat2, lon2){
  const R=6371000, toRad=d=>d*Math.PI/180, dLat=toRad(lat2-lat1), dLon=toRad(lon2-lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(a));
}
function getOpenStatus(opening){
  try{
    if(!opening) return { text:"ไม่ระบุเวลา", class:"closed" };
    const now=new Date(), keys=["sun","mon","tue","wed","thu","fri","sat"], key=keys[now.getDay()];
    const ranges=opening[key]||[], mins=now.getHours()*60+now.getMinutes();
    let open=false, near=false;
    for(const [a,b] of ranges){
      const [ah,am]=a.split(":").map(Number), [bh,bm]=b.split(":").map(Number);
      const st=ah*60+am, en=bh*60+bm;
      if (mins>=st && mins<=en){ open=true; near=(en-mins)<=30; }
    }
    if (open && near) return { text:"ใกล้ปิด", class:"soon" };
    if (open) return { text:"เปิดอยู่", class:"open" };
    return { text:"ปิดแล้ว", class:"closed" };
  }catch{ return { text:"ไม่ระบุเวลา", class:"closed" }; }
}
