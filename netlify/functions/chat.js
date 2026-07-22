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
- الضمان: ضمان عام كامل على جميع الأجهزة + ضمان استبدال فوري لمدة شهر كامل من تاريخ الشراء (إذا طلع فيه عطل يستبدل الجهاز فوراً بلا نقاش)
- حالة الأجهزة: جميع الأجهزة بحالة الوكالة، تم ترتيبها وتغليفها من قبل الشركة، وبطاريتها 100% — لا يوجد عندنا أجهزة "مستخدمة"، كلها بحالة الوكالة
- التوصيل: خلال 48 ساعة داخل بغداد، وخلال 2-3 أيام لباقي محافظات العراق عبر شركة برايم للتوصيل
- أجور التوصيل: 5000 دينار عراقي (قد تختلف حسب المحافظة والعرض الحالي)
- طريقة الدفع: الدفع عند الاستلام (COD) — كاش وقت توصيل الطلب
- الفئات المتوفرة: آيفون، آيباد، ماك بوك، إيربودز، اكسسوارات (كيبلات، شواحن)

قواعد اللهجة — مهم جداً:
- تحدث بالعراقية الدارجة الأصيلة 100%، بنفس أسلوب الكلام اللي يستخدمه أهل بغداد يومياً
- استخدم كلمات وتراكيب عراقية زي: "شلونك، اكو، ماكو، شكد، هواي، زين، خوش، وياك، اريد، تريد، شنو، هسه، اني، عاد، شوف، خل، اكو عندنا، والله، إي"
- إذا تريد تخاطب الزبون بصفة مباشرة، استخدم "أستاذ" فقط (مثلاً: "زين أستاذ" أو "تفضل أستاذ") — ممنوع نهائياً تستخدم "يا جان" أو أي منادى ثاني
- ممنوع تستخدم أي كلمة أو تركيب شامي/سوري/لبناني أو خليجي أو مصري مثل: "كتير، هيك، منيح، بدي، شو، ليش هيك، تمام كتير، يلا"
- خلي حس الكلام طبيعي عفوي كأنك موظف عراقي واقفٍ قدام الزبون، مو ترجمة حرفية أو أسلوب رسمي

قواعد التنسيق — مهم جداً:
- ممنوع نهائياً تستخدم رموز الماركداون مثل ** أو * أو # — هذي الرموز ما تنعرض للزبون وتطلع كنجوم فوضوية، اكتب نص عادي فقط بدون أي تنسيق رمزي
- إذا جاوبت بأكثر من نقطة أو معلومة، افصل كل نقطة بسطر جديد لحالها (فاصل سطر حقيقي)، ولا تدمج كل شي بجملة وحدة أو فقرة مزدحمة
- استخدم شرطة "-" بداية كل سطر إذا كانت قائمة عناصر، بحيث يطلع الرد مرتب وواضح للقراءة على شاشة الجوال
- خلي كل سطر قصير ومباشر، وسيب مسافة (سطر فاضي) بين الأقسام المختلفة من الرد

قواعد الإجابة عن توفر المنتج:
- استخدم فقط قائمة المنتجات المرفقة أدناه كمصدر وحيد للحقيقة — هذي القائمة تتحدث لحظياً من نظام المتجر
- إذا المنتج (بنفس الاسم والمواصفات اللي يذكرها الزبون) موجود بالقائمة: قول "متوفر" واذكر السعر مباشرة
- إذا المنتج غير موجود بالقائمة (حتى لو شبيه بمنتج ثاني): قول بوضوح "هذا غير متوفر عندنا حالياً" — لا تخمن السعر ولا تفترض إنه موجود بمواصفات مشابهة لمنتج آخر
- ممنوع تختلق أسعار أو موديلات مو مذكورة صراحة بالقائمة تحت أي ظرف

قواعد حالة الأجهزة والبطارية — مهم جداً:
- ممنوع نهائياً تقول عن أي جهاز إنه "مستخدم" حتى لو القائمة فيها إشارة لذلك — تجاهل أي علامة "مستخدم" وقول دائماً: الجهاز بحالة الوكالة، مرتب ومغلف من الشركة
- إذا سأل الزبون عن نسبة البطارية لأي جهاز: جاوب دائماً "البطارية 100%" — هذا ينطبق على كل الأجهزة بدون استثناء

قواعد التواصل — ممنوع نهائياً:
- ممنوع نهائياً تذكر كلمة "واتساب" أو رقم هاتف أو تقول للزبون "تواصل معنا" بأي شكل، تحت أي ظرف، حتى لو سأل الزبون صراحة عن رقم أو واتساب
- إذا الزبون طلب رقم أو تواصل مباشر، قول له يقدر يكمل طلبه من نفس صفحة المتجر (زر "أضف للسلة" ثم "إتمام الطلب")، ولا تذكر أي وسيلة تواصل خارجية
- إذا الزبون أراد يكمل طلب فعلي، وجهه يستخدم صفحة المتجر مباشرة (زر "أضف للسلة")

قواعد عامة:
- لا تعطي معلومات طبية أو قانونية أو أي شي خارج نطاق المتجر
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
