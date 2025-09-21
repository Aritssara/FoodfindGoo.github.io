/* ========= ตั้งค่า ========= */
const API_URL = "/api/menus";
const FALLBACK_IMG = "/background/food.jpg";

/* ========= DOM ========= */
const listEl  = document.getElementById("menuList");
const catWrap = document.getElementById("catScroller");
const stateEl = document.getElementById("state");

/* ========= State ========= */
let ALL = [];
let GROUPS = {};
let ACTIVE_CAT = "ทั้งหมด";

/* ========= Safe utils ========= */
const esc = (s='') => String(s)
  .replaceAll('&','&amp;').replaceAll('<','&lt;')
  .replaceAll('>','&gt;').replaceAll('"','&quot;')
  .replaceAll("'",'&#39;');

/* ========= View Track (กันยิงซ้ำต่อ session) ========= */
const VIEW_STORAGE_KEY = "ffg_menu_viewed_ids_v1";
const VIEWED_SET = loadSet(VIEW_STORAGE_KEY);

function loadSet(key){
  try{
    const raw = sessionStorage.getItem(key);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  }catch{ return new Set(); }
}
function persistSet(key, set){
  try{ sessionStorage.setItem(key, JSON.stringify([...set])); }catch{}
}
function markViewed(id){ if(!id) return; VIEWED_SET.add(id); persistSet(VIEW_STORAGE_KEY, VIEWED_SET); }
const hasViewed = (id) => VIEWED_SET.has(id);

/* ========= Click Track ========= */
const CLICK_STORAGE_KEY = "ffg_menu_clicked_ids_v1";
const CLICKED_SET = loadSet(CLICK_STORAGE_KEY);
function markClicked(id){ if(!id) return; CLICKED_SET.add(id); persistSet(CLICK_STORAGE_KEY, CLICKED_SET); }
const hasClicked = (id) => CLICKED_SET.has(id);

/* ========= Utils ========= */
// จัดกลุ่มหมวดแบบ normalize (ตัดช่องว่าง/ตัวพิมพ์เล็ก)
const norm = (s='') => s.toString().trim();
const normKey = (s='') => norm(s).toLowerCase();

function groupByCategory(items){
  const map = {};
  for(const m of items){
    const raw = norm(m.category || m.type || "อื่นๆ");
    const key = raw ? normKey(raw) : "อื่นๆ";
    (map[key] ||= { label: raw || "อื่นๆ", items: [] }).items.push(m);
  }
  return map;
}

/* หา restaurant key */
function getRestaurantKey(m){
  if(!m || typeof m !== "object") return null;
  const direct = m.restaurantId || m.shopId || m.shop_id || m.restaurant_id;
  if (direct) return direct;
  const r = m.restaurant || m.shop || {};
  return r._id || r.id || r.slug || null;
}

/* ดึง _id เมนูให้แน่ใจ */
const getMenuId = (m) => m?._id || m?.id || null;

/* ไปหน้า shop.html */
function gotoDetail(menuObj){
  const key = getRestaurantKey(menuObj);
  const url = new URL("/Menu/shop.html", location.origin);
  if (key){
    url.searchParams.set("id", key);
    if (menuObj?._id) url.searchParams.set("menuId", menuObj._id);
    else if (menuObj?.name) url.searchParams.set("menu", menuObj.name);
  }else{
    if (menuObj?.name) url.searchParams.set("menu", menuObj.name);
    console.warn("[menu.js] ไม่มี restaurant id/slug ในเมนูนี้");
  }
  window.location.href = url.toString();
}

/* ราคา */
const fmtTHB = new Intl.NumberFormat("th-TH",{ style:"currency", currency:"THB", maximumFractionDigits:0 });
function getPrice(m){
  if (typeof m?.price === "number") return fmtTHB.format(m.price);
  if (typeof m?.price === "string" && m.price.trim()) return esc(m.price.trim());
  if (m?.price?.min || m?.price?.max){
    const min = Number.isFinite(m.price.min) ? fmtTHB.format(m.price.min) : null;
    const max = Number.isFinite(m.price.max) ? fmtTHB.format(m.price.max) : null;
    if (min && max) return `${min} - ${max}`;
    if (min) return min;
    if (max) return max;
  }
  return "ราคาไม่ระบุ";
}
const getViews = (m) => Number.isFinite(m?.stats?.views ?? m?.views) ? (m.stats?.views ?? m.views) : 0;

/* ========= หมวด ========= */
function renderCategories(groups){
  if (!catWrap) return;
  catWrap.innerHTML = "";

  // รายการหมวด
  const cats = [{ key:"ทั้งหมด", label:"ทั้งหมด" }, ...Object.entries(groups)
    .sort((a,b)=> a[1].label.localeCompare(b[1].label,"th"))
    .map(([key, val]) => ({ key, label: val.label }))];

  for (const {key,label} of cats){
    const btn = document.createElement("button");
    btn.className = "cat-chip" + ((key==="ทั้งหมด" && ACTIVE_CAT==="ทั้งหมด") || (key!=="ทั้งหมด" && normKey(ACTIVE_CAT)===key) ? " active" : "");

    const thumb = document.createElement("div");
    thumb.className = "thumb";

    if (key === "ทั้งหมด"){
      const span = document.createElement("span"); span.textContent = "🍽️";
      thumb.appendChild(span);
    }else{
      const first = groups[key]?.items?.[0];
      const img = document.createElement("img");
      img.src = (first && first.image) ? first.image : FALLBACK_IMG;
      img.alt = label;
      img.loading = "lazy";
      img.decoding = "async";
      img.referrerPolicy = "no-referrer";
      img.onerror = () => { img.src = FALLBACK_IMG; };
      thumb.appendChild(img);
    }

    const lab = document.createElement("div");
    lab.className = "label";
    lab.textContent = label;

    btn.appendChild(thumb);
    btn.appendChild(lab);

    btn.addEventListener("click", ()=>{
      ACTIVE_CAT = label;
      renderCategories(groups);
      renderGrid();

      const url = new URL(location.href);
      if (label === "ทั้งหมด") url.searchParams.delete("cat");
      else url.searchParams.set("cat", label);
      history.replaceState(null,"",url.toString());
    });

    catWrap.appendChild(btn);
  }
}

/* ========= นับวิวเมื่อการ์ดโผล่ ========= */
let io = null;
function ensureObserver(){
  if (io) return io;
  if (!("IntersectionObserver" in window)) return null;
  io = new IntersectionObserver((entries, obs)=>{
    entries.forEach(en=>{
      if (!en.isIntersecting) return;
      const card = en.target;
      const menuId = card.getAttribute("data-menu-id");
      const viewsCountEl = card.querySelector(".views-count");
      if (menuId) pingMenuView(menuId, viewsCountEl);
      obs.unobserve(card);
    });
  },{ threshold:0.4 });
  return io;
}

async function pingMenuView(menuId, viewsCountEl){
  try{
    if (!menuId || hasViewed(menuId)) return;
    markViewed(menuId); // optimistic

    // optimistic UI
    if (viewsCountEl){
      const current = parseInt((viewsCountEl.textContent||"0").replace(/[^\d]/g,""),10) || 0;
      viewsCountEl.textContent = (current+1).toLocaleString("th-TH");
    }

    const res = await fetch(`${API_URL}/${encodeURIComponent(menuId)}/view`, { method:"POST", keepalive:true });
    if (res.ok){
      const data = await res.json().catch(()=>null);
      if (data && data.ok === true && data.uniqueAdded === 0 && viewsCountEl){
        const current = parseInt((viewsCountEl.textContent||"0").replace(/[^\d]/g,""),10) || 0;
        if (current>0) viewsCountEl.textContent = (current-1).toLocaleString("th-TH");
      }
    }
  }catch{/* เงียบไว้ */}
}

function pingMenuClick(menuId){
  try{
    if (!menuId || hasClicked(menuId)) return;
    markClicked(menuId);
    const body = "{}";
    const blob = new Blob([body], { type:"application/json" });
    if (navigator.sendBeacon){
      navigator.sendBeacon(`${API_URL}/${encodeURIComponent(menuId)}/click`, blob);
    }else{
      fetch(`${API_URL}/${encodeURIComponent(menuId)}/click`, {
        method:"POST", headers:{ "Content-Type":"application/json" }, body, keepalive:true
      }).catch(()=>{});
    }
  }catch{}
}

/* ========= Render กริด ========= */
function renderGrid(){
  if (!listEl) return;
  // เคลียร์ observer เก่า (ป้องกันหลง observe องค์ประกอบที่ถูกลบ)
  if (io) { io.disconnect(); io = null; }

  listEl.innerHTML = "";

  const items = (ACTIVE_CAT === "ทั้งหมด")
    ? ALL
    : (GROUPS[normKey(ACTIVE_CAT)]?.items || []);

  if (items.length === 0){
    stateEl.textContent = "ไม่มีเมนูในหมวดนี้";
    return;
  }
  stateEl.textContent = "";

  const observer = ensureObserver();

  for (const m of items){
    const li = document.createElement("li");
    li.className = "card";

    const name = esc(m.name || "-");
    const img  = m.image || FALLBACK_IMG;
    const desc = esc(m.description || m.review || "");
    const priceText = getPrice(m);
    const viewsText = getViews(m).toLocaleString("th-TH");
    const menuId = getMenuId(m);
    if (menuId) li.setAttribute("data-menu-id", menuId);

    li.innerHTML = `
      <img src="${esc(img)}" alt="${name}" class="card-img"
           loading="lazy" decoding="async" referrerpolicy="no-referrer" />
      <h3 class="card-title">${name}</h3>
      ${desc ? `<p class="card-desc muted">${desc}</p>` : ""}
      <div class="meta">
        <span class="badge price">${priceText}</span>
        <span class="badge"><i>👁</i> <span class="views-count">${viewsText}</span> วิว</span>
      </div>
      <button class="content-btn" type="button">ดูรายละเอียด</button>
    `;

    // รูปแตก = fallback
    li.querySelector(".card-img").addEventListener("error", (e)=>{ e.currentTarget.src = FALLBACK_IMG; });

    const go = () => { if (menuId) pingMenuClick(menuId); gotoDetail(m); };
    li.querySelector(".content-btn")?.addEventListener("click", go);
    li.querySelector(".card-img")?.addEventListener("click", go);
    li.querySelector(".card-title")?.addEventListener("click", go);

    listEl.appendChild(li);

    if (observer && menuId && !hasViewed(menuId)) observer.observe(li);
    else if (!observer && menuId && !hasViewed(menuId)) {
      const viewsCountEl = li.querySelector(".views-count");
      pingMenuView(menuId, viewsCountEl);
    }
  }
}

/* ========= Data ========= */
async function loadMenus(){
  stateEl.textContent = "กำลังโหลดเมนูอาหาร...";
  try{
    const res = await fetch(API_URL, { method:"GET" });
    if (!res.ok) throw new Error("โหลดข้อมูลไม่สำเร็จ");
    const data = await res.json();
    stateEl.textContent = "";
    return Array.isArray(data) ? data : [];
  }catch(e){
    console.error(e);
    stateEl.textContent = "❌ โหลดเมนูไม่สำเร็จ";
    return [];
  }
}

/* ========= Init ========= */
(async function init(){
  const url = new URL(location.href);
  ACTIVE_CAT = url.searchParams.get("cat") || "ทั้งหมด";

  ALL = await loadMenus();
  GROUPS = groupByCategory(ALL);

  renderCategories(GROUPS);
  renderGrid();
})();
