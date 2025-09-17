/* ==============================
   Admin Dashboard – CRUD + Comment Moderation (single-admin safe)
   ============================== */
"use strict";

/* ---------- Base UI ---------- */
const sidebar  = document.getElementById('sidebar');
const menuBar  = document.querySelector('#content nav .bx.bx-menu');
const switchMode = document.getElementById('switch-mode');

menuBar?.addEventListener('click', () => sidebar?.classList.toggle('hide'));
if (window.innerWidth < 768) sidebar?.classList.add('hide');

switchMode?.addEventListener('change', function(){
  document.body.classList.toggle('dark', !!this.checked);
});

/* ---------- Tabs ---------- */
const sideLinks = document.querySelectorAll('#sidebar .side-menu.top li a');
const sections = {
  admin:       document.getElementById('section-admin'),
  moderation:  document.getElementById('section-moderation'),
  shops:       document.getElementById('section-shops'),
  tables:      document.getElementById('section-tables')
};
function showSection(key){
  Object.entries(sections).forEach(([k, el]) => el?.classList.toggle('hidden', k !== key));
  sideLinks.forEach(a => a.parentElement.classList.remove('active'));
  document.querySelector(`#sidebar .side-menu.top li a[data-section="${key}"]`)?.parentElement.classList.add('active');

  // โหลดข้อมูลทันทีเมื่อเปลี่ยนแท็บ
  if (key === 'moderation') loadMods();
  if (key === 'tables')     refreshTiles();
}
sideLinks.forEach(a => {
  a.addEventListener('click', (e) => {
    e.preventDefault();
    const tab = a.dataset.section;
    showSection(tab); // ไม่ต้องเรียก loadMods()/refreshTiles() ซ้ำแล้ว
  });
});

/* ---------- Helpers ---------- */
const searchButton     = document.querySelector('#content nav form .form-input button');
const searchButtonIcon = document.querySelector('#content nav form .form-input button .bx');
const searchForm       = document.getElementById('admin-search-form') || document.querySelector('#content nav form');
const globalSearch     = document.getElementById('globalSearch');

searchButton?.addEventListener('click', function(e){
  if (window.innerWidth < 576) {
    e.preventDefault();
    searchForm?.classList.toggle('show');
    if (searchForm?.classList.contains('show')) searchButtonIcon?.classList.replace('bx-search','bx-x');
    else searchButtonIcon?.classList.replace('bx-x','bx-search');
  }
});
window.addEventListener('resize', function(){
  if (this.innerWidth > 576) {
    searchButtonIcon?.classList.replace('bx-x','bx-search');
    searchForm?.classList.remove('show');
  }
});

const clearVals = (ids=[]) => ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
const setBtnBusy = (btn, busy, labelBusy='กำลังบันทึก...') => {
  if (!btn) return;
  if (busy) {
    btn.dataset._label = btn.textContent;
    btn.innerHTML = `<i class='bx bx-loader-alt bx-spin'></i> ${labelBusy}`;
    btn.disabled = true;
  } else {
    btn.innerHTML = btn.dataset._label || btn.textContent;
    btn.disabled = false;
  }
};

/* fetch พร้อมโทเคน (ใช้ window.authFetch ถ้ามี) */
const jfetch = async (url, opts = {}) => {
  const abs = /^https?:\/\//i.test(url) ? url : (url.startsWith('/') ? url : `/${url}`);

  // ถ้ามี authFetch (จาก admin_guard.js ใหม่) จะคืน JSON อยู่แล้ว
  if (typeof window.authFetch === 'function') {
    const resOrData = await window.authFetch(abs, opts);
    // กันเคสที่บางที่คืน Response กลับมา
    if (resOrData instanceof Response) {
      const data = await resOrData.json().catch(()=>null);
      if (!resOrData.ok) throw new Error((data && (data.error || data.message)) || `HTTP ${resOrData.status}`);
      return data ?? {};
    }
    return resOrData; // เป็น JSON แล้ว
  }

  // fallback ธรรมดา (แนบ credentials เผื่อมีคุกกี้เซสชันฝั่งเซิร์ฟเวอร์)
  const res = await fetch(abs, { ...opts, credentials: 'include' });
  let data = null; try { data = await res.json(); } catch {}
  if (!res.ok) throw new Error((data && (data.error || data.message)) || `HTTP ${res.status}`);
  return data ?? {};
};

/* ---------- DOM refs ---------- */
const els = {
  // tiles
  statRestaurants : document.getElementById('statRestaurants'),
  statMenus       : document.getElementById('statMenus'),
  statComments    : document.getElementById('statComments'),
  notifyNum       : document.getElementById('notifyNum'),
  // restaurant form
  rName  : document.getElementById('restaurantName'),
  rImg   : document.getElementById('restaurantImage'),
  rLat   : document.getElementById('restaurantLat'),
  rLng   : document.getElementById('restaurantLng'),
  rAddr  : document.getElementById('restaurantAddress'),
  rPhone : document.getElementById('restaurantPhone'),
  btnAddRestaurant   : document.getElementById('btnAddRestaurant'),
  btnClearRestaurant : document.getElementById('btnClearRestaurant'),
  // menu form
  selRestaurant : document.getElementById('restaurantSelect'),
  mName  : document.getElementById('menuName'),
  mPrice : document.getElementById('menuPrice'),
  mType  : document.getElementById('menuType'),
  mImg   : document.getElementById('menuImage'),
  mDesc  : document.getElementById('menuDescription'),
  mFeatured : document.getElementById('menuIsFeatured'),
  mBoost    : document.getElementById('menuFeaturedBoost'),
  btnAddMenu  : document.getElementById('btnAddMenu'),
  btnClearMenu: document.getElementById('btnClearMenu'),
  // tables
  tblRestaurants : document.querySelector('#tblRestaurants tbody'),
  tblMenus       : document.querySelector('#tblMenus tbody'),
};

/* ================== Moderation DOM ================== */
const ModAPI = {
  list: (status='pending', page=1, limit=20) => `/api/comments/mod?status=${encodeURIComponent(status)}&page=${page}&limit=${limit}`,
  approve: (cid) => `/api/comments/${cid}/approve`,
  reject:  (cid) => `/api/comments/${cid}/reject`,
  del:     (cid) => `/api/comments/${cid}`
};
const M = {
  status: document.getElementById('modStatus'),
  reload: document.getElementById('btnReloadMods'),
  badge:  document.getElementById('modInfoBadge'),
  body:   document.querySelector('#tblMods tbody'),
};
const mEsc = (s='') => String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const mFmt = (d) => { try { return new Date(d).toLocaleString(); } catch { return ''; } };

/* ---------- Local state ---------- */
const state = { restaurants: [], menus: [], editingRestaurantId: null, editingMenuId: null };

/* ---------- Loaders ---------- */
async function loadRestaurantOptions(){
  const data = await jfetch('/api/restaurants').catch(()=> []);
  state.restaurants = Array.isArray(data) ? data : [];
  if (els.selRestaurant){
    els.selRestaurant.innerHTML = '<option value="">-- เลือกร้านอาหาร --</option>';
    state.restaurants.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r._id; opt.textContent = r.name;
      els.selRestaurant.appendChild(opt);
    });
  }
  return state.restaurants;
}

function renderRestaurantsTable(list = state.restaurants){
  if (!els.tblRestaurants) return 0;
  els.tblRestaurants.innerHTML = '';
  list.forEach((r, idx) => {
    const lat = r.location?.coordinates?.[1] ?? r.lat ?? '-';
    const lng = r.location?.coordinates?.[0] ?? r.lng ?? '-';
    const tr = document.createElement('tr');
    tr.dataset.id = r._id || '';
    tr.innerHTML = `
      <td>${idx+1}</td>
      <td>${r.image ? `<img class="thumb" src="${r.image}" alt="${r.name}">` : '-'}</td>
      <td><strong>${r.name || '-'}</strong><div class="muted">${r._id || ''}</div></td>
      <td>${r.address || '-'}</td>
      <td>${r.phone || '-'}</td>
      <td><div class="muted">${lat}, ${lng}</div></td>
      <td class="nowrap">
        <button class="button" data-act="edit-rest">แก้</button>
        <button class="button" data-act="del-rest" style="background:#fee2e2;border:1px solid #fecaca">ลบ</button>
      </td>`;
    els.tblRestaurants.appendChild(tr);
  });
  return list.length;
}

async function loadRestaurantsTable(){
  const data = await jfetch('/api/restaurants').catch(()=> []);
  state.restaurants = Array.isArray(data) ? data : [];
  return renderRestaurantsTable();
}

function renderMenusTable(list = state.menus){
  if (!els.tblMenus) return { total: 0, featured: 0 };
  els.tblMenus.innerHTML = '';
  list.forEach((m, idx) => {
    const tr = document.createElement('tr');
    tr.dataset.id = m._id || '';
    tr.dataset.restaurantId = m.restaurant?._id || m.restaurant || '';
    tr.innerHTML = `
      <td>${idx+1}</td>
      <td>${m.image ? `<img class="thumb" src="${m.image}" alt="${m.name}">` : '-'}</td>
      <td><strong>${m.name || '-'}</strong><div class="muted">${m._id || ''}</div></td>
      <td>${m.type || '-'}</td>
      <td>${(m.price ?? '-') + (m.price ? ' ฿' : '')}</td>
      <td>${m.restaurant?.name || '-'}</td>
      <td>${m.isFeatured ? `⭐ ${m.featuredBoost || 0}` : '-'}</td>
      <td class="nowrap">
        <button class="button" data-act="edit-menu">แก้</button>
        <button class="button" data-act="del-menu" style="background:#fee2e2;border:1px solid #fecaca">ลบ</button>
      </td>`;
    els.tblMenus.appendChild(tr);
  });
  return { total: list.length, featured: list.filter(x=>x.isFeatured).length };
}

async function loadMenusTable(){
  const menus = await jfetch('/api/menus').catch(()=> []);
  state.menus = Array.isArray(menus) ? menus : [];
  return renderMenusTable();
}

/* ---------- Tiles ---------- */
async function refreshTiles(){
  const [restCount, menuInfo] = await Promise.all([loadRestaurantsTable(), loadMenusTable()]);
  if (els.statRestaurants) els.statRestaurants.textContent = restCount ?? '-';
  if (els.statMenus)       els.statMenus.textContent       = (menuInfo && menuInfo.total) || '-';
  if (els.statComments)    els.statComments.textContent    = '—';
}

/* ---------- Global filter ---------- */
function filterTables(term){
  const t = (term||'').trim().toLowerCase();
  document.querySelectorAll('main .panel:not(.hidden) table tbody').forEach(tbody => {
    [...tbody.querySelectorAll('tr')].forEach(tr => {
      tr.style.display = tr.textContent.toLowerCase().includes(t) ? '' : 'none';
    });
  });
}

/* ---------- CRUD: ร้านอาหาร ---------- */
function setRestaurantEditing(r){
  state.editingRestaurantId = r?._id || null;
  if (els.btnAddRestaurant) els.btnAddRestaurant.textContent = state.editingRestaurantId ? 'บันทึกการแก้ไขร้าน' : 'เพิ่มร้านอาหาร';
  if (els.rName)  els.rName.value  = r?.name || '';
  if (els.rImg)   els.rImg.value   = r?.image || '';
  if (els.rAddr)  els.rAddr.value  = r?.address || '';
  if (els.rPhone) els.rPhone.value = r?.phone || '';
  const lat = r?.location?.coordinates?.[1] ?? r?.lat ?? '';
  const lng = r?.location?.coordinates?.[0] ?? r?.lng ?? '';
  if (els.rLat) els.rLat.value = lat;
  if (els.rLng) els.rLng.value = lng;
}

async function addOrUpdateRestaurant(){
  const name = (els.rName?.value || '').trim();
  if (!name) throw new Error('กรอกชื่อร้านก่อน');
  const lat = parseFloat(els.rLat?.value || 'NaN');
  const lng = parseFloat(els.rLng?.value || 'NaN');
  const payload = {
    name,
    image:   (els.rImg?.value || '').trim() || undefined,
    address: (els.rAddr?.value || '').trim() || undefined,
    phone:   (els.rPhone?.value || '').trim() || undefined,
    location: (Number.isFinite(lat) && Number.isFinite(lng)) ? { type:"Point", coordinates:[lng, lat] } : undefined,
    lat: Number.isFinite(lat) ? lat : undefined,
    lng: Number.isFinite(lng) ? lng : undefined,
  };
  if (state.editingRestaurantId) {
    await jfetch(`/api/restaurants/${state.editingRestaurantId}`, {
      method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)
    });
  } else {
    await jfetch('/api/restaurants', {
      method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)
    });
  }
  setRestaurantEditing(null);
  clearVals(['restaurantName','restaurantImage','restaurantLat','restaurantLng','restaurantAddress','restaurantPhone']);
  await Promise.all([loadRestaurantOptions(), loadRestaurantsTable(), refreshTiles()]);
}

async function deleteRestaurant(id){
  if (!id) return;
  if (!confirm('ลบร้านนี้และอาจกระทบเมนูที่เกี่ยวข้อง—ยืนยันหรือไม่?')) return;
  await jfetch(`/api/restaurants/${id}`, { method:'DELETE' });
  if (state.editingRestaurantId === id) setRestaurantEditing(null);
  await Promise.all([loadRestaurantOptions(), loadRestaurantsTable(), refreshTiles()]);
}

/* ---------- CRUD: เมนู ---------- */
function setMenuEditing(m){
  state.editingMenuId = m?._id || null;
  if (els.btnAddMenu) els.btnAddMenu.textContent = state.editingMenuId ? 'บันทึกการแก้ไขเมนู' : 'เพิ่มเมนู';
  const restId = m?.restaurant?._id || m?.restaurant || '';
  if (els.selRestaurant) els.selRestaurant.value = restId || '';
  if (els.mName)  els.mName.value  = m?.name || '';
  if (els.mPrice) els.mPrice.value = m?.price ?? '';
  if (els.mType)  els.mType.value  = m?.type || '';
  if (els.mImg)   els.mImg.value   = m?.image || '';
  if (els.mDesc)  els.mDesc.value  = m?.description || '';
  if (els.mFeatured) els.mFeatured.checked = !!m?.isFeatured;
  if (els.mBoost)    els.mBoost.value    = m?.featuredBoost ?? '';
}

async function addOrUpdateMenu(){
  const restaurantId = els.selRestaurant?.value;
  if (!restaurantId) throw new Error('เลือกร้านก่อน');
  const name = (els.mName?.value || '').trim();
  if (!name) throw new Error('กรอกชื่อเมนู');
  const payload = {
    restaurantId, // ✅ ใช้ restaurantId ตาม API
    name,
    price: Number(els.mPrice?.value || 0),
    type:  (els.mType?.value || '').trim() || undefined,
    image: (els.mImg?.value || '').trim() || undefined,
    description: (els.mDesc?.value || '').trim() || undefined,
    isFeatured: !!els.mFeatured?.checked,
    featuredBoost: Number(els.mBoost?.value || 0),
  };
  if (state.editingMenuId) {
    await jfetch(`/api/menus/${state.editingMenuId}`, {
      method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)
    });
  } else {
    await jfetch('/api/menus', {
      method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)
    });
  }
  setMenuEditing(null);
  clearVals(['menuName','menuPrice','menuType','menuImage','menuDescription','menuFeaturedBoost']);
  if (els.mFeatured) els.mFeatured.checked = false;
  await Promise.all([loadMenusTable(), refreshTiles()]);
}

async function deleteMenu(id){
  if (!id) return;
  if (!confirm('ลบเมนูนี้หรือไม่?')) return;
  await jfetch(`/api/menus/${id}`, { method:'DELETE' });
  if (state.editingMenuId === id) setMenuEditing(null);
  await Promise.all([loadMenusTable(), refreshTiles()]);
}

/* ================== Comments Moderation ================== */
async function loadMods(){
  if (!M.body) return;
  const st = M.status?.value || 'pending';
  M.badge && (M.badge.textContent = 'กำลังดึงข้อมูล...');
  try{
    const data = await jfetch(ModAPI.list(st));
    const items = Array.isArray(data.items) ? data.items : [];
    if (!items.length){
      M.body.innerHTML = `<tr><td colspan="7" class="muted">ไม่พบรายการ</td></tr>`;
      M.badge && (M.badge.textContent = 'ทั้งหมด 0 รายการ');
      return;
    }
    M.body.innerHTML = items.map(c => `
      <tr data-cid="${c._id}">
        <td class="nowrap">${mFmt(c.createdAt)}</td>
        <td class="nowrap">${mEsc(c.username || '-') }</td>
        <td class="nowrap">${c.rating ?? '-'}</td>
        <td>${mEsc(c.content || '')}</td>
        <td class="nowrap">${mEsc(c.refType || '-')}: ${mEsc(c.refId || '')}</td>
        <td class="nowrap"><span class="chip">${mEsc(c.status)}</span></td>
        <td class="nowrap">
          ${c.status!=='approved'? `<button class="button" data-act="approve">อนุมัติ</button>`:''}
          ${c.status!=='rejected'? `<button class="button" data-act="reject">ปฏิเสธ</button>`:''}
          <button class="button" data-act="delete" style="background:#fee2e2;border:1px solid #fecaca">ลบ</button>
        </td>
      </tr>
    `).join('');
    M.badge && (M.badge.textContent = `ทั้งหมด ${items.length} รายการ`);
  }catch(e){
    M.body.innerHTML = `<tr><td colspan="7" class="muted">ดึงข้อมูลไม่สำเร็จ: ${mEsc(e.message||'')}</td></tr>`;
    M.badge && (M.badge.textContent = 'โหลดไม่สำเร็จ');
  }
}

async function onModAction(e){
  const btn = e.target.closest('button[data-act]'); if (!btn) return;
  const tr = btn.closest('tr'); const cid = tr?.dataset?.cid; if (!cid) return;
  try{
    if (btn.dataset.act==='approve') await jfetch(ModAPI.approve(cid), { method:'PATCH' });
    else if (btn.dataset.act==='reject') await jfetch(ModAPI.reject(cid), { method:'PATCH' });
    else if (btn.dataset.act==='delete') { if (!confirm('ลบคอมเมนต์นี้หรือไม่?')) return; await jfetch(ModAPI.del(cid), { method:'DELETE' }); }
  }catch(e){ alert(e.message || 'ดำเนินการไม่สำเร็จ'); }
  finally { loadMods(); }
}

/* ---------- Events & Delegation ---------- */
window.addEventListener('DOMContentLoaded', async () => {
  showSection('admin'); // default tab

  // ค้นหาแบบกรองในตาราง
  document.querySelector('#content nav form')?.addEventListener('submit', (e)=>{ e.preventDefault(); filterTables(globalSearch?.value || ''); });

  // ร้าน: ปุ่มฟอร์ม
  els.btnAddRestaurant?.addEventListener('click', async () => {
    try { setBtnBusy(els.btnAddRestaurant, true); await addOrUpdateRestaurant(); }
    catch(e){ alert(e.message); }
    finally{ setBtnBusy(els.btnAddRestaurant, false); }
  });
  els.btnClearRestaurant?.addEventListener('click', () => {
    setRestaurantEditing(null);
    clearVals(['restaurantName','restaurantImage','restaurantLat','restaurantLng','restaurantAddress','restaurantPhone']);
  });

  // เมนู: ปุ่มฟอร์ม
  els.btnAddMenu?.addEventListener('click', async () => {
    try { setBtnBusy(els.btnAddMenu, true); await addOrUpdateMenu(); }
    catch(e){ alert(e.message); }
    finally{ setBtnBusy(els.btnAddMenu, false); }
  });
  els.btnClearMenu?.addEventListener('click', () => {
    setMenuEditing(null);
    clearVals(['menuName','menuPrice','menuType','menuImage','menuDescription','menuFeaturedBoost']);
    if (els.mFeatured) els.mFeatured.checked=false;
  });

  // Delegation: ตารางร้าน
  els.tblRestaurants?.addEventListener('click', (e)=>{
    const btn = e.target.closest('button[data-act]'); if(!btn) return;
    const tr = btn.closest('tr'); const id = tr?.dataset.id;
    if (btn.dataset.act === 'edit-rest') {
      const r = state.restaurants.find(x => String(x._id)===String(id));
      if (r) { setRestaurantEditing(r); showSection('shops'); }
    }
    if (btn.dataset.act === 'del-rest') deleteRestaurant(id).catch(e=>alert(e.message));
  });

  // Delegation: ตารางเมนู
  els.tblMenus?.addEventListener('click', (e)=>{
    const btn = e.target.closest('button[data-act]'); if(!btn) return;
    const tr = btn.closest('tr'); const id = tr?.dataset.id;
    if (btn.dataset.act === 'edit-menu') {
      const m = state.menus.find(x => String(x._id)===String(id));
      if (m) { setMenuEditing(m); showSection('shops'); }
    }
    if (btn.dataset.act === 'del-menu') deleteMenu(id).catch(e=>alert(e.message));
  });

  // Moderation
  M.body?.addEventListener('click', onModAction);
  M.reload?.addEventListener('click', (e)=>{ e.preventDefault(); loadMods(); });
  M.status?.addEventListener('change', loadMods);

  await loadRestaurantOptions().catch(()=>{});
  await refreshTiles().catch(()=>{});
  if (els.notifyNum) els.notifyNum.textContent = '3'; // demo
});
