// /public/admin/admin_profile.js
import {
  getAuth, updateProfile, updateEmail,
  reauthenticateWithCredential, EmailAuthProvider
} from "https://www.gstatic.com/firebasejs/10.11.1/firebase-auth.js";

const $ = (id) => document.getElementById(id);
const auth = getAuth();

function fillProfile(u){
  if ($('adminName'))  $('adminName').value  = u?.displayName || (u?.email?.split('@')[0] || '');
  if ($('adminEmail')) $('adminEmail').value = u?.email || '';
}
auth.onAuthStateChanged((u) => fillProfile(u));

const jfetch = (window.authFetch) || (async (url, opts={})=>{
  const res = await fetch(url, opts); let data=null; try{ data=await res.json(); }catch{}
  if (!res.ok) throw new Error((data && (data.error || data.message)) || `HTTP ${res.status}`);
  return data;
});

// บันทึก display name
$('btnSaveAdminProfile')?.addEventListener('click', async (e)=>{
  e.preventDefault();
  const name = ($('adminName')?.value || '').trim();
  if (!name) return alert('ใส่ชื่อก่อน');
  const u = auth.currentUser; if (!u) return alert('ยังไม่ได้เข้าสู่ระบบ');
  await updateProfile(u, { displayName: name });
  try { await jfetch('/api/admin/profile', { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ displayName: name }) }); } catch {}
  alert('บันทึกแล้ว');
});

// modal เปลี่ยนอีเมล
const backdrop = $('changeEmailModalBackdrop');
function closeCE(){ backdrop.style.display='none'; document.body.style.overflow=''; }
$('btnOpenChangeEmail')?.addEventListener('click', ()=>{
  const u = auth.currentUser;
  const usesPassword = (u?.providerData||[]).some(p=>p.providerId==='password');
  $('cePwdBlock').style.display = usesPassword ? '' : 'none';
  $('ceInfoOauth').style.display = usesPassword ? 'none' : '';
  backdrop.style.display = 'flex';
  document.body.style.overflow = 'hidden';
});
$('btnCEClose')?.addEventListener('click', closeCE);
$('btnCECancel')?.addEventListener('click', closeCE);

$('btnCESubmit')?.addEventListener('click', async ()=>{
  const u = auth.currentUser; if (!u) return;
  const newEmail = ($('ceNewEmail')?.value||'').trim();
  if (!newEmail) return alert('กรอกอีเมลใหม่ก่อน');

  const usesPassword = (u?.providerData||[]).some(p=>p.providerId==='password');
  try{
    if (usesPassword){
      const pwd = $('cePassword')?.value || '';
      if (!pwd) return alert('กรอกรหัสผ่านปัจจุบัน');
      await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, pwd));
    }else{
      return alert('บัญชีนี้ล็อกอินด้วย Google/Provider อื่น — ออกจากระบบแล้วล็อกอินใหม่ด้วยอีเมลที่ต้องการ');
    }
    await updateEmail(u, newEmail);
    try { await jfetch('/api/admin/profile', { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email: newEmail }) }); } catch {}
    fillProfile(u);
    alert('เปลี่ยนอีเมลเรียบร้อย');
    closeCE();
  }catch(e){ alert(e.message || 'ไม่สำเร็จ'); }
});
