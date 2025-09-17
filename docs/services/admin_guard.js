// /services/admin_guard.js
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.11.1/firebase-auth.js";

const auth = getAuth();
const LOGIN_URL = "/login/Login.html";

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    location.href = LOGIN_URL;
    return;
  }
  // สร้าง fetch ที่แนบ Bearer token เสมอ
  window.authFetch = async (url, opts = {}) => {
    const idToken = await user.getIdToken(); // ดึง token สดๆ
    const headers = new Headers(opts.headers || {});
    headers.set("Authorization", `Bearer ${idToken}`);
    // ใส่ Content-Type เมื่อส่ง JSON (ถ้าไม่มี)
    if ((opts.method && opts.method !== "GET") && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    const res = await fetch(url, { ...opts, headers, credentials: "omit" });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error((data && (data.error || data.message)) || `HTTP ${res.status}`);
    return data ?? {};
  };
});
