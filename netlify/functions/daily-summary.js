/* ============================================================
   EMPIRE — الملخص اليومي المجدول

   Netlify يشغّلها حسب الجدولة بملف netlify.toml (١٠ مساءً بتوقيت
   بغداد). الوظائف المجدولة ما تنفتح بالمتصفح — للفحص اليدوي
   استخدم summary-now.js.

   منطق الملخص كله بملف lib/summary-core.js.
   ============================================================ */

const { runSummary } = require("./lib/summary-core.js");

exports.handler = async () => {
  try {
    await runSummary();
    return { statusCode: 200, body: "تم الإرسال" };
  } catch (e) {
    console.error("daily-summary:", e);
    return { statusCode: 500, body: "تعذّر إرسال الملخص: " + e.message };
  }
};
