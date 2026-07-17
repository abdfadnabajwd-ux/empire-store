/* ============================================================
   EMPIRE — وظيفة الدردشة الذكية (Netlify Function)
   هذا الملف يشتغل على السيرفر فقط، والمفتاح السري لا يظهر أبداً
   للزبون أو لأي شخص يفتح كود الموقع.
   ============================================================ */

const FIREBASE_PROJECT = "empire-store-9c546";

/* معلومات ثابتة عن امباير — تُغذّى للذكاء الاصطناعي مع كل محادثة */
const STORE_KNOWLEDGE = `
أنت "مساعد امباير" — موظف خدمة زبائن ذكي يشتغل بمتجر EMPIRE لبيع منتجات Apple الأصلية ببغداد، العراق.

معلومات المتجر:
- الاسم: EMPIRE (امباير)
- العنوان: بغداد — الأعظمية، مقابل مطعم قاسم أبو الگص
- الهاتف/واتساب: +964 780 009 4094
- الضمان: ضمان الوكالة الرسمي + ضمان Empire الذهبي على جميع الأجهزة الجديدة
- التوصيل: خلال 48 ساعة داخل بغداد، وخلال 2-3 أيام لباقي محافظات العراق عبر شركة برايم للتوصيل
- أجور التوصيل: 5000 دينار عراقي (قد تختلف حسب المحافظة والعرض الحالي)
- طريقة الدفع: الدفع عند الاستلام (COD) — كاش وقت توصيل الطلب
- الفئات المتوفرة: آيفون، آيباد، ماك بوك، إيربودز، اكسسوارات (كيبلات، شواحن)

أسلوبك:
- تحدث دائماً بالعراقية الدارجة (اللهجة العراقية)، بشكل ودود ومحترم وقصير
- إذا الزبون سأل عن منتج أو سعر، استخدم قائمة المنتجات الحالية المرفقة أدناه فقط — لا تخترع أسعار أو منتجات غير موجودة
- إذا ما لكيت المنتج بالقائمة، اعتذر بأدب واقترح يتواصل واتساب مباشرة
- لا تعطي معلومات طبية أو قانونية أو أي شي خارج نطاق المتجر
- إذا الزبون أراد يكمل طلب فعلي، وجهه يستخدم صفحة المتجر مباشرة (زر "أضف للسلة") أو يتواصل واتساب
- خلي ردودك مختصرة (2-4 جمل) إلا إذا الزبون طلب تفاصيل أكثر
`;

async function fetchLiveProducts() {
  try {
    const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents/products?pageSize=100`;
    const res = await fetch(url);
    if (!res.ok) return "";
    const data = await res.json();
    if (!data.documents) return "";
    const lines = data.documents.map(doc => {
      const f = doc.fields || {};
      const name = f.name?.stringValue || "";
      const price = f.price?.stringValue || "";
      const cat = f.cat?.stringValue || "";
      const used = f.used?.booleanValue ? " (مستخدم)" : "";
      return `- ${name}${used} | الفئة: ${cat} | السعر: ${price} د.ع`;
    });
    return lines.join("\n");
  } catch (e) {
    return "";
  }
}

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "المفتاح غير مهيأ بعد" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "طلب غير صالح" }) };
  }

  const messages = Array.isArray(body.messages) ? body.messages.slice(-14) : [];
  if (!messages.length) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "لا توجد رسائل" }) };
  }

  const productList = await fetchLiveProducts();
  const systemPrompt = STORE_KNOWLEDGE +
    (productList
      ? `\n\nقائمة المنتجات المتوفرة حالياً (استخدمها للرد على أسئلة الأسعار):\n${productList}`
      : "\n\n(تعذّر تحميل قائمة المنتجات الحية، اعتذر واقترح التواصل واتساب لأي سؤال عن سعر محدد)");

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 500,
        system: systemPrompt,
        messages: messages
      })
    });

    const data = await resp.json();
    if (!resp.ok) {
      return { statusCode: resp.status, headers, body: JSON.stringify({ error: data.error?.message || "صار خطأ" }) };
    }

    const reply = (data.content || []).map(b => b.text || "").join("").trim();
    return { statusCode: 200, headers, body: JSON.stringify({ reply }) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "تعذّر الاتصال بالخادم" }) };
  }
};
