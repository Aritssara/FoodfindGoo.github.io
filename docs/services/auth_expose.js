// /public/services/auth_expose.js (เวอร์ชันปรับปรุง)
import { getAuth } from "https://www.gstatic.com/firebasejs/10.11.1/firebase-auth.js";

// รอ state ให้พร้อมครั้งเดียว
window.waitForAuth = new Promise((resolve) => {
  const unsub = getAuth().onAuthStateChanged((u) => { unsub(); resolve(u); });
});

// สร้าง absolute URL (กัน dev เผลอส่ง path แปลก ๆ)
const abs = (u) => /^https?:\/\//i.test(u) ? u : (u.startsWith("/") ? u : `/${u}`);

// แปลง response -> data (พยายามอ่าน JSON ก่อน ถ้าไม่ได้ค่อยคืน text/null)
async function toData(res) {
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return await res.json();
  if (res.status === 204) return null;
  try { return await res.json(); } catch {}
  try { return await res.text(); } catch {}
  return null;
}

// fetch แนบ Firebase ID token อัตโนมัติ + auto refresh เมื่อเจอ 401/403
window.authFetch = async (url, opts = {}) => {
  const auth = getAuth();
  const u = auth.currentUser || await window.waitForAuth;

  const run = async (forceRefresh = false) => {
    const headers = new Headers(opts.headers || {});
    if (u) {
      const token = await u.getIdToken(forceRefresh);
      headers.set("Authorization", `Bearer ${token}`);
    }
    const res = await fetch(abs(url), { ...opts, headers, credentials: "include" });
    const data = await toData(res);
    if (!res.ok) {
      const msg = (data && (data.error || data.message)) || `HTTP ${res.status}`;
      const err = new Error(msg); err.status = res.status; err.data = data;
      throw err;
    }
    return data;
  };

  try {
    return await run(false);
  } catch (e) {
    // ถ้าเจอ 401/403 ลองรีเฟรชโทเคนอีกครั้ง
    if ((e.status === 401 || e.status === 403) && (auth.currentUser || u)) {
      return await run(true);
    }
    throw e;
  }
};
