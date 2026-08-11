/* ============================================================
   EMPIRE — تعديل الطلب أو إلغاؤه من قِبل الزبون

   يُسمح بالتعديل بشرطين: الحالة ما زالت "جديد"، وما مرّ أكثر من
   نصف ساعة. بعدها يكون صاحب المتجر باشر التجهيز.

   المسموح تعديله: بيانات التوصيل فقط (الاسم، الهاتف الثاني،
   المحافظة، المنطقة، نقطة الدالة). تغيير المنتجات ما ينفع من هنا
   حتى لا تتغيّر المبالغ من طرف الزبون — يلغي ويطلب من جديد.

   وبكل الحالتين يوصل صاحب المتجر تنبيه بتيليجرام.
   ============================================================ */

const {
  createClient, findOrder, patchOrder, publicView, canEdit,
  deliveryFor, STATUS
} = require("./lib/orders.js");

const JSON_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8"
};

const TG_CHAT_FALLBACK = "152173477";
const fmt = n => Math.round(Number(n) || 0).toLocaleString("en-US");
const clean = (v, max) =>
  String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);

async function notify(text) {
  const token = process.env.TG_BOT_TOKEN;
  if (!token) return;
  const chat = process.env.TG_CHAT_ID || TG_CHAT_FALLBACK;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true })
    });
  } catch (e) {
    console.error("edit-order: تعذّر إبلاغ تيليجرام", e.message);
  }
}

function cancelMessage(order) {
  return "🚫 الزبون ألغى طلبه\n" +
    "━━━━━━━━━━━━━━━\n" +
    `رقم الفاتورة: ${order.invoiceNo || "—"}\n` +
    `الاسم: ${order.name || ""}\n` +
    `المبلغ: ${fmt(order.total)} د.ع\n` +
    "لا تجهّز هذا الطلب.";
}

function editMessage(order, before, after) {
  let m = "⚠️ الزبون عدّل طلبه\n" +
    "━━━━━━━━━━━━━━━\n" +
    `رقم الفاتورة: ${order.invoiceNo || "—"}\n`;
  const labels = { name: "الاسم", phone2: "هاتف ثاني", gov: "المحافظة", area: "المنطقة", mark: "نقطة دالة" };
  Object.keys(labels).forEach(k => {
    if ((before[k] || "") !== (after[k] || "")) {
      m += `${labels[k]}: ${before[k] || "—"}  ←  ${after[k] || "—"}\n`;
    }
  });
  if ((before.delivery || 0) !== (after.delivery || 0)) {
    m += `أجور التوصيل: ${fmt(before.delivery)}  ←  ${fmt(after.delivery)} د.ع\n`;
    m += `المجموع النهائي: ${fmt(after.total)} د.ع\n`;
  }
  m += "━━━━━━━━━━━━━━━\nالتفاصيل المحدّثة أعلاه — اعتمدها بدل الرسالة السابقة.";
  return m;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: JSON_HEADERS, body: "" };
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: JSON_HEADERS, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (e) {
    return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: "طلب غير صالح" }) };
  }

  const { invoiceNo, phone, action } = body;
  if (!invoiceNo || !phone) {
    return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: "اكتب رقم الفاتورة ورقم هاتفك" }) };
  }

  try {
    const client = createClient();
    const found = await findOrder(client, invoiceNo, phone);
    if (found.error) {
      return { statusCode: 404, headers: JSON_HEADERS, body: JSON.stringify({ error: found.error }) };
    }

    const order = found.data;
    if (!canEdit(order)) {
      const why = (order.status || STATUS.NEW) !== STATUS.NEW
        ? `ما عاد ينفع التعديل — طلبك صار "${order.status}". تواصل ويانا بالمعرض`
        : "مرّت أكثر من نصف ساعة على الطلب، فما عاد ينفع التعديل";
      return { statusCode: 409, headers: JSON_HEADERS, body: JSON.stringify({ error: why }) };
    }

    if (action === "cancel") {
      const updated = await patchOrder(client, found.id, {
        status: STATUS.CANCELLED,
        cancelledAt: Date.now()
      });
      await notify(cancelMessage(order));
      return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify({ ok: true, order: publicView({ ...order, ...updated }) }) };
    }

    // تعديل بيانات التوصيل
    const name = clean(body.name, 80);
    const gov = clean(body.gov, 40);
    const area = clean(body.area, 120);
    if (!name || !gov || !area) {
      return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: "الاسم والمحافظة والمنطقة مطلوبة" }) };
    }

    // المحافظة تغيّر أجور التوصيل، فنعيد حساب المجموع من مبالغ الطلب المحفوظة.
    // وإذا الطلب انعمل بكود توصيل مجاني، تبقى الأجور صفر مهما بدّل محافظته.
    const delivery = order.freeDelivery ? 0 : deliveryFor(gov);
    const total = Math.max(0, (order.subtotal || 0) + delivery - (order.discount || 0));

    const changes = {
      name,
      gov,
      area,
      mark: clean(body.mark, 120),
      phone2: clean(body.phone2, 20),
      delivery,
      total,
      editedAt: Date.now()
    };

    await patchOrder(client, found.id, changes);
    const after = { ...order, ...changes };
    await notify(editMessage(order, order, changes));

    return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify({ ok: true, order: publicView(after) }) };
  } catch (e) {
    console.error("edit-order:", e);
    return { statusCode: 500, headers: JSON_HEADERS, body: JSON.stringify({ error: "تعذّر تعديل الطلب، حاول بعد قليل" }) };
  }
};
