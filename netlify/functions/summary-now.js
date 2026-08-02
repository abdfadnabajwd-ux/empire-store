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

/* تشخيص: أي متغير وصل للوظيفة وأي واحد ناقص — بأسمائها فقط
   بدون أي قيمة، حتى ما تنكشف كلمة المرور ولا التوكن */
function envReport() {
  const names = ["SUMMARY_SECRET", "FB_ADMIN_EMAIL", "FB_ADMIN_PASSWORD", "TG_BOT_TOKEN", "TG_CHAT_ID"];
  return names
    .map(n => `${(process.env[n] || "").trim() ? "✅ واصل" : "❌ ناقص"}  ${n}`)
    .join("\n");
}

exports.handler = async (event) => {
  // المسافات الزائدة سهلة الوقوع عند اللصق، فنتجاهلها بالطرفين
  const secret = (process.env.SUMMARY_SECRET || "").trim();
  const key = (((event && event.queryStringParameters) || {}).key || "").trim();

  if (!secret) {
    return {
      statusCode: 401,
      headers: TEXT,
      body:
        "المتغير SUMMARY_SECRET ما وصل للوظيفة.\n\n" +
        "حالة المتغيرات:\n" + envReport() + "\n\n" +
        "تأكد من كتابة الاسم بالضبط بحروف كبيرة وبدون مسافات، وأن له قيمة،\n" +
        "ثم اعمل Deploy جديد (المتغيرات ما تسري إلا بعد نشر جديد).\n" +
        "ملاحظة: TG_BOT_TOKEN و TG_CHAT_ID اختياريان ووجودهما ناقصاً طبيعي."
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
