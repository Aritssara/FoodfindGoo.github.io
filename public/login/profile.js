// /login/profile.js
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.11.1/firebase-app.js";
import {
  getAuth, onAuthStateChanged,
  updateProfile, updatePassword,
  reauthenticateWithCredential, EmailAuthProvider
} from "https://www.gstatic.com/firebasejs/10.11.1/firebase-auth.js";
import {
  getFirestore, getDoc, setDoc,
  doc, collection, getDocs, query, orderBy, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.11.1/firebase-firestore.js";

/* ========= Firebase init ========= */
const firebaseConfig = {
  apiKey: "AIzaSyC-Yu2UgqF5BVuNFSej_-dm0tVeZi9r37U",
  authDomain: "login-6978f.firebaseapp.com",
  projectId: "login-6978f",
  storageBucket: "login-6978f.firebasestorage.app",
  messagingSenderId: "359944908271",
  appId: "1:359944908271:web:514897139121b86ebada1a",
  measurementId: "G-WSTBP08YH2"
};
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

/* ========= Helpers ========= */
const $  = (id) => document.getElementById(id);
const esc = (s="") => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const maskEmail = (e) => (!e||!e.includes("@")) ? (e||"") : (e.split("@")[0].slice(0,3)+"******@"+e.split("@")[1]);

/* ========= Pages for redirect ========= */
const USER_PAGE  = "/login/Profile.html";
const OWNER_PAGE = "/owner/owner.html";
const ADMIN_PAGE = "/admin.html";

/* ========= Favorites UI ========= */
function showSkeleton(n=5){
  const w = $("favoritesList"); if(!w) return;
  w.innerHTML = Array.from({length:n}).map(()=>`
    <div class="skel">
      <div class="skel-rect"></div>
      <div class="skel-line"></div>
    </div>
  `).join("");
}
function renderEmpty(){
  const w = $("favoritesList"); if(!w) return;
  w.innerHTML = `<div class="empty"><i class="fa-regular fa-bookmark"></i><div>ยังไม่มีรายการโปรด</div></div>`;
}
async function loadFavorites(uid){
  const w = $("favoritesList"); if(!w) return;
  showSkeleton(5);
  try{
    const snap = await getDocs(query(collection(db,"users",uid,"saved"), orderBy("createdAt","desc")));
    if (snap.empty) return renderEmpty();
    w.innerHTML = "";
    snap.forEach(d=>{
      const it = d.data();
      const name = it.name || "ไม่ระบุชื่อ";
      const img  = it.image || "/background/food.jpg";
      const rid  = it.restaurantId || "";
      const midQ = it.menuId ? `&menuId=${encodeURIComponent(it.menuId)}` : "";
      const el = document.createElement("article");
      el.className="fav-card";
      el.innerHTML = `
        <img src="${esc(img)}" alt="${esc(name)}" loading="lazy">
        <div class="body">
          <div class="title" title="${esc(name)}">${esc(name)}</div>
          <div class="row">
            <a class="btn btn-primary" href="/Menu/shop.html?id=${encodeURIComponent(rid)}${midQ}">เปิดร้าน</a>
            <button class="btn" data-remove="${d.id}">ลบออก</button>
          </div>
        </div>`;
      w.appendChild(el);
    });
    w.querySelectorAll("[data-remove]").forEach(btn=>{
      btn.addEventListener("click", async ()=>{
        if(!confirm("ลบออกจากรายการโปรด?")) return;
        await deleteDoc(doc(db,"users",auth.currentUser.uid,"saved", btn.getAttribute("data-remove")));
        btn.closest(".fav-card")?.remove();
        if(!w.children.length) renderEmpty();
      });
    });
  }catch(e){
    console.error(e);
    w.innerHTML = '<div class="empty"><div>โหลดรายการโปรดไม่สำเร็จ</div></div>';
  }
}

/* ========= Edit Profile Dialog ========= */
function bindEditDialog(){
  const link   = document.querySelector(".edit-link");
  const dlg    = $("editDialog");
  const cancel = $("cancelEdit");
  const form   = $("editForm");
  if (!link || !dlg || !form) return;

  link.addEventListener("click", async (e)=>{
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) return (location.href="/login/Login.html");

    // ดึงค่าเดิมจาก Firestore
    const snap = await getDoc(doc(db,"users", user.uid));
    const d = snap.exists() ? snap.data() : {};
    $("firstName").value = d.firstName || "";
    $("lastName").value  = d.lastName  || "";
    $("oldPass").value = $("newPass").value = $("newPass2").value = "";
    $("editMsg").textContent = "";
    dlg.showModal();
  });

  cancel?.addEventListener("click", ()=> dlg.close());

  form.addEventListener("submit", async (e)=>{
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) return (location.href="/login/Login.html");

    const f  = $("firstName").value.trim();
    const l  = $("lastName").value.trim();
    const op = $("oldPass").value;
    const np = $("newPass").value;
    const np2= $("newPass2").value;
    const msg= $("editMsg");
    const saveBtn = $("saveEdit");

    if (!f || !l) { msg.textContent = "กรุณากรอกชื่อและนามสกุล"; return; }
    if (np || np2 || op) {
      if (np.length < 6) { msg.textContent = "รหัสผ่านใหม่ต้องอย่างน้อย 6 ตัวอักษร"; return; }
      if (np !== np2)    { msg.textContent = "รหัสผ่านใหม่ไม่ตรงกัน"; return; }
      if (!op)           { msg.textContent = "กรุณากรอกรหัสผ่านเดิมเพื่อยืนยัน"; return; }
    }

    saveBtn.disabled = true; saveBtn.textContent = "กำลังบันทึก...";
    try{
      // 1) บันทึกชื่อ-นามสกุลลง Firestore
      await setDoc(doc(db,"users",user.uid), { firstName: f, lastName: l }, { merge: true });

      // 2) อัปเดต displayName ใน Firebase Auth
      try { await updateProfile(user, { displayName: `${f} ${l}`.trim() }); } catch {}

      // 3) เปลี่ยนรหัสผ่าน (ถ้ามีกรอก)
      if (np) {
        if (!user.email) throw new Error("บัญชีนี้ไม่มีอีเมล ไม่สามารถตั้งรหัสผ่านได้");
        const cred = EmailAuthProvider.credential(user.email, op);
        await reauthenticateWithCredential(user, cred);
        await updatePassword(user, np);
      }

      // 4) อัปเดต UI
      const fn = $("loggedUserFName");
      const ln = $("loggedUserLName");
      if (fn) fn.textContent = f;
      if (ln) ln.textContent = l;

      msg.textContent = "บันทึกสำเร็จ";
      dlg.close();
      alert("บันทึกสำเร็จ");
    }catch(err){
      console.error(err);
      const code = err?.code || "";
      if (code === "auth/wrong-password")           msg.textContent = "รหัสผ่านเดิมไม่ถูกต้อง";
      else if (code === "auth/weak-password")       msg.textContent = "รหัสผ่านใหม่อ่อนแรงเกินไป";
      else if (code === "auth/too-many-requests")   msg.textContent = "พยายามมากเกินไป กรุณาลองใหม่ภายหลัง";
      else if (code === "auth/requires-recent-login") msg.textContent = "โปรดเข้าสู่ระบบใหม่ แล้วลองอีกครั้ง";
      else msg.textContent = err?.message || "บันทึกไม่สำเร็จ";
    }finally{
      saveBtn.disabled = false; saveBtn.textContent = "บันทึก";
    }
  });
}

/* ========= Resolve role (Firestore + Custom Claims) ========= */
async function resolveRole(user){
  // 1) Firestore user doc
  let fsRole = "user", fsAdmin=false, fsOwner=false;
  try {
    const snap = await getDoc(doc(db,"users", user.uid));
    if (snap.exists()) {
      const d = snap.data();
      fsRole  = (typeof d.role === "string" && d.role) || "user";
      fsAdmin = d.admin === true;
      fsOwner = d.owner === true;
      if (fsAdmin) fsRole = "admin";
      else if (fsOwner) fsRole = "owner";
    }
  } catch {}

  // 2) Custom claims (เผื่อกำหนดไว้ใน Firebase Admin)
  try {
    const idt = await user.getIdTokenResult(true);
    const c = idt?.claims || {};
    if (c.admin === true || c.isAdmin === true || c.role === "admin" || (Array.isArray(c.roles) && c.roles.includes("admin"))) return "admin";
    if (c.owner === true || c.role === "owner" || (Array.isArray(c.roles) && c.roles.includes("owner"))) return "owner";
  } catch {}

  return fsRole || "user";
}

/* ========= Auth Gate + Redirect by role ========= */
onAuthStateChanged(auth, async (user)=>{
  if (!user){ location.replace("/login/Login.html"); return; }

  // ตัดสินบทบาทแล้ว "เด้งทันที" ถ้าเป็น owner/admin
  let role = "user";
  try { role = await resolveRole(user); } catch {}
  if (role === "admin") { location.replace(ADMIN_PAGE); return; }
  if (role === "owner") { location.replace(OWNER_PAGE); return; }

  // ผู้ใช้ทั่วไป: แสดงข้อมูลโปรไฟล์และรายการโปรด
  try{
    const snap = await getDoc(doc(db,"users",user.uid));
    if (snap.exists()){
      const d = snap.data();
      $("loggedUserFName")?.append(d.firstName || "");
      $("loggedUserLName")?.append(d.lastName  || "");
      $("loggedUserEmail")?.append(maskEmail(d.email || user.email || ""));
      $("loggedUserRole")?.append(role || "user");
    } else {
      $("loggedUserEmail")?.append(maskEmail(user.email || ""));
      $("loggedUserRole")?.append("user");
    }
  }catch(e){ console.warn("โหลดโปรไฟล์ไม่สำเร็จ", e); }

  bindEditDialog();
  loadFavorites(user.uid);
});
