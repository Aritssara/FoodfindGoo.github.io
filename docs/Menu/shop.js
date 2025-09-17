// /Menu/shop.js — คอมเมนต์: ชื่อผู้ใช้ + ดาว + วันเวลา + ปุ่มไลก์ (สวยขึ้น)
// คอมเมนต์ใหม่เป็น pending (รอแอดมินอนุมัติ) ก่อนจะแสดง
import { getAuth } from "https://www.gstatic.com/firebasejs/10.11.1/firebase-auth.js";
import { getFirestore, doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.11.1/firebase-firestore.js";

(function () {
  "use strict";

  /* ---------- Helpers ---------- */
  const $ = (id) => document.getElementById(id);
  const qs = () => new URLSearchParams(location.search);
  const getParam = (k) => new URLSearchParams(location.search).get(k);
  const getShopParam = () =>
    getParam("id") || getParam("shop") || getParam("restaurantId") || "";

  const isValidObjectId = (v) => /^[a-f\d]{24}$/i.test(String(v || ""));
  const escapeHTML = (s = "") =>
    s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const kmHaversine = (a, b) => {
    const R = 6371, rad = (d) => d * Math.PI / 180;
    const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const la1 = rad(a.lat), la2 = rad(b.lat);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  };
  const fmtKm = (m) => (m / 1000).toFixed(2) + " กม.";
  const fmtDuration = (s) => {
    const m = Math.round(s / 60);
    if (m < 60) return `~ ${m} นาที`;
    const h = Math.floor(m / 60), mm = m % 60;
    return `~ ${h} ชม. ${mm} นาที`;
  };
  const pad = (n) => String(n).padStart(2, "0");
  const fmtDateTime = (iso) => {
    try {
      const d = new Date(iso);
      return d.toLocaleString('th-TH', {
        timeZone: 'Asia/Bangkok',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        day: '2-digit', month: 'short', year: 'numeric'
      });
    } catch { return ""; }
  };
  async function jget(url) {
    try { const r = await fetch(url, { cache: "no-store" }); if (!r.ok) throw r; return await r.json(); }
    catch { return { __error: true }; }
  }
  const pickImage = (o) =>
    o?.image || o?.photo ||
    (Array.isArray(o?.photos) && o.photos[0]) ||
    (Array.isArray(o?.images) && o.images[0]) ||
    o?.cover || o?.thumbnail || "";
  function setPlaceholder(imgEl, label = "Image") {
    if (!imgEl) return;
    const svg = encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' width='600' height='400'>
         <rect width='100%' height='100%' fill='%23e5e7eb'/>
         <text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle'
               fill='%239ca3af' font-family='Arial' font-size='22'>${label}</text>
       </svg>`
    );
    imgEl.src = `data:image/svg+xml;charset=utf-8,${svg}`;
  }
  function setImgSrc(imgEl, url, label) {
    if (!imgEl) return;
    if (url && typeof url === "string") imgEl.src = url;
    else setPlaceholder(imgEl, label);
  }

  /* ===== NEW: resolve ร้านจาก menuId เมื่อเปิดด้วย ?menuId= ===== */
  async function fetchMenuByIdSmart(menuId) {
    // ลองแบบ path param ก่อน
    let m = await jget(`/api/menus/${encodeURIComponent(menuId)}`);
    if (!m || m.__error || !m._id) {
      // เผื่อ backend คืนเป็น array ด้วย query
      const r = await jget(`/api/menus?id=${encodeURIComponent(menuId)}`);
      if (Array.isArray(r) && r[0]) m = r[0];
    }
    return m && !m.__error ? m : null;
  }
  function pickRestaurantId(m) {
    return (
      m?.restaurantId ||
      m?.shopId ||
      m?.restaurant?._id ||
      m?.restaurant?.id ||
      m?.restaurant ||
      m?.shop ||
      m?.restaurant_id ||
      null
    );
  }

  /* ---------- State / Elements ---------- */
  let map, shopMarker, userMarker, routeLayer;
  let currentShop = null, currentMenu = null, isDemoMode = false;

  const els = {
    shopTitle: $("shopTitle"), shopMenuTitle: $("shopMenuTitle"),
    menuImage: $("menuImage"), menuDesc: $("menuDesc"),
    userDistance: $("userDistance"),
    btnSave: $("btnSave"), btnShare: $("btnShare"), btnDirections: $("btnDirections"),
    map: $("map"), menuList: $("menuList"), relatedWrap: $("relatedWrap"),
    commentInput: $("commentInput"), ratingInput: $("ratingInput"),
    commentsList: $("commentsList"), btnSendComment: $("btnSendComment"),
    avgRatingLabel: $("avgRatingLabel"), commentTimeHint: $("commentTimeHint"),
  };

  /* ---------- Demo data ---------- */
  function demoData() {
    return {
      shop: { _id: "demo-shop", name: "ก๋วยเตี๋ยวคุณอร", location: { type: "Point", coordinates: [104.8480, 15.2427] }, image: "" },
      menusInShop: [
        { _id: "m1", name: "ก๋วยเตี๋ยวต้มยำ", price: "60-80", image: "", desc: "เส้นนุ่ม น้ำซุปต้มยำเข้มข้น" },
        { _id: "m2", name: "ไก่ทอดสูตรโบราณ", price: "79", image: "", desc: "กรอบนอกนุ่มใน" },
        { _id: "m3", name: "ส้มตำไทยรสจัด", price: "60", image: "", desc: "เปรี้ยวหวานเผ็ดลงตัว" },
      ],
      related: [{ _id: "sA", name: "ร้าน A" }, { _id: "sB", name: "ร้าน B" }, { _id: "sC", name: "ร้าน C" }, { _id: "sD", name: "ร้าน D" }],
    };
  }

  /* ---------- Loaders ---------- */
  async function loadAllForShop(shopId) {
    let shop = null;

    if (shopId) {
      // พยายามดึงร้านให้ได้ แม้ shopId จะไม่ใช่ ObjectId (อาจเป็น slug/uuid)
      // 1) แบบ path param
      let r1 = await jget(`/api/restaurants/${encodeURIComponent(shopId)}`);
      if (r1 && !r1.__error && r1._id) shop = r1;

      // 2) แบบ query id
      if (!shop) {
        const r2 = await jget(`/api/restaurants?id=${encodeURIComponent(shopId)}`);
        if (Array.isArray(r2) && r2[0]) shop = r2[0];
      }

      // 3) แบบ query restaurantId
      if (!shop) {
        const r3 = await jget(`/api/restaurants?restaurantId=${encodeURIComponent(shopId)}`);
        if (Array.isArray(r3) && r3[0]) shop = r3[0];
      }
    }

    if (!shop) { shop = demoData().shop; isDemoMode = true; }

    // เมนูของร้าน
    let menusInShop;
    const rid = shop._id || shop.id || shop.slug || "";
    if (rid) {
      const mm = await jget(`/api/menus?restaurantId=${encodeURIComponent(rid)}`);
      menusInShop = (mm && !mm.__error && Array.isArray(mm)) ? mm : demoData().menusInShop;
    } else {
      menusInShop = demoData().menusInShop;
    }

    // ใกล้เคียง
    let related = null;
    const lat = shop.location?.coordinates?.[1] ?? shop.lat;
    const lng = shop.location?.coordinates?.[0] ?? shop.lng;
    if (lat && lng) {
      const r = await jget(`/api/restaurants?lat=${lat}&lng=${lng}&radius=2000&limit=8`);
      related = (r && !r.__error && Array.isArray(r)) ? r : null;
    }
    if (!related) related = demoData().related;

    return { shop, menusInShop, related };
  }

  /* ---------- Renderers (general) ---------- */
  function setTitles(shop) {
    const name = shop.name || "รายละเอียดร้าน";
    if (els.shopTitle) els.shopTitle.textContent = isDemoMode ? `${name} (โหมดตัวอย่าง)` : name;
    document.querySelectorAll("#shopMenuTitle, .shopMenuTitle")
      .forEach((n) => (n.textContent = `เมนูของร้าน ${name}`));
  }
  function renderLeft(menu, shop) {
    currentMenu = menu || currentMenu;
    if (els.menuDesc) els.menuDesc.textContent = (menu?.desc || menu?.description || shop?.description || "—");
    if (els.menuImage) {
      const big = pickImage(menu) || pickImage(shop);
      setImgSrc(els.menuImage, big, "เมนู");
      els.menuImage.alt = menu?.name || shop?.name || "เมนู";
    }
    setTitles(shop);
  }
  function renderMenuList(list) {
    if (!els.menuList) return;
    els.menuList.innerHTML = "";
    if (!list || list.length === 0) { els.menuList.innerHTML = '<div class="muted">ยังไม่มีเมนูสำหรับร้านนี้</div>'; return; }
    list.forEach(m => {
      const row = document.createElement("button");
      row.type = "button"; row.className = "menu-row"; row.setAttribute("aria-label", m.name || "เมนู");
      row.innerHTML = `
        <img alt="thumb"/>
        <div>
          <h4>${escapeHTML(m.name || "เมนู")}</h4>
          <div class="meta">รายละเอียด • ราคา ${m.price ? escapeHTML(String(m.price)) + " บาท" : "-"}</div>
        </div>`;
      setImgSrc(row.querySelector("img"), pickImage(m), "เมนู");
      row.addEventListener("click", () => renderLeft(m, currentShop));
      els.menuList.appendChild(row);
    });
  }
  function pushShopURL(id) {
    const shopPage = location.pathname.includes("/Menu/shop.html") ? location.pathname : "/Menu/shop.html";
    history.pushState({ id }, "", `${shopPage}?id=${encodeURIComponent(id)}`);
  }
  async function switchShopInPlace(id) {
    isDemoMode = false;
    const data = await loadAllForShop(id);
    await renderAll(data, true);
  }
  function renderRelated(items) {
    if (!els.relatedWrap) return;
    els.relatedWrap.innerHTML = "";
    (items || []).forEach(s => {
      const card = document.createElement("div");
      card.className = "related-card";
      const name = s.name || s; const id = s._id || s.id || null;
      card.innerHTML = `<img class="related-thumb" alt="${escapeHTML(name)}"/><div class="related-name">${escapeHTML(name)}</div>`;
      setImgSrc(card.querySelector(".related-thumb"), pickImage(s), "ร้าน");
      card.setAttribute("role", "button"); card.tabIndex = 0;
      if (id) {
        const go = async () => { pushShopURL(id); await switchShopInPlace(id); };
        card.addEventListener("click", go);
        card.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
        card.title = "ดูรายละเอียดร้าน (ในหน้าเดียว)";
      } else card.title = "ไม่พบรหัสร้าน (_id)";
      els.relatedWrap.appendChild(card);
    });
  }

  /* ---------- Map ---------- */
  const mapLatLngOfShop = (shop) => ({
    lat: shop.location?.coordinates?.[1] ?? shop.lat ?? 15.2427,
    lng: shop.location?.coordinates?.[0] ?? shop.lng ?? 104.8480,
  });
  function initMap(shop) {
    if (!els.map || typeof L === "undefined") return;
    const { lat, lng } = mapLatLngOfShop(shop);
    if (!map) {
      map = L.map("map", { zoomControl: false }).setView([lat, lng], 15);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map);
    }
    if (shopMarker) shopMarker.remove();
    shopMarker = L.marker([lat, lng]).addTo(map).bindPopup(shop.name || "ร้านอาหาร");
    map.setView([lat, lng], 15);
  }
  function clearRoute(fit = true) {
    if (routeLayer) { routeLayer.remove(); routeLayer = null; }
    if (userMarker) { userMarker.remove(); userMarker = null; }
    if (fit && shopMarker) map.setView(shopMarker.getLatLng(), 15);
  }
  async function drawRoute(from, to) {
    const data = await jget(`https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson&alternatives=false&steps=false`);
    if (!data?.routes?.length) throw new Error("ไม่พบเส้นทาง");
    const route = data.routes[0];
    clearRoute(false);
    routeLayer = L.geoJSON(route.geometry, { style: { weight: 6, opacity: 0.9, color: "#2563eb" } }).addTo(map);
    userMarker = L.marker([from.lat, from.lng]).addTo(map).bindPopup("ตำแหน่งของคุณ");
    const b = routeLayer.getBounds(); b.extend([to.lat, to.lng]); map.fitBounds(b, { padding: [20, 20] });
    if (els.userDistance) els.userDistance.textContent = `${fmtKm(route.distance)} • ${fmtDuration(route.duration)}`;
  }

  /* ---------- Save (Firestore) ---------- */
  const getSavePayload = () => {
    const restaurantId = currentShop?._id || currentShop?.id || null;
    const menuId = currentMenu?._id || null;
    if (!restaurantId && !menuId) return null;
    return {
      refType: menuId ? "menu" : "restaurant",
      restaurantId, menuId,
      name: currentMenu?.name || currentShop?.name || "",
      price: currentMenu?.price ?? null,
      image: pickImage(currentMenu) || pickImage(currentShop) || "",
      shopName: currentShop?.name || "",
      createdAt: serverTimestamp(),
    };
  };
  function bindActions(shop) {
    $("btnSave")?.addEventListener("click", async () => {
      const user = getAuth().currentUser;
      if (!user) { alert("กรุณาเข้าสู่ระบบก่อนบันทึก"); location.href = "/login/Login.html"; return; }
      const db = getFirestore();
      const payload = getSavePayload();
      if (!payload) { alert("ไม่พบข้อมูลสำหรับบันทึก"); return; }
      const saveId = payload.menuId || payload.restaurantId;
      try {
        await setDoc(doc(db, "users", user.uid, "saved", String(saveId)), payload, { merge: true });
        alert("บันทึกรายการโปรดแล้ว! ไปดูได้ที่หน้าโปรไฟล์");
      } catch (e) { console.error(e); alert("บันทึกไม่สำเร็จ"); }
    });

    $("btnShare")?.addEventListener("click", async () => {
      const payload = { title: "FoodFindGo", text: `แวะร้าน ${shop.name || "ร้านอาหาร"} กัน!`, url: location.href };
      if (navigator.share) { try { await navigator.share(payload); } catch {} }
      else { try { await navigator.clipboard.writeText(payload.url); alert("คัดลอกลิงก์แล้ว"); } catch {} }
    });

    let routed = false;
    $("btnDirections")?.addEventListener("click", () => {
      const { lat, lng } = mapLatLngOfShop(shop);
      if (!lat || !lng) return alert("ไม่มีพิกัดร้าน");
      if (routed) { clearRoute(true); if (els.userDistance) els.userDistance.textContent = "-"; routed = false; return; }
      if (!navigator.geolocation) return alert("เบราว์เซอร์ไม่รองรับระบุตำแหน่ง");
      navigator.geolocation.getCurrentPosition(async (pos) => {
        try { await drawRoute({ lat: pos.coords.latitude, lng: pos.coords.longitude }, { lat, lng }); routed = true; }
        catch { alert("คำนวณเส้นทางไม่สำเร็จ"); }
      }, () => alert("ไม่สามารถระบุตำแหน่งของคุณ"));
    });
  }

  /* ---------- Stars ---------- */
  function initStars() {
    const wrap = $("ratingStars"), hidden = $("ratingInput");
    if (!wrap || !hidden) return;
    wrap.querySelectorAll("button").forEach((btn) => {
      btn.classList.add("star-btn");
      btn.addEventListener("click", () => {
        const user = getAuth().currentUser;
        if (!user) {
          if (confirm("ต้องเข้าสู่ระบบก่อนให้ดาว/แสดงความคิดเห็น ไปหน้าเข้าสู่ระบบหรือไม่?"))
            location.href = "/login/Login.html";
          return;
        }
        const val = Number(btn.dataset.v);
        hidden.value = String(val);
        wrap.querySelectorAll("button").forEach((b) => {
          const on = Number(b.dataset.v) <= val;
          b.classList.toggle("active", on);
        });
      });
    });
  }

  /* ---------- Time hint ---------- */
  function startTimeHint() {
    const el = $("commentTimeHint"); if (!el) return;
    const fmt = (d) => d.toLocaleString(undefined, { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short", year: "numeric" });
    const tick = () => (el.textContent = `⏱ เวลา: ${fmt(new Date())}`);
    tick(); setInterval(tick, 30_000);
  }

  /* ---------- Comments API ---------- */
  const CommentAPI = {
    // ใช้ public endpoint ที่ฝั่ง server คืนเฉพาะ approved
    list: (refType, refId, page = 1, limit = 10) =>
      `/api/comments/public?refType=${encodeURIComponent(refType)}&refId=${encodeURIComponent(refId)}&page=${page}&limit=${limit}`,
    create: () => `/api/comments`,
    like:   (cid) => `/api/comments/${cid}/like`,
  };

  /* ---------- Comments: renderer ---------- */
  function renderCommentItem(c){
    const liked = !!c.meLiked;
    const likes = c.likesCount ?? (Array.isArray(c.likedBy) ? c.likedBy.length : 0) ?? 0;
    const r = Math.max(0, Math.min(5, c.rating|0));
    const stars = "★".repeat(r) + "☆".repeat(5 - r);
    const initials = escapeHTML((c.username || "U").trim().slice(0,1).toUpperCase());

    return `
    <li class="comment-item" data-cid="${c._id}">
      <div class="cmt-head">
        <div class="cmt-user">
          <div class="avatar" aria-hidden="true">${initials}</div>
          <div class="cmt-meta">
            <div class="cmt-name">${escapeHTML(c.username || "ผู้ใช้")}</div>
            <div class="cmt-sub">
              <span class="stars" aria-label="ให้ ${c.rating} ดาว">${stars}</span>
              <span class="dot">•</span>
              <time datetime="${c.createdAt}">${fmtDateTime(c.createdAt)}</time>
            </div>
          </div>
        </div>
        <button class="btn-like ${liked?'liked':''}" data-act="like" aria-pressed="${liked}">
          <i class="${liked?'fa-solid':'fa-regular'} fa-thumbs-up"></i>
          <span class="like-num">${likes}</span>
        </button>
      </div>

      <p class="cmt-body">${escapeHTML(c.content || "")}</p>

    </li>`;
  }
  function renderComments(items = []){
    const list = els.commentsList || document.querySelector(".comments-list");
    if (!list) return;
    list.innerHTML = items.length ? items.map(renderCommentItem).join("") : '<div class="muted">ยังไม่มีความคิดเห็น</div>';
  }

  async function loadComments(refType, refId){
    const box = els.commentsList || document.querySelector(".comments-list");
    if (!box) return;
    if (!refId || refId === "demo-shop") {
      els.avgRatingLabel && (els.avgRatingLabel.textContent = "ยังไม่มีคะแนน");
      box.innerHTML = '<div class="muted">โหมดตัวอย่าง: ยังไม่ดึงความคิดเห็นจากเซิร์ฟเวอร์</div>';
      return;
    }
    box.innerHTML = '<div class="muted">กำลังโหลด...</div>';
    try {
      const res = await fetch(CommentAPI.list(refType, refId), { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      const items = Array.isArray(data.items) ? data.items : [];
      const count = data.count ?? items.length ?? 0;
      const avg = data.avgRating ?? (count ? (items.reduce((s,c)=>s+(+c.rating||0),0)/count) : 0);

      els.avgRatingLabel && (els.avgRatingLabel.textContent =
        count ? `คะแนนเฉลี่ย ${avg.toFixed(1)} จาก ${count} รีวิว` : "ยังไม่มีคะแนน");
      renderComments(items);
    } catch {
      box.innerHTML = '<div class="muted">โหลดความคิดเห็นไม่สำเร็จ</div>';
    }
  }

  function bindCreateComment(refType, refId){
    if (!els.btnSendComment) return;
    els.btnSendComment.addEventListener("click", async () => {
      if (!refId || refId === "demo-shop") { alert("ต้องเปิดร้านที่มีรหัสจริงก่อนถึงจะส่งความคิดเห็นได้"); return; }
      const user = getAuth().currentUser;
      if (!user) { if (confirm("ต้องเข้าสู่ระบบก่อนแสดงความคิดเห็น ไปหน้าเข้าสู่ระบบ?")) location.href="/login/Login.html"; return; }

      const text = (els.commentInput?.value || "").trim();
      const rating = Number(els.ratingInput?.value || 0);
      if (!text) return alert("พิมพ์ข้อความความคิดเห็นก่อน");
      if (!rating) return alert("กรุณาให้คะแนน 1–5 ดาว");

      els.btnSendComment.disabled = true;
      const old = els.btnSendComment.innerHTML;
      els.btnSendComment.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังส่ง...';
      try {
        const headers = { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken()}` };
        const body = { refType, refId, content: text, text, rating };
        const r = await fetch(CommentAPI.create(), { method: "POST", headers, body: JSON.stringify(body) });
        if (!r.ok) {
          const err = await r.json().catch(()=>({}));
          throw new Error(err.error || `HTTP ${r.status}`);
        }
        alert("ส่งความคิดเห็นแล้ว • รอแอดมินตรวจ");
        els.commentInput && (els.commentInput.value = "");
        els.ratingInput && (els.ratingInput.value = "0");
        document.querySelectorAll("#ratingStars .star-btn").forEach(b => b.classList.remove("active"));
      } catch (e) {
        alert("ส่งไม่สำเร็จ: " + (e?.message || "unknown"));
      } finally {
        els.btnSendComment.innerHTML = old;
        els.btnSendComment.disabled = false;
      }
    });

    // like toggle (สลับไอคอน + ตัวเลข)
    (els.commentsList || document.querySelector(".comments-list"))?.addEventListener("click", async (e) => {
      const btn = e.target.closest("button[data-act='like']"); if (!btn) return;
      const item = btn.closest(".comment-item"); const cid = item?.dataset?.cid; if (!cid) return;
      const user = getAuth().currentUser;
      if (!user) { if (confirm("ต้องเข้าสู่ระบบก่อนกดไลก์ ไปหน้าเข้าสู่ระบบ?")) location.href="/login/Login.html"; return; }
      btn.disabled = true;
      try {
        const headers = { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken()}` };
        const r = await fetch(CommentAPI.like(cid), { method: "POST", headers });
        if (!r.ok) throw new Error();
        const data = await r.json();
        const num = btn.querySelector(".like-num");
        const icon = btn.querySelector("i");
        if (num)  num.textContent = data.likesCount ?? 0;
        if (icon) { icon.classList.toggle("fa-solid", !!data.liked); icon.classList.toggle("fa-regular", !data.liked); }
        btn.classList.toggle("liked", !!data.liked);
        btn.setAttribute("aria-pressed", data.liked ? "true" : "false");
      } catch { alert("กดไลก์ไม่สำเร็จ"); }
      finally { btn.disabled = false; }
    });
  }

  /* ---------- Boot ---------- */
  async function renderAll(data, fitMap) {
    currentShop = data.shop; currentMenu = data.menusInShop?.[0] || null;
    setTitles(currentShop);
    renderLeft(currentMenu || { name: "เมนู", desc: "—", image: "" }, currentShop);
    renderMenuList(data.menusInShop);
    renderRelated(data.related);
    initMap(currentShop);
    if (fitMap && shopMarker) map.setView(shopMarker.getLatLng(), 15);

    if (navigator.geolocation) {
      const { lat, lng } = mapLatLngOfShop(currentShop);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const d = kmHaversine({ lat: pos.coords.latitude, lng: pos.coords.longitude }, { lat, lng });
          if (els.userDistance) els.userDistance.textContent = `${d.toFixed(2)} กม.`;
        },
        () => { if (els.userDistance) els.userDistance.textContent = "-"; }
      );
    }
    bindActions(currentShop);
    initStars();
    startTimeHint();

    const refId = currentShop._id || currentShop.id || "demo-shop";
    bindCreateComment("restaurant", refId);
    loadComments("restaurant", refId);
  }

  async function init() {
    const directShopId = getShopParam();
    const menuId = getParam("menuId");

    let shopId = directShopId;
    let preselectedMenu = null;

    // ถ้าไม่มี shopId แต่มี menuId → ไปดึงเมนูก่อนเพื่อรู้ร้าน
    if (!shopId && menuId) {
      const m = await fetchMenuByIdSmart(menuId);
      if (m) {
        preselectedMenu = m;
        const rid = pickRestaurantId(m);
        if (rid) {
          shopId = String(rid);
          // อัปเดต URL ให้มี ?id=<restaurantId> กันตกไป demo รอบหน้าที่ผู้ใช้ refresh
          try { history.replaceState({}, "", `${location.pathname}?id=${encodeURIComponent(shopId)}&menuId=${encodeURIComponent(menuId)}`); } catch {}
        }
      }
    }

    const data = await loadAllForShop(shopId || "demo-shop");
    await renderAll(data, true);

    // ถ้าเลือกเมนูมาจากลิงก์ ให้แสดงเมนูนั้นเป็นหลัก
    if (preselectedMenu) {
      renderLeft(preselectedMenu, data.shop);
    }
  }

  window.addEventListener("popstate", async (e) => {
    isDemoMode = false;
    const id = (e.state && e.state.id) || getShopParam();
    const data = await loadAllForShop(id || "demo-shop");
    await renderAll(data, true);
  });

  document.addEventListener("DOMContentLoaded", init);
})();
