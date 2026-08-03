/* ============================================================
   EMPIRE — وصول Firestore من وظائف Netlify

   قواعد الأمان تمنع القراءة العامة للإحصائيات والطلبات، فنحاول
   الطلب بدون تسجيل دخول وإذا انرفض نسجّل دخول بحساب لوحة التحكم
   ونعيد المحاولة. التوكن يُطلب مرة واحدة لكل استدعاء.

   متغيرات البيئة: FB_ADMIN_EMAIL و FB_ADMIN_PASSWORD
   ============================================================ */

const FIREBASE_PROJECT = "empire-store-9c546";
const FIREBASE_API_KEY = "AIzaSyDXYIgsj_S8Eqomlal23RxHaRc6ffWGIkc";
const FS_DOC_ROOT = `projects/${FIREBASE_PROJECT}/databases/(default)/documents`;
const FS_BASE = `https://firestore.googleapis.com/v1/${FS_DOC_ROOT}`;

/* تحويل قيم Firestore REST إلى قيم جافاسكربت عادية */
function val(v) {
  if (!v || typeof v !== "object") return null;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return Number(v.doubleValue);
  if ("stringValue" in v) return v.stringValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("nullValue" in v) return null;
  if ("mapValue" in v) {
    const o = {};
    Object.entries(v.mapValue.fields || {}).forEach(([k, x]) => { o[k] = val(x); });
    return o;
  }
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(val);
  return null;
}

function docFields(doc) {
  const o = {};
  Object.entries((doc && doc.fields) || {}).forEach(([k, v]) => { o[k] = val(v); });
  return o;
}

async function signIn() {
  const email = process.env.FB_ADMIN_EMAIL;
  const password = process.env.FB_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error(
      "قواعد Firestore تمنع القراءة العامة، فلازم تضيف FB_ADMIN_EMAIL و FB_ADMIN_PASSWORD بإعدادات Netlify"
    );
  }
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true })
    }
  );
  if (!res.ok) throw new Error("تعذّر تسجيل الدخول إلى Firebase — تأكد من البريد وكلمة المرور");
  return (await res.json()).idToken;
}

/* كل استدعاء للوظيفة يبدأ بجلسة نظيفة عبر createClient */
function createClient() {
  let token = null;

  async function fsFetch(url, options = {}) {
    const call = t => fetch(url, {
      ...options,
      headers: {
        ...(options.headers || {}),
        ...(t ? { Authorization: `Bearer ${t}` } : {})
      }
    });

    let res = await call(token);
    if (res.status === 401 || res.status === 403) {
      token = await signIn();
      res = await call(token);
    }
    return res;
  }

  /* يزيد حقلاً رقمياً بشكل ذرّي ويرجّع القيمة الجديدة.
     يُنشئ المستند إذا ما كان موجوداً. */
  async function incrementAndRead(docPath, field, by = 1) {
    const res = await fsFetch(`${FS_BASE}:commit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        writes: [
          {
            update: { name: `${FS_DOC_ROOT}/${docPath}`, fields: {} },
            updateMask: { fieldPaths: [] },
            updateTransforms: [
              { fieldPath: field, increment: { integerValue: String(by) } }
            ]
          }
        ]
      })
    });
    if (!res.ok) throw new Error("تعذّر حجز الرقم (HTTP " + res.status + ")");
    const data = await res.json();
    const result = ((data.writeResults || [])[0] || {}).transformResults || [];
    const next = val(result[0]);
    if (typeof next !== "number") throw new Error("رد غير متوقع عند حجز الرقم");
    return next;
  }

  return { fsFetch, incrementAndRead };
}

module.exports = { FS_BASE, FS_DOC_ROOT, val, docFields, signIn, createClient };
