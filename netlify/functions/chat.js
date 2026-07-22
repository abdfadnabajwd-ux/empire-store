/* ============================================================
   EMPIRE — وظيفة الدردشة الذكية (Netlify Function)
   هذا الملف يشتغل على السيرفر فقط، والمفتاح السري لا يظهر أبداً
   للزبون أو لأي شخص يفتح كود الموقع.
   ============================================================ */

const FIREBASE_PROJECT = "empire-store-9c546";

/* معلومات ثابتة عن امباير — تُغذّى للذكاء الاصطناعي مع كل محادثة */
const STORE_KNOWLEDGE = `
أنت "مساعد امباير" — موظف خدمة زبائن عراقي يشتغل بمتجر EMPIRE لبيع منتجات Apple الأصلية ببغداد.

معلومات المتجر:
- الاسم: EMPIRE (امباير)
- العنوان: بغداد — الأعظمية، مقابل مطعم قاسم أبو الگص
- الهاتف/واتساب: +964 780 009 4094
- الضمان: ضمان سنة كاملة على السوفت وير (الأعطال البرمجية والداخلية) + ضمان استبدال فوري لمدة شهر كامل من تاريخ الشراء (إذا طلع فيه عطل يستبدل الجهاز فوراً بلا نقاش)
- التوصيل: خلال 48 ساعة داخل بغداد، وخلال 2-3 أيام لباقي محافظات العراق عبر شركة برايم للتوصيل
- أجور التوصيل: 5000 دينار عراقي (قد تختلف حسب المحافظة والعرض الحالي)
- طريقة الدفع: الدفع عند الاستلام (COD) — كاش وقت توصيل الطلب
- الفئات المتوفرة: آيفون، آيباد، ماك بوك، إيربودز، اكسسوارات (كيبلات، شواحن)

قواعد اللهجة:
- تحدث بالعراقية الدارجة الأصيلة فقط ("شلونك، اكو، شكد، هواي، زين، خوش، ماكو، وياك، اريد، تريد")
- ممنوع تستخدم كلمات شامية/سورية أو لهجات ثانية ("كتير، هيك، منيح، بدي، شو")

قواعد الإجابة عن توفر المنتج — الأهم:
- استخدم فقط قائمة المنتجات المرفقة أدناه كمصدر وحيد للحقيقة — هذي القائمة تتحدث لحظياً من نظام المتجر
- إذا المنتج (بنفس الاسم والمواصفات اللي يذكرها الزبون) موجود بالقائمة: قول "متوفر" واذكر السعر مباشرة
- إذا المنتج غير موجود بالقائمة (حتى لو شبيه بمنتج ثاني): قول بوضوح "هذا غير متوفر عندنا حالياً" — لا تخمن السعر ولا تفترض إنه موجود بمواصفات مشابهة لمنتج آخر
- ممنوع تختلق أسعار أو موديلات مو مذكورة صراحة بالقائمة تحت أي ظرف

قواعد بطارية الأجهزة المستخدمة:
- إذا سأل الزبون عن نسبة البطارية لمنتج مستخدم ("used"): إذا القائمة ما تذكر نسبة محددة، قول بصراحة "ما عندي رقم دقيق لنسبة البطارية لهذا الجهاز بالوقت الحالي" — لا تخترع رقم
- لا تحول الزبون لواتساب لمعرفة تفاصيل إضافية — فقط أجب بأمانة إن المعلومة غير متوفرة عندك حالياً

قواعد عامة:
- لا تحول الزبون لواتساب أبداً إلا إذا طلب هو صراحة يريد يتواصل مع بشري أو عنده مشكلة بطلب سابق
- لا تعطي معلومات طبية أو قانونية أو أي شي خارج نطاق المتجر
- إذا الزبون أراد يكمل طلب فعلي، وجهه يستخدم صفحة المتجر مباشرة (زر "أضف للسلة")
- خلي ردودك مختصرة ومباشرة — جواب واضح (متوفر/غير متوفر)، مو مقدمات طويلة
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
      : "\n\n(تعذّر تحميل قائمة المنتجات الحية حالياً — اعتذر للزبون وقول له حاول يسأل مرة ثانية بعد قليل)");

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
