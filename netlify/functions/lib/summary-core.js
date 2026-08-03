/* ============================================================
   EMPIRE — منطق الملخص اليومي على تيليجرام

   يقرأ إحصائيات اليوم من Firestore ويرسل ملخصاً لصاحب المتجر على
   تيليجرام مع مقارنة بأمس. يستدعيه ملفان:
     daily-summary.js  الوظيفة المجدولة (١٠ مساءً بتوقيت بغداد)
     summary-now.js    نقطة الفحص اليدوي من المتصفح

   هذا الملف داخل مجلد lib حتى لا يعتبره Netlify وظيفة مستقلة.

   متغيرات البيئة:
     TG_BOT_TOKEN / TG_CHAT_ID       اختيارية — لنقل توكن تيليجرام خارج الكود
     FB_ADMIN_EMAIL / FB_ADMIN_PASSWORD  تلزم عندما تمنع قواعد Firestore
                                     القراءة العامة (وهو الوضع الحالي)
     SUMMARY_SECRET                  مفتاح نقطة الفحص اليدوي

   طريقة قراءة البيانات: نحاول القراءة مباشرة، وإذا كانت القواعد
   مشدّدة ورفضت الطلب نسجّل الدخول بحساب لوحة التحكم. هيك تشتغل
   الوظيفة قبل تشديد القواعد وبعده بدون تعديل.
   ============================================================ */

const { FS_BASE, val, docFields, createClient } = require("./firestore.js");

/* نفس قيم index.html كافتراضي حتى تشتغل بدون إعداد — والأفضل نقلها
   لمتغيرات البيئة، لأن التوكن الحالي مكشوف بكود الموقع أصلاً */
const TG_TOKEN_FALLBACK = "8970683021:AAGqA4ZmCQKswDbnhynZIjkqSBnzWDsehcI";
const TG_CHAT_FALLBACK = "152173477";
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

let fs = null; // عميل Firestore لهذا الاستدعاء

async function getDay(key) {
  const res = await fs.fsFetch(`${FS_BASE}/analytics/${key}`);
  if (res.status === 404) return {}; // ما توجد بيانات لهذا اليوم
  if (!res.ok) throw new Error("تعذّر قراءة الإحصائيات (HTTP " + res.status + ")");
  return docFields(await res.json());
}

async function getRecentOrders(sinceMs) {
  const res = await fs.fsFetch(`${FS_BASE}:runQuery`, {
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
  m += `🛒 أضافوا للسلة: ${fmt(today.addToCart)}\n`;
  if (today.cartOpens || today.checkoutReached) {
    m += `🛍 فتحوا السلة: ${fmt(today.cartOpens)}\n`;
    m += `📝 وصلوا لفورم العنوان: ${fmt(today.checkoutReached)}\n`;
  }
  m += `🧾 الطلبات: ${fmt(orderCount)}${trend(orderCount, yest.orders)}\n`;
  m += `💰 المبيعات: ${fmt(revenue)} د.ع${trend(revenue, yest.revenue)}\n`;
  m += `📈 نسبة التحويل: ${visits ? ((orderCount / visits) * 100).toFixed(1) : "0"}%\n`;
  if (orderCount) m += `💵 متوسط الطلب: ${fmt(revenue / orderCount)} د.ع\n`;

  const chatUsers = today.chatUsers || 0;
  if (today.chatOpens || chatUsers) {
    m += `${line}\n`;
    m += `💬 تكلموا مع المساعد: ${fmt(chatUsers)}${trend(chatUsers, yest.chatUsers)}\n`;
    m += `   فتحوا الدردشة: ${fmt(today.chatOpens)} · الرسائل: ${fmt(today.chatMessages)}\n`;
  }

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

/* يجمع أرقام اليوم، يرسلها على تيليجرام، ويرجّع نص الرسالة.
   يستدعيها الملف المجدول daily-summary.js ونقطة الفحص summary-now.js */
async function runSummary() {
  fs = createClient(); // كل استدعاء يبدأ بجلسة نظيفة
  const day = baghdadDay(0);
  // أول قراءة لحالها حتى يُطلب توكن الدخول مرة واحدة إذا احتجناه
  const today = await getDay(day.key);
  const [yest, orders] = await Promise.all([
    getDay(baghdadDay(1).key),
    getRecentOrders(day.startMs)
  ]);

  const message = buildMessage(day, today, yest, orders);
  await sendTelegram(message);
  return message;
}

exports.runSummary = runSummary;

/* مُصدَّرة للاختبار فقط */
exports._internals = { baghdadDay, buildMessage, trend, durStr, val, docFields };
