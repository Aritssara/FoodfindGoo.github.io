// /public/script.js
(async () => {
  let hasFirebase = false;
  try { await import('/services/firebase.js'); hasFirebase = true; }
  catch { console.warn('ไม่พบ /services/firebase.js'); }

  const show = (el) => el && (el.style.display = '');
  const hide = (el) => el && (el.style.display = 'none');

  const debounce = (fn, ms=160) => {
    let t; return (...args)=>{ clearTimeout(t); t=setTimeout(()=>fn(...args), ms); };
  };

  function mountAutocomplete(rootBar) {
    if (!rootBar) return;
    let open = false, cursor = -1, items = [];

    // สร้างกล่อง dropdown
    const box = document.createElement('div');
    box.className = 'autocomplete';
    box.style.display = 'none';
    rootBar.style.position = 'relative';
    rootBar.appendChild(box);

    const input = rootBar.querySelector('.search-input');
    const icon  = rootBar.querySelector('i');

    const render = () => {
      if (!open || !items.length) { box.style.display = 'none'; box.innerHTML=''; return; }
      box.innerHTML = items.map((it, idx) => `
        <a href="${it.href}" class="ac-row ${idx===cursor?'active':''}" data-idx="${idx}">
          <span class="ac-pill ${it.type}">${it.type==='menu'?'เมนู':'ร้าน'}</span>
          <span class="ac-main">${(it.label||'').replace(/</g,'&lt;')}</span>
          ${it.sub?`<span class="ac-sub">${(it.sub||'').replace(/</g,'&lt;')}</span>`:''}
        </a>
      `).join('');
      box.style.display = '';
    };

    const fetchSuggest = debounce(async (q) => {
      if (!q) { items=[]; open=false; render(); return; }
      try{
        const res = await fetch(`/api/search/suggest?q=${encodeURIComponent(q)}`, { cache:'no-store' });
        const data = await res.json();
        items = Array.isArray(data.suggestions)? data.suggestions : [];
        cursor = -1; open = true; render();
      }catch(e){ /* เงียบ */ }
    }, 140);

    const doSearch = () => {
      const term = (input?.value || '').trim();
      if (!term) return;
      location.href = `/search.html?q=${encodeURIComponent(term)}`;
    };

    input?.addEventListener('input', () => fetchSuggest(input.value.trim()));
    input?.addEventListener('focus', () => { if (items.length){open=true; render();} });
    icon?.addEventListener('click', (e) => { e.preventDefault(); doSearch(); });

    input?.addEventListener('keydown', (e) => {
      if (!open && (e.key==='ArrowDown' || e.key==='ArrowUp')) { open=true; render(); }
      if (!open) { if (e.key==='Enter') doSearch(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); cursor = (cursor+1) % Math.max(items.length,1); render(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); cursor = (cursor-1+items.length) % Math.max(items.length,1); render(); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        if (cursor>=0 && items[cursor]) location.href = items[cursor].href;
        else doSearch();
      } else if (e.key === 'Escape') { open=false; render(); }
    });

    box.addEventListener('mousedown', (e) => {
      const a = e.target.closest('a.ac-row');
      if (!a) return;
      const idx = +a.dataset.idx;
      if (items[idx]) location.href = items[idx].href;
    });

    document.addEventListener('click', (e) => {
      if (!rootBar.contains(e.target)) { open=false; render(); }
    });
  }

  async function loadNavbar() {
    const slot = document.getElementById('navbar');
    if (!slot) return;

    const res = await fetch('/nav.html', { cache: 'no-store' });
    slot.innerHTML = await res.text();

    const loginLi   = slot.querySelector('#loginMenu');
    const profileLi = slot.querySelector('#profileMenu');
    const logoutLi  = slot.querySelector('#logoutMenu');
    const logoutBtn = slot.querySelector('#logout');

    // ===== Search handler (+Autocomplete) =====
    const bar = slot.querySelector('.search-bar');
    mountAutocomplete(bar);

    // ===== Auth menu toggle =====
    const showEl = (isLogin) => {
      if (isLogin) { hide(loginLi); show(profileLi); show(logoutLi); }
      else { show(loginLi); hide(profileLi); hide(logoutLi); }
    };
    showEl(false);

    if (hasFirebase) {
      const { getAuth, onAuthStateChanged, signOut } =
        await import('https://www.gstatic.com/firebasejs/10.11.1/firebase-auth.js');
      const auth = getAuth();
      onAuthStateChanged(auth, (user) => showEl(!!user));
      logoutBtn?.addEventListener('click', async (e) => {
        e.preventDefault();
        try { await signOut(auth); } catch {}
        try { localStorage.clear(); sessionStorage.clear(); } catch {}
        location.href = '/login/Login.html';
      });
    } else if (localStorage.getItem('loggedInUserId')) {
      showEl(true);
      logoutBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        try { localStorage.clear(); sessionStorage.clear(); } catch {}
        location.href = '/login/Login.html';
      });
    }
  }

  loadNavbar().catch(console.error);
})();
