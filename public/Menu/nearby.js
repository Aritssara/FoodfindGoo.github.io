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
    // ⬇️ สำคัญ: รองรับทั้งชื่อฟิลด์ hours (จากแอดมิน) และ openingHours (จากที่อื่น)
    openingHours: (s.openingHours ?? s.hours ?? s.opening_hours ?? null),
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
  <article class="card" data-id="${s.id}" role="button" tabindex="0" aria-label="ดูรายละเอียด ${esc(s.name)}"
           onclick="location.href='/Menu/shop.html?id=${s.id}'"
           onkeydown="if(event.key==='Enter'||event.key===' '){location.href='/Menu/shop.html?id=${s.id}'}">
    <div class="thumb">
      <img src="${s.image}" alt="${esc(s.name)}" loading="lazy" decoding="async" onerror="this.src='/assets/img/placeholder-shop.jpg'"/>
      <div class="badges">${priceBadge}${distBadge}</div>
    </div>
    <div class="body">
      <h3 class="title">${esc(s.name)}</h3>
      <div class="row subtle" style="gap:8px;">
        <span class="rating"><i class="fa-solid fa-star"></i> ${(s.ratingAvg||0).toFixed(1)}</span>
        <span>(${s.ratingCount||0} รีวิว)</span>
        <span>•</span>
        <span class="status ${openInfo.class}">${openInfo.text}</span>
      </div>
      <div class="row subtle" style="margin-top:4px;">
        <i class="fa-regular fa-clock" aria-hidden="true"></i>
        <span aria-label="เวลาเปิดวันนี้">${openInfo.todayText || "ไม่ระบุเวลา"}</span>
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
function esc(str=""){ return String(str).replace(/[&<>"']/g, s=>({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;" }[s])); }
function fmtDistance(m){ if (!Number.isFinite(m)) return "—"; return m<1000? `${Math.round(m)} m` : `${(m/1000).toFixed(1)} km`; }
function haversineMeters(lat1, lon1, lat2, lon2){
  const R=6371000, toRad=d=>d*Math.PI/180, dLat=toRad(lat2-lat1), dLon=toRad(lon2-lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(a));
}

const DAY_KEYS = ["sun","mon","tue","wed","thu","fri","sat"];
// ✅ แมปชื่อวันภาษาไทย -> อังกฤษ
const TH2EN = {
  "อาทิตย์":"sun","จันทร์":"mon","อังคาร":"tue",
  "พุธ":"wed","พฤหัสบดี":"thu","ศุกร์":"fri","เสาร์":"sat"
};

const PAD = n => String(n).padStart(2,"0");
const toMins = (hhmm) => { const [h,m] = hhmm.split(":").map(Number); return (h*60 + (m||0) + 7*24*60)%(24*60); };
const minsToHHMM = mins => `${PAD(Math.floor(mins/60)%24)}:${PAD(mins%60)}`;
const nowLocal = () => new Date();

/** แปลง openingHours “หลายรูปแบบ” -> { mon:[["09:00","18:00"], ...], ... } */
function normalizeOpening(opening){
  if (!opening) return null;

  // 1) สตริงเดียวทุกวัน
  if (typeof opening === "string"){
    const t = opening.trim().toLowerCase();
    if (!t) return null;

    // 24 ชั่วโมง
    if (/(ตลอด\s*24\s*ชั่วโมง|24\s*ชั่วโมง|24h|24-hour)/.test(t)) {
      return Object.fromEntries(DAY_KEYS.map(k=>[k, [["00:00","24:00"]]]));
    }

    // “เปิดทุกวัน 10:00-20:00”, “10.00 - 20.00”, “10:00–20:00”
    const m = t.replaceAll(".",":").match(/(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/);
    if (m){
      const range = [[m[1], m[2]]];
      return Object.fromEntries(DAY_KEYS.map(k=>[k, range]));
    }
    return null;
  }

  // 2) แบบ Google Places: periods
  if (Array.isArray(opening.periods)) {
    const map = Object.fromEntries(DAY_KEYS.map(k=>[k, []]));
    for (const p of opening.periods){
      if (!p?.open?.day || !p?.open?.time) continue;
      const od = Number(p.open.day)||0;
      const ct = p?.close?.time; // อาจไม่มี (24h)
      const cd = Number(p?.close?.day ?? od) % 7;
      const ot = p.open.time; // "HHmm"
      const from = `${ot.slice(0,2)}:${ot.slice(2)}`;
      const to   = ct ? `${ct.slice(0,2)}:${ct.slice(2)}` : "24:00";
      // ข้ามวัน หรือเวลาปิด <= เวลาเปิด
      if (ct && (od !== cd || toMins(to) <= toMins(from))) {
        map[DAY_KEYS[od]].push([from,"24:00"]);
        map[DAY_KEYS[(od+1)%7]].push(["00:00", to]);
      } else {
        map[DAY_KEYS[od]].push([from,to]);
      }
    }
    return map;
  }

  // 3) อ็อบเจ็กต์รายวัน (รองรับคีย์ไทย/อังกฤษ และค่าทั้ง string/array)
  const keys = Object.keys(opening || {});
  const hasDaily = keys.length && keys.some(k => DAY_KEYS.includes(k) || TH2EN[k]);
  if (hasDaily){
    const map = {};
    for (const kEn of DAY_KEYS){
      const thKey = Object.keys(TH2EN).find(th => TH2EN[th] === kEn);
      const v = opening[kEn] ?? opening[thKey];

      if (!v){ map[kEn] = []; continue; }

      if (typeof v === "string"){
        const s = v.trim().toLowerCase().replaceAll(".",":");
        if (/(ตลอด\s*24\s*ชั่วโมง|24\s*ชั่วโมง|24h|24-hour|^24$)/.test(s)) {
          map[kEn] = [["00:00","24:00"]];
          continue;
        }
        const m = s.match(/(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/);
        map[kEn] = m ? [[m[1], m[2]]] : [];
      } else if (Array.isArray(v)){
        // [["10:00","14:00"], ["16:00","20:00"]] หรือ ["10:00","18:00"]
        if (v.length && Array.isArray(v[0])) map[kEn] = v;
        else if (v.length===2 && typeof v[0]==="string") map[kEn] = [v];
        else map[kEn] = [];
      } else {
        map[kEn] = [];
      }
    }
    return map;
  }

  return null;
}

/** สถานะเปิด/ปิด + เวลาเปิด/ปิดถัดไป + ช่วงของวันนี้ */
function getOpenStatus(opening){
  const map = normalizeOpening(opening);
  if (!map) return { text:"ไม่ระบุเวลา", class:"closed", todayText:"" };

  const now = nowLocal();
  const dayIdx = now.getDay(); // 0=Sun
  const minsNow = now.getHours()*60 + now.getMinutes();

  const todayRanges = (map[DAY_KEYS[dayIdx]] || []).map(([a,b]) => [toMins(a), toMins(b=== "24:00" ? "23:59" : b)]);
  let open = false, closeInMins = null, nextOpenInMins = null;

  for (const [a,b] of todayRanges){
    if (minsNow >= a && minsNow < b){
      open = true;
      closeInMins = Math.min(closeInMins ?? Infinity, b - minsNow);
    } else if (minsNow < a){
      nextOpenInMins = Math.min(nextOpenInMins ?? Infinity, a - minsNow);
    }
  }

  // หาเวลาเปิดครั้งถัดไปในวันถัดไป (ถ้าวันนี้ไม่มีรอบเหลือ)
  if (!open && (nextOpenInMins == null)){
    for (let d=1; d<=7; d++){
      const idx = (dayIdx + d) % 7;
      const ranges = (map[DAY_KEYS[idx]] || []).map(([a,_b]) => [toMins(a), 0]);
      if (ranges.length){
        nextOpenInMins = (24*60 - minsNow) + (d-1)*24*60 + (ranges[0][0]);
        break;
      }
    }
  }

  const todayText = (map[DAY_KEYS[dayIdx]]||[]).length
    ? (map[DAY_KEYS[dayIdx]].map(([a,b]) => `${a}–${b}`).join(", "))
    : "ปิดทั้งวัน";

  if (open){
    const soon = closeInMins !== null && closeInMins <= 30;
    const at = minsToHHMM(minsNow + (closeInMins||0));
    return { text: soon ? `ใกล้ปิด • ปิด ${at}` : `เปิดอยู่ • ปิด ${at}`, class: soon ? "soon" : "open", todayText };
  } else {
    if (nextOpenInMins != null){
      const at = minsToHHMM(minsNow + nextOpenInMins);
      return { text:`ปิดอยู่ • เปิด ${at}`, class:"closed", todayText };
    }
    return { text:"ปิดอยู่", class:"closed", todayText };
  }
}
