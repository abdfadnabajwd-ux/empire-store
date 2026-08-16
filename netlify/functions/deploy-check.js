/* ============================================================
   EMPIRE — فحص النشر

   يجيب صفحات الموقع من خادم Netlify نفسه ويشوف أي التعديلات
   وصلتها فعلاً. لأن الوظيفة تشتغل بالخادم لا بالمتصفح، جوابها
   ما يتأثر بذاكرة متصفح صاحب المتجر أبداً — وهذا كل الغرض منها:
   نفرّق بين "النشر واقف" و"متصفحك يعرض نسخة قديمة".

   يُفتح بنفس مفتاح صفحات الفحص الثانية:
     /.netlify/functions/deploy-check?key=SUMMARY_SECRET
   ============================================================ */

const TEXT = { "Content-Type": "text/plain; charset=utf-8" };

/* كل علامة هي أثر نصّي لتعديل معيّن. وجودها بالملف المنشور يعني
   إن ذاك التعديل وصل الموقع. مرتّبة من الأقدم للأحدث حتى يبيّن
   وين بالضبط توقّف النشر لو توقّف. */
const CHECKS = [
  {
    file: "/admin.html",
    marks: [
      ["رفع صورة الإعلان بعرض 1400", "resizeImageToDataUrl(file, 1400, 0.85"],
      ["اختيار الصيغة حسب الشفافية", "function hasTransparency"],
      ["عرض الصيغة بسطر الحالة", "${out.fmt}"]
    ]
  },
  {
    file: "/index.html",
    marks: [
      ["تكبير صورة الإعلان بالكمبيوتر", "min(580px,100%)"]
    ]
  }
];

function siteBase() {
  const u = process.env.URL || process.env.DEPLOY_PRIME_URL || "https://www.empir-iq.com";
  return u.replace(/\/+$/, "");
}

exports.handler = async (event) => {
  const secret = (process.env.SUMMARY_SECRET || "").trim();
  const key = (((event && event.queryStringParameters) || {}).key || "").trim();
  if (!secret || key !== secret) {
    return { statusCode: 401, headers: TEXT, body: "غير مصرّح" };
  }

  const base = siteBase();
  const lines = ["فحص النشر", "━━━━━━━━━━━━━━━", "الموقع: " + base, ""];
  let missing = 0;

  for (const check of CHECKS) {
    lines.push(check.file);
    let res, body = "";
    try {
      /* نضيف طابعاً زمنياً حتى لا تجي نسخة مخزّنة بأي وسيط بالطريق */
      res = await fetch(base + check.file + "?_=" + Date.now(), {
        headers: { "Cache-Control": "no-cache" }
      });
      body = await res.text();
    } catch (e) {
      lines.push("  ❌ تعذّر جلب الملف — " + (e && e.message ? e.message : e), "");
      missing += check.marks.length;
      continue;
    }

    if (!res.ok) {
      lines.push("  ❌ الخادم رجّع HTTP " + res.status, "");
      missing += check.marks.length;
      continue;
    }

    lines.push("  الحجم: " + Math.round(body.length / 1024) + " كيلوبايت");
    const cc = res.headers.get("cache-control");
    if (cc) lines.push("  ترويسة التخزين: " + cc);

    check.marks.forEach(([label, needle]) => {
      const found = body.includes(needle);
      if (!found) missing++;
      lines.push("  " + (found ? "✅" : "❌") + " " + label);
    });
    lines.push("");
  }

  lines.push("━━━━━━━━━━━━━━━");
  lines.push(missing === 0
    ? "كل التعديلات وصلت الموقع.\nإذا بعدك تشوف السطر القديم باللوحة، فالمشكلة بذاكرة متصفحك."
    : `${missing} تعديل ما وصل الموقع — النشر واقف بجهة Netlify، مو بمتصفحك.`);

  return { statusCode: 200, headers: TEXT, body: lines.join("\n") };
};
