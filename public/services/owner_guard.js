// /public/services/owner_guard.js
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.11.1/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.11.1/firebase-firestore.js";

const LOGIN_URL = "/login/Login.html";

// ซ่อนทั้งหน้าจนกว่าจะยืนยันสิทธิ์
try { document.documentElement.style.visibility = "hidden"; } catch {}

const auth = getAuth();
const db = getFirestore();

const goLogin = () =>
  location.replace(`${LOGIN_URL}?next=${encodeURIComponent(location.pathname + location.search)}`);

const hasOwnerAccess = (rolesSet) =>
  rolesSet.has("owner") || rolesSet.has("admin");

onAuthStateChanged(auth, async (user) => {
  if (!user) return goLogin();

  try {
    // 1) ดึง claims ล่าสุด (true เพื่อรีเฟรช)
    let claims = {};
    try {
      const idt = await user.getIdTokenResult(true);
      claims = idt?.claims || {};
    } catch {}

    // 2) รวมบทบาทจากหลายแหล่ง: claims + เอกสาร users
    const roles = new Set();

    // จาก claims
    if (typeof claims.role === "string") roles.add(String(claims.role).toLowerCase());
    if (Array.isArray(claims.roles)) claims.roles.forEach(r => roles.add(String(r).toLowerCase()));
    if (claims.admin === true || claims.isAdmin === true) roles.add("admin");
    if (claims.owner === true) roles.add("owner");

    // จากเอกสาร users/{uid}
    try {
      const snap = await getDoc(doc(db, "users", user.uid));
      if (snap.exists()) {
        const d = snap.data() || {};
        if (typeof d.role === "string") roles.add(String(d.role).toLowerCase());
        if (Array.isArray(d.roles)) d.roles.forEach(r => roles.add(String(r).toLowerCase()));
        if (d.admin === true) roles.add("admin");
        if (d.owner === true) roles.add("owner");
      }
    } catch {}

    // 3) ถ้ามีพอแล้ว ให้แสดงหน้า
    if (hasOwnerAccess(roles)) {
      document.documentElement.style.visibility = "";
      return;
    }

    // 4) Fallback: ลองสอบถามสิทธิ์จากเซิร์ฟเวอร์ (/api/owner/me)
    try {
      const token = await user.getIdToken();
      const r = await fetch("/api/owner/me", {
        headers: { Authorization: "Bearer " + token }
      });
      if (r.ok) {
        document.documentElement.style.visibility = "";
        return;
      }
    } catch {}

    // 5) ไม่ผ่านทุกเงื่อนไข → ปฏิเสธ
    alert("ต้องเป็นเจ้าของร้านหรือผู้ดูแลระบบเท่านั้น");
    location.replace("/");
  } catch {
    goLogin();
  }
});
