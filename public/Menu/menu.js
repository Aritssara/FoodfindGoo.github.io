/* ========= ตั้งค่า ========= */
const API_URL = "/api/menus";
const FALLBACK_IMG = "/images/default-food.jpg";

/* ========= DOM ========= */
const listEl  = document.getElementById("menuList");
const catWrap = document.getElementById("catScroller");
const stateEl = document.getElementById("state");

/* ========= State ========= */
let ALL = [];
let GROUPS = {};
let ACTIVE_CAT = "ทั้งหมด";

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

// ไปหน้าแสดงรายละเอียดเมนู (detail.html) ด้วยชื่อเมนู
function gotoDetail(menuName) {
  const url = `/Menu/detail.html?menu=${encodeURIComponent(menuName)}`;
  window.location.href = url;
}

// ฟอร์แมตราคาเป็นสกุลบาท (THB)
const fmtTHB = new Intl.NumberFormat("th-TH", {
  style: "currency",
  currency: "THB",
  maximumFractionDigits: 0
});

// ดึงราคาแบบปลอดภัย (รองรับหลายเคส)
function getPrice(m) {
  // ถ้ามี price ตรงๆ
  if (typeof m?.price === "number") return fmtTHB.format(m.price);
  // ถ้าเก็บเป็นสตริงอยู่แล้ว
  if (typeof m?.price === "string" && m.price.trim()) return m.price.trim();
  // ถ้าเก็บเป็นช่วงราคา เช่น { min, max }
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
  // รองรับทั้ง m.stats.views และ m.views
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

/* ========= Render: กริดเมนู ========= */
function renderGrid() {
  listEl.innerHTML = "";

  const items = (ACTIVE_CAT === "ทั้งหมด") ? ALL : (GROUPS[ACTIVE_CAT] || []);
  if (items.length === 0) {
    stateEl.textContent = "ไม่มีเมนูในหมวดนี้";
    return;
  }
  stateEl.textContent = "";

  for (const m of items) {
    const li = document.createElement("li");
    li.className = "card";

    const name = m.name || "-";
    const img  = m.image || FALLBACK_IMG;
    const desc = (m.description || m.review || "");
    const priceText = getPrice(m);
    const viewsText = getViews(m).toLocaleString("th-TH");

    li.innerHTML = `
      <img src="${img}" alt="${name}" />
      <h3 class="card-title">${name}</h3>
      ${desc ? `<p class="card-desc muted">${desc}</p>` : ""}

      <div class="meta">
        <span class="badge price">${priceText}</span>
        <span class="badge"><i>👁</i> ${viewsText} วิว</span>
      </div>

      <button class="content-btn">ดูรายละเอียด</button>
    `;

    li.querySelector(".content-btn").addEventListener("click", () => gotoDetail(name));
    listEl.appendChild(li);
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
