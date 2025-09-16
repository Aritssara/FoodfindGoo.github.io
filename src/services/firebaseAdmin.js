// src/services/firebaseAdmin.js
const admin = require("firebase-admin");
const fs = require("fs");

if (!admin.apps.length) {
  let credential;
  if (process.env.FIREBASE_SERVICE_ACCOUNT && fs.existsSync(process.env.FIREBASE_SERVICE_ACCOUNT)) {
    credential = admin.credential.cert(require(process.env.FIREBASE_SERVICE_ACCOUNT));
  } else if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    credential = admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON));
  }
  credential ? admin.initializeApp({ credential }) : admin.initializeApp();
}

// ทำให้ ADMIN_EMAIL มี claim admin=true (ถ้ามีระบุไว้)
(async () => {
  const email = process.env.ADMIN_EMAIL;
  if (!email) return;
  try {
    const user = await admin.auth().getUserByEmail(email);
    const current = user.customClaims || {};
    if (!current.admin) {
      await admin.auth().setCustomUserClaims(user.uid, { ...current, admin: true });
      console.log("[firebaseAdmin] set admin claim for", email);
    }
  } catch (e) {
    console.warn("[firebaseAdmin] cannot ensure admin claim:", e.message);
  }
})();

module.exports = { admin };
