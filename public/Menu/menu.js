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

/* ========= View Track (กันยิงซ้ำต่อ session) ========= */
const VIEW_STORAGE_KEY = "ffg_menu_viewed_ids_v1";
const VIEWED_SET = loadViewedSet();

function loadViewedSet() {
  try {
    const raw = sessionStorage.getItem(VIEW_STORAGE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch { return new Set(); }
}
function markViewed(id) {
  if (!id) return;
  VIEWED_SET.add(id);
  try {
    sessionStorage.setItem(VIEW_STORAGE_KEY, JSON.stringify([...VIEWED_SET]));
  } catch {}
}
function hasViewed(id) {
  return VIEWED_SET.has(id);
}

/* ========= Utils ========= */
// จัดกลุ่มเมนูตามหมวด (รองรับทั้ง category และ type)
function groupByCategory(items) {
  const map = {};
  for (const m of items) {
    const cat = (m.category || m.type || "อื่นๆ").toString().trim();
    (map[cat] ||= []).push(m);
  }
  return map;
}

/* ---- หา restaurant id/slug จากอ็อบเจ็กต์เมนู ---- */
function getRestaurantKey(m) {
  if (!m || typeof m !== "object") return null;

  const direct =
    m.restaurantId ||
    m.shopId ||
    m.shop_id ||
    m.restaurant_id;

  if (direct) return direct;

  const r = m.restaurant || m.shop || {};
  return r._id || r.id || r.slug || null;
}

/* ดึง _id ของเมนูให้แน่ใจ */
function getMenuId(m) {
  return m?._id || m?.id || null;
}

/* ไปหน้าแสดงรายละเอียด (shop.html) โดยพยายามส่ง "id" ก่อน แล้วค่อย fallback เป็น "menu" */
function gotoDetail(menuObj) {
  const key = getRestaurantKey(menuObj);
  const url = new URL("/Menu/shop.html", location.origin);

  if (key) {
    url.searchParams.set("id", key);
    // แนบเมนูเพื่อให้หน้า Shop โฟกัสเมนูนั้นได้ (ถ้าอยากใช้)
    if (menuObj?._id) url.searchParams.set("menuId", menuObj._id);
    else if (menuObj?.name) url.searchParams.set("menu", menuObj.name);
  } else {
    // ไม่มีรหัสร้านจริง ๆ -> fallback เดิม (อาจทำให้ได้โหมดเดโม่)
    if (menuObj?.name) url.searchParams.set("menu", menuObj.name);
    console.warn("[menu.js] ไม่มี restaurant id/slug ในเมนูนี้, ส่งเฉพาะชื่อเมนูไปที่ shop.html");
  }

  window.location.href = url.toString();
}

// ฟอร์แมตราคาเป็นสกุลบาท (THB)
const fmtTHB = new Intl.NumberFormat("th-TH", {
  style: "currency",
  currency: "THB",
  maximumFractionDigits: 0
});

// ดึงราคาแบบปลอดภัย (รองรับหลายเคส)
function getPrice(m) {
  if (typeof m?.price === "number") return fmtTHB.format(m.price);
  if (typeof m?.price === "string" && m.price.trim()) return m.price.trim();
  if (m?.price?.min || m?.price?.max) {
    const min = m.price.min ? fmtTHB.format(m.price.min) : null;
    const max = m.price.max ? fmtTHB.format(m.price.max) : null;
    if (min && max) return `${min} - ${max}`;
    if (min) return min;
    if (max) return max;
  }
  return "ราคาไม่ระบุ";
}

// ดึงยอดวิวแบบปลอดภัย
function getViews(m) {
  const v = (m?.stats?.views ?? m?.views ?? 0);
  return Number.isFinite(v) ? v : 0;
}

/* ========= Render: หมวด ========= */
function renderCategories(groups) {
  catWrap.innerHTML = "";

  const cats = ["ทั้งหมด", ...Object.keys(groups).sort()];
  for (const cat of cats) {
    const btn = document.createElement("button");
    btn.className = "cat-chip" + (cat === ACTIVE_CAT ? " active" : "");

    // วงกลมรูป/ไอคอน
    const thumb = document.createElement("div");
    thumb.className = "thumb";
    if (cat === "ทั้งหมด") {
      const span = document.createElement("span");
      span.textContent = "🍽️";
      thumb.appendChild(span);
    } else {
      const first = groups[cat]?.[0];
      const img = document.createElement("img");
      img.src = (first && first.image) ? first.image : FALLBACK_IMG;
      img.alt = cat;
      thumb.appendChild(img);
    }

    // ชื่อหมวด
    const label = document.createElement("div");
    label.className = "label";
    label.textContent = cat;

    btn.appendChild(thumb);
    btn.appendChild(label);

    // เปลี่ยนหมวด
    btn.addEventListener("click", () => {
      ACTIVE_CAT = cat;
      renderCategories(groups);
      renderGrid();

      // อัปเดต URL (deep-link) เป็น ?cat=<ชื่อหมวด>
      const url = new URL(location.href);
      if (cat === "ทั้งหมด") url.searchParams.delete("cat");
      else url.searchParams.set("cat", cat);
      history.replaceState(null, "", url.toString());
    });

    catWrap.appendChild(btn);
  }
}

/* ========= ยิงนับวิวแบบยูนีกเมื่อการ์ดโผล่ ========= */
async function pingMenuView(menuId, viewsCountEl) {
  try {
    if (!menuId || hasViewed(menuId)) return;
    markViewed(menuId); // กันกดซ้ำใน session นี้ก่อนเลย (optimistic)

    // อัปเดต UI ทันที (optimistic)
    if (viewsCountEl) {
      const current = parseInt((viewsCountEl.textContent || "0").replace(/[^\d]/g, ""), 10) || 0;
      viewsCountEl.textContent = (current + 1).toLocaleString("th-TH");
    }

    const res = await fetch(`${API_URL}/${menuId}/view`, { method: "POST" });
    // ถ้าเซิร์ฟเวอร์ตอบ increased=false แปลว่าเคยนับไปแล้ว (duplicate)
    if (res.ok) {
      const data = await res.json().catch(()=>null);
      if (data && data.ok === true && data.increased === false && viewsCountEl) {
        // ย้อน UI ถ้าไม่ได้เพิ่มจริง (กรณีหน้าอื่นเพิ่งนับไป)
        // หมายเหตุ: ส่วนใหญ่จะ increased=true เมื่อ session นี้ยังไม่เคย
        const current = parseInt((viewsCountEl.textContent || "0").replace(/[^\d]/g, ""), 10) || 0;
        if (current > 0) {
          viewsCountEl.textContent = (current - 1).toLocaleString("th-TH");
        }
      }
    }
  } catch {
    // เงียบไว้ ไม่ให้กระทบ UX
  }
}

/* ========= Render: กริดเมนู ========= */
let intersectionObserver = null;
function ensureObserver() {
  if (intersectionObserver) return intersectionObserver;
  if (!("IntersectionObserver" in window)) return null;

  intersectionObserver = new IntersectionObserver((entries, obs) => {
    entries.forEach(en => {
      if (!en.isIntersecting) return;
      const card = en.target;
      const menuId = card.getAttribute("data-menu-id");
      const viewsCountEl = card.querySelector(".views-count");
      if (menuId) pingMenuView(menuId, viewsCountEl);
      obs.unobserve(card);
    });
  }, { threshold: 0.4 }); // โผล่อย่างน้อย ~40%

  return intersectionObserver;
}

function renderGrid() {
  listEl.innerHTML = "";

  const items = (ACTIVE_CAT === "ทั้งหมด") ? ALL : (GROUPS[ACTIVE_CAT] || []);
  if (items.length === 0) {
    stateEl.textContent = "ไม่มีเมนูในหมวดนี้";
    return;
  }
  stateEl.textContent = "";

  const io = ensureObserver();

  for (const m of items) {
    const li = document.createElement("li");
    li.className = "card";

    const name = m.name || "-";
    const img  = m.image || FALLBACK_IMG;
    const desc = (m.description || m.review || "");
    const priceText = getPrice(m);
    const viewsText = getViews(m).toLocaleString("th-TH");
    const menuId = getMenuId(m);

    // เก็บ menuId ไว้ที่การ์ด เพื่อให้อ่านตอนโผล่ได้
    if (menuId) li.setAttribute("data-menu-id", menuId);

    li.innerHTML = `
      <img src="${img}" alt="${name}" />
      <h3 class="card-title">${name}</h3>
      ${desc ? `<p class="card-desc muted">${desc}</p>` : ""}

      <div class="meta">
        <span class="badge price">${priceText}</span>
        <span class="badge"><i>👁</i> <span class="views-count">${viewsText}</span> วิว</span>
      </div>

      <button class="content-btn">ดูรายละเอียด</button>
    `;

    // กดดูรายละเอียด
    li.querySelector(".content-btn").addEventListener("click", () => gotoDetail(m));

    listEl.appendChild(li);

    // สร้าง Observer ต่อการ์ด
    if (io && menuId && !hasViewed(menuId)) {
      io.observe(li);
    } else if (!io && menuId && !hasViewed(menuId)) {
      // เบราว์เซอร์เก่าไม่มี IntersectionObserver → ยิงทันที
      const viewsCountEl = li.querySelector(".views-count");
      pingMenuView(menuId, viewsCountEl);
    }
  }
}

/* ========= Data ========= */
async function loadMenus() {
  stateEl.textContent = "กำลังโหลดเมนูอาหาร...";
  try {
    const res = await fetch(API_URL);
    if (!res.ok) throw new Error("โหลดข้อมูลไม่สำเร็จ");
    const data = await res.json();
    stateEl.textContent = "";
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error(err);
    stateEl.textContent = "❌ โหลดเมนูไม่สำเร็จ";
    return [];
  }
}

/* ========= Init ========= */
(async function init() {
  // รองรับเปิดหน้าพร้อมพารามิเตอร์ ?cat=<ชื่อหมวด>
  const url = new URL(location.href);
  ACTIVE_CAT = url.searchParams.get("cat") || "ทั้งหมด";

  ALL = await loadMenus();
  GROUPS = groupByCategory(ALL);

  renderCategories(GROUPS);
  renderGrid();
})();
