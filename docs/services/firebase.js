// /public/services/firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.1/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.11.1/firebase-auth.js";
import { getFirestore, setDoc, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.11.1/firebase-firestore.js";

/* เป้าหมายของแต่ละบทบาท */
const USER_URL  = "/login/Profile.html";
const ADMIN_URL = "/admin.html";
const OWNER_URL = "/owner/owner.html";         
const LOGIN_URL = "/login/Login.html";

/* (ตัวเลือก) รายชื่ออีเมลที่จะเป็น admin อัตโนมัติ */
const ADMIN_EMAIL_ALLOWLIST = [ /* ... */ ];

/* Firebase config ของคุณ */
const firebaseConfig = {
  apiKey: "AIzaSyC-Yu2UgqF5BVuNFSej_-dm0tVeZi9r37U",
  authDomain: "login-6978f.firebaseapp.com",
  projectId: "login-6978f",
  storageBucket: "login-6978f.firebasestorage.app",
  messagingSenderId: "359944908271",
  appId: "1:359944908271:web:514897139121b86ebada1a",
  measurementId: "G-WSTBP08YH2"
};
export const app = initializeApp(firebaseConfig);   // ✅ export เผื่อไฟล์อื่น import app

/* helpers */
const msg = (t, id) => { const el = document.getElementById(id); if(!el) return;
  el.style.display="block"; el.textContent=t; el.style.opacity=1; setTimeout(()=>el.style.opacity=0, 3500); };
const getRole = (data, claimsRole) => {
  if (typeof claimsRole === "string") return claimsRole;
  if (data?.role) return data.role;
  if (data?.admin === true) return "admin";
  if (data?.owner === true) return "owner";
  return "user";
};
const goByRole = (role) => {
  if (role === "admin")      location.href = ADMIN_URL;
  else if (role === "owner") location.href = OWNER_URL;
  else                       location.href = USER_URL;
};

/* ===== Sign Up ===== */
document.getElementById("submitSignUp")?.addEventListener("click", async (e) => {
  e.preventDefault();
  const email = document.getElementById("rEmail").value.trim().toLowerCase();
  const password = document.getElementById("rPassword").value.trim();
  const firstName = document.getElementById("fName").value.trim();
  const lastName  = document.getElementById("lName").value.trim();
  const roleFromForm =
    document.querySelector('input[name="role"]:checked')?.value ||
    document.getElementById("roleSelect")?.value || "user";

  const auth = getAuth(), db = getFirestore();
  try {
    const { user } = await createUserWithEmailAndPassword(auth, email, password);
    const role = ADMIN_EMAIL_ALLOWLIST.includes(email)
      ? "admin"
      : (["owner","admin"].includes(roleFromForm) ? roleFromForm : "user");
    await setDoc(doc(db, "users", user.uid), {
      email, firstName, lastName,
      role, admin: role==="admin", owner: role==="owner"
    });
    msg("Account Created Successfully", "signUpMessage");
    location.href = LOGIN_URL;
  } catch (err) {
    msg(err?.code==="auth/email-already-in-use" ? "Email Address Already Exists !!!" : "Unable to create user", "signUpMessage");
  }
});

/* ===== Sign In (พาไปหน้าตามบทบาท) ===== */
document.getElementById("submitSignIn")?.addEventListener("click", async (e) => {
  e.preventDefault();
  const email = document.getElementById("email").value.trim().toLowerCase();
  const password = document.getElementById("password").value.trim();

  const auth = getAuth(), db = getFirestore();
  try {
    const { user } = await signInWithEmailAndPassword(auth, email, password);
    localStorage.setItem("loggedInUserId", user.uid);

    let claimsRole = null;
    try { const t = await user.getIdTokenResult(); claimsRole = t.claims?.role ?? null; } catch {}
    const snap = await getDoc(doc(db, "users", user.uid));
    const role = getRole(snap.exists() ? snap.data() : null, claimsRole);
    localStorage.setItem("userRole", role);

    goByRole(role); // ✅ redirect ทันที
  } catch (err) {
    msg(err?.code==="auth/invalid-credential" ? "Incorrect Email or Password" : "Account does not Exist", "signInMessage");
  }
});

/* ถ้าอยู่หน้า Login และล็อกอินค้างไว้ → เด้งตามบทบาท */
(() => {
  const onLogin = location.pathname.endsWith("/login/Login.html") || location.pathname.endsWith("/Login.html");
  if (!onLogin) return;
  const auth = getAuth(), db = getFirestore();
  onAuthStateChanged(auth, async (user) => {
    if (!user) return;
    let claimsRole=null; try{ const t=await user.getIdTokenResult(); claimsRole=t.claims?.role??null; }catch{}
    const snap = await getDoc(doc(db,"users",user.uid));
    const role = getRole(snap.exists()?snap.data():null, claimsRole);
    localStorage.setItem("userRole", role);
    goByRole(role);
  });
})(); 
