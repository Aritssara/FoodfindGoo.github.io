// /Menu/shop.js — (ย่อ) ลบการ์ดเวลาเปิด-ปิดออก คงไว้เฉพาะสถานะที่ #shopTime
import { getAuth } from "https://www.gstatic.com/firebasejs/10.11.1/firebase-auth.js";
import { getFirestore, doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.11.1/firebase-firestore.js";

(function () {
  "use strict";

  /* ---------- Helpers ---------- */
  const $ = (id) => document.getElementById(id);
  const getParam = (k) => new URLSearchParams(location.search).get(k);
  const getShopParam = () => getParam("id") || getParam("shop") || getParam("restaurantId") || "";
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
    shopTime: $("shopTime"), // ✅ เหลือใช้ตัวนี้ตัวเดียวสำหรับเวลาเปิด-ปิด
  };

  /* ---------- Demo data ---------- */
  function demoData() {
    return {
      shop: { _id: "demo-shop", name: "ก๋วยเตี๋ยวคุณอร", location: { type: "Point", coordinates: [104.8480, 15.2427] }, image: "", hours: "10:00-20:00" },
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
      let r1 = await jget(`/api/restaurants/${encodeURIComponent(shopId)}`);
      if (r1 && !r1.__error && r1._id) shop = r1;

      if (!shop) {
        const r2 = await jget(`/api/restaurants?id=${encodeURIComponent(shopId)}`);
        if (Array.isArray(r2) && r2[0]) shop = r2[0];
      }

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

  /* ---------- Renderers (ทั่วไป) ---------- */
  function setTitles(shop) {
    const name = shop.name || "รายละเอียดร้าน";
    if (els.shopTitle) els.shopTitle.textContent = isDemoMode ? `${name} (โหมดตัวอย่าง)` : name;
    document.querySelectorAll("#shopMenuTitle, .shopMenuTitle")
      .forEach((n) => (n.textContent = `เมนูของร้าน ${name}`));
  }
  function renderLeft(menu, shop) {
    if (els.menuDesc) els.menuDesc.textContent = (menu?.desc || menu?.description || shop?.description || "—");
    if (els.menuImage) {
      const big = pickImage(menu) || pickImage(shop);
      els.menuImage.src = big || els.menuImage.src;
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
      const img = row.querySelector("img");
      img.src = pickImage(m) || img.src;
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
      const img = card.querySelector(".related-thumb");
      img.src = pickImage(s) || img.src;
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

  /* ---------- Stars / Time hint / Comments (เดิม) ---------- */
  // ... (เหมือนเดิมทั้งหมด — ตัดออกเพื่อย่อ)

  /* ========= Opening Hours (คงฟังก์ชันคำนวณไว้ แต่เรนเดอร์เฉพาะ #shopTime) ========= */
  const DAY_KEYS = ["sun","mon","tue","wed","thu","fri","sat"];
  const TH2EN = { "อาทิตย์":"sun","จันทร์":"mon","อังคาร":"tue","พุธ":"wed","พฤหัสบดี":"thu","ศุกร์":"fri","เสาร์":"sat" };
  const PAD = n => String(n).padStart(2,"0");
  const toMins = (hhmm) => { const [h,m] = String(hhmm).split(":").map(Number); return (h*60 + (m||0) + 7*24*60)%(24*60); };
  const minsToHHMM = mins => `${PAD(Math.floor(mins/60)%24)}:${PAD(mins%60)}`;

  function normalizeOpening(opening){
    if (!opening) return null;

    if (typeof opening === "string"){
      const t = opening.trim().toLowerCase().replaceAll(".",":");
      if (!t) return null;
      if (/(ตลอด\s*24\s*ชั่วโมง|24\s*ชั่วโมง|24h|24-hour)/.test(t)) {
        return Object.fromEntries(DAY_KEYS.map(k=>[k, [["00:00","24:00"]]]));
      }
      const m = t.match(/(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/);
      if (m) {
        const range = [[m[1], m[2]]];
        return Object.fromEntries(DAY_KEYS.map(k=>[k, range]));
      }
      return null;
    }

    if (Array.isArray(opening.periods)) {
      const map = Object.fromEntries(DAY_KEYS.map(k=>[k, []]));
      for (const p of opening.periods){
        if (!p?.open?.day || !p?.open?.time) continue;
        const od = Number(p.open.day)||0;
        const ct = p?.close?.time;
        const cd = Number(p?.close?.day ?? od) % 7;
        const ot = p.open.time;
        const from = `${ot.slice(0,2)}:${ot.slice(2)}`;
        const to   = ct ? `${ct.slice(0,2)}:${ct.slice(2)}` : "24:00";
        if (ct && (od !== cd || toMins(to) <= toMins(from))) {
          map[DAY_KEYS[od]].push([from,"24:00"]);
          map[DAY_KEYS[(od+1)%7]].push(["00:00", to]);
        } else {
          map[DAY_KEYS[od]].push([from,to]);
        }
      }
      return map;
    }

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
          if (/(ตลอด\s*24\s*ชั่วโมง|24\s*ชั่วโมง|24h|24-hour|^24$)/.test(s)) { map[kEn] = [["00:00","24:00"]]; continue; }
          const m = s.match(/(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/);
          map[kEn] = m ? [[m[1], m[2]]] : [];
        } else if (Array.isArray(v)){
          if (v.length && Array.isArray(v[0])) map[kEn] = v;
          else if (v.length===2 && typeof v[0]==="string") map[kEn] = [v];
          else map[kEn] = [];
        } else map[kEn] = [];
      }
      return map;
    }
    return null;
  }

  function getOpenStatus(opening){
    const map = normalizeOpening(opening);
    if (!map) return { text:"ไม่ระบุเวลา", class:"closed" };

    const now = new Date();
    const dayIdx = now.getDay();
    const minsNow = now.getHours()*60 + now.getMinutes();

    const todayRanges = (map[DAY_KEYS[dayIdx]] || []).map(([a,b]) => [toMins(a), toMins(b==="24:00"?"23:59":b)]);
    let open = false, closeInMins = null, nextOpenInMins = null;

    for (const [a,b] of todayRanges){
      if (minsNow >= a && minsNow < b){ open = true; closeInMins = Math.min(closeInMins ?? Infinity, b - minsNow); }
      else if (minsNow < a){ nextOpenInMins = Math.min(nextOpenInMins ?? Infinity, a - minsNow); }
    }

    if (open){
      const soon = closeInMins !== null && closeInMins <= 30;
      const at = minsToHHMM(minsNow + (closeInMins||0));
      return { text: soon ? `ใกล้ปิด • ปิด ${at}` : `เปิดอยู่ • ปิด ${at}`, class: soon ? "soon" : "open" };
    } else {
      if (nextOpenInMins != null){
        const at = minsToHHMM(minsNow + nextOpenInMins);
        return { text:`ปิดอยู่ • เปิด ${at}`, class:"closed" };
      }
      return { text:"ปิดอยู่", class:"closed" };
    }
  }

  // ✅ อัปเดตเฉพาะสถานะสั้น ๆ ที่แถวบน
  function updateOpenStatus(shop){
    const opening = shop?.openingHours ?? shop?.hours ?? shop?.opening_hours ?? null;
    const status = getOpenStatus(opening);
    if (els.shopTime) {
      els.shopTime.textContent = status.text;
      els.shopTime.className = `status ${status.class}`;
    }
  }

  /* ---------- Boot ---------- */
  async function renderAll(data, fitMap) {
    const { shop, menusInShop, related } = data;
    currentShop = shop; currentMenu = menusInShop?.[0] || null;

    setTitles(shop);
    updateOpenStatus(shop);                     // ← แทนที่เดิมที่เรนเดอร์การ์ด
    renderLeft(currentMenu || { name: "เมนู", desc: "—", image: "" }, shop);
    renderMenuList(menusInShop);
    renderRelated(related);
    initMap(shop);
    if (fitMap && shopMarker) map.setView(shopMarker.getLatLng(), 15);

    if (navigator.geolocation) {
      const { lat, lng } = mapLatLngOfShop(shop);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const d = kmHaversine({ lat: pos.coords.latitude, lng: pos.coords.longitude }, { lat, lng });
          if (els.userDistance) els.userDistance.textContent = `${d.toFixed(2)} กม.`;
        },
        () => { if (els.userDistance) els.userDistance.textContent = "-"; }
      );
    }

    // …ส่วนอื่น ๆ (ปุ่ม, ดาว, คอมเมนต์) ใช้เหมือนเดิม…
  }

  async function init() {
    const directShopId = getShopParam();
    const menuId = getParam("menuId");
    let shopId = directShopId, preselectedMenu = null;

    if (!shopId && menuId) {
      let m = await jget(`/api/menus/${encodeURIComponent(menuId)}`);
      if (!m || m.__error || !m._id) {
        const r = await jget(`/api/menus?id=${encodeURIComponent(menuId)}`);
        if (Array.isArray(r) && r[0]) m = r[0];
      }
      if (m) {
        preselectedMenu = m;
        const rid = m?.restaurantId || m?.shopId || m?.restaurant?._id || m?.restaurant?.id || m?.restaurant || m?.shop || m?.restaurant_id;
        if (rid) {
          shopId = String(rid);
          try { history.replaceState({}, "", `${location.pathname}?id=${encodeURIComponent(shopId)}&menuId=${encodeURIComponent(menuId)}`); } catch {}
        }
      }
    }

    const data = await loadAllForShop(shopId || "demo-shop");
    await renderAll(data, true);

    if (preselectedMenu) renderLeft(preselectedMenu, data.shop);
  }

  window.addEventListener("popstate", async (e) => {
    const id = (e.state && e.state.id) || getShopParam();
    const data = await loadAllForShop(id || "demo-shop");
    await renderAll(data, true);
  });

  document.addEventListener("DOMContentLoaded", init);
})();
