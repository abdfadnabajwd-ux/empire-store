/* ============================================================
   EMPIRE — عمليات الطلبات المشتركة بين الوظائف

   الطلبات محمية بقواعد Firestore (قراءتها وتعديلها يحتاجان صلاحية)،
   فكل شي هنا يمر بحساب البوت. الزبون يتعرّف على طلبه برقم الفاتورة
   + رقم هاتفه سوية، فما يقدر يشوف طلبات غيره.
   ============================================================ */

const { FS_BASE, FS_DOC_ROOT, docFields, createClient } = require("./firestore.js");

const STATUS = {
  NEW: "جديد",
  PREPARING: "قيد التجهيز",
  SHIPPING: "بالتوصيل",
  DELIVERED: "تم التسليم",
  CANCELLED: "ملغى"
};
const ALL_STATUSES = Object.values(STATUS);

/* نافذة التعديل: بعدها يقفل التعديل حتى لو الحالة ما زالت "جديد" */
const EDIT_WINDOW_MS = 30 * 60 * 1000;

const DELIVERY_BAGHDAD = 4000;
const DELIVERY_OTHER = 5000;
const deliveryFor = gov => (String(gov || "").trim() === "بغداد" ? DELIVERY_BAGHDAD : DELIVERY_OTHER);

/* الأرقام العراقية تنكتب بصيغ مختلفة (٠٧٧ / +964 / مسافات)،
   فنوحّدها قبل المقارنة حتى ما نرفض صاحب الطلب الحقيقي */
function normPhone(p) {
  let d = String(p || "").replace(/[^\d]/g, "");
  if (d.startsWith("00964")) d = d.slice(5);
  else if (d.startsWith("964")) d = d.slice(3);
  if (d.startsWith("0")) d = d.slice(1);
  return d;
}

function toFsValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isSafeInteger(v)
    ? { integerValue: String(v) }
    : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFsValue) } };
  if (typeof v === "object") {
    const fields = {};
    Object.entries(v).forEach(([k, x]) => { fields[k] = toFsValue(x); });
    return { mapValue: { fields } };
  }
  return { stringValue: String(v) };
}
const toFsFields = obj => {
  const fields = {};
  Object.entries(obj).forEach(([k, v]) => { fields[k] = toFsValue(v); });
  return fields;
};

/* يلقى الطلب برقم الفاتورة، ويتأكد أن الهاتف يطابق صاحبه */
async function findOrder(client, invoiceNo, phone) {
  const inv = String(invoiceNo || "").trim().toUpperCase();
  if (!inv) return { error: "اكتب رقم الفاتورة" };

  const res = await client.fsFetch(`${FS_BASE}:runQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: "orders" }],
        where: {
          fieldFilter: { field: { fieldPath: "invoiceNo" }, op: "EQUAL", value: { stringValue: inv } }
        },
        limit: 1
      }
    })
  });
  if (!res.ok) return { error: "تعذّر الوصول للطلبات، حاول بعد قليل" };

  const rows = await res.json();
  const row = (Array.isArray(rows) ? rows : []).find(r => r.document);
  // نفس الرسالة للطلب غير الموجود وللهاتف الخاطئ، حتى ما يُستخدم
  // البحث لمعرفة أي أرقام فواتير موجودة
  const notFound = { error: "ما لكينا طلب بهذا الرقم وهذا الهاتف" };
  if (!row) return notFound;

  const data = docFields(row.document);
  if (normPhone(data.phone) !== normPhone(phone)) return notFound;

  return { id: row.document.name.split("/").pop(), data };
}

async function patchOrder(client, id, changes) {
  const paths = Object.keys(changes);
  const url = `${FS_BASE}/orders/${id}?` +
    paths.map(p => `updateMask.fieldPaths=${encodeURIComponent(p)}`).join("&");
  const res = await client.fsFetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields: toFsFields(changes) })
  });
  if (!res.ok) throw new Error("تعذّر تحديث الطلب (HTTP " + res.status + ")");
  return docFields(await res.json());
}

async function createOrder(client, order) {
  const res = await client.fsFetch(`${FS_BASE}/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields: toFsFields(order) })
  });
  if (!res.ok) throw new Error("تعذّر حفظ الطلب (HTTP " + res.status + ")");
  const doc = await res.json();
  return doc.name.split("/").pop();
}

/* ما يظهر للزبون — بدون أي حقل داخلي */
function publicView(data) {
  return {
    invoiceNo: data.invoiceNo || "",
    status: data.status || STATUS.NEW,
    dateStr: data.dateStr || "",
    createdAt: data.createdAt || 0,
    name: data.name || "",
    gov: data.gov || "",
    area: data.area || "",
    mark: data.mark || "",
    phone2: data.phone2 || "",
    items: Array.isArray(data.items) ? data.items : [],
    subtotal: data.subtotal || 0,
    discount: data.discount || 0,
    couponCode: data.couponCode || null,
    delivery: data.delivery || 0,
    total: data.total || 0,
    editable: canEdit(data)
  };
}

function canEdit(data) {
  const status = data.status || STATUS.NEW;
  if (status !== STATUS.NEW) return false;
  return Date.now() - (data.createdAt || 0) <= EDIT_WINDOW_MS;
}

module.exports = {
  STATUS, ALL_STATUSES, EDIT_WINDOW_MS,
  DELIVERY_BAGHDAD, DELIVERY_OTHER, deliveryFor,
  normPhone, toFsFields, findOrder, patchOrder, createOrder, publicView, canEdit,
  createClient, FS_BASE, FS_DOC_ROOT
};
