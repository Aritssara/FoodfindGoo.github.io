// /login/script_login.js
const $ = (id) => document.getElementById(id);

const signUpButton = $("signUpButton");
const signInButton = $("signInButton");
const signInForm   = $("signIn");
const signUpForm   = $("signup");

function show(mode){
  const toSignup = mode === "signup";
  if (signInForm) signInForm.style.display = toSignup ? "none"  : "block";
  if (signUpForm) signUpForm.style.display = toSignup ? "block" : "none";
  document.title  = toSignup ? "Register • FoodFindGo" : "Sign In • FoodFindGo";
}
signUpButton?.addEventListener("click", ()=> show("signup"));
signInButton?.addEventListener("click", ()=> show("signin"));

const params = new URLSearchParams(location.search);
show(params.get("mode")==="signup" ? "signup" : "signin");

/* ===== ปุ่มเลือกบทบาท (ทำให้ label มีสถานะ active ตาม radio) ===== */
const roleInputs = document.querySelectorAll('input[name="role"]');
function refreshRoleActive(){
  document.querySelectorAll(".role-btn").forEach(lb => lb.classList.remove("active"));
  const checked = document.querySelector('input[name="role"]:checked');
  if (checked) document.querySelector(`label[for="${checked.id}"]`)?.classList.add("active");
}
roleInputs.forEach(inp => inp.addEventListener("change", refreshRoleActive));
refreshRoleActive();
// === Role picker: ทำให้ปุ่มบทบาทกดได้ + แสดง active ===
const roleRow = document.querySelector('.role-row');
if (roleRow) {
  roleRow.addEventListener('click', (e) => {
    const label = e.target.closest('.role-btn');
    if (!label) return;

    const input = label.querySelector('input[type="radio"]');
    if (!input) return;

    // เลือก radio
    input.checked = true;

    // เปลี่ยนสถานะ active ของปุ่ม
    roleRow.querySelectorAll('.role-btn')
      .forEach(lb => lb.classList.toggle('active', lb === label));
  });

  // ตั้งค่าเริ่มต้นให้ปุ่มตรงกับ radio ที่ checked
  const checked = roleRow.querySelector('input[name="role"]:checked');
  checked?.closest('.role-btn')?.classList.add('active');
}
