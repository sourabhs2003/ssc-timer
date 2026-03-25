// firebase.js – Firebase v9 compat SDK (CDN-loaded in index.html)
// This module initialises Firebase and exports Firestore helpers.

const firebaseConfig = {
  apiKey: "AIzaSyCZMfIl46ea7C_1U_8XEmjpeImg4-so9tk",
  authDomain: "sourabhzssc.firebaseapp.com",
  projectId: "sourabhzssc",
  storageBucket: "sourabhzssc.firebasestorage.app",
  messagingSenderId: "31742915782",
  appId: "1:31742915782:web:29fa2b94b6d146aea6d3c7"
};

let db = null;
let firebaseReady = false;

export function initFirebase() {
  return new Promise((resolve) => {
    try {
      if (typeof firebase === 'undefined') { resolve(false); return; }
      if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
      db = firebase.firestore();
      db.settings({ merge: true });
      firebaseReady = true;
      resolve(true);
    } catch (e) {
      console.warn('[Firebase] Init failed:', e.message);
      resolve(false);
    }
  });
}

export function isFirebaseReady() { return firebaseReady; }

// ── Collection helpers (all prefixed sscx_) ────────────────────────────────

export async function fbSet(collection, docId, data) {
  if (!firebaseReady) return false;
  try {
    await db.collection(`sscx_${collection}`).doc(docId).set(data, { merge: true });
    return true;
  } catch (e) { console.warn('[FB set]', e.message); return false; }
}

export async function fbAdd(collection, data) {
  if (!firebaseReady) return null;
  try {
    const ref = await db.collection(`sscx_${collection}`).add(data);
    return ref.id;
  } catch (e) { console.warn('[FB add]', e.message); return null; }
}

export async function fbDelete(collection, docId) {
  if (!firebaseReady) return false;
  try {
    await db.collection(`sscx_${collection}`).doc(docId).delete();
    return true;
  } catch (e) { console.warn('[FB delete]', e.message); return false; }
}

export async function fbGetAll(collection) {
  if (!firebaseReady) return [];
  try {
    const snap = await db.collection(`sscx_${collection}`).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) { console.warn('[FB getAll]', e.message); return []; }
}

export async function fbQuery(collection, field, op, value) {
  if (!firebaseReady) return [];
  try {
    const snap = await db.collection(`sscx_${collection}`).where(field, op, value).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) { console.warn('[FB query]', e.message); return []; }
}
