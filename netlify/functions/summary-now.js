/* ============================================================
   EMPIRE — فحص الملخص يدوياً

   يرسل نفس ملخص اليوم فوراً بدل انتظار الموعد المجدول، ويعرض
   النص بالمتصفح حتى تشوف النتيجة. للفحص بعد أي تعديل:

     https://www.empir-iq.com/.netlify/functions/summary-now?key=...

   المفتاح هو SUMMARY_SECRET من متغيرات البيئة. بدونه الرد مرفوض،
   حتى لا يقدر أحد يشوف أرقام المتجر أو يزعجك برسائل متكررة.
   ============================================================ */

const { runSummary } = require("./lib/summary-core.js");

const TEXT = { "Content-Type": "text/plain; charset=utf-8" };

exports.handler = async (event) => {
  const secret = process.env.SUMMARY_SECRET;
  const key = ((event && event.queryStringParameters) || {}).key;

  if (!secret) {
    return {
      statusCode: 401,
      headers: TEXT,
      body: "غير مصرّح — ضِف المتغير SUMMARY_SECRET بإعدادات Netlify أولاً"
    };
  }
  if (key !== secret) {
    return { statusCode: 401, headers: TEXT, body: "غير مصرّح — المفتاح غير صحيح" };
  }

  try {
    const message = await runSummary();
    return {
      statusCode: 200,
      headers: TEXT,
      body: "✅ تم إرسال الملخص على تيليجرام.\n\n" + message
    };
  } catch (e) {
    console.error("summary-now:", e);
    return { statusCode: 500, headers: TEXT, body: "تعذّر إرسال الملخص:\n" + e.message };
  }
};
