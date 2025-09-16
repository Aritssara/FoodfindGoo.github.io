// /public/search.js
function qs() { return new URLSearchParams(location.search); }
function esc(s=""){ return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function imgOr(ph){ return (u)=> u && typeof u === 'string' ? u : ph; }
const phShop = "/background/restaurant.jpg";
const phMenu = "/background/food.jpg";
const $ = (id)=> document.getElementById(id);

const ICONS = {
  "ก๋วยเตี๋ยว":"🍜","ข้าวจานเดียว":"🍛","ของทอด":"🍟","ของหวาน":"🍨","ปิ้งย่าง":"🍢",
  "สเต๊ก":"🥩","สลัด":"🥗","กาแฟ":"☕","ชา":"🧋","พิซซ่า":"🍕","เบอร์เกอร์":"🍔","เครื่องดื่ม":"🥤","อื่นๆ":"🍽️"
};

function cardRestaurant(r){
  const lat = r?.location?.coordinates?.[1];
  const lng = r?.location?.coordinates?.[0];
  return `
  <a class="card" href="/Menu/shop.html?id=${encodeURIComponent(r._id)}" title="${esc(r.name||'ร้านอาหาร')}">
    <img src="${esc(imgOr(phShop)(r.image))}" alt="${esc(r.name||'ร้านอาหาร')}">
    <div class="body">
      <div class="title">${esc(r.name || 'ร้านอาหาร')}</div>
      <div class="meta">${esc(r.address || (lat&&lng ? `พิกัด ${lat.toFixed?.(4)}, ${lng.toFixed?.(4)}` : ''))}</div>
    </div>
  </a>`;
}
function cardMenu(m){
  const rid = m.restaurantId || "";
  const price = m.price != null ? String(m.price) : "-";
  const link = rid ? `/Menu/shop.html?id=${encodeURIComponent(rid)}&menuId=${encodeURIComponent(m._id)}`
                   : `/Menu/shop.html?menuId=${encodeURIComponent(m._id)}`;
  return `
  <a class="card" href="${link}" title="${esc(m.name||'เมนู')}">
    <img src="${esc(imgOr(phMenu)(m.image))}" alt="${esc(m.name||'เมนู')}">
    <div class="body">
      <div class="title">${esc(m.name || 'เมนู')}</div>
      <div class="meta">ราคา: ${esc(price)} บาท</div>
    </div>
  </a>`;
}

const state = {
  q: "", allMenus: [], filtered: [], activeCat: 'ทั้งหมด', cats: ['ทั้งหมด'],
};

function buildChips() {
  const wrap = $("catChips");
  if (!wrap) return;
  wrap.innerHTML = state.cats.map(cat => `
    <button class="cat-chip ${cat===state.activeCat?'active':''}" data-cat="${esc(cat)}">
      <span class="icon">${ICONS[cat] || ICONS['อื่นๆ']}</span>
      <span class="label">${esc(cat)}</span>
    </button>
  `).join('');
  wrap.querySelectorAll('.cat-chip').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      state.activeCat = btn.dataset.cat;
      filterRender();
      buildChips();
    });
  });
}
function filterRender() {
  const menusWrap = $("menusWrap");
  const cat = state.activeCat;
  const shown = cat==='ทั้งหมด'
    ? state.allMenus
    : state.allMenus.filter(m => (m.category||m.type||'อื่นๆ').toString().trim() === cat);
  state.filtered = shown;
  menusWrap.innerHTML = shown.length
    ? shown.map(cardMenu).join('')
    : "<div class='muted'>ไม่พบเมนูที่ตรงคำค้น</div>";
}

async function fetchCategories() {
  try {
    const res = await fetch('/api/search/categories', { cache: 'no-store' });
    const data = await res.json();
    const cats = Array.isArray(data.categories) ? data.categories.filter(Boolean) : [];
    state.cats = ['ทั้งหมด', ...cats];
  } catch {
    // fallback จากผลเมนูเมื่อโหลดแล้ว
  }
}

function mountLocalAutocomplete() {
  const bar = document.querySelector('.search-again .search-bar');
  if (!bar) return;
  // ใช้ logic แบบเดียวกับ navbar (ย่อส่วน)
  let items = [], open=false, cursor=-1;
  const box = document.createElement('div');
  box.className = 'autocomplete';
  box.style.display = 'none';
  bar.style.position = 'relative';
  bar.appendChild(box);

  const inp = $("searchBox");
  const render = () => {
    if (!open || !items.length) { box.style.display='none'; box.innerHTML=''; return; }
    box.innerHTML = items.map((it,i)=>`
      <a href="${it.href}" class="ac-row ${i===cursor?'active':''}" data-idx="${i}">
        <span class="ac-pill ${it.type}">${it.type==='menu'?'เมนู':'ร้าน'}</span>
        <span class="ac-main">${esc(it.label)}</span>
        ${it.sub?`<span class="ac-sub">${esc(it.sub)}</span>`:''}
      </a>
    `).join('');
    box.style.display = '';
  };
  const debounce = (fn, ms=140)=>{ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms);} };
  const doSuggest = debounce(async (q)=>{
    if (!q) { items=[]; open=false; render(); return; }
    try{
      const r = await fetch(`/api/search/suggest?q=${encodeURIComponent(q)}`, { cache:'no-store' });
      const d = await r.json();
      items = Array.isArray(d.suggestions)? d.suggestions: [];
      cursor=-1; open=true; render();
    }catch{}
  }, 140);

  inp?.addEventListener('input', e=>{
    const val = inp.value.trim();
    state.q = val;
    doSuggest(val);
    doSearch(val); // อัปเดตผลแบบเรียลไทม์
  });
  inp?.addEventListener('keydown', (e)=>{
    if (e.key==='ArrowDown'){ e.preventDefault(); open=true; cursor=(cursor+1)%Math.max(items.length,1); render(); }
    else if (e.key==='ArrowUp'){ e.preventDefault(); open=true; cursor=(cursor-1+items.length)%Math.max(items.length,1); render(); }
    else if (e.key==='Enter'){
      e.preventDefault();
      if (cursor>=0 && items[cursor]) location.href = items[cursor].href;
      else location.href = `/search.html?q=${encodeURIComponent(inp.value.trim())}`;
    } else if (e.key==='Escape'){ open=false; render(); }
  });
  document.addEventListener('click', (e)=>{ if (!bar.contains(e.target)) { open=false; render(); }});
}

async function doSearch(q) {
  const restaurantsWrap = $("restaurantsWrap");
  const menusWrap = $("menusWrap");
  const emptyBox = $("emptyBox");

  if (!q) {
    restaurantsWrap.innerHTML = "";
    menusWrap.innerHTML = "";
    emptyBox.style.display = "";
    return;
  }
  emptyBox.style.display = "none";

  try{
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const rs = Array.isArray(data.restaurants) ? data.restaurants : [];
    const ms = Array.isArray(data.menus) ? data.menus : [];

    // ร้าน
    restaurantsWrap.innerHTML = rs.length ? rs.map(cardRestaurant).join("") : "<div class='muted'>ไม่พบร้านที่ตรงคำค้น</div>";

    // เมนู + ทำหมวด
    state.allMenus = ms;
    if (state.cats.length <= 1) {
      const derived = Array.from(new Set(ms.map(m => (m.category||m.type||'อื่นๆ').toString().trim()))).filter(Boolean);
      state.cats = ['ทั้งหมด', ...derived];
    }
    buildChips();
    filterRender();

    if (!rs.length && !ms.length) emptyBox.style.display = "";
  }catch(e){
    console.error(e);
    restaurantsWrap.innerHTML = "<div class='error'>ค้นหาไม่สำเร็จ</div>";
    menusWrap.innerHTML = "<div class='error'>ค้นหาไม่สำเร็จ</div>";
  }
}

async function run(){
  state.q = qs().get("q")?.trim() || "";
  $("searchTitle").textContent = state.q ? `ผลการค้นหา: “${state.q}”` : "ผลการค้นหา";
  $("searchBox").value = state.q;

  await fetchCategories();  // เผื่อมีใช้ในชิป
  await doSearch(state.q);
  mountLocalAutocomplete();

  // Enter เพื่อไปหน้าเดิมแต่เปลี่ยน query (รองรับเคสกด Enter แบบไม่เลือก suggest)
  $("searchBox")?.addEventListener("keydown", (ev)=>{
    if (ev.key === "Enter") {
      const term = $("searchBox").value.trim();
      if (term) location.href = `/search.html?q=${encodeURIComponent(term)}`;
    }
  });
}
document.addEventListener("DOMContentLoaded", run);
