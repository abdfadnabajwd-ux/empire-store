/* ============================================================
   EMPIRE — الملخص اليومي على تيليجرام (Netlify Scheduled Function)

   يشتغل تلقائياً كل يوم الساعة ١٠ مساءً بتوقيت بغداد (الجدولة
   بملف netlify.toml)، يقرأ إحصائيات اليوم من Firestore ويرسل
   ملخصاً لصاحب المتجر على تيليجرام مع مقارنة بأمس.

   تشتغل بدون أي إعداد. وكل متغيرات البيئة اختيارية:
     TG_BOT_TOKEN / TG_CHAT_ID       لنقل توكن تيليجرام خارج الكود
     FB_ADMIN_EMAIL / FB_ADMIN_PASSWORD  تلزم فقط بعد تشديد قواعد
                                     Firestore بحيث تمنع القراءة العامة
     SUMMARY_SECRET                  كلمة سر لتجربة الملخص يدوياً من المتصفح

   طريقة قراءة البيانات: نحاول القراءة مباشرة، وإذا كانت القواعد
   مشدّدة ورفضت الطلب نسجّل الدخول بحساب لوحة التحكم. هيك تشتغل
   الوظيفة قبل تشديد القواعد وبعده بدون تعديل.
   ============================================================ */

const FIREBASE_PROJECT = "empire-store-9c546";
const FIREBASE_API_KEY = "AIzaSyDXYIgsj_S8Eqomlal23RxHaRc6ffWGIkc";
/* نفس قيم index.html كافتراضي حتى تشتغل بدون إعداد — والأفضل نقلها
   لمتغيرات البيئة، لأن التوكن الحالي مكشوف بكود الموقع أصلاً */
const TG_TOKEN_FALLBACK = "8970683021:AAGqA4ZmCQKswDbnhynZIjkqSBnzWDsehcI";
const TG_CHAT_FALLBACK = "152173477";
const FS_BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents`;
const BAGHDAD_OFFSET_MS = 3 * 60 * 60 * 1000; // UTC+3

const pad = n => String(n).padStart(2, "0");
const fmt = n => Math.round(n || 0).toLocaleString("en-US");
const AR_DAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

/* تاريخ بغداد — نزيح الوقت ثم نقرأ مكوّنات UTC */
function baghdadDay(daysAgo = 0) {
  const d = new Date(Date.now() + BAGHDAD_OFFSET_MS - daysAgo * 86400000);
  return {
    key: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
    label: `${AR_DAYS[d.getUTCDay()]} ${d.getUTCDate()}/${d.getUTCMonth() + 1}/${d.getUTCFullYear()}`,
    startMs: Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - BAGHDAD_OFFSET_MS
  };
}

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
const docFields = doc => {
  const o = {};
  Object.entries((doc && doc.fields) || {}).forEach(([k, v]) => { o[k] = val(v); });
  return o;
};

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

/* نقرأ بدون تسجيل دخول، وإذا رفضت القواعد نسجّل الدخول ونعيد المحاولة.
   التوكن يُطلب مرة واحدة فقط ويُعاد استخدامه لبقية الطلبات. */
let cachedToken = null;
async function fsFetch(url, options = {}) {
  const call = token => fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });

  let res = await call(cachedToken);
  if (res.status === 401 || res.status === 403) {
    cachedToken = await signIn();
    res = await call(cachedToken);
  }
  return res;
}

async function getDay(key) {
  const res = await fsFetch(`${FS_BASE}/analytics/${key}`);
  if (res.status === 404) return {}; // ما توجد بيانات لهذا اليوم
  if (!res.ok) throw new Error("تعذّر قراءة الإحصائيات (HTTP " + res.status + ")");
  return docFields(await res.json());
}

async function getRecentOrders(sinceMs) {
  const res = await fsFetch(`${FS_BASE}:runQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: "orders" }],
        orderBy: [{ field: { fieldPath: "createdAt" }, direction: "DESCENDING" }],
        limit: 40
      }
    })
  });
  if (!res.ok) return [];
  const rows = await res.json();
  return rows
    .filter(r => r.document)
    .map(r => docFields(r.document))
    .filter(o => (o.createdAt || 0) >= sinceMs);
}

/* مقارنة مع أمس: ▲ ٢٦٪ */
function trend(today, yesterday) {
  const t = today || 0, y = yesterday || 0;
  if (!y) return y === 0 && t === 0 ? "" : `  (أمس ${fmt(y)})`;
  const pct = Math.round(((t - y) / y) * 100);
  const arrow = pct > 0 ? "▲" : pct < 0 ? "▼" : "=";
  return `  (أمس ${fmt(y)}) ${arrow} ${Math.abs(pct)}%`;
}

function durStr(total, count) {
  if (!count) return "0:00";
  const sec = Math.round(total / count);
  return `${Math.floor(sec / 60)}:${pad(sec % 60)}`;
}

function buildMessage(day, today, yest, orders) {
  const visits = today.visits || 0;
  const orderCount = today.orders || 0;
  const revenue = today.revenue || 0;
  const line = "━━━━━━━━━━━━━━━";

  let m = `📊 ملخص امباير اليومي\n${day.label}\n${line}\n`;

  if (!visits && !orderCount) {
    return m + "ما وصلت أي زيارة أو طلب اليوم.";
  }

  m += `👥 الزيارات: ${fmt(visits)}${trend(visits, yest.visits)}\n`;
  m += `🆕 زوار جدد: ${fmt(today.newVisitors)}${trend(today.newVisitors, yest.newVisitors)}\n`;
  m += `⏱ متوسط مدة الزيارة: ${durStr(today.durationTotal, today.durationCount)}\n`;
  m += `${line}\n`;
  m += `🛒 إضافات للسلة: ${fmt(today.addToCart)}\n`;
  m += `🧾 الطلبات: ${fmt(orderCount)}${trend(orderCount, yest.orders)}\n`;
  m += `💰 المبيعات: ${fmt(revenue)} د.ع${trend(revenue, yest.revenue)}\n`;
  m += `📈 نسبة التحويل: ${visits ? ((orderCount / visits) * 100).toFixed(1) : "0"}%\n`;
  if (orderCount) m += `💵 متوسط الطلب: ${fmt(revenue / orderCount)} د.ع\n`;

  const views = Object.entries(today.productViews || {}).sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (views.length) {
    m += `${line}\n🔝 الأكثر مشاهدة:\n`;
    views.forEach(([name, count], i) => { m += `${i + 1}. ${name} — ${fmt(count)}\n`; });
  }

  if (orders.length) {
    m += `${line}\n📦 طلبات اليوم:\n`;
    orders.slice(0, 10).forEach(o => {
      m += `• ${o.invoiceNo || "—"} — ${o.name || ""} — ${fmt(o.total)} د.ع\n`;
    });
    if (orders.length > 10) m += `وغيرها ${fmt(orders.length - 10)} طلب\n`;
  }

  return m.trim();
}

async function sendTelegram(text) {
  const token = process.env.TG_BOT_TOKEN || TG_TOKEN_FALLBACK;
  const chat = process.env.TG_CHAT_ID || TG_CHAT_FALLBACK;
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true })
  });
  if (!res.ok) throw new Error("تيليجرام رفض الرسالة: " + (await res.text()).slice(0, 200));
}

exports.handler = async (event) => {
  /* التشغيل المجدول يرسله Netlify ومعه next_run. أي استدعاء يدوي
     من المتصفح لازم يجيب SUMMARY_SECRET حتى ما أحد يشوف الأرقام. */
  let scheduled = false;
  try {
    scheduled = !!JSON.parse(event.body || "{}").next_run;
  } catch (e) {}
  const secret = process.env.SUMMARY_SECRET;
  const key = (event.queryStringParameters || {}).key;
  const authorized = !!secret && key === secret;

  if (!scheduled && !authorized) {
    return { statusCode: 401, body: "غير مصرّح" };
  }

  try {
    const day = baghdadDay(0);
    // أول قراءة لحالها حتى يُطلب توكن الدخول مرة واحدة إذا احتجناه
    const today = await getDay(day.key);
    const [yest, orders] = await Promise.all([
      getDay(baghdadDay(1).key),
      getRecentOrders(day.startMs)
    ]);

    const message = buildMessage(day, today, yest, orders);
    await sendTelegram(message);

    // النص يرجع فقط للاستدعاء اليدوي المصرّح به، حتى تشوف النتيجة وأنت تجرب
    return {
      statusCode: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
      body: authorized ? message : "تم الإرسال"
    };
  } catch (e) {
    console.error("daily-summary:", e);
    return { statusCode: 500, body: "تعذّر إرسال الملخص: " + e.message };
  }
};

/* مُصدَّرة للاختبار فقط */
exports._internals = { baghdadDay, buildMessage, trend, durStr, val, docFields };
