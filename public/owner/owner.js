// /public/owner/owner.js — owner multi-restaurant + proper menus calls
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.11.1/firebase-auth.js";
import { app } from "/services/firebase.js";

/* ========== helpers ========== */
const auth = getAuth(app);
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
const txt = (el, v) => (el && (el.textContent = v ?? ""), el);
const val = (el) => (el ? el.value.trim() : "");
const num = (el) => { const n = Number(val(el)); return Number.isFinite(n) ? n : NaN; };
function show(el){ if(el){ el.hidden = false; el.classList.remove("hidden"); } }
function hide(el){ if(el){ el.hidden = true;  el.classList.add("hidden");  } }
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

/* ========== state & api ========== */
const S = { user:null, token:null, tokenAt:0, me:null, menus:[], loaded:false, rid:null };
const TOKEN_TTL = 45 * 60 * 1000;

async function getToken(force=false){
  if(!S.user) return null;
  const fresh = Date.now() - S.tokenAt < TOKEN_TTL;
  if(!force && S.token && fresh) return S.token;
  S.token = await S.user.getIdToken(true);
  S.tokenAt = Date.now();
  return S.token;
}

// ----- แยก 2 ตัว: owner API (/api/owner) และ root API (/api) -----
async function apiOwner(path, { method='GET', body, retry=true } = {}){
  const t = await getToken();
  const res = await fetch(`/api/owner${path}`, {
    method,
    headers: { "Content-Type":"application/json", "Authorization":`Bearer ${t}` },
    body: body ? JSON.stringify(body) : undefined
  });
  if(res.status === 401 && retry){
    const t2 = await getToken(true);
    const res2 = await fetch(`/api/owner${path}`, {
      method,
      headers: { "Content-Type":"application/json", "Authorization":`Bearer ${t2}` },
      body: body ? JSON.stringify(body) : undefined
    });
    if(!res2.ok) throw new Error(`${res2.status} ${await res2.text()}`);
    return read(res2);
  }
  if(!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return read(res);
}
async function apiRoot(path, { method='GET', body, retry=true } = {}){
  const t = await getToken();
  const res = await fetch(`/api${path}`, {
    method,
    headers: { "Content-Type":"application/json", "Authorization":`Bearer ${t}` },
    body: body ? JSON.stringify(body) : undefined
  });
  if(res.status === 401 && retry){
    const t2 = await getToken(true);
    const res2 = await fetch(`/api${path}`, {
      method,
      headers: { "Content-Type":"application/json", "Authorization":`Bearer ${t2}` },
      body: body ? JSON.stringify(body) : undefined
    });
    if(!res2.ok) throw new Error(`${res2.status} ${await res2.text()}`);
    return read(res2);
  }
  if(!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return read(res);
}
const read = (r) => (r.headers.get("content-type")||"").includes("application/json") ? r.json() : {};

/* ========== layout (tabs/sidebar) ========== */
async function handleLogout(e){
  e?.preventDefault?.();
  try{
    const link = e?.currentTarget || e?.target?.closest(".side-logout");
    if (link) { link.setAttribute("aria-disabled","true"); link.style.pointerEvents = "none"; }
    await signOut(auth);
  }finally{
    location.href = "/login/Login.html";
  }
}
function showTab(name){
  $$(".side-link").forEach(a => a.classList.toggle("active", a.dataset.tab === name));
  $$(".tab-panel").forEach(p => {
    const active = p.id.endsWith(name);
    p.hidden = !active;
    p.classList.toggle("hidden", !active);
  });

  if(name === "restaurant"){
    if(!S.loaded){
      loadAll().catch(e => { console.error(e); alert(e.message || "โหลดข้อมูลไม่สำเร็จ"); });
    }else{
      const anyVisible = !$("#noRestaurant")?.hidden || !$("#restaurantForm")?.hidden || !$("#restaurantView")?.hidden;
      if(!anyVisible) show($("#noRestaurant"));
    }
  }
}
function initLayout(){
  $("#sidebarToggle")?.addEventListener("click", ()=> $("#ownerSidebar")?.classList.toggle("open"));
  $$(".side-link").forEach(a => a.addEventListener("click", (e) => {
    e.preventDefault();
    if (a.classList.contains("side-logout") || a.dataset.tab === "logout"){
      handleLogout(e);
      return;
    }
    showTab(a.dataset.tab);
  }));
}

/* ========== owner info ========== */
function fillOwnerInfo(){
  txt($("#ownerDisplayName"), S.user?.email || S.user?.displayName || "ผู้ใช้");
  if($("#displayName")) $("#displayName").value = S.user?.displayName || "";
  if($("#email"))       $("#email").value       = S.user?.email || "";
}

/* ========== restaurant (form/view) ========== */
function fillRestaurantForm(r){
  $("#restaurantId").value = r?._id || "";
  $("#rName").value     = r?.name    || "";
  $("#rPhone").value    = r?.phone   || "";
  $("#rAddress").value  = r?.address || "";
  $("#rFacebook").value = r?.facebook|| "";
  $("#rImage").value    = r?.image   || "";
  $("#rHours").value    = r?.hours   || "";
  $("#rLat").value      = r?.location?.coordinates?.[1] ?? "";
  $("#rLng").value      = r?.location?.coordinates?.[0] ?? "";
}
function fillRestaurantView(r){
  if(!r) return;
  const lat = r.location?.coordinates?.[1];
  const lng = r.location?.coordinates?.[0];
  $("#rPhoto").src = r.image || "/assets/placeholder-restaurant.png";
  $("#rPhoto").alt = r.name || "ร้าน";
  txt($("#rTitle"), r.name || "-");
  txt($("#rMeta"),  [r.address || null, (Number.isFinite(lat)&&Number.isFinite(lng)) ? `(${lat}, ${lng})` : null].filter(Boolean).join(" • "));
  txt($("#rContact"), [r.phone||null, r.facebook||null, r.hours||null].filter(Boolean).join(" • "));
}
function composeLocationFromForm(){
  const lat = num($("#rLat")), lng = num($("#rLng"));
  if(!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { type:"Point", coordinates:[lng, lat] }; // GeoJSON
}

/* ========== menus ========== */
function renderMenuRows(list){
  const tb = $("#menuRows"); if(!tb) return;
  if(!list?.length){
    tb.innerHTML = `<tr><td colspan="6" class="muted" style="text-align:center">ยังไม่มีเมนู</td></tr>`;
    return;
  }
  tb.innerHTML = list.map(m=>{
    const img = m.image ? `<img src="${esc(m.image)}" alt="" style="width:44px;height:44px;object-fit:cover;border-radius:8px">` : "";
    return `<tr data-id="${m._id}">
      <td>${img}</td>
      <td><strong>${esc(m.name)}</strong></td>
      <td>${m.price ?? ""}</td>
      <td>${esc(m.type || m.category || "")}</td>
      <td>${m.isFeatured ? "⭐" : ""}</td>
      <td class="right">
        <button class="btn sm" data-act="edit-menu">แก้</button>
        <button class="btn sm danger" data-act="del-menu">ลบ</button>
      </td>
    </tr>`;
  }).join("");
}

/* ========== pick restaurant & data flow ========== */
function selectRestaurantFromMe(me){
  // รองรับทั้งโครงสร้างเดิม (me.restaurant) และใหม่ (me.restaurants[])
  const qs     = new URLSearchParams(location.search);
  const fromQS = qs.get('restaurantId');
  const fromLS = localStorage.getItem('owner_rid');
  const list   = Array.isArray(me.restaurants) ? me.restaurants : (me.restaurant ? [me.restaurant] : []);

  // ลำดับความสำคัญ: query -> LS -> legacy (me.restaurant) -> ร้านแรก
  let rid = fromQS || fromLS || (me.restaurant?._id || null) || (list[0]?._id || null);

  // ถ้า rid ไม่อยู่ใน list (เช่น ร้านถูกลบ/สิทธิ์หมด) → fallback ร้านแรก
  let r = rid ? (list.find(x => x._id === rid) || null) : null;
  if (!r && list.length) { r = list[0]; rid = r._id; }

  if (rid) localStorage.setItem('owner_rid', rid);
  return { rid, restaurant: r };
}

async function loadAll(){
  // ดึงข้อมูลตัวเอง + เลือกร้าน
  const me = await apiOwner("/me");
  let picked = selectRestaurantFromMe(me);

  S.me  = me;
  S.rid = picked.rid || null;

  // helper: โหลดเมนูของร้านใดร้านหนึ่งผ่าน root API (เหมือนฝั่งเว็บหลัก)
  const fetchMenusByRid = async (rid) => {
    if (!rid) return [];
    try{
      return await apiRoot(`/menus?restaurantId=${encodeURIComponent(rid)}&limit=500`);
    }catch{ return []; }
  };

  // 1) โหลดของร้านที่เลือกก่อน
  let menus = await fetchMenusByRid(S.rid);

  // 2) ถ้าไม่มีเมนู → ไล่หาร้านแรกที่ "มีเมนู" แล้วสลับอัตโนมัติ
  if ((!menus || menus.length === 0) && Array.isArray(me.restaurants) && me.restaurants.length){
    for (const r of me.restaurants){
      const list = await fetchMenusByRid(r._id);
      if (list && list.length){
        S.rid = r._id;
        localStorage.setItem('owner_rid', S.rid);
        // sync URL ให้ตรงร้านที่มีข้อมูล
        const url = new URL(location.href);
        url.searchParams.set('restaurantId', S.rid);
        history.replaceState(null, '', url.toString());
        picked = { rid: r._id, restaurant: r };
        menus  = list;
        break;
      }
    }
  }

  S.menus  = menus || [];
  S.loaded = true;

  if(!picked.restaurant){
    show($("#noRestaurant")); hide($("#restaurantForm")); hide($("#restaurantView"));
  }else{
    hide($("#noRestaurant"));
    fillRestaurantForm(picked.restaurant);
    fillRestaurantView(picked.restaurant);
    hide($("#restaurantForm")); show($("#restaurantView"));
  }
  renderMenuRows(S.menus);

  // ถ้ามี select ร้านในหน้า ก็เติมตัวเลือกให้
  const sel = $("#restaurantSelect");
  if (sel && (me.restaurant || Array.isArray(me.restaurants))) {
    const list = me.restaurants || (me.restaurant ? [me.restaurant] : []);
    sel.innerHTML = list.map(r =>
      `<option value="${r._id}" ${r._id===S.rid ? 'selected':''}>${esc(r.name)}</option>`
    ).join('');
    sel.onchange = async (e) => {
      const newRid = e.target.value;
      localStorage.setItem('owner_rid', newRid);
      // โหลดเมนูของร้านที่เลือกทันที
      S.rid   = newRid;
      S.menus = await fetchMenusByRid(newRid);
      renderMenuRows(S.menus);
      // sync URL
      const url = new URL(location.href);
      url.searchParams.set('restaurantId', newRid);
      history.replaceState(null, '', url.toString());
    };
  }
}

/* ========== actions ========== */
function bindActions(){
  $("#btnStartCreate")?.addEventListener("click", ()=>{
    hide($("#noRestaurant"));
    fillRestaurantForm(null);
    show($("#restaurantForm"));
  });

  $("#btnEditRestaurant")?.addEventListener("click", ()=>{
    const picked = selectRestaurantFromMe(S.me);
    fillRestaurantForm(picked.restaurant);
    hide($("#restaurantView"));
    show($("#restaurantForm"));
  });

  $("#btnCancelRest")?.addEventListener("click", ()=>{
    const picked = selectRestaurantFromMe(S.me);
    if(picked.restaurant){
      hide($("#restaurantForm"));
      fillRestaurantView(picked.restaurant);
      show($("#restaurantView"));
    }else{
      hide($("#restaurantForm"));
      show($("#noRestaurant"));
    }
  });

  $("#restaurantForm")?.addEventListener("submit", async (e)=>{
    e.preventDefault();
    const id = $("#restaurantId").value;
    const body = {
      name: val($("#rName")),
      phone: val($("#rPhone")),
      address: val($("#rAddress")),
      facebook: val($("#rFacebook")),
      image: val($("#rImage")),
      hours: val($("#rHours")),
      lat: num($("#rLat")),
      lng: num($("#rLng")),
      location: composeLocationFromForm()
    };
    if(!body.name) return alert("กรุณากรอกชื่อร้าน");
    if(!body.location) return alert("กรุณากรอก lat/lng ให้ถูกต้อง");

    try{
      // เส้นทางจัดการร้านของคุณอาจอยู่ที่ /api/owner/... (คงของเดิมไว้)
      const r = id
        ? await apiOwner(`/restaurant/${id}`, { method:"PUT",  body })
        : await apiOwner("/restaurant",       { method:"POST", body });

      // อัปเดต state และ UI
      if (Array.isArray(S.me?.restaurants)) {
        const i = S.me.restaurants.findIndex(x => x._id === r._id);
        if (i >= 0) S.me.restaurants[i] = r; else S.me.restaurants.unshift(r);
      } else {
        S.me.restaurant = r;
      }
      S.rid = r._id;
      localStorage.setItem('owner_rid', S.rid);

      fillRestaurantForm(r);
      fillRestaurantView(r);
      hide($("#restaurantForm"));
      show($("#restaurantView"));
    }catch(err){
      alert(err.message || "บันทึกร้านไม่สำเร็จ");
    }
  });

  $("#btnNewMenu")?.addEventListener("click", ()=>{
    $("#mId").value=""; $("#mName").value=""; $("#mPrice").value="";
    $("#mCategory").value=""; $("#mDesc").value=""; $("#mImage").value="";
    $("#mFeatured").checked=false; show($("#menuForm"));
  });

  $("#btnCancelMenu")?.addEventListener("click", ()=> hide($("#menuForm")));

  $("#menuForm")?.addEventListener("submit", async (e)=>{
    e.preventDefault();
    if (!S.rid) return alert("ยังไม่เลือกร้าน");

    const id = $("#mId").value;
    const body = {
      name: val($("#mName")),
      price: Number(val($("#mPrice")) || NaN),
      type:  val($("#mCategory")),
      description: val($("#mDesc")),
      image: val($("#mImage")),
      isFeatured: $("#mFeatured").checked,
      status: "published",
      restaurantId: S.rid, // ✅ สำคัญ
    };
    if(!body.name) return alert("กรุณาระบุชื่อเมนู");
    if(!Number.isFinite(body.price)) delete body.price;

    try{
      let m;
      if(id){
        m = await apiRoot(`/menus/${id}`, { method:"PUT", body });     // ✅ ใช้ /api/menus
        const i = S.menus.findIndex(x => x._id === id); if(i>=0) S.menus[i] = m;
      }else{
        m = await apiRoot(`/menus`, { method:"POST", body });          // ✅ ใช้ /api/menus
        S.menus.unshift(m);
      }
      renderMenuRows(S.menus);
      hide($("#menuForm"));
    }catch(err){
      alert(err.message || "บันทึกเมนูไม่สำเร็จ");
    }
  });

  $("#menuTable")?.addEventListener("click", async (e)=>{
    const btn = e.target.closest("[data-act]"); if(!btn) return;
    const tr  = e.target.closest("tr"); const id = tr?.dataset.id; if(!id) return;

    if(btn.dataset.act === "edit-menu"){
      const m = S.menus.find(x => x._id === id); if(!m) return;
      $("#mId").value = m._id; $("#mName").value = m.name || "";
      $("#mPrice").value = m.price ?? ""; $("#mCategory").value = m.type || m.category || "";
      $("#mDesc").value = m.description || ""; $("#mImage").value = m.image || "";
      $("#mFeatured").checked = !!m.isFeatured; show($("#menuForm"));
    }

    if(btn.dataset.act === "del-menu"){
      if(!confirm("ลบเมนูนี้?")) return;
      try{
        await apiRoot(`/menus/${id}`, { method:"DELETE" });            // ✅ ใช้ /api/menus
        tr.remove();
        S.menus = S.menus.filter(x => x._id !== id);
      }catch(err){
        alert(err.message || "ลบเมนูไม่สำเร็จ");
      }
    }
  });
}

/* ========== boot ========== */
function boot(){
  initLayout();
  bindActions();
  fillOwnerInfo();

  const firstTab = $(".side-link.active")?.dataset.tab || "owner";
  showTab(firstTab);
}

onAuthStateChanged(auth, async (user)=>{
  if(!user){ location.href = "/login/Login.html"; return; }
  S.user = user;
  await getToken(true);
  boot();
});

if(auth.currentUser){
  S.user = auth.currentUser;
  getToken(true).then(boot);
}
