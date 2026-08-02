/* ============================================================
   EMPIRE — إرسال الطلب لصاحب المتجر على تيليجرام

   قبل هذا الملف كان الموقع يرسل الطلب مباشرة من متصفح الزبون،
   وهذا يعني أن توكن البوت كان مكتوباً داخل صفحة الموقع ويقدر أي
   شخص يفتح المصدر وياخذه. الآن الإرسال يصير هنا بالسيرفر.

   نص الرسالة يُبنى هنا من حقول محددة ومحدودة الطول، فحتى لو استدعى
   أحد الرابط مباشرة ما يقدر يرسل نصاً حراً — بس شكل طلب.

   متغيرات البيئة (اختيارية):
     TG_BOT_TOKEN / TG_CHAT_ID   عند تبديل التوكن من BotFather
   ============================================================ */

/* القيم الحالية كافتراضي حتى يستمر الاستلام بدون انقطاع.
   بعد تبديل التوكن من BotFather، ضع الجديد بمتغيرات البيئة. */
const TG_TOKEN_FALLBACK = "8970683021:AAGqA4ZmCQKswDbnhynZIjkqSBnzWDsehcI";
const TG_CHAT_FALLBACK = "152173477";

const MAX_ITEMS = 60;
const fmt = n => Math.round(Number(n) || 0).toLocaleString("en-US");

/* ننظّف كل حقل من محارف التحكم ونقصّه لطول معقول */
function clean(v, max) {
  return String(v == null ? "" : v)
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, max);
}

function buildMessage(o) {
  const line = "━━━━━━━━━━━━━━━";
  const phone2 = clean(o.phone2, 20);

  let msg = "🧾 طلب جاهز — متجر امباير\n";
  msg += "رقم الفاتورة: " + clean(o.invoiceNo, 40) + "\n";
  msg += line + "\n";
  msg += "معلومات الزبون:\n";
  msg += "الاسم: " + clean(o.name, 80) + "\n";
  msg += "العنوان: " + clean(o.gov, 40) + " — " + clean(o.area, 120) + "\n";
  msg += "نقطة دالة: " + clean(o.mark, 120) + "\n";
  msg += "الهاتف: " + clean(o.phone, 20) + "\n";
  if (phone2) msg += "هاتف ثاني: " + phone2 + "\n";
  msg += line + "\n";
  msg += "المنتجات:\n";

  const items = Array.isArray(o.items) ? o.items.slice(0, MAX_ITEMS) : [];
  items.forEach((it, i) => {
    const qty = Math.max(0, Math.round(Number(it.qty) || 0));
    const price = Math.round(Number(it.price) || 0);
    const color = clean(it.color, 60);
    const note = clean(it.note, 200);
    msg += i + 1 + ". " + clean(it.name, 120);
    if (color) msg += " — " + color;
    if (it.withBox !== null && it.withBox !== undefined) {
      msg += it.withBox ? " (مع علبة وكيبل)" : " (بدون علبة)";
    }
    msg += " × " + qty + " = " + fmt(price * qty) + " د.ع\n";
    if (note) msg += "   📝 ملاحظة: " + note + "\n";
  });

  msg += line + "\n";
  msg += "مجموع المنتجات: " + fmt(o.subtotal) + " د.ع\n";
  const couponCode = clean(o.couponCode, 40);
  if (couponCode) msg += "خصم (" + couponCode + "): − " + fmt(o.discount) + " د.ع\n";
  msg += "أجور التوصيل: " + fmt(o.delivery) + " د.ع\n";
  msg += "المجموع النهائي: " + fmt(o.total) + " د.ع\n";
  msg += "التاريخ: " + clean(o.dateStr, 60);
  return msg;
}

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json; charset=utf-8"
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  let order;
  try {
    order = JSON.parse(event.body || "{}");
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "طلب غير صالح" }) };
  }
  if (!clean(order.name, 80) || !clean(order.phone, 20)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "بيانات الطلب ناقصة" }) };
  }

  const token = process.env.TG_BOT_TOKEN || TG_TOKEN_FALLBACK;
  const chat = process.env.TG_CHAT_ID || TG_CHAT_FALLBACK;

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text: buildMessage(order), disable_web_page_preview: true })
    });
    if (!res.ok) {
      console.error("send-order: تيليجرام رفض الرسالة", (await res.text()).slice(0, 300));
      return { statusCode: 502, headers, body: JSON.stringify({ error: "تعذّر إبلاغ المتجر" }) };
    }
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  } catch (e) {
    console.error("send-order:", e);
    return { statusCode: 502, headers, body: JSON.stringify({ error: "تعذّر إبلاغ المتجر" }) };
  }
};

/* مُصدَّرة للاختبار فقط */
exports._internals = { buildMessage, clean };
