/* ============================================================
   EMPIRE — فحص المساعد الذكي

   يفحص كل خطوة بالمسار ويگول وين بالضبط تنكسر:
   المفتاح ← قائمة المنتجات ← Anthropic ← حفظ المحادثة

   يُفتح بالمتصفح بنفس مفتاح صفحة فحص الملخص:
     /.netlify/functions/chat-check?key=SUMMARY_SECRET
   ============================================================ */

const TEXT = { "Content-Type": "text/plain; charset=utf-8" };
const FIREBASE_PROJECT = "empire-store-9c546";

/* آخر ٦ حروف من المفتاح فقط — تكفي لمطابقته بصفحة API Keys بحساب
   Anthropic حتى يتأكد صاحب المتجر إنه داخل الحساب الصحيح، ولا تكفي
   أبداً لاستعمال المفتاح. نفس الشي تسويه لوحة Anthropic نفسها. */
function fingerprint(key) {
  const k = String(key || "");
  return k.length > 6 ? "…" + k.slice(-6) : "…";
}

async function step(label, fn) {
  try {
    const detail = await fn();
    return `✅ ${label}${detail ? " — " + detail : ""}`;
  } catch (e) {
    return `❌ ${label} — ${e && e.message ? e.message : e}`;
  }
}

exports.handler = async (event) => {
  const secret = (process.env.SUMMARY_SECRET || "").trim();
  const key = (((event && event.queryStringParameters) || {}).key || "").trim();
  if (!secret || key !== secret) {
    return { statusCode: 401, headers: TEXT, body: "غير مصرّح" };
  }

  const lines = ["فحص المساعد الذكي", "━━━━━━━━━━━━━━━"];

  const apiKey = process.env.ANTHROPIC_API_KEY;
  lines.push(apiKey
    ? `✅ مفتاح Anthropic موجود (${apiKey.length} حرف) — بصمته ${fingerprint(apiKey)}`
    : "❌ مفتاح Anthropic غير مضبوط — ضِف ANTHROPIC_API_KEY بإعدادات Netlify");

  lines.push(await step("قائمة المنتجات", async () => {
    const res = await fetch(
      `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents/products?pageSize=5`
    );
    if (!res.ok) throw new Error("HTTP " + res.status);
    const d = await res.json();
    return `${(d.documents || []).length} منتج`;
  }));

  if (apiKey) {
    lines.push(await step("رد Anthropic", async () => {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5",
          max_tokens: 20,
          messages: [{ role: "user", content: "قول: تمام" }]
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const m = (data.error && data.error.message) || "HTTP " + res.status;
        throw new Error(m.slice(0, 220));
      }
      const reply = (data.content || []).map(b => b.text || "").join("").trim();
      return `"${reply.slice(0, 40)}"`;
    }));
  }

  lines.push(await step("تحميل ملف Firestore", async () => {
    const m = require("./lib/firestore.js");
    if (typeof m.createClient !== "function") throw new Error("createClient مفقودة");
    return "سليم";
  }));

  lines.push(await step("حفظ محادثة تجريبية", async () => {
    const { createClient, FS_BASE } = require("./lib/firestore.js");
    const res = await createClient().fsFetch(
      `${FS_BASE}/chats/_selftest?updateMask.fieldPaths=firstQuestion&updateMask.fieldPaths=updatedAt`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fields: {
            firstQuestion: { stringValue: "(فحص ذاتي — تكدر تحذفها)" },
            updatedAt: { integerValue: String(Date.now()) }
          }
        })
      }
    );
    if (!res.ok) throw new Error("HTTP " + res.status + " — " + (await res.text()).slice(0, 200));
    return "انكتبت";
  }));

  lines.push("━━━━━━━━━━━━━━━");
  lines.push("أي سطر عليه ❌ هو سبب تعطّل المساعد.");

  return { statusCode: 200, headers: TEXT, body: lines.join("\n") };
};
