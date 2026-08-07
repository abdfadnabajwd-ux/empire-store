/* ============================================================
   EMPIRE — متابعة الطلب

   الزبون يدخل رقم الفاتورة + رقم هاتفه فيشوف طلبه وحالته. لازم
   يعرف الاثنين سوية، فما يقدر يتطفّل على طلبات غيره.

   الطلبات محمية بقواعد Firestore، فالقراءة تمر بحساب البوت هنا
   بدل ما تنفتح للعموم.
   ============================================================ */

const { createClient, findOrder, publicView } = require("./lib/orders.js");

const JSON_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8"
};

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

  const invoiceNo = String(body.invoiceNo || "").trim();
  const phone = String(body.phone || "").trim();
  if (!invoiceNo || !phone) {
    return {
      statusCode: 400,
      headers: JSON_HEADERS,
      body: JSON.stringify({ error: "اكتب رقم الفاتورة ورقم هاتفك" })
    };
  }

  try {
    const found = await findOrder(createClient(), invoiceNo, phone);
    if (found.error) {
      return { statusCode: 404, headers: JSON_HEADERS, body: JSON.stringify({ error: found.error }) };
    }
    return {
      statusCode: 200,
      headers: JSON_HEADERS,
      body: JSON.stringify({ ok: true, order: publicView(found.data) })
    };
  } catch (e) {
    console.error("track-order:", e);
    return {
      statusCode: 500,
      headers: JSON_HEADERS,
      body: JSON.stringify({ error: "تعذّر الوصول للطلب، حاول بعد قليل" })
    };
  }
};
