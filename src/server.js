// Intranet Starkum — Cloudflare Worker (archivo único, sin dependencias)
// Bindings: DB (D1), FILES (R2), AI (Workers AI), EMAIL (send_email)
// Variables: ADMIN_EMAIL, MAIL_FROM, AI_MODEL (opcional), ANTHROPIC_API_KEY (secreto, opcional),
//            CLAUDE_MODEL, CLAUDE_MONTHLY_CAP_USD, DEV ("1" solo en pruebas locales)

const SCHEMA = __SCHEMA__;
const APP_HTML = __APP_HTML__;
const APP_VERSION = __APP_VERSION__;

const STORAGE_FREE_BYTES = 10 * 1024 ** 3;
const SESSION_DAYS = 30;
const MAX_UPLOAD = 50 * 1024 * 1024;
const MAX_EMAIL_BYTES = 3.5 * 1024 * 1024; // el correo de Cloudflare acepta 5 MiB por mensaje, adjuntos incluidos
const MAX_EMAIL_FILES = 30;
const MIGRATIONS = [
  "ALTER TABLE invoices ADD COLUMN supplier_phone TEXT", "ALTER TABLE invoices ADD COLUMN supplier_email TEXT", "ALTER TABLE invoices ADD COLUMN supplier_website TEXT",
  "ALTER TABLE suppliers ADD COLUMN address TEXT", "ALTER TABLE suppliers ADD COLUMN tax_id TEXT",
  ...["status", "status_by", "amazon_policy", "amazon_note", "location", "risk", "risk_note", "priority", "decision", "director_note", "draft_text", "draft_condition", "draft_channel", "source", "source_updated"].map((c) => `ALTER TABLE suppliers ADD COLUMN ${c} TEXT`),
  "ALTER TABLE suppliers ADD COLUMN contact_order INTEGER",
  "ALTER TABLE cards ADD COLUMN card_type TEXT NOT NULL DEFAULT 'credito'",
  "ALTER TABLE invoices ADD COLUMN card_id TEXT", "ALTER TABLE invoices ADD COLUMN card_last4 TEXT", "ALTER TABLE invoices ADD COLUMN lot_id TEXT",
];
const LOGO_URL = "https://starkumholdings.com/wp-content/uploads/2026/08/starkum-holdings-logo.png";
const FOLDERS = ["Legales", "Fiscales", "Bancarios", "Licencias y permisos", "Contratos", "Impuestos por año"];

// ---------- utilidades ----------
const now = () => new Date().toISOString();
const uid = () => crypto.randomUUID();
const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-app-version": APP_VERSION, ...headers } });
const fail = (msg, status = 400) => json({ error: msg }, status);
async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function randomHex(bytes) {
  const a = new Uint8Array(bytes); crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const normEmail = (e) => String(e || "").trim().toLowerCase();
const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const num = (v) => { if (v === null || v === undefined || v === "") return null; const n = Number(String(v).replace(/[^0-9.\-]/g, "")); return Number.isFinite(n) ? n : null; };
const isoDate = (v) => { if (!v) return null; const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[1]}-${m[2]}-${m[3]}` : null; };
function cookie(req, name) {
  const c = req.headers.get("cookie") || "";
  const m = c.match(new RegExp("(?:^|; )" + name + "=([^;]+)"));
  return m ? decodeURIComponent(m[1]) : null;
}
function b64(bytes) {
  let s = ""; const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  return btoa(s);
}

// ---------- base de datos ----------
let schemaReady = false;
async function ensureSchema(env) {
  if (schemaReady) return;
  const stmts = SCHEMA.split(";").map((s) => s.trim()).filter(Boolean).map((s) => env.DB.prepare(s));
  await env.DB.batch(stmts);
  for (const m of MIGRATIONS) { try { await env.DB.prepare(m).run(); } catch { /* la columna ya existe */ } }
  const seeded = await env.DB.prepare("SELECT value FROM settings WHERE key='seeded'").first();
  if (!seeded) await seed(env);
  const admin = normEmail(env.ADMIN_EMAIL);
  if (admin) {
    await env.DB.prepare("INSERT OR IGNORE INTO users (email, name, role, active, created_at) VALUES (?, ?, 'admin', 1, ?)").bind(admin, "Administrador", now()).run();
    await env.DB.prepare("INSERT OR IGNORE INTO recipients (email, label, created_at) VALUES (?, 'Correo principal', ?)").bind(admin, now()).run();
  }
  await backfillSuppliers(env);
  schemaReady = true;
}
async function seed(env) {
  const t = now();
  const q = [];
  q.push(env.DB.prepare("INSERT OR IGNORE INTO entities (id, name, country, details) VALUES (?,?,?,?)").bind("llc", "Starkum Holdings LLC", "EE. UU.", JSON.stringify({ Estado: "Illinois", Tributación: "Disregarded entity · Schedule C", EIN: "" })));
  q.push(env.DB.prepare("INSERT OR IGNORE INTO entities (id, name, country, details) VALUES (?,?,?,?)").bind("sas", "Starkum Group SAS", "Colombia", JSON.stringify({ Registro: "Cámara de Comercio de Bogotá", NIT: "" })));
  const biz = [
    ["amazon", "Amazon", "llc", "reventa", "activo", "Wholesale + FBA · arbitraje", 1],
    ["dropshipping", "Dropshipping", null, "tienda", "pausa", "Tienda Shopify", 2],
  ];
  for (const b of biz) q.push(env.DB.prepare("INSERT OR IGNORE INTO businesses (id, name, entity_id, kind, status, description, sort, created_at) VALUES (?,?,?,?,?,?,?,?)").bind(...b, t));
  const plats = [
    ["amazon-us", "Amazon US", "EE. UU.", "amazon", "por_conectar"], ["shopify", "Shopify", "Tienda propia", "dropshipping", "por_conectar"],
    ["walmart", "Walmart", "EE. UU.", null, "sin_cuenta"], ["ebay", "eBay", "EE. UU.", null, "sin_cuenta"],
    ["etsy", "Etsy", "Global", null, "sin_cuenta"], ["tiktok-shop", "TikTok Shop", "EE. UU.", null, "sin_cuenta"],
    ["mercadolibre", "Mercado Libre", "Latinoamérica", null, "sin_cuenta"], ["woocommerce", "WooCommerce", "Tienda propia", null, "sin_cuenta"],
  ];
  plats.forEach((p, i) => q.push(env.DB.prepare("INSERT OR IGNORE INTO platforms (id, name, region, business_id, status, sort) VALUES (?,?,?,?,?,?)").bind(...p, i)));
  q.push(env.DB.prepare("INSERT OR IGNORE INTO suppliers (id, business_id, name, kind, notes, created_at) VALUES (?,?,?,?,?,?)").bind("tiendas-fisicas", "amazon", "Tiendas físicas (arbitraje)", "Arbitraje", "Recibos de compras en tiendas", t));
  q.push(env.DB.prepare("INSERT OR IGNORE INTO deadlines (id, title, entity_id, due_on, notes, created_at) VALUES (?,?,?,?,?,?)").bind(uid(), "Impuesto estimado IRS (4.º trimestre)", "llc", "2027-01-15", "Confirmar monto con el contador", t));
  q.push(env.DB.prepare("INSERT OR IGNORE INTO deadlines (id, title, entity_id, due_on, notes, created_at) VALUES (?,?,?,?,?,?)").bind(uid(), "Renovación matrícula mercantil", "sas", "2027-03-31", "Cámara de Comercio de Bogotá", t));
  q.push(env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('seeded', ?)").bind(t));
  await env.DB.batch(q);
}

// ---------- roles ----------
// admin: todo · standard: ver, subir facturas y documentos, revisar lo que sube, enviar a correos autorizados · viewer: ver y descargar
const ROLES = ["admin", "standard", "viewer"];
const normRole = (r) => (r === "member" ? "standard" : ROLES.includes(r) ? r : "standard");
const STANDARD_WRITES = [
  ["POST", /^\/invoices$/], ["POST", /^\/invoices\/[\w-]+\/extract$/], ["PUT", /^\/invoices\/[\w-]+$/],
  ["POST", /^\/docs$/], ["POST", /^\/docs\/[\w-]+\/extract$/], ["POST", /^\/tax\/periods\/[\w-]+\/file$/], ["POST", /^\/records$/], ["POST", /^\/send$/], ["POST", /^\/scan\/logs$/], ["POST", /^\/lots$/], ["POST", /^\/moves$/],
];
function permissionError(role, method, path) {
  if (method === "GET" || path === "/auth/logout" || role === "admin") return null;
  if (role === "viewer") return "Tu acceso es de solo consulta: puedes ver y descargar, pero no subir ni cambiar nada.";
  if (STANDARD_WRITES.some(([mm, re]) => mm === method && re.test(path))) return null;
  return "Solo el administrador puede editar o eliminar registros. Tu rol permite subir facturas y documentos.";
}

// ---------- sesión ----------
async function currentUser(req, env) {
  const token = cookie(req, "sid");
  if (!token) return null;
  const h = await sha256(token);
  const row = await env.DB.prepare("SELECT s.email, s.expires_at, u.name, u.role FROM sessions s JOIN users u ON u.email = s.email WHERE s.token_hash = ? AND u.active = 1").bind(h).first();
  if (!row || row.expires_at < Date.now()) return null;
  return { email: row.email, name: row.name, role: normRole(row.role) };
}
function sessionCookie(token, maxAge) {
  return `sid=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

// ---------- correo ----------
async function sendMail(env, msg) {
  const from = env.MAIL_FROM || "intranet@velknoxiq.com";
  if (env.DEV === "1" || !env.EMAIL) {
    await env.DB.prepare("INSERT INTO dev_outbox (id, to_email, subject, raw, created_at) VALUES (?,?,?,?,?)").bind(uid(), msg.to, msg.subject, msg.devNote || "", now()).run();
    console.log(`[correo de prueba] para ${msg.to}: ${msg.subject} ${msg.devNote || ""}`);
    return;
  }
  await env.EMAIL.send({
    to: msg.to, from, subject: msg.subject, text: msg.text, html: msg.html,
    attachments: (msg.attachments || []).map((a) => ({ content: a.bytes, filename: a.filename, type: a.mime || "application/octet-stream", disposition: "attachment" })),
  });
}

// ---------- archivos ----------
async function storeFile(env, user, file, originalSize) {
  if (!file || typeof file.arrayBuffer !== "function") throw new Error("Falta el archivo.");
  if (file.size > MAX_UPLOAD) throw new Error("El archivo supera 50 MB.");
  const id = uid();
  const key = `files/${id}`;
  const mime = file.type || "application/octet-stream";
  await env.FILES.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: mime } });
  await env.DB.prepare("INSERT INTO files (id, r2_key, filename, mime, size, original_size, uploaded_by, uploaded_at) VALUES (?,?,?,?,?,?,?,?)")
    .bind(id, key, file.name || "archivo", mime, file.size, num(originalSize) || file.size, user.email, now()).run();
  return id;
}
async function serveFile(env, id, download) {
  const f = await env.DB.prepare("SELECT * FROM files WHERE id = ?").bind(id).first();
  if (!f) return fail("Archivo no encontrado.", 404);
  const obj = await env.FILES.get(f.r2_key);
  if (!obj) return fail("Archivo no encontrado en el almacenamiento.", 404);
  const name = encodeURIComponent(f.filename);
  return new Response(obj.body, { headers: {
    "content-type": f.mime, "cache-control": "private, max-age=300",
    "content-disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${name}`,
    "x-content-type-options": "nosniff",
  } });
}

// ---------- lectura de facturas con IA ----------
const EXTRACT_PROMPT = `Eres un lector de facturas y recibos. Extrae los datos del documento y responde SOLO con un objeto JSON válido, sin texto adicional, con esta forma exacta:
{"supplier":{"name":"","address":"","phone":"","email":"","website":"","tax_id":""},"buyer":{"name":"","address":""},"invoice_number":"","po_number":"","issue_date":"AAAA-MM-DD","due_date":"AAAA-MM-DD","currency":"USD","subtotal":0,"tax":0,"shipping":0,"discount":0,"total":0,"payment_method":"","payment_card_last4":"","payment_status":"pagada|pendiente|desconocido","items":[{"description":"","sku":"","upc":"","qty":0,"unit_cost":0,"line_total":0}],"confidence":{"invoice_number":0.0,"issue_date":0.0,"total":0.0,"supplier":0.0,"items":0.0}}
"payment_card_last4" son SOLO los últimos 4 dígitos de la tarjeta con que se pagó si el recibo los muestra (por ejemplo "XXXX1002" o "Visa ending in 1002" → "1002"); nunca escribas el número completo.
Reglas: usa "" o null cuando un dato no aparezca; nunca inventes datos; fechas en formato AAAA-MM-DD; montos como números sin símbolos; confidence entre 0 y 1 según qué tan legible estaba cada dato.`;

function parseModelJson(text) {
  if (!text) return null;
  if (typeof text === "object") return text;
  const start = text.indexOf("{"); const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(text.slice(start, end + 1)); } catch { return null; }
}
async function extractWorkersAI(env, { image, text }) {
  if (!env.AI && env.DEV === "1") return { supplier: { name: "Midwest Wholesale Supply (PRUEBA)", address: "100 Demo St, Chicago, IL", phone: "(312) 555-0100", email: "ventas@midwest-demo.com", website: "midwest-demo.com", tax_id: "" }, buyer: { name: "Starkum Holdings LLC", address: "La Grange, IL" }, invoice_number: "INV-1042", po_number: "PO-221", issue_date: "2026-10-20", due_date: "2026-11-19", currency: "USD", subtotal: 480, tax: 12.5, shipping: 25, discount: 0, total: 517.5, payment_method: "VISA XXXX1002", payment_card_last4: "1002", payment_status: "pendiente", items: [{ description: "Producto de prueba A", upc: "012345678905", qty: 24, unit_cost: 15 }, { description: "Producto de prueba B", upc: "", qty: 12, unit_cost: 10 }], confidence: { invoice_number: 0.95, issue_date: 0.9, total: 0.92, supplier: 0.85, items: 0.6 } };
  if (!env.AI) throw new Error("La lectura automática no está activada.");
  const model = env.AI_MODEL || "@cf/meta/llama-4-scout-17b-16e-instruct";
  const content = [{ type: "text", text: EXTRACT_PROMPT + (text ? "\n\nTexto del documento:\n" + text.slice(0, 12000) : "") }];
  if (image) content.push({ type: "image_url", image_url: { url: image } });
  const out = await env.AI.run(model, { messages: [{ role: "user", content }], max_tokens: 1500, temperature: 0 });
  return parseModelJson(out?.response ?? out?.result?.response ?? out);
}
async function claudeSpend(env, add = 0) {
  const month = new Date().toISOString().slice(0, 7);
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'claude_spend'").first();
  let s = row ? JSON.parse(row.value) : { month, usd: 0 };
  if (s.month !== month) s = { month, usd: 0 };
  if (add) { s.usd += add; await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('claude_spend', ?)").bind(JSON.stringify(s)).run(); }
  return s;
}
async function extractClaude(env, { image, text }) {
  if (!env.ANTHROPIC_API_KEY) throw new Error("La relectura con Claude no está configurada.");
  const cap = Number(env.CLAUDE_MONTHLY_CAP_USD || 2);
  const spend = await claudeSpend(env);
  if (spend.usd >= cap) throw new Error(`Se alcanzó el tope mensual de relecturas con Claude ($${cap}).`);
  const content = [];
  if (image) {
    const m = image.match(/^data:(image\/[a-z]+);base64,(.+)$/);
    if (m) content.push({ type: "image", source: { type: "base64", media_type: m[1], data: m[2] } });
  }
  content.push({ type: "text", text: EXTRACT_PROMPT + (text ? "\n\nTexto del documento:\n" + text.slice(0, 20000) : "") });
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: env.CLAUDE_MODEL || "claude-haiku-5-5", max_tokens: 1500, messages: [{ role: "user", content }] }),
  });
  if (!res.ok) throw new Error("Claude no pudo leer la factura (" + res.status + ").");
  const data = await res.json();
  const rateIn = Number(env.CLAUDE_RATE_IN || 1), rateOut = Number(env.CLAUDE_RATE_OUT || 5);
  const cost = ((data.usage?.input_tokens || 0) * rateIn + (data.usage?.output_tokens || 0) * rateOut) / 1e6;
  await claudeSpend(env, cost);
  return parseModelJson(data.content?.map((c) => c.text || "").join(""));
}
function last4Of(field, method) {
  const d = String(field || "").replace(/\D/g, "");
  if (d.length >= 4) return d.slice(-4);
  const m = String(method || "").match(/(?:ending(?: in)?|terminad[ao] en|x{2,}|\*{2,}|•{2,}|#)\s*(\d{4})\b/i);
  return m ? m[1] : "";
}
function cleanExtraction(x) {
  if (!x || typeof x !== "object") return null;
  const s = x.supplier || {}, b = x.buyer || {};
  return {
    supplier_name: s.name || "", supplier_address: s.address || "", supplier_tax_id: s.tax_id || "",
    supplier_email: s.email || "", supplier_phone: s.phone || "", supplier_website: s.website || "",
    buyer_name: b.name || "", buyer_address: b.address || "",
    invoice_number: x.invoice_number || "", po_number: x.po_number || "",
    issue_date: isoDate(x.issue_date), due_date: isoDate(x.due_date), currency: (x.currency || "USD").toUpperCase().slice(0, 3),
    subtotal: num(x.subtotal), tax: num(x.tax), shipping: num(x.shipping), discount: num(x.discount), total: num(x.total),
    payment_method: String(x.payment_method || "").replace(/\d{8,}/g, (d) => "•••• " + d.slice(-4)), payment_last4: last4Of(x.payment_card_last4, x.payment_method), payment_status: ["pagada", "pendiente"].includes(x.payment_status) ? x.payment_status : "pendiente",
    items: Array.isArray(x.items) ? x.items.slice(0, 200).map((i) => ({ description: i.description || "", sku: i.sku || "", upc: i.upc || "", qty: num(i.qty), unit_cost: num(i.unit_cost), line_total: num(i.line_total) })) : [],
    confidence: x.confidence && typeof x.confidence === "object" ? x.confidence : {},
  };
}
async function invoiceChecks(env, inv) {
  const checks = [];
  if (inv.invoice_number) {
    const dup = await env.DB.prepare("SELECT id FROM invoices WHERE invoice_number = ? AND COALESCE(supplier_id,'') = COALESCE(?, '') AND id != ? LIMIT 1")
      .bind(inv.invoice_number, inv.supplier_id || null, inv.id || "").first();
    checks.push(dup ? { level: "mal", text: `Posible duplicada: ya existe la factura ${inv.invoice_number} de este proveedor.`, link: dup.id } : { level: "bien", text: `No es duplicada: no hay otra ${inv.invoice_number} de este proveedor.` });
  } else checks.push({ level: "atencion", text: "Falta el número de factura." });
  if (num(inv.tax) > 0) checks.push({ level: "atencion", text: `Te cobraron impuesto de venta (${Number(inv.tax).toFixed(2)}). Con tu certificado de reventa podrías reclamarlo.` });
  if (inv.kind === "recibo") checks.push({ level: "atencion", text: "Amazon no acepta recibos de tienda como prueba de compra: guárdalo para tus cuentas, pero para Amazon necesitas una factura del proveedor." });
  const missing = [];
  if (!inv.supplier_name) missing.push("nombre del proveedor");
  if (!inv.supplier_address) missing.push("dirección del proveedor");
  if (!inv.supplier_phone) missing.push("teléfono del proveedor");
  if (!inv.supplier_website) missing.push("sitio web del proveedor");
  if (!inv.buyer_name) missing.push("nombre del comprador");
  if (!inv.buyer_address) missing.push("dirección del comprador");
  if (!inv.issue_date) missing.push("fecha");
  const items = typeof inv.items === "string" ? JSON.parse(inv.items || "[]") : inv.items || [];
  if (!items.some((i) => num(i.qty) > 0)) missing.push("cantidades por producto");
  if (items.length && !items.some((i) => i.upc || i.sku)) missing.push("identificador de producto (UPC, modelo o ASIN)");
  if (inv.issue_date && Date.now() - Date.parse(inv.issue_date) > 365 * 864e5) missing.push("fecha reciente (tiene más de un año)");
  checks.push(missing.length ? { level: "atencion", text: "Para presentarla a Amazon le falta: " + missing.join(", ") + "." } : { level: "bien", text: "Tiene lo básico que pide Amazon: proveedor, comprador, fecha de menos de un año, productos identificados y cantidades. Verifica que tu nombre y dirección coincidan con Seller Central." });
  return checks;
}

// ---------- proveedores: detectar o crear ----------
const normName = (n) => String(n || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/\(prueba\)/g, "").replace(/[^a-z0-9 ]+/g, " ")
  .replace(/\b(inc|llc|l l c|ltd|co|corp|corporation|company|sas|s a s|sa|de cv|limited|the)\b/g, " ").replace(/\s+/g, " ").trim();
async function findOrCreateSupplier(env, inv, x) {
  const name = (x && x.supplier_name) || inv.supplier_name;
  if (!name || !normName(name)) return null;
  const biz = await env.DB.prepare("SELECT entity_id FROM businesses WHERE id = ?").bind(inv.business_id).first();
  const pool = (await env.DB.prepare("SELECT s.id, s.name FROM suppliers s JOIN businesses sb ON sb.id = s.business_id WHERE s.business_id = ?1 OR (sb.entity_id IS NOT NULL AND sb.entity_id = ?2)").bind(inv.business_id, biz?.entity_id || "__none__").all()).results;
  const target = normName(name);
  const hit = pool.find((p) => normName(p.name) === target) || pool.find((p) => { const n = normName(p.name); return n.length >= 4 && target.length >= 4 && (n.includes(target) || target.includes(n)); });
  const v = (k) => (x && x[k]) || inv[k] || null;
  if (hit) {
    await env.DB.prepare("UPDATE suppliers SET email = COALESCE(NULLIF(email,''), ?), phone = COALESCE(NULLIF(phone,''), ?), website = COALESCE(NULLIF(website,''), ?), address = COALESCE(NULLIF(address,''), ?), tax_id = COALESCE(NULLIF(tax_id,''), ?) WHERE id = ?")
      .bind(v("supplier_email"), v("supplier_phone"), v("supplier_website"), v("supplier_address"), v("supplier_tax_id"), hit.id).run();
    return { id: hit.id, name: hit.name, created: false };
  }
  const id = uid();
  await env.DB.prepare("INSERT INTO suppliers (id, business_id, name, kind, email, phone, website, address, tax_id, platforms, notes, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
    .bind(id, inv.business_id, String(name).trim(), "Otro", v("supplier_email"), v("supplier_phone"), v("supplier_website"), v("supplier_address"), v("supplier_tax_id"), inv.platforms || "[]", "Creado automáticamente desde una factura.", now()).run();
  return { id, name: String(name).trim(), created: true };
}
async function backfillSuppliers(env) {
  const done = await env.DB.prepare("SELECT value FROM settings WHERE key = 'backfill_suppliers_v1'").first();
  if (done) return;
  const rows = (await env.DB.prepare("SELECT * FROM invoices WHERE supplier_id IS NULL AND COALESCE(supplier_name,'') != ''").all()).results;
  for (const inv of rows) {
    const s = await findOrCreateSupplier(env, inv, null);
    if (s) await env.DB.prepare("UPDATE invoices SET supplier_id = ? WHERE id = ?").bind(s.id, inv.id).run();
  }
  await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('backfill_suppliers_v1', ?)").bind(now()).run();
}

// ---------- lectura de documentos de la empresa ----------
function titleFromFilename(name) {
  let t = String(name || "").replace(/\.[a-z0-9]{2,5}$/i, "").replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
  if (/^(img|image|scan|scanned|doc|document|dsc|photo|foto|whatsapp image)[\s\-]*\d/i.test(t) || /^[\w-]{20,}$/.test(t) && !/\s/.test(t)) return "";
  return t.slice(0, 80);
}
const DOC_PROMPT = `Eres un lector de documentos legales y fiscales de empresas (EE. UU. y Colombia). Lee el documento y responde SOLO con un objeto JSON válido, sin texto adicional, con esta forma:
{"doc_type":"ein|articles|tax_return|operating_agreement|good_standing|annual_report|sales_tax_registration|resale_certificate|tax_notice|rut|camara_comercio|bank|license|contract|other","suggested_title":"","suggested_folder":"Legales|Fiscales|Bancarios|Licencias y permisos|Contratos|Impuestos por año","issued_on":"AAAA-MM-DD","expires_on":"AAAA-MM-DD","company":{"legal_name":"","ein":"","nit":"","state":"","address":"","state_account_id":"","formation_date":"","registered_agent":""},"tax_obligation":null,"tax_return":null}
Si el documento establece una obligación periódica de declarar impuestos (por ejemplo, impuesto de ventas de Illinois Form ST-1 trimestral), llena "tax_obligation" así: {"name":"","agency":"","account_id":"","frequency":"mensual|bimestral|trimestral|cuatrimestral|anual","effective_date":"AAAA-MM-DD","due_day":20,"due_offset_months":1}. due_day es el día del mes de vencimiento y due_offset_months cuántos meses después del fin del período vence.
"suggested_title" es un nombre corto y claro en español para archivar el documento (máximo 60 caracteres), por ejemplo "Carta de asignación del EIN", "Operating Agreement", "Certificado de existencia Cámara de Comercio", "Notificación IDOR – declaración ST-1". Sin la palabra "documento" ni fechas largas.
Si el documento ES una declaración de impuestos ya llenada o presentada, o un comprobante de pago de impuestos (por ejemplo Form ST-1 "Sales and Use Tax and E911 Surcharge Return", IVA formulario 300, retención 350), usa doc_type "tax_return" y llena "tax_return" así: {"form":"ST-1","tax_name":"Impuesto de ventas Illinois (ST-1)","agency":"","account_id":"","period_start":"AAAA-MM-DD","period_end":"AAAA-MM-DD","filed_on":"AAAA-MM-DD","confirmation":"","amount":0,"is_payment":false}. amount es el total a pagar de la declaración (0 si no hay impuesto). En ese caso deja "tax_obligation" en null.
Reglas: usa "" o null cuando un dato no aparezca; nunca inventes datos; copia números (EIN, NIT, cuenta) exactamente como aparecen; fechas en AAAA-MM-DD.`;
async function runDocModel(env, { image, text }) {
  if (!env.AI && env.DEV === "1" && /Sales and Use Tax/i.test(text || "")) return { doc_type: "tax_return", suggested_title: "Declaración ST-1 3.er trimestre 2026", suggested_folder: "Fiscales", issued_on: "2026-10-21", company: {}, tax_obligation: null, tax_return: { form: "ST-1", tax_name: "Impuesto de ventas Illinois (ST-1)", agency: "Illinois Department of Revenue", account_id: "4648-4965", period_start: "", period_end: "", filed_on: "2026-10-21", confirmation: "", amount: 0 } };
  if (!env.AI && env.DEV === "1") return { doc_type: "sales_tax_registration", suggested_title: "Notificación de declaración electrónica (ST-1)", suggested_folder: "Fiscales", issued_on: "2026-08-26", expires_on: null, company: { legal_name: "STARKUM HOLDINGS LLC", ein: "", state: "Illinois", address: "121 W HILLGROVE AVE UNIT 2, LA GRANGE IL 60525-1000", state_account_id: "4648-4965" }, tax_obligation: { name: "Impuesto de ventas Illinois (ST-1)", agency: "Illinois Department of Revenue", account_id: "4648-4965", frequency: "trimestral", effective_date: "2026-08-26", due_day: 20, due_offset_months: 1 } };
  if (!env.AI) throw new Error("La lectura automática no está activada.");
  const model = env.AI_MODEL || "@cf/meta/llama-4-scout-17b-16e-instruct";
  const content = [{ type: "text", text: DOC_PROMPT + (text ? "\n\nTexto del documento:\n" + text.slice(0, 12000) : "") }];
  if (image) content.push({ type: "image_url", image_url: { url: image } });
  const out = await env.AI.run(model, { messages: [{ role: "user", content }], max_tokens: 1200, temperature: 0 });
  return parseModelJson(out?.response ?? out?.result?.response ?? out);
}
const FREQS = { mensual: 1, bimestral: 2, trimestral: 3, cuatrimestral: 4, anual: 12 };
const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
function ymd(y, m, d) { const t = new Date(Date.UTC(y, m, d)); return t.toISOString().slice(0, 10); }
function shiftWeekend(iso) { const t = new Date(iso + "T00:00:00Z"); const wd = t.getUTCDay(); if (wd === 6) t.setUTCDate(t.getUTCDate() + 2); if (wd === 0) t.setUTCDate(t.getUTCDate() + 1); return t.toISOString().slice(0, 10); }
async function generatePeriods(env, ob) {
  const step = FREQS[ob.frequency] || 3;
  const st = new Date(ob.start_date + "T00:00:00Z");
  let y = st.getUTCFullYear(), m = Math.floor(st.getUTCMonth() / step) * step;
  const horizon = new Date(Date.now() + 120 * 864e5);
  const stmts = [];
  for (let i = 0; i < 200; i++) {
    const start = ymd(y, m, 1);
    if (new Date(start + "T00:00:00Z") > horizon) break;
    const endMonth = m + step - 1;
    const end = ymd(y, endMonth + 1, 0);
    const due = shiftWeekend(ymd(y, endMonth + Number(ob.due_offset ?? 1), Math.min(Number(ob.due_day) || 20, 28)));
    const label = step === 12 ? `${y}` : step === 3 ? `${y} · ${Math.floor(m / 3) + 1}.º trimestre (${MES[m]}–${MES[endMonth % 12]})` : step === 1 ? `${y} · ${MES[m]}` : `${y} · ${MES[m]}–${MES[endMonth % 12]}`;
    stmts.push(env.DB.prepare("INSERT OR IGNORE INTO tax_periods (id, obligation_id, label, period_start, period_end, due_date, status, created_at) VALUES (?,?,?,?,?,?,'pendiente',?)").bind(uid(), ob.id, label, start, end, due, now()));
    m += step; if (m >= 12) { y += Math.floor(m / 12); m %= 12; }
  }
  if (stmts.length) await env.DB.batch(stmts);
}
async function createObligation(env, entityId, t, sourceDocId) {
  const start = isoDate(t.effective_date || t.start_date);
  if (!t.name || !start) return null;
  const ex = await findObligation(env, entityId, t);
  if (ex) return { id: ex.id, created: false, name: ex.name };
  const id = uid();
  const ob = { id, entity_id: entityId, name: String(t.name).slice(0, 120), agency: t.agency || "", account_id: t.account_id || "", frequency: FREQS[t.frequency] ? t.frequency : "trimestral", due_day: Number(t.due_day) || 20, due_offset: Number(t.due_offset_months ?? t.due_offset ?? 1), start_date: start };
  await env.DB.prepare("INSERT INTO tax_obligations (id, entity_id, name, agency, account_id, frequency, due_day, due_offset, start_date, source_doc_id, notes, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
    .bind(id, entityId, ob.name, ob.agency, ob.account_id, ob.frequency, ob.due_day, ob.due_offset, ob.start_date, sourceDocId || null, t.notes || null, now()).run();
  await generatePeriods(env, ob);
  return { id, created: true, name: ob.name };
}
async function findObligation(env, entityId, t) {
  const acct = String(t.account_id || "").replace(/\D/g, "");
  const all = (await env.DB.prepare("SELECT * FROM tax_obligations WHERE entity_id = ?").bind(entityId).all()).results;
  if (acct) { const hit = all.find((o) => String(o.account_id || "").replace(/\D/g, "") === acct); if (hit) return hit; }
  const nm = normName(t.name || t.tax_name || "");
  const form = String(t.form || "").toLowerCase();
  return all.find((o) => (nm && normName(o.name) === nm) || (form && o.name.toLowerCase().includes(form))) || null;
}
// Lee una declaración presentada y la registra en su período (crea la obligación si no existe).
function returnFromText(text) {
  const t = String(text || "");
  if (!/Sales and Use Tax/i.test(t) || !/ST-1/i.test(t)) return null;
  const m = t.match(/(\d{2})\/(\d{2})\/(\d{4})\s*-\s*(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  const conf = t.match(/\b\d-\d{3}-\d{3}-\d{3}\b/);
  const acct = t.match(/\b\d{4}-\d{4}\b/);
  return { form: "ST-1", tax_name: "Impuesto de ventas Illinois (ST-1)", agency: "Illinois Department of Revenue", account_id: acct ? acct[0] : "", period_start: `${m[3]}-${m[1]}-${m[2]}`, period_end: `${m[6]}-${m[4]}-${m[5]}`, confirmation: conf ? conf[0] : "" };
}
async function registerReturn(env, entityId, r, doc) {
  const pend = isoDate(r.period_end); if (!pend) return null;
  const pstart = isoDate(r.period_start) || pend;
  let ob = await findObligation(env, entityId, r);
  let created = false;
  if (!ob) {
    const months = Math.max(1, Math.round((new Date(pend) - new Date(pstart)) / (30.4 * 864e5)));
    const endM = Number(pend.slice(5, 7));
    const frequency = months >= 10 ? "anual" : months <= 1 && endM % 3 !== 0 ? "mensual" : endM % 3 === 0 ? "trimestral" : months <= 2 ? "bimestral" : "cuatrimestral";
    const name = r.tax_name || (r.form ? "Declaración " + r.form : "Declaración de impuestos");
    const c = await createObligation(env, entityId, { name, agency: r.agency || "", account_id: r.account_id || "", frequency, effective_date: pstart, due_day: 20, due_offset_months: 1 }, doc.id);
    if (!c) return null;
    ob = await env.DB.prepare("SELECT * FROM tax_obligations WHERE id = ?").bind(c.id).first(); created = true;
  } else {
    if (pstart < ob.start_date) await env.DB.prepare("UPDATE tax_obligations SET start_date = ? WHERE id = ?").bind(pstart, ob.id).run(), (ob.start_date = pstart);
    await generatePeriods(env, ob);
  }
  const per = await env.DB.prepare("SELECT * FROM tax_periods WHERE obligation_id = ? AND period_start <= ? AND period_end >= ?").bind(ob.id, pend, pend).first();
  if (!per) return { obligation: ob.name, created, label: null };
  const amount = r.amount === "" || r.amount == null || isNaN(Number(r.amount)) ? per.amount : Number(r.amount);
  const status = r.is_payment ? "pagada" : per.status === "pagada" ? "pagada" : "presentada";
  const note = r.confirmation ? `Confirmación ${r.confirmation}` : null;
  await env.DB.prepare(`UPDATE tax_periods SET status = ?, amount = ?, filed_on = COALESCE(?, filed_on), ${r.is_payment ? "payment_file_id" : "return_file_id"} = ?, notes = CASE WHEN ? IS NULL THEN notes WHEN notes IS NULL OR notes = '' THEN ? WHEN instr(notes, ?) > 0 THEN notes ELSE notes || ' · ' || ? END WHERE id = ?`)
    .bind(status, amount, isoDate(r.filed_on), doc.file_id, note, note, note, note, per.id).run();
  return { obligation: ob.name, created, label: per.label, status };
}
function periodState(p) {
  if (p.status !== "pendiente") return p.status;
  return p.due_date < new Date().toISOString().slice(0, 10) ? "vencida" : "pendiente";
}

// ---------- Cerebro Amazon: proveedores con estado y hoja de escaneo ----------
const SUP_STATUS = ["investigar", "listo", "contactado", "activo", "no_enviar", "descartado"];
const SCAN_LISTS = ["prioritario", "enero", "vigilancia", "no_comprar"];

function slug(s) { return normName(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60); }
// Regla rápida del Cerebro para productos sin ficha (FINANZAS §30.2): etiqueta ≤ factor × Buy Box
function quickRule(bb, weight) {
  if (!bb || bb < 35) return null;
  let f = bb < 60 ? 0.33 : bb <= 100 ? 0.38 : null;
  if (f == null) return null;
  if (weight && weight > 2.3) f -= 0.04 * Math.ceil(weight - 2.3);
  return Math.round(bb * f * 100) / 100;
}
function scanVerdict(item, r) {
  const reasons = [];
  if (item?.list === "no_comprar") reasons.push("Está en la lista de no comprar");
  if (r.can_sell === "no") reasons.push("La cuenta no puede venderlo");
  if (r.can_sell === "solicitud") reasons.push("Pide aprobación para vender");
  if (r.amazon_sells === "si") reasons.push("Amazon vende este ASIN");
  if (r.buybox && !/^tercero/.test(r.buybox)) reasons.push(r.buybox === "amazon" ? "La Buy Box es de Amazon" : r.buybox === "marca" ? "La Buy Box es de la marca" : "No hay Buy Box");
  if (r.drops === "si") reasons.push("Caídas fuertes de precio en 90 días");
  if (r.hazmat === "si") reasons.push("Pide revisión de producto peligroso");
  if (r.size_ok === "no") reasons.push("No es tamaño estándar");
  let limit = null;
  if (item && item.ceiling != null) {
    const need = (String(item.ceiling_note || "").match(/Buy Box ≥\s*(\d+(?:[.,]\d+)?)/) || [])[1];
    const appOk = /^tercero/.test(r.buybox || "") && item.ceiling_app != null && (!/FBA/.test(item.ceiling_note || "") || r.buybox === "tercero_fba") && (!need || (r.buybox_price != null && r.buybox_price >= Number(need.replace(",", "."))));
    limit = appOk ? item.ceiling_app : item.ceiling;
  }
  else limit = quickRule(r.buybox_price, r.weight);
  if (r.shelf_price != null && limit != null && r.shelf_price > limit) reasons.push(`El precio de etiqueta supera el máximo (${limit.toFixed(2)})`);
  const missing = [];
  if (!r.can_sell) missing.push("si puedes venderlo"); if (!r.buybox) missing.push("quién tiene la Buy Box"); if (r.shelf_price == null) missing.push("precio de etiqueta");
  if (limit == null && !reasons.length) missing.push(item ? "techo de compra (pídelo al Cerebro)" : "precio de la Buy Box (35–100) para la regla rápida");
  const verdict = reasons.length ? "no" : missing.length ? "incompleto" : "cumple";
  return { verdict, reasons: reasons.length ? reasons : missing.map((x) => "Falta: " + x), limit };
}
async function importCerebro(env, b, biz) {
  const stamp = b.source_updated ? new Date(Number(b.source_updated) * 1000).toISOString() : now();
  const existing = (await env.DB.prepare("SELECT * FROM suppliers").all()).results;
  const byName = new Map(existing.map((s) => [normName(s.name), s]));
  const stmts = []; let created = 0, updated = 0;
  for (const s of b.suppliers || []) {
    if (!s.name) continue;
    const key = normName(s.name);
    const ex = byName.get(key) || existing.find((e) => normName(e.name).split(" (")[0] === key.split(" (")[0]);
    const status = SUP_STATUS.includes(s.status) ? s.status : "investigar";
    const f = [s.kind || null, s.location || null, s.min_order || null, s.amazon_policy || null, s.amazon_note || null, s.risk || null, s.risk_note || null, s.priority || null, s.decision || null, s.director_note || null, s.draft_text || null, s.draft_condition || null, s.draft_channel || null, s.contact_order || null, stamp];
    if (ex) {
      stmts.push(env.DB.prepare(`UPDATE suppliers SET kind = COALESCE(NULLIF(kind,''), ?), location = ?, min_order = ?, amazon_policy = ?, amazon_note = ?, risk = ?, risk_note = ?, priority = ?, decision = ?, director_note = ?, draft_text = ?, draft_condition = ?, draft_channel = ?, contact_order = ?, source_updated = ?,
        website = COALESCE(NULLIF(website,''), ?), phone = COALESCE(NULLIF(phone,''), ?), email = COALESCE(NULLIF(email,''), ?),
        status = CASE WHEN status_by = 'manual' THEN status ELSE ? END, source = COALESCE(source, 'cerebro') WHERE id = ?`).bind(...f, s.website || null, s.phone || null, s.email || null, status, ex.id));
      updated++;
    } else {
      stmts.push(env.DB.prepare(`INSERT INTO suppliers (id, business_id, name, kind, location, min_order, amazon_policy, amazon_note, risk, risk_note, priority, decision, director_note, draft_text, draft_condition, draft_channel, contact_order, source_updated, website, phone, email, status, status_by, source, brand_auth, platforms, created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'cerebro','cerebro','pendiente','["Amazon US"]',?)`).bind(uid(), biz, s.name, ...f, s.website || null, s.phone || null, s.email || null, status, now()));
      created++;
    }
  }
  const ids = [];
  (b.scan_items || []).forEach((it, i) => {
    if (!it.name) return;
    const id = "cb-" + slug(it.name); ids.push(id);
    stmts.push(env.DB.prepare(`INSERT INTO scan_items (id, business_id, name, code, stores, ceiling, ceiling_app, ceiling_note, max_units, risk, list, purpose, ficha, source, sort, active, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'cerebro',?,1,?)
      ON CONFLICT(id) DO UPDATE SET name = excluded.name, code = excluded.code, stores = excluded.stores, ceiling = excluded.ceiling, ceiling_app = excluded.ceiling_app, ceiling_note = excluded.ceiling_note, max_units = excluded.max_units, risk = excluded.risk, list = excluded.list, purpose = excluded.purpose, ficha = excluded.ficha, sort = excluded.sort, active = 1, updated_at = excluded.updated_at WHERE scan_items.source = 'cerebro'`)
      .bind(id, biz, it.name, it.code || null, it.stores || null, num(it.ceiling), num(it.ceiling_app), it.ceiling_note || null, num(it.max_units), it.risk || null, SCAN_LISTS.includes(it.list) ? it.list : "prioritario", it.purpose || null, it.ficha || null, i, stamp));
  });
  if (b.scan_items) stmts.push(env.DB.prepare(`UPDATE scan_items SET active = 0 WHERE business_id = ? AND source = 'cerebro' AND id NOT IN (${ids.map(() => "?").join(",") || "''"})`).bind(biz, ...ids));
  if (b.scan_guide) stmts.push(env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").bind("scan_guide_" + biz, JSON.stringify({ guide: b.scan_guide, updated: stamp })));
  for (let i = 0; i < stmts.length; i += 50) await env.DB.batch(stmts.slice(i, i + 50));
  return { created, updated, items: ids.length };
}

// ---------- aprobaciones de marca: qué tan lista está cada factura ----------
function approvalCheck(inv, a, legal, addr) {
  const items = JSON.parse(inv.items || "[]");
  const units = items.reduce((t, i) => t + (Number(i.qty) || 0), 0);
  const days = inv.issue_date ? Math.floor((Date.now() - Date.parse(inv.issue_date)) / 864e5) : null;
  const norm = (x) => normName(x).replace(/\s+/g, "");
  const fails = [];
  if (inv.kind === "recibo") fails.push("es un recibo de tienda (Amazon pide factura de mayorista o fabricante)");
  if (days == null) fails.push("no tiene fecha");
  else if (days > 180) fails.push(`tiene ${days} días (Amazon suele pedir menos de 180)`);
  if (units < (a.min_units || 10)) fails.push(`suma ${units} unidades (pides ${a.min_units || 10} o más)`);
  if (!inv.supplier_name && !inv.supplier) fails.push("falta el nombre del proveedor");
  if (!inv.supplier_address) fails.push("falta la dirección del proveedor");
  if (!inv.supplier_phone && !inv.supplier_website && !inv.supplier_email) fails.push("falta un contacto del proveedor (teléfono, web o correo)");
  if (!inv.buyer_name) fails.push("falta tu nombre como comprador");
  else if (legal && !norm(inv.buyer_name).includes(norm(legal).slice(0, 12))) fails.push(`el comprador dice "${inv.buyer_name}" y debe coincidir con "${legal}"`);
  if (!inv.buyer_address) fails.push("falta tu dirección como comprador");
  else if (addr && !norm(inv.buyer_address).includes(norm(addr.split(",")[0]).slice(0, 10))) fails.push("la dirección del comprador no coincide con la de la empresa");
  const brand = norm(a.brand);
  if (brand && !items.some((i) => norm(i.description).includes(brand)) && !norm(inv.supplier_name || inv.supplier || "").includes(brand)) fails.push(`no veo la marca "${a.brand}" en los productos`);
  return { id: inv.id, supplier: inv.supplier || inv.supplier_name, invoice_number: inv.invoice_number, issue_date: inv.issue_date, units, ok: !fails.length, fails };
}

// ---------- tarjetas y lotes ----------
const NETWORKS = ["Visa", "Mastercard", "American Express", "Discover", "Otra"];
const LOT_STAGES = ["comprado", "etiquetado", "enviado", "recibido", "vendiendo", "recuperado"];
function cardLabel(c) { return `${c.network || "Tarjeta"} ${c.card_type === "debito" ? "débito" : "crédito"} terminada en ${c.last4}${c.issuer ? " (" + c.issuer + ")" : ""}${c.holder ? ", titular " + c.holder : ""}`; }
function clampDay(y, m, d) { return ymd(y, m, Math.min(d, new Date(Date.UTC(y, m + 1, 0)).getUTCDate())); }
// Crea los ciclos (cierre → pago) del mes anterior, el actual y el siguiente de cada tarjeta
async function ensureCycles(env) {
  const cards = (await env.DB.prepare("SELECT id, card_type, closing_day, due_day, created_at FROM cards WHERE active = 1 AND ((closing_day IS NOT NULL AND due_day IS NOT NULL) OR card_type = 'debito')").all()).results;
  if (!cards.length) return;
  const t = new Date(); const stmts = [];
  for (const c of cards) for (const k of [-3, -2, -1, 0, 1]) {
    const y = t.getUTCFullYear(), m = t.getUTCMonth() + k;
    const debit = c.card_type === "debito";
    const close = clampDay(y, m, debit ? c.closing_day || 31 : c.closing_day);
    const due = debit ? close : c.due_day > c.closing_day ? clampDay(y, m, c.due_day) : clampDay(y, m + 1, c.due_day);
    // Los ciclos anteriores al registro de la tarjeta se dan por pagados (sirven solo para subir extractos viejos)
    const before = due < c.created_at.slice(0, 10) ? 1 : 0;
    stmts.push(env.DB.prepare("INSERT OR IGNORE INTO card_cycles (id, card_id, closing_date, due_date, paid, created_at) VALUES (?,?,?,?,?,?)").bind(uid(), c.id, close, due, before, now()));
  }
  if (stmts.length) await env.DB.batch(stmts);
}
const CARD_PROMPT = `Lee la foto del frente de una tarjeta de crédito o débito y responde SOLO con JSON válido: {"issuer":"","network":"Visa|Mastercard|American Express|Discover|Otra","card_type":"credito|debito","holder":"","last4":"","exp_month":0,"exp_year":0}.
"card_type" es "debito" si la tarjeta dice DEBIT o DÉBITO; si no, "credito".
"issuer" es el banco o emisor (por ejemplo Chase, Capital One, Discover). "holder" es el nombre impreso. "last4" son SOLO los últimos 4 dígitos del número. Nunca escribas el número completo ni el código de seguridad. exp_year con 4 dígitos. Usa "" o 0 si no se ve.`;
async function readCard(env, image) {
  if (!env.AI && env.DEV === "1") return { card_type: "credito", issuer: "Chase", network: "Visa", holder: "JONTH CABALLERO", last4: "1002", exp_month: 8, exp_year: 2029 };
  if (!env.AI) throw new Error("La lectura automática no está activada.");
  const out = await env.AI.run(env.AI_MODEL || "@cf/meta/llama-4-scout-17b-16e-instruct", { messages: [{ role: "user", content: [{ type: "text", text: CARD_PROMPT }, { type: "image_url", image_url: { url: image } }] }], max_tokens: 300, temperature: 0 });
  const x = parseModelJson(out?.response ?? out?.result?.response ?? out) || {};
  const safe = (v) => String(v || "").replace(/\d[\d\s-]{7,}\d/g, "").trim().slice(0, 60);
  const net = NETWORKS.find((n) => n.toLowerCase() === String(x.network || "").toLowerCase()) || (/amex|american/i.test(x.network) ? "American Express" : /master/i.test(x.network) ? "Mastercard" : /visa/i.test(x.network) ? "Visa" : /discover/i.test(x.network) ? "Discover" : "");
  const em = Number(x.exp_month) || 0, ey = Number(x.exp_year) || 0;
  return { card_type: /deb/i.test(x.card_type || "") ? "debito" : "credito", issuer: safe(x.issuer), network: net, holder: safe(x.holder), last4: (String(x.last4 || "").replace(/\D/g, "").match(/(\d{4})$/) || [])[1] || "", exp_month: em >= 1 && em <= 12 ? em : null, exp_year: ey > 2000 && ey < 2100 ? ey : ey > 20 && ey < 100 ? 2000 + ey : null };
}

// ---------- estado de documentos ----------
function docStatus(expires) {
  if (!expires) return { key: "vigente", label: "Vigente" };
  const days = Math.floor((Date.parse(expires) - Date.now()) / 864e5);
  if (days < 0) return { key: "vencido", label: "Vencido" };
  if (days <= 60) return { key: "por_vencer", label: "Por vencer", days };
  return { key: "vigente", label: "Vigente", days };
}

// ---------- API ----------
async function api(req, env, url, user) {
  const p = url.pathname.replace(/^\/api/, "");
  const m = req.method;
  const body = async () => { try { return await req.json(); } catch { return {}; } };
  const isAdmin = user.role === "admin";
  const denied = permissionError(user.role, m, p);
  if (denied) return fail(denied, 403);

  if (p === "/me") return json({ user });
  if (p === "/auth/logout" && m === "POST") {
    const token = cookie(req, "sid");
    if (token) await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(token)).run();
    return json({ ok: true }, 200, { "set-cookie": sessionCookie("", 0) });
  }

  // Inicio
  if (p === "/dashboard") {
    const [biz, ents, docs, dls, recent, plats, usage] = await Promise.all([
      env.DB.prepare("SELECT b.*, e.name AS entity_name FROM businesses b LEFT JOIN entities e ON e.id = b.entity_id ORDER BY b.sort, b.name").all(),
      env.DB.prepare("SELECT * FROM entities ORDER BY id").all(),
      env.DB.prepare("SELECT d.entity_id, d.title, d.expires_on FROM company_docs d WHERE d.version = (SELECT MAX(version) FROM company_docs x WHERE x.group_id = d.group_id)").all(),
      env.DB.prepare("SELECT * FROM deadlines WHERE done = 0 ORDER BY due_on LIMIT 8").all(),
      env.DB.prepare("SELECT i.id, i.title, i.invoice_number, i.issue_date, i.created_at, i.status, b.name AS business, b.entity_id, s.name AS supplier FROM invoices i JOIN businesses b ON b.id = i.business_id LEFT JOIN suppliers s ON s.id = i.supplier_id ORDER BY i.created_at DESC LIMIT 40").all(),
      env.DB.prepare("SELECT * FROM platforms ORDER BY sort").all(),
      env.DB.prepare("SELECT COALESCE(SUM(size),0) AS bytes, COUNT(*) AS n FROM files").first(),
    ]);
    const entities = ents.results.map((e) => {
      const mine = docs.results.filter((d) => d.entity_id === e.id);
      const issues = mine.filter((d) => docStatus(d.expires_on).key !== "vigente").length;
      return { ...e, details: JSON.parse(e.details || "{}"), docs: mine.length, issues };
    });
    const expiring = docs.results.filter((d) => d.expires_on && docStatus(d.expires_on).key !== "vigente").map((d) => ({ title: d.title, entity_id: d.entity_id, due_on: d.expires_on, kind: "documento" }));
    const taxDue = (await env.DB.prepare("SELECT tp.label, tp.due_date, tp.status, o.name, o.entity_id FROM tax_periods tp JOIN tax_obligations o ON o.id = tp.obligation_id WHERE o.active = 1 AND tp.status = 'pendiente' AND tp.due_date <= ? ORDER BY tp.due_date LIMIT 8").bind(new Date(Date.now() + 90 * 864e5).toISOString().slice(0, 10)).all()).results
      .map((t) => ({ title: `${t.name} · ${t.label}`, entity_id: t.entity_id, due_on: t.due_date, kind: "impuesto", overdue: t.due_date < new Date().toISOString().slice(0, 10) }));
    await ensureCycles(env);
    const cardDue = (await env.DB.prepare("SELECT cc.due_date, c.nickname, c.last4, c.entity_id FROM card_cycles cc JOIN cards c ON c.id = cc.card_id WHERE c.active = 1 AND c.card_type != 'debito' AND cc.paid = 0 AND cc.due_date <= ? AND cc.closing_date <= ? ORDER BY cc.due_date LIMIT 6").bind(new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10), new Date().toISOString().slice(0, 10)).all()).results
      .map((c) => ({ title: `Pagar el total de la tarjeta ${c.nickname} •••• ${c.last4}`, due_on: c.due_date, kind: "tarjeta", entity_id: c.entity_id || null, link: `#/empresa/${c.entity_id || "llc"}/tarjetas`, overdue: c.due_date < new Date().toISOString().slice(0, 10) }));
    const staleLots = (await env.DB.prepare("SELECT l.id, l.business_id, l.name, l.stage, l.dates, l.created_at, b.entity_id FROM lots l JOIN businesses b ON b.id = l.business_id WHERE l.stage IN ('comprado','etiquetado')").all()).results
      .map((l) => ({ ...l, d: JSON.parse(l.dates || "{}").comprado || l.created_at.slice(0, 10) })).filter((l) => (Date.now() - new Date(l.d)) / 864e5 > 14)
      .map((l) => ({ title: `${l.name}: lleva ${Math.floor((Date.now() - new Date(l.d)) / 864e5)} días sin enviarse a Amazon`, due_on: l.d, kind: "lote", entity_id: l.entity_id, link: `#/negocio/${l.business_id}/lotes`, overdue: true }));
    const caseDue = (await env.DB.prepare("SELECT c.id, c.business_id, c.title, c.case_number, c.due_date, b.entity_id FROM amazon_cases c JOIN businesses b ON b.id = c.business_id WHERE c.status = 'abierto' AND c.due_date IS NOT NULL").all()).results
      .map((c) => ({ title: `Caso de Amazon: ${c.title}${c.case_number ? " (" + c.case_number + ")" : ""}`, due_on: c.due_date, kind: "caso", entity_id: c.entity_id, link: `#/negocio/${c.business_id}/casos?c=${c.id}`, overdue: c.due_date < new Date().toISOString().slice(0, 10) }));
    const all = [...dls.results.map((d) => ({ title: d.title, entity_id: d.entity_id, due_on: d.due_on, kind: "fecha", id: d.id })), ...expiring, ...taxDue, ...cardDue, ...staleLots, ...caseDue].sort((a, b) => a.due_on.localeCompare(b.due_on));
    const ent = url.searchParams.get("entity");
    const mine = (x) => !ent || !x.entity_id || x.entity_id === ent;
    const today = new Date().toISOString().slice(0, 10);
    const byEntity = Object.fromEntries(entities.map((e) => [e.id, { businesses: biz.results.filter((b) => b.entity_id === e.id).length, upcoming: all.filter((x) => !x.entity_id || x.entity_id === e.id).length, overdue: all.filter((x) => (!x.entity_id || x.entity_id === e.id) && (x.overdue || x.due_on < today)).length }]));
    const bizIds = new Set(biz.results.filter((b) => !ent || b.entity_id === ent).map((b) => b.id));
    return json({ businesses: biz.results.filter((b) => !ent || b.entity_id === ent), all_businesses: biz.results, entities: entities.map((e) => ({ ...e, summary: byEntity[e.id] })), upcoming: all.filter(mine).slice(0, 10), recent: recent.results.filter((r) => !ent || r.entity_id === ent).slice(0, 6),
      platforms: plats.results.filter((p) => !ent || !p.business_id || bizIds.has(p.business_id)), usage: { ...usage, free: STORAGE_FREE_BYTES } });
  }

  let mm0;
  // Logo de cada empresa (opcional; si no hay, la aplicación usa el ícono de Starkum)
  if ((mm0 = p.match(/^\/entities\/(llc|sas)\/logo$/))) {
    const key = "brand/entity-" + mm0[1];
    if (m === "GET") { const o = await env.FILES.get(key); return o ? new Response(o.body, { headers: { "content-type": o.httpMetadata?.contentType || "image/png", "cache-control": "private, max-age=300" } }) : new Response("", { status: 404 }); }
    if (m === "POST") {
      const fd = await req.formData(); const f = fd.get("file");
      if (!f || !f.size || f.size > 2 * 1024 * 1024 || !/^image\//.test(f.type)) return fail("Sube una imagen de hasta 2 MB.");
      await env.FILES.put(key, await f.arrayBuffer(), { httpMetadata: { contentType: f.type } });
      return json({ ok: true });
    }
    if (m === "DELETE") { await env.FILES.delete(key); return json({ ok: true }); }
  }
  // Empresas
  if (p === "/entities") return json({ entities: (await env.DB.prepare("SELECT * FROM entities ORDER BY id").all()).results.map((e) => ({ ...e, details: JSON.parse(e.details || "{}") })), folders: FOLDERS });
  let mm;
  if ((mm = p.match(/^\/entities\/([a-z]+)$/)) && m === "PUT") {
    const b = await body();
    await env.DB.prepare("UPDATE entities SET details = ? WHERE id = ?").bind(JSON.stringify(b.details || {}), mm[1]).run();
    return json({ ok: true });
  }

  // Documentos de empresas
  if (p === "/docs" && m === "GET") {
    const ent = url.searchParams.get("entity") || "llc";
    const rows = (await env.DB.prepare("SELECT d.*, f.filename, f.mime, f.size FROM company_docs d LEFT JOIN files f ON f.id = d.file_id WHERE d.entity_id = ? ORDER BY d.folder, d.title, d.version DESC").bind(ent).all()).results;
    const groups = {};
    for (const r of rows) (groups[r.group_id] ||= []).push(r);
    const docs = Object.values(groups).map((v) => ({ ...v[0], versions: v.length, history: v.map((x) => ({ id: x.id, version: x.version, file_id: x.file_id, filename: x.filename, created_at: x.created_at })), state: docStatus(v[0].expires_on) }));
    return json({ docs, folders: FOLDERS });
  }
  if (p === "/docs" && m === "POST") {
    const fd = await req.formData();
    const file = fd.get("file");
    const fileId = file && file.size ? await storeFile(env, user, file, fd.get("original_size")) : null;
    let group = fd.get("group_id"); let version = 1;
    const prev = group ? await env.DB.prepare("SELECT * FROM company_docs WHERE group_id = ? ORDER BY version DESC LIMIT 1").bind(group).first() : null;
    if (prev) version = prev.version + 1; else group = uid();
    const entity = fd.get("entity_id") || prev?.entity_id;
    if (!["llc", "sas"].includes(entity)) return fail("Empresa no válida.");
    let title = String(fd.get("title") || prev?.title || "").trim();
    const autoTitle = !title;
    if (autoTitle) title = titleFromFilename(file && file.name) || "Documento sin nombre";
    const folder = FOLDERS.includes(fd.get("folder")) ? fd.get("folder") : prev?.folder || FOLDERS[0];
    const id = uid();
    await env.DB.prepare("INSERT INTO company_docs (id, group_id, entity_id, folder, title, issued_on, expires_on, file_id, notes, version, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
      .bind(id, group, entity, folder, title, isoDate(fd.get("issued_on")), isoDate(fd.get("expires_on")), fileId, fd.get("notes") || null, version, now()).run();
    return json({ id, group_id: group, version, auto_title: autoTitle });
  }
  if ((mm = p.match(/^\/docs\/([\w-]+)$/)) && m === "PUT") {
    const b = await body();
    await env.DB.prepare("UPDATE company_docs SET title = ?, folder = ?, issued_on = ?, expires_on = ?, notes = ? WHERE id = ?")
      .bind(b.title, FOLDERS.includes(b.folder) ? b.folder : FOLDERS[0], isoDate(b.issued_on), isoDate(b.expires_on), b.notes || null, mm[1]).run();
    return json({ ok: true });
  }

  if ((mm = p.match(/^\/docs\/([\w-]+)\/extract$/)) && m === "POST") {
    const b = await body();
    const doc = await env.DB.prepare("SELECT * FROM company_docs WHERE id = ?").bind(mm[1]).first();
    if (!doc) return fail("Documento no encontrado.", 404);
    if (b.image && b.image.length > 6_000_000) return fail("La imagen para leer es demasiado grande.");
    let x;
    try { x = await runDocModel(env, b); } catch (e) { return fail(e.message || "No se pudo leer el documento.", 502); }
    if (!x || typeof x !== "object") return fail("No se pudieron leer datos de este documento.", 422);
    const ent = await env.DB.prepare("SELECT * FROM entities WHERE id = ?").bind(doc.entity_id).first();
    const details = JSON.parse(ent.details || "{}");
    const c = x.company || {};
    const map = doc.entity_id === "llc"
      ? [["Nombre legal", c.legal_name], ["EIN", c.ein], ["Estado", c.state], ["Dirección", c.address], ["Cuenta Illinois (IDOR)", c.state_account_id], ["Fecha de constitución", isoDate(c.formation_date)], ["Agente registrado", c.registered_agent]]
      : [["Razón social", c.legal_name], ["NIT", c.nit || c.ein], ["Dirección", c.address], ["Fecha de constitución", isoDate(c.formation_date)]];
    const filled = [];
    for (const [k, v] of map) {
      const val = String(v || "").trim();
      if (!val) continue;
      if (!details[k] || !String(details[k]).trim()) { details[k] = val; filled.push(k); }
    }
    if (filled.length) await env.DB.prepare("UPDATE entities SET details = ? WHERE id = ?").bind(JSON.stringify(details), doc.entity_id).run();
    const upd = [];
    if (!doc.issued_on && isoDate(x.issued_on)) upd.push(["issued_on", isoDate(x.issued_on)]);
    if (!doc.expires_on && isoDate(x.expires_on)) upd.push(["expires_on", isoDate(x.expires_on)]);
    for (const [k, v] of upd) await env.DB.prepare(`UPDATE company_docs SET ${k} = ? WHERE group_id = ? AND version = ?`).bind(v, doc.group_id, doc.version).run();
    let title = null;
    const sug = String(x.suggested_title || "").replace(/\s+/g, " ").trim().slice(0, 80);
    if ((b.auto_title || doc.title === "Documento sin nombre") && sug) { await env.DB.prepare("UPDATE company_docs SET title = ? WHERE group_id = ?").bind(sug, doc.group_id).run(); title = sug; }
    let obligation = null;
    let taxReturn = null;
    const tr = Object.assign({}, returnFromText(b.text) || {}, ...Object.entries(x.tax_return && typeof x.tax_return === "object" ? x.tax_return : {}).filter(([, v]) => v !== "" && v != null).map(([k, v]) => ({ [k]: v })));
    if (tr.period_end) taxReturn = await registerReturn(env, doc.entity_id, tr, doc);
    else if (x.tax_obligation && typeof x.tax_obligation === "object") obligation = await createObligation(env, doc.entity_id, x.tax_obligation, doc.id);
    return json({ filled, dates: upd.map((u) => u[0]), obligation, tax_return: taxReturn, title, doc_type: x.doc_type || "", suggested_title: x.suggested_title || "", suggested_folder: FOLDERS.includes(x.suggested_folder) ? x.suggested_folder : null });
  }

  // Declaraciones por período
  if (p === "/tax" && m === "GET") {
    const ent = url.searchParams.get("entity");
    const obs = (await env.DB.prepare("SELECT * FROM tax_obligations WHERE entity_id = ? AND active = 1 ORDER BY created_at").bind(ent).all()).results;
    for (const ob of obs) await generatePeriods(env, ob);
    const periods = obs.length ? (await env.DB.prepare(`SELECT tp.*, rf.filename AS return_name, pf.filename AS payment_name FROM tax_periods tp LEFT JOIN files rf ON rf.id = tp.return_file_id LEFT JOIN files pf ON pf.id = tp.payment_file_id WHERE tp.obligation_id IN (${obs.map(() => "?").join(",")}) ORDER BY tp.period_start DESC`).bind(...obs.map((o) => o.id)).all()).results : [];
    return json({ obligations: obs.map((o) => ({ ...o, periods: periods.filter((pp) => pp.obligation_id === o.id).map((pp) => ({ ...pp, state: periodState(pp) })) })) });
  }
  if (p === "/tax/obligations" && m === "POST") {
    const b = await body();
    if (!["llc", "sas"].includes(b.entity_id)) return fail("Empresa no válida.");
    const r = await createObligation(env, b.entity_id, { ...b, effective_date: b.start_date }, null);
    if (!r) return fail("Escribe el nombre y la fecha de inicio.");
    return json(r);
  }
  if ((mm = p.match(/^\/tax\/obligations\/([\w-]+)$/)) && m === "DELETE") {
    if (!isAdmin) return fail("Solo el administrador puede eliminar obligaciones.", 403);
    const files = (await env.DB.prepare("SELECT return_file_id, payment_file_id FROM tax_periods WHERE obligation_id = ?").bind(mm[1]).all()).results;
    for (const f of files) { await removeFile(f.return_file_id); await removeFile(f.payment_file_id); }
    await env.DB.batch([env.DB.prepare("DELETE FROM tax_periods WHERE obligation_id = ?").bind(mm[1]), env.DB.prepare("DELETE FROM tax_obligations WHERE id = ?").bind(mm[1])]);
    return json({ ok: true });
  }
  if ((mm = p.match(/^\/tax\/periods\/([\w-]+)$/)) && m === "PUT") {
    const b = await body();
    const st = ["pendiente", "presentada", "pagada", "no_aplica"].includes(b.status) ? b.status : "pendiente";
    await env.DB.prepare("UPDATE tax_periods SET status = ?, amount = ?, filed_on = ?, notes = ? WHERE id = ?").bind(st, num(b.amount), isoDate(b.filed_on), b.notes || null, mm[1]).run();
    return json({ ok: true });
  }
  if ((mm = p.match(/^\/tax\/periods\/([\w-]+)\/file$/)) && m === "POST") {
    const fd = await req.formData();
    const kind = fd.get("kind") === "payment" ? "payment" : "return";
    const per = await env.DB.prepare("SELECT * FROM tax_periods WHERE id = ?").bind(mm[1]).first();
    if (!per) return fail("Período no encontrado.", 404);
    const fid = await storeFile(env, user, fd.get("file"), fd.get("original_size"));
    const old = kind === "payment" ? per.payment_file_id : per.return_file_id;
    const newStatus = kind === "payment" ? "pagada" : per.status === "pagada" ? "pagada" : "presentada";
    await env.DB.prepare(`UPDATE tax_periods SET ${kind === "payment" ? "payment_file_id" : "return_file_id"} = ?, status = ?, filed_on = COALESCE(filed_on, ?), amount = COALESCE(?, amount) WHERE id = ?`)
      .bind(fid, newStatus, new Date().toISOString().slice(0, 10), num(fd.get("amount")), per.id).run();
    if (old && isAdmin) await removeFile(old);
    return json({ ok: true, status: newStatus });
  }

  // Fechas importantes
  if (p === "/deadlines" && m === "POST") {
    const b = await body();
    if (!b.title || !isoDate(b.due_on)) return fail("Escribe el nombre y la fecha.");
    await env.DB.prepare("INSERT INTO deadlines (id, title, entity_id, due_on, notes, created_at) VALUES (?,?,?,?,?,?)").bind(uid(), b.title, b.entity_id || null, isoDate(b.due_on), b.notes || null, now()).run();
    return json({ ok: true });
  }
  if ((mm = p.match(/^\/deadlines\/([\w-]+)$/)) && m === "PUT") {
    const b = await body();
    await env.DB.prepare("UPDATE deadlines SET done = ? WHERE id = ?").bind(b.done ? 1 : 0, mm[1]).run();
    return json({ ok: true });
  }

  // Negocios
  if (p === "/businesses" && m === "GET") return json({ businesses: (await env.DB.prepare("SELECT b.*, e.name AS entity_name FROM businesses b LEFT JOIN entities e ON e.id = b.entity_id ORDER BY b.sort, b.name").all()).results });
  if (p === "/businesses" && m === "POST") {
    const b = await body();
    const name = String(b.name || "").trim();
    if (!name) return fail("Escribe el nombre del negocio.");
    const id = name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || uid();
    const exists = await env.DB.prepare("SELECT id FROM businesses WHERE id = ?").bind(id).first();
    if (exists) return fail("Ya existe un negocio con ese nombre.");
    await env.DB.prepare("INSERT INTO businesses (id, name, entity_id, kind, status, description, sort, created_at) VALUES (?,?,?,?,?,?,?,?)")
      .bind(id, name, ["llc", "sas"].includes(b.entity_id) ? b.entity_id : null, b.kind || "general", "activo", b.description || "", 99, now()).run();
    return json({ id });
  }
  if ((mm = p.match(/^\/businesses\/([\w-]+)$/)) && m === "GET") {
    const biz = await env.DB.prepare("SELECT b.*, e.name AS entity_name FROM businesses b LEFT JOIN entities e ON e.id = b.entity_id WHERE b.id = ?").bind(mm[1]).first();
    if (!biz) return fail("Negocio no encontrado.", 404);
    const [plats, stats] = await Promise.all([
      env.DB.prepare("SELECT * FROM platforms WHERE business_id = ? ORDER BY sort").bind(mm[1]).all(),
      env.DB.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(total),0) AS total, SUM(CASE WHEN status='por_revisar' THEN 1 ELSE 0 END) AS pending FROM invoices WHERE business_id = ?").bind(mm[1]).first(),
    ]);
    return json({ business: biz, platforms: plats.results, stats });
  }
  if ((mm = p.match(/^\/businesses\/([\w-]+)$/)) && m === "PUT") {
    const b = await body();
    await env.DB.prepare("UPDATE businesses SET name = ?, entity_id = ?, status = ?, description = ? WHERE id = ?")
      .bind(b.name, ["llc", "sas"].includes(b.entity_id) ? b.entity_id : null, b.status || "activo", b.description || "", mm[1]).run();
    return json({ ok: true });
  }

  // Plataformas
  if (p === "/platforms" && m === "GET") {
    const [plats, pols] = await Promise.all([
      env.DB.prepare("SELECT p.*, b.name AS business_name FROM platforms p LEFT JOIN businesses b ON b.id = p.business_id ORDER BY p.sort").all(),
      env.DB.prepare("SELECT po.*, p.name AS platform_name, b.name AS business_name FROM policies po LEFT JOIN platforms p ON p.id = po.platform_id LEFT JOIN businesses b ON b.id = p.business_id ORDER BY COALESCE(po.happened_on, po.created_at) DESC LIMIT 30").all(),
    ]);
    return json({ platforms: plats.results, policies: pols.results });
  }
  if ((mm = p.match(/^\/platforms\/([\w-]+)$/)) && m === "PUT") {
    const b = await body();
    const st = ["sin_cuenta", "por_conectar", "conectada"].includes(b.status) ? b.status : "sin_cuenta";
    await env.DB.prepare("UPDATE platforms SET business_id = ?, status = ? WHERE id = ?").bind(b.business_id || null, st, mm[1]).run();
    return json({ ok: true });
  }
  if ((mm = p.match(/^\/platforms\/([\w-]+)\/business$/)) && m === "POST") {
    const plat = await env.DB.prepare("SELECT * FROM platforms WHERE id = ?").bind(mm[1]).first();
    if (!plat) return fail("Plataforma no encontrada.", 404);
    if (plat.business_id && (await env.DB.prepare("SELECT id FROM businesses WHERE id = ?").bind(plat.business_id).first())) return json({ id: plat.business_id, existed: true });
    const b = await body();
    let id = plat.id; let n = 1;
    while (await env.DB.prepare("SELECT id FROM businesses WHERE id = ?").bind(id).first()) id = `${plat.id}-${++n}`;
    const kind = ["shopify", "woocommerce"].includes(plat.id) ? "tienda" : "reventa";
    await env.DB.batch([
      env.DB.prepare("INSERT INTO businesses (id, name, entity_id, kind, status, description, sort, created_at) VALUES (?,?,?,?,?,?,?,?)")
        .bind(id, plat.name, ["llc", "sas"].includes(b.entity_id) ? b.entity_id : null, kind, "activo", kind === "tienda" ? "Tienda propia" : "Marketplace · " + (plat.region || ""), 50 + plat.sort, now()),
      env.DB.prepare("UPDATE platforms SET business_id = ? WHERE id = ?").bind(id, plat.id),
    ]);
    return json({ id });
  }
  if (p === "/policies" && m === "POST") {
    const b = await body();
    if (!b.title) return fail("Describe el cambio de política.");
    await env.DB.prepare("INSERT INTO policies (id, platform_id, title, happened_on, url, notes, created_at) VALUES (?,?,?,?,?,?,?)").bind(uid(), b.platform_id || null, b.title, isoDate(b.happened_on), b.url || null, b.notes || null, now()).run();
    return json({ ok: true });
  }

  // Proveedores
  if (p === "/suppliers" && m === "GET" && url.searchParams.get("entity")) {
    const ent = url.searchParams.get("entity");
    const rows = (await env.DB.prepare(`SELECT s.*, sb.name AS home_business,
        (SELECT COUNT(*) FROM invoices i WHERE i.supplier_id = s.id) AS invoices,
        (SELECT COALESCE(SUM(total),0) FROM invoices i WHERE i.supplier_id = s.id AND substr(i.issue_date,1,4) = ?2) AS year_total,
        (SELECT GROUP_CONCAT(DISTINCT b.name) FROM invoices i JOIN businesses b ON b.id = i.business_id WHERE i.supplier_id = s.id) AS used_in
      FROM suppliers s JOIN businesses sb ON sb.id = s.business_id WHERE sb.entity_id = ?1 ORDER BY s.name`).bind(ent, String(new Date().getFullYear())).all()).results;
    return json({ suppliers: rows.map((s) => ({ ...s, platforms: JSON.parse(s.platforms || "[]") })) });
  }
  if (p === "/suppliers" && m === "GET") {
    const biz = url.searchParams.get("business");
    // Los proveedores se comparten entre los negocios de la misma empresa (un mayorista puede surtir Amazon y Walmart)
    const rows = (await env.DB.prepare(`SELECT s.*, sb.name AS home_business,
        (SELECT COUNT(*) FROM invoices i WHERE i.supplier_id = s.id AND i.business_id = ?1) AS invoices,
        (SELECT COALESCE(SUM(total),0) FROM invoices i WHERE i.supplier_id = s.id AND i.business_id = ?1 AND substr(i.issue_date,1,4) = ?2) AS year_total
      FROM suppliers s JOIN businesses sb ON sb.id = s.business_id
      WHERE s.business_id = ?1 OR (sb.entity_id IS NOT NULL AND sb.entity_id = (SELECT entity_id FROM businesses WHERE id = ?1))
      ORDER BY s.name`).bind(biz, String(new Date().getFullYear())).all()).results;
    return json({ suppliers: rows.map((s) => ({ ...s, platforms: JSON.parse(s.platforms || "[]") })) });
  }
  const supFields = ["name", "kind", "contact_name", "email", "phone", "website", "address", "tax_id", "brands", "min_order", "payment_terms", "brand_auth", "notes", "status", "amazon_policy", "location", "risk", "priority"];
  if (p === "/suppliers" && m === "POST") {
    const b = await body();
    if (!b.business_id && b.entity_id) b.business_id = (await env.DB.prepare("SELECT id FROM businesses WHERE entity_id = ? ORDER BY sort, name LIMIT 1").bind(b.entity_id).first())?.id;
    if (!String(b.name || "").trim() || !b.business_id) return fail("Escribe el nombre del proveedor.");
    const id = uid();
    await env.DB.prepare(`INSERT INTO suppliers (id, business_id, ${supFields.join(", ")}, platforms, created_at) VALUES (?, ?, ${supFields.map(() => "?").join(", ")}, ?, ?)`)
      .bind(id, b.business_id, ...supFields.map((f) => (f === "brand_auth" ? b[f] || "pendiente" : b[f] ?? null)), JSON.stringify(b.platforms || []), now()).run();
    return json({ id });
  }
  if ((mm = p.match(/^\/suppliers\/([\w-]+)$/)) && m === "PUT") {
    const b = await body();
    await env.DB.prepare(`UPDATE suppliers SET ${supFields.map((f) => f + " = ?").join(", ")}, platforms = ?, status_by = 'manual' WHERE id = ?`)
      .bind(...supFields.map((f) => (f === "brand_auth" ? b[f] || "pendiente" : b[f] ?? null)), JSON.stringify(b.platforms || []), mm[1]).run();
    return json({ ok: true });
  }
  if ((mm = p.match(/^\/suppliers\/([\w-]+)\/status$/)) && m === "PUT") {
    const b = await body();
    if (!SUP_STATUS.includes(b.status)) return fail("Estado no válido.");
    await env.DB.prepare("UPDATE suppliers SET status = ?, status_by = 'manual' WHERE id = ?").bind(b.status, mm[1]).run();
    return json({ ok: true });
  }

  // Tarjetas (solo últimos 4 dígitos; nunca el número completo ni la imagen)
  if (p === "/cards" && m === "GET") {
    await ensureCycles(env);
    const [cards, cycles, uses] = await Promise.all([
      (url.searchParams.get("entity") ? env.DB.prepare("SELECT * FROM cards WHERE active = 1 AND (entity_id IS NULL OR entity_id = '' OR entity_id = ?) ORDER BY nickname").bind(url.searchParams.get("entity")) : env.DB.prepare("SELECT * FROM cards WHERE active = 1 ORDER BY nickname")).all(),
      env.DB.prepare("SELECT cc.*, f.filename FROM card_cycles cc LEFT JOIN files f ON f.id = cc.file_id ORDER BY cc.closing_date DESC").all(),
      env.DB.prepare("SELECT card_id, COUNT(*) AS n, COALESCE(SUM(total),0) AS total FROM invoices WHERE card_id IS NOT NULL GROUP BY card_id").all(),
    ]);
    return json({ cards: cards.results.map((c) => ({ ...c, cycles: cycles.results.filter((x) => x.card_id === c.id).slice(0, 6), uses: uses.results.find((u) => u.card_id === c.id) || { n: 0, total: 0 } })) });
  }
  if (p === "/cards/read" && m === "POST") {
    const b = await body();
    if (!b.image || b.image.length > 6_000_000) return fail("Falta la foto de la tarjeta o es demasiado grande.");
    try { return json({ card: await readCard(env, b.image) }); } catch (e) { return fail(e.message || "No se pudo leer la tarjeta.", 502); }
  }
  if ((p === "/cards" && m === "POST") || ((mm = p.match(/^\/cards\/([\w-]+)$/)) && m === "PUT")) {
    const b = await body();
    const last4 = String(b.last4 || "").replace(/\D/g, "");
    if (last4.length !== 4) return fail("Escribe solo los últimos 4 dígitos de la tarjeta.");
    if (!String(b.nickname || "").trim()) return fail("Ponle un nombre corto a la tarjeta (por ejemplo, Chase personal).");
    const day = (v) => { const n = parseInt(v, 10); return n >= 1 && n <= 31 ? n : null; };
    const vals = [String(b.nickname).trim().slice(0, 60), b.issuer || null, NETWORKS.includes(b.network) ? b.network : null, b.holder || null, last4, day(b.exp_month) && day(b.exp_month) <= 12 ? day(b.exp_month) : null, Number(b.exp_year) > 2000 ? Number(b.exp_year) : null, b.owner === "empresa" ? "empresa" : "personal", b.entity_id || null, day(b.closing_day), day(b.due_day), num(b.credit_limit), b.notes || null, b.card_type === "debito" ? "debito" : "credito"];
    if (m === "POST") { const id = uid(); await env.DB.prepare("INSERT INTO cards (id, nickname, issuer, network, holder, last4, exp_month, exp_year, owner, entity_id, closing_day, due_day, credit_limit, notes, card_type, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(id, ...vals, now()).run(); return json({ id }); }
    await env.DB.prepare("UPDATE cards SET nickname = ?, issuer = ?, network = ?, holder = ?, last4 = ?, exp_month = ?, exp_year = ?, owner = ?, entity_id = ?, closing_day = ?, due_day = ?, credit_limit = ?, notes = ?, card_type = ? WHERE id = ?").bind(...vals, mm[1]).run();
    await env.DB.prepare("DELETE FROM card_cycles WHERE card_id = ? AND paid = 0 AND file_id IS NULL AND closing_date >= ?").bind(mm[1], new Date().toISOString().slice(0, 10)).run();
    return json({ ok: true });
  }
  if ((mm = p.match(/^\/cards\/([\w-]+)$/)) && m === "DELETE") {
    const files = (await env.DB.prepare("SELECT file_id FROM card_cycles WHERE card_id = ? AND file_id IS NOT NULL").bind(mm[1]).all()).results;
    for (const f of files) await removeFile(f.file_id);
    await env.DB.batch([env.DB.prepare("UPDATE invoices SET card_id = NULL WHERE card_id = ?").bind(mm[1]), env.DB.prepare("DELETE FROM card_cycles WHERE card_id = ?").bind(mm[1]), env.DB.prepare("DELETE FROM cards WHERE id = ?").bind(mm[1])]);
    return json({ ok: true });
  }
  if ((mm = p.match(/^\/cards\/cycles\/([\w-]+)$/)) && m === "PUT") {
    const b = await body();
    await env.DB.prepare("UPDATE card_cycles SET paid = ?, paid_on = ?, amount = ? WHERE id = ?").bind(b.paid ? 1 : 0, b.paid ? isoDate(b.paid_on) || new Date().toISOString().slice(0, 10) : null, num(b.amount), mm[1]).run();
    return json({ ok: true });
  }
  if ((mm = p.match(/^\/cards\/cycles\/([\w-]+)\/file$/)) && m === "POST") {
    const fd = await req.formData();
    const cyc = await env.DB.prepare("SELECT file_id FROM card_cycles WHERE id = ?").bind(mm[1]).first();
    if (!cyc) return fail("Ciclo no encontrado.", 404);
    const fileId = await storeFile(env, user, fd.get("file"), fd.get("original_size"));
    if (cyc.file_id) await removeFile(cyc.file_id);
    await env.DB.prepare("UPDATE card_cycles SET file_id = ? WHERE id = ?").bind(fileId, mm[1]).run();
    return json({ ok: true });
  }

  // Aprobaciones de marca y categoría
  if (p === "/approvals" && m === "GET") {
    const biz = url.searchParams.get("business") || "amazon";
    const b = await env.DB.prepare("SELECT b.*, e.details FROM businesses b LEFT JOIN entities e ON e.id = b.entity_id WHERE b.id = ?").bind(biz).first();
    const det = JSON.parse(b?.details || "{}");
    const legal = det["Nombre legal"] || det["Razón social"] || "";
    const addr = det["Dirección"] || "";
    const rows = (await env.DB.prepare("SELECT * FROM brand_approvals WHERE business_id = ? ORDER BY CASE status WHEN 'por_solicitar' THEN 0 WHEN 'solicitada' THEN 1 WHEN 'aprobada' THEN 2 ELSE 3 END, brand").bind(biz).all()).results;
    const out = [];
    for (const a of rows) {
      const ids = JSON.parse(a.invoice_ids || "[]"); const invoices = [];
      for (const id of ids) {
        const inv = await env.DB.prepare("SELECT i.*, s.name AS supplier FROM invoices i LEFT JOIN suppliers s ON s.id = i.supplier_id WHERE i.id = ?").bind(id).first();
        if (inv) invoices.push(approvalCheck(inv, a, legal, addr));
      }
      out.push({ ...a, invoice_ids: ids, invoices, ready: invoices.some((i) => i.ok) });
    }
    return json({ approvals: out, legal_name: legal, address: addr });
  }
  if ((p === "/approvals" && m === "POST") || ((mm = p.match(/^\/approvals\/([\w-]+)$/)) && m === "PUT")) {
    const b = await body();
    const st = ["por_solicitar", "solicitada", "aprobada", "rechazada"].includes(b.status) ? b.status : "por_solicitar";
    if (m === "POST") {
      if (!String(b.brand || "").trim()) return fail("Escribe la marca o la categoría.");
      await env.DB.prepare("INSERT INTO brand_approvals (id, business_id, brand, category, asin, status, requested_on, decided_on, min_units, invoice_ids, notes, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
        .bind(uid(), b.business_id || "amazon", b.brand.trim(), b.category || null, b.asin || null, st, isoDate(b.requested_on), isoDate(b.decided_on), Math.max(1, parseInt(b.min_units, 10) || 10), JSON.stringify(b.invoice_ids || []), b.notes || null, now()).run();
      return json({ ok: true });
    }
    const a = await env.DB.prepare("SELECT * FROM brand_approvals WHERE id = ?").bind(mm[1]).first(); if (!a) return fail("No encontrada.", 404);
    const v = (k, d) => (b[k] !== undefined ? b[k] : d);
    await env.DB.prepare("UPDATE brand_approvals SET brand = ?, category = ?, asin = ?, status = ?, requested_on = ?, decided_on = ?, min_units = ?, invoice_ids = ?, notes = ? WHERE id = ?")
      .bind(v("brand", a.brand), v("category", a.category), v("asin", a.asin), b.status ? st : a.status, b.requested_on !== undefined ? isoDate(b.requested_on) : a.requested_on, b.decided_on !== undefined ? isoDate(b.decided_on) : a.decided_on,
        b.min_units !== undefined ? Math.max(1, parseInt(b.min_units, 10) || 10) : a.min_units, b.invoice_ids ? JSON.stringify(b.invoice_ids) : a.invoice_ids, v("notes", a.notes), mm[1]).run();
    return json({ ok: true });
  }
  if ((mm = p.match(/^\/approvals\/([\w-]+)$/)) && m === "DELETE") { await env.DB.prepare("DELETE FROM brand_approvals WHERE id = ?").bind(mm[1]).run(); return json({ ok: true }); }

  // Inventario por producto (unidades compradas según facturas y etapa del lote)
  if (p === "/inventory" && m === "GET") {
    const biz = url.searchParams.get("business") || "amazon";
    const rows = (await env.DB.prepare("SELECT i.id, i.items, i.issue_date, i.currency, COALESCE(s.name, i.supplier_name) AS supplier, l.stage, l.name AS lot FROM invoices i LEFT JOIN suppliers s ON s.id = i.supplier_id LEFT JOIN lots l ON l.id = i.lot_id WHERE i.business_id = ? AND i.kind != 'nota de crédito'").bind(biz).all()).results;
    const map = new Map();
    const where = (st) => !st || st === "comprado" || st === "etiquetado" ? "casa" : st === "enviado" || st === "recibido" ? "camino" : st === "vendiendo" ? "vendiendo" : "recuperado";
    for (const r of rows) for (const it of JSON.parse(r.items || "[]")) {
      const qty = Number(it.qty) || 0; if (!qty) continue;
      const code = String(it.upc || it.sku || "").trim();
      const key = code ? "c:" + code.replace(/\s+/g, "") : "d:" + normName(it.description || "").slice(0, 60);
      if (key === "d:") continue;
      const e = map.get(key) || { key, upc: it.upc || "", sku: it.sku || "", description: it.description || "", units: 0, cost: 0, by: { casa: 0, camino: 0, vendiendo: 0, recuperado: 0 }, suppliers: new Set(), last_date: null, invoices: new Set() };
      e.units += qty; e.cost += qty * (Number(it.unit_cost) || 0); e.by[where(r.stage)] += qty; if (r.supplier) e.suppliers.add(r.supplier); e.invoices.add(r.id);
      if (!e.description && it.description) e.description = it.description;
      if (r.issue_date && (!e.last_date || r.issue_date > e.last_date)) e.last_date = r.issue_date;
      map.set(key, e);
    }
    const items = [...map.values()].map((e) => ({ ...e, avg_cost: e.units ? e.cost / e.units : null, suppliers: [...e.suppliers], invoices: [...e.invoices] })).sort((a, z) => (z.last_date || "").localeCompare(a.last_date || ""));
    return json({ items });
  }

  // Otros movimientos de dinero de la empresa (ingresos, gastos y transferencias que no son facturas de compra)
  if (p === "/moves" && m === "GET") {
    const ent = url.searchParams.get("entity"); const from = isoDate(url.searchParams.get("from")) || "0000"; const to = isoDate(url.searchParams.get("to")) || "9999";
    const rows = (await env.DB.prepare("SELECT mv.*, c.nickname AS card, c.last4, b.name AS business, f.filename FROM money_moves mv LEFT JOIN cards c ON c.id = mv.card_id LEFT JOIN businesses b ON b.id = mv.business_id LEFT JOIN files f ON f.id = mv.file_id WHERE mv.entity_id = ? AND mv.moved_on BETWEEN ? AND ? ORDER BY mv.moved_on DESC, mv.created_at DESC").bind(ent, from, to).all()).results;
    return json({ moves: rows });
  }
  if (p === "/moves" && m === "POST") {
    const fd = await req.formData(); const g = (k) => { const v = fd.get(k); return v == null || v === "" ? null : String(v); };
    const kind = ["ingreso", "gasto", "transferencia"].includes(g("kind")) ? g("kind") : null;
    const amount = num(g("amount")); const date = isoDate(g("moved_on"));
    if (!kind || !amount || !date || !g("concept") || !["llc", "sas"].includes(g("entity_id"))) return fail("Completa tipo, fecha, monto y concepto.");
    const file = fd.get("file");
    const fileId = file && file.size ? await storeFile(env, user, file, fd.get("original_size")) : null;
    await env.DB.prepare("INSERT INTO money_moves (id, entity_id, kind, moved_on, amount, currency, concept, category, card_id, business_id, file_id, notes, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind(uid(), g("entity_id"), kind, date, Math.abs(amount), (g("currency") || "USD").toUpperCase().slice(0, 3), g("concept").slice(0, 200), g("category"), g("card_id"), g("business_id"), fileId, g("notes"), user.email, now()).run();
    return json({ ok: true });
  }
  if ((mm = p.match(/^\/moves\/([\w-]+)$/)) && m === "DELETE") {
    const mv = await env.DB.prepare("SELECT file_id FROM money_moves WHERE id = ?").bind(mm[1]).first();
    if (mv?.file_id) await removeFile(mv.file_id);
    await env.DB.prepare("DELETE FROM money_moves WHERE id = ?").bind(mm[1]).run();
    return json({ ok: true });
  }

  // Paquete para el contador: todo lo de la empresa en un período
  if (p === "/accounting" && m === "GET") {
    const ent = url.searchParams.get("entity"); const from = isoDate(url.searchParams.get("from")); const to = isoDate(url.searchParams.get("to"));
    if (!ent || !from || !to) return fail("Elige la empresa y el período.");
    const [entity, invs, pays, tax, docs, moves, cdocs] = await Promise.all([
      env.DB.prepare("SELECT * FROM entities WHERE id = ?").bind(ent).first(),
      env.DB.prepare(`SELECT i.id, i.kind, i.invoice_number, i.po_number, i.issue_date, i.due_date, i.currency, i.subtotal, i.tax, i.shipping, i.discount, i.total, i.payment_status, i.payment_method, i.status, i.items, i.card_last4,
          COALESCE(s.name, i.supplier_name) AS supplier, s.tax_id AS supplier_tax_id, b.name AS business, c.nickname AS card, c.card_type, c.network, c.last4, c.issuer, l.name AS lot, f.id AS file_id, f.filename, f.size
        FROM invoices i JOIN businesses b ON b.id = i.business_id LEFT JOIN suppliers s ON s.id = i.supplier_id LEFT JOIN cards c ON c.id = i.card_id LEFT JOIN lots l ON l.id = i.lot_id LEFT JOIN files f ON f.id = i.file_id
        WHERE b.entity_id = ? AND COALESCE(i.issue_date, substr(i.created_at,1,10)) BETWEEN ? AND ? ORDER BY COALESCE(i.issue_date, i.created_at)`).bind(ent, from, to).all(),
      env.DB.prepare("SELECT p.*, b.name AS business, l.name AS lot FROM payouts p JOIN businesses b ON b.id = p.business_id LEFT JOIN lots l ON l.id = p.lot_id WHERE b.entity_id = ? AND p.paid_on BETWEEN ? AND ? ORDER BY p.paid_on").bind(ent, from, to).all(),
      env.DB.prepare("SELECT tp.*, o.name AS obligation, o.agency, f1.filename AS return_filename, f2.filename AS payment_filename FROM tax_periods tp JOIN tax_obligations o ON o.id = tp.obligation_id LEFT JOIN files f1 ON f1.id = tp.return_file_id LEFT JOIN files f2 ON f2.id = tp.payment_file_id WHERE o.entity_id = ? AND tp.period_end >= ? AND tp.period_start <= ? ORDER BY tp.period_start").bind(ent, from, to).all(),
      env.DB.prepare("SELECT cc.*, c.nickname, c.last4, c.card_type, f.filename, f.size FROM card_cycles cc JOIN cards c ON c.id = cc.card_id JOIN files f ON f.id = cc.file_id WHERE (c.entity_id IS NULL OR c.entity_id = '' OR c.entity_id = ?) AND cc.closing_date BETWEEN ? AND ? ORDER BY cc.closing_date").bind(ent, from, to).all(),
      env.DB.prepare("SELECT mv.*, c.nickname AS card, c.last4, b.name AS business, f.filename FROM money_moves mv LEFT JOIN cards c ON c.id = mv.card_id LEFT JOIN businesses b ON b.id = mv.business_id LEFT JOIN files f ON f.id = mv.file_id WHERE mv.entity_id = ? AND mv.moved_on BETWEEN ? AND ? ORDER BY mv.moved_on").bind(ent, from, to).all(),
      env.DB.prepare("SELECT d.id, d.folder, d.title, d.issued_on, d.created_at, d.file_id, f.filename FROM company_docs d JOIN files f ON f.id = d.file_id WHERE d.entity_id = ? AND d.folder IN ('Bancarios','Fiscales','Impuestos por año') AND COALESCE(d.issued_on, substr(d.created_at,1,10)) BETWEEN ? AND ? AND d.version = (SELECT MAX(version) FROM company_docs x WHERE x.group_id = d.group_id) ORDER BY d.folder, d.issued_on").bind(ent, from, to).all(),
    ]);
    if (!entity) return fail("Empresa no encontrada.", 404);
    return json({ entity: { id: entity.id, name: entity.name }, from, to, invoices: invs.results.map((i) => ({ ...i, items: JSON.parse(i.items || "[]") })), payouts: pays.results, tax: tax.results, statements: docs.results, moves: moves.results, docs: cdocs.results });
  }

  // Lotes y pagos de Amazon
  if (p === "/lots" && m === "GET") {
    const biz = url.searchParams.get("business") || "amazon";
    const [lots, invs, pays] = await Promise.all([
      env.DB.prepare("SELECT * FROM lots WHERE business_id = ? ORDER BY created_at DESC").bind(biz).all(),
      env.DB.prepare("SELECT i.id, i.lot_id, i.invoice_number, i.title, i.issue_date, i.total, i.currency, i.items, i.card_id, s.name AS supplier, c.nickname AS card_name, c.last4 FROM invoices i LEFT JOIN suppliers s ON s.id = i.supplier_id LEFT JOIN cards c ON c.id = i.card_id WHERE i.business_id = ? AND i.lot_id IS NOT NULL").bind(biz).all(),
      env.DB.prepare("SELECT * FROM payouts WHERE business_id = ? ORDER BY paid_on DESC").bind(biz).all(),
    ]);
    const out = lots.results.map((l) => {
      const inv = invs.results.filter((i) => i.lot_id === l.id).map((i) => ({ ...i, units: JSON.parse(i.items || "[]").reduce((a, x) => a + (Number(x.qty) || 0), 0), items: undefined }));
      const pay = pays.results.filter((x) => x.lot_id === l.id);
      return { ...l, dates: JSON.parse(l.dates || "{}"), invoices: inv, payouts: pay, invested: inv.reduce((a, i) => a + (Number(i.total) || 0), 0), recovered: pay.reduce((a, x) => a + x.amount, 0), units: inv.reduce((a, i) => a + i.units, 0) };
    });
    return json({ lots: out, unassigned_payouts: pays.results.filter((x) => !x.lot_id), stages: LOT_STAGES });
  }
  if (p === "/lots" && m === "POST") {
    const b = await body(); const id = uid();
    const n = (await env.DB.prepare("SELECT COUNT(*) AS n FROM lots WHERE business_id = ?").bind(b.business_id || "amazon").first()).n + 1;
    const d = isoDate(b.date) || new Date().toISOString().slice(0, 10);
    await env.DB.prepare("INSERT INTO lots (id, business_id, name, stage, dates, notes, created_at) VALUES (?,?,?,'comprado',?,?,?)").bind(id, b.business_id || "amazon", String(b.name || "").trim() || `Lote ${n} · ${d}`, JSON.stringify({ comprado: d }), b.notes || null, now()).run();
    return json({ id });
  }
  if ((mm = p.match(/^\/lots\/([\w-]+)$/)) && m === "PUT") {
    const b = await body();
    const l = await env.DB.prepare("SELECT * FROM lots WHERE id = ?").bind(mm[1]).first(); if (!l) return fail("Lote no encontrado.", 404);
    const dates = JSON.parse(l.dates || "{}");
    if (b.stage && LOT_STAGES.includes(b.stage)) { dates[b.stage] = isoDate(b.date) || new Date().toISOString().slice(0, 10); for (const s of LOT_STAGES.slice(LOT_STAGES.indexOf(b.stage) + 1)) delete dates[s]; }
    await env.DB.prepare("UPDATE lots SET name = ?, stage = ?, dates = ?, shipment_id = ?, notes = ? WHERE id = ?").bind(b.name ?? l.name, b.stage && LOT_STAGES.includes(b.stage) ? b.stage : l.stage, JSON.stringify(dates), b.shipment_id ?? l.shipment_id, b.notes ?? l.notes, mm[1]).run();
    return json({ ok: true });
  }
  if ((mm = p.match(/^\/lots\/([\w-]+)$/)) && m === "DELETE") {
    await env.DB.batch([env.DB.prepare("UPDATE invoices SET lot_id = NULL WHERE lot_id = ?").bind(mm[1]), env.DB.prepare("UPDATE payouts SET lot_id = NULL WHERE lot_id = ?").bind(mm[1]), env.DB.prepare("DELETE FROM lots WHERE id = ?").bind(mm[1])]);
    return json({ ok: true });
  }
  if (p === "/payouts" && m === "POST") {
    const b = await body(); const amount = num(b.amount);
    if (!amount || !isoDate(b.paid_on)) return fail("Escribe la fecha y el monto del pago de Amazon.");
    await env.DB.prepare("INSERT INTO payouts (id, business_id, lot_id, paid_on, amount, notes, created_at) VALUES (?,?,?,?,?,?,?)").bind(uid(), b.business_id || "amazon", b.lot_id || null, isoDate(b.paid_on), amount, b.notes || null, now()).run();
    return json({ ok: true });
  }
  if ((mm = p.match(/^\/payouts\/([\w-]+)$/)) && m === "DELETE") { await env.DB.prepare("DELETE FROM payouts WHERE id = ?").bind(mm[1]).run(); return json({ ok: true }); }

  // Ícono de cada herramienta (se descarga una vez y se guarda)
  if (p === "/icon" && m === "GET") {
    const d = String(url.searchParams.get("d") || "").toLowerCase();
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)) return new Response("", { status: 400 });
    const key = "icons/" + d + ".png";
    let obj = await env.FILES.get(key);
    if (!obj) {
      const r = await fetch(`https://www.google.com/s2/favicons?domain=${d}&sz=128`);
      if (!r.ok) return new Response("", { status: 404 });
      const buf = await r.arrayBuffer();
      await env.FILES.put(key, buf, { httpMetadata: { contentType: r.headers.get("content-type") || "image/png" } });
      return new Response(buf, { headers: { "content-type": r.headers.get("content-type") || "image/png", "cache-control": "private, max-age=604800" } });
    }
    return new Response(obj.body, { headers: { "content-type": obj.httpMetadata?.contentType || "image/png", "cache-control": "private, max-age=604800" } });
  }

  // Casos de Amazon: paquetes de soportes con número de caso y fecha límite
  if (p === "/cases" && m === "GET") {
    const biz = url.searchParams.get("business") || "amazon";
    const rows = (await env.DB.prepare("SELECT * FROM amazon_cases WHERE business_id = ? ORDER BY CASE status WHEN 'abierto' THEN 0 WHEN 'enviado' THEN 1 ELSE 2 END, COALESCE(due_date, '9999') , created_at DESC").bind(biz).all()).results;
    return json({ cases: rows.map((c) => ({ ...c, invoice_ids: JSON.parse(c.invoice_ids || "[]"), doc_ids: JSON.parse(c.doc_ids || "[]") })) });
  }
  if ((mm = p.match(/^\/cases\/([\w-]+)$/)) && m === "GET") {
    const c = await env.DB.prepare("SELECT * FROM amazon_cases WHERE id = ?").bind(mm[1]).first();
    if (!c) return fail("Caso no encontrado.", 404);
    const ids = JSON.parse(c.invoice_ids || "[]");
    const invoices = [];
    for (const id of ids) {
      const inv = await env.DB.prepare("SELECT i.*, s.name AS supplier, cd.nickname AS card_name, cd.last4 FROM invoices i LEFT JOIN suppliers s ON s.id = i.supplier_id LEFT JOIN cards cd ON cd.id = i.card_id WHERE i.id = ?").bind(id).first();
      if (!inv) continue;
      const checks = await invoiceChecks(env, inv);
      const proof = inv.card_id && inv.issue_date ? await env.DB.prepare("SELECT closing_date FROM card_cycles WHERE card_id = ? AND closing_date >= ? AND file_id IS NOT NULL ORDER BY closing_date LIMIT 1").bind(inv.card_id, inv.issue_date).first() : null;
      invoices.push({ id: inv.id, supplier: inv.supplier || inv.supplier_name, invoice_number: inv.invoice_number, title: inv.title, issue_date: inv.issue_date, total: inv.total, currency: inv.currency, kind: inv.kind, status: inv.status, card: inv.card_id ? `${inv.card_name} •••• ${inv.last4}` : inv.card_last4 ? `•••• ${inv.card_last4} (no registrada)` : null, proof: !!proof, checks });
    }
    return json({ case: { ...c, invoice_ids: ids, doc_ids: JSON.parse(c.doc_ids || "[]") }, invoices });
  }
  if ((p === "/cases" && m === "POST") || ((mm = p.match(/^\/cases\/([\w-]+)$/)) && m === "PUT")) {
    const b = await body();
    const st = ["abierto", "enviado", "resuelto", "rechazado"].includes(b.status) ? b.status : null;
    if (m === "POST") {
      if (!String(b.title || "").trim()) return fail("Describe qué pide Amazon.");
      const id = uid();
      await env.DB.prepare("INSERT INTO amazon_cases (id, business_id, title, case_number, kind, due_date, notes, invoice_ids, doc_ids, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
        .bind(id, b.business_id || "amazon", b.title.trim(), b.case_number || null, b.kind || null, isoDate(b.due_date), b.notes || null, JSON.stringify(b.invoice_ids || []), JSON.stringify(b.doc_ids || []), now()).run();
      return json({ id });
    }
    const c = await env.DB.prepare("SELECT * FROM amazon_cases WHERE id = ?").bind(mm[1]).first(); if (!c) return fail("Caso no encontrado.", 404);
    const v = (k, d) => (b[k] !== undefined ? b[k] : d);
    await env.DB.prepare("UPDATE amazon_cases SET title = ?, case_number = ?, kind = ?, due_date = ?, notes = ?, invoice_ids = ?, doc_ids = ?, status = ?, sent_at = ?, sent_to = ? WHERE id = ?")
      .bind(v("title", c.title), v("case_number", c.case_number), v("kind", c.kind), b.due_date !== undefined ? isoDate(b.due_date) : c.due_date, v("notes", c.notes),
        b.invoice_ids ? JSON.stringify(b.invoice_ids) : c.invoice_ids, b.doc_ids ? JSON.stringify(b.doc_ids) : c.doc_ids, st || c.status, b.sent_at !== undefined ? b.sent_at : c.sent_at, v("sent_to", c.sent_to), mm[1]).run();
    return json({ ok: true });
  }
  if ((mm = p.match(/^\/cases\/([\w-]+)$/)) && m === "DELETE") { await env.DB.prepare("DELETE FROM amazon_cases WHERE id = ?").bind(mm[1]).run(); return json({ ok: true }); }

  // Accesos directos a herramientas externas (RevSeller, Keepa, Seller Central…)
  if (p === "/tools" && m === "GET") {
    const biz = url.searchParams.get("business");
    const b = await env.DB.prepare("SELECT id, kind FROM businesses WHERE id = ?").bind(biz).first();
    if (!b) return fail("Negocio no encontrado.", 404);
    const seeded = await env.DB.prepare("SELECT value FROM settings WHERE key = ?").bind("tools_seeded_" + biz).first();
    if (!seeded) {
      const preset = b.kind === "reventa" ? [
        ["Seller Central", "https://sellercentral.amazon.com/", "Tu cuenta de vendedor: inventario, envíos FBA, pagos y salud de la cuenta."],
        ["RevSeller", "https://www.revseller.com/", "Extensión de Chrome: ganancia, ROI, ventas estimadas y restricciones en cada ficha de Amazon."],
        ["Keepa", "https://keepa.com/", "Historial de precios, rango de ventas y vendedores de cada ASIN."],
        ["App Amazon Seller", "https://sell.amazon.com/tools/seller-app", "Escanear en tienda: si puedes vender el producto y quién tiene la Buy Box."],
      ] : [];
      const st = preset.map((t, i) => env.DB.prepare("INSERT INTO tool_links (id, business_id, name, url, description, sort, created_at) VALUES (?,?,?,?,?,?,?)").bind(uid(), biz, t[0], t[1], t[2], i, now()));
      st.push(env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").bind("tools_seeded_" + biz, now()));
      await env.DB.batch(st);
    }
    return json({ tools: (await env.DB.prepare("SELECT * FROM tool_links WHERE business_id = ? ORDER BY sort, name").bind(biz).all()).results });
  }
  if ((p === "/tools" && m === "POST") || ((mm = p.match(/^\/tools\/([\w-]+)$/)) && m === "PUT")) {
    const b = await body();
    let link = String(b.url || "").trim(); if (link && !/^https?:\/\//i.test(link)) link = "https://" + link;
    if (!String(b.name || "").trim() || !/^https?:\/\/[^\s]+\.[^\s]+/i.test(link)) return fail("Escribe el nombre y un enlace válido.");
    if (m === "POST") await env.DB.prepare("INSERT INTO tool_links (id, business_id, name, url, description, sort, created_at) VALUES (?,?,?,?,?,?,?)").bind(uid(), b.business_id, b.name.trim(), link, b.description || null, 100, now()).run();
    else await env.DB.prepare("UPDATE tool_links SET name = ?, url = ?, description = ? WHERE id = ?").bind(b.name.trim(), link, b.description || null, mm[1]).run();
    return json({ ok: true });
  }
  if ((mm = p.match(/^\/tools\/([\w-]+)$/)) && m === "DELETE") { await env.DB.prepare("DELETE FROM tool_links WHERE id = ?").bind(mm[1]).run(); return json({ ok: true }); }

  // Importación desde el Cerebro Amazon (solo administrador)
  if (p === "/cerebro/import" && m === "POST") {
    const b = await body();
    return json(await importCerebro(env, b, b.business_id || "amazon"));
  }

  // Hoja de escaneo
  if (p === "/scan" && m === "GET") {
    const biz = url.searchParams.get("business") || "amazon";
    const [items, logs, guide] = await Promise.all([
      env.DB.prepare("SELECT * FROM scan_items WHERE business_id = ? AND active = 1 ORDER BY sort, name").bind(biz).all(),
      env.DB.prepare("SELECT * FROM scan_logs WHERE business_id = ? ORDER BY created_at DESC LIMIT 200").bind(biz).all(),
      env.DB.prepare("SELECT value FROM settings WHERE key = ?").bind("scan_guide_" + biz).first(),
    ]);
    const g = guide ? JSON.parse(guide.value) : null;
    return json({ items: items.results, logs: logs.results.map((l) => ({ ...l, reasons: JSON.parse(l.reasons || "[]") })), guide: g?.guide || null, updated: g?.updated || null });
  }
  if (p === "/scan/logs" && m === "POST") {
    const fd = await req.formData();
    const g = (k) => { const v = fd.get(k); return v == null || v === "" ? null : String(v); };
    const biz = g("business_id") || "amazon";
    const item = g("item_id") ? await env.DB.prepare("SELECT * FROM scan_items WHERE id = ?").bind(g("item_id")).first() : null;
    const file = fd.get("photo");
    const fileId = file && file.size ? await storeFile(env, user, file, fd.get("original_size")) : null;
    const r = { can_sell: g("can_sell"), amazon_sells: g("amazon_sells"), buybox: g("buybox"), buybox_price: num(g("buybox_price")), drops: g("drops"), hazmat: g("hazmat"), size_ok: g("size_ok"), shelf_price: num(g("shelf_price")), weight: num(g("weight")) };
    const v = scanVerdict(item, r);
    const id = uid();
    await env.DB.prepare("INSERT INTO scan_logs (id, business_id, item_id, name, code, store, can_sell, amazon_sells, buybox, buybox_price, drops, hazmat, size_ok, shelf_price, limit_price, verdict, reasons, notes, file_id, user_email, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind(id, biz, item?.id || null, item?.name || g("name") || "Producto sin ficha", g("code") || item?.code || null, g("store"), r.can_sell, r.amazon_sells, r.buybox, r.buybox_price, r.drops, r.hazmat, r.size_ok, r.shelf_price, v.limit, v.verdict, JSON.stringify(v.reasons), g("notes"), fileId, user.email, now()).run();
    return json({ id, ...v });
  }
  if ((mm = p.match(/^\/scan\/logs\/([\w-]+)$/)) && m === "DELETE") {
    const l = await env.DB.prepare("SELECT file_id FROM scan_logs WHERE id = ?").bind(mm[1]).first();
    if (l?.file_id) await removeFile(l.file_id);
    await env.DB.prepare("DELETE FROM scan_logs WHERE id = ?").bind(mm[1]).run();
    return json({ ok: true });
  }
  if (p === "/scan/items" && m === "POST" || (mm = p.match(/^\/scan\/items\/([\w-]+)$/)) && m === "PUT") {
    const b = await body();
    if (!String(b.name || "").trim()) return fail("Escribe el nombre del producto.");
    const vals = [b.name, b.code || null, b.stores || null, num(b.ceiling), num(b.ceiling_app), b.ceiling_note || null, num(b.max_units), b.risk || null, SCAN_LISTS.includes(b.list) ? b.list : "prioritario", b.purpose || null];
    if (m === "POST") await env.DB.prepare("INSERT INTO scan_items (id, business_id, name, code, stores, ceiling, ceiling_app, ceiling_note, max_units, risk, list, purpose, source, sort, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'manual',500,?)").bind(uid(), b.business_id || "amazon", ...vals, now()).run();
    else await env.DB.prepare("UPDATE scan_items SET name = ?, code = ?, stores = ?, ceiling = ?, ceiling_app = ?, ceiling_note = ?, max_units = ?, risk = ?, list = ?, purpose = ?, source = 'manual', updated_at = ? WHERE id = ?").bind(...vals, now(), mm[1]).run();
    return json({ ok: true });
  }
  if ((mm = p.match(/^\/scan\/items\/([\w-]+)$/)) && m === "DELETE") {
    await env.DB.prepare("UPDATE scan_items SET active = 0 WHERE id = ?").bind(mm[1]).run();
    return json({ ok: true });
  }

  // Facturas
  if (p === "/invoices/tree") {
    const biz = url.searchParams.get("business"); const ent = url.searchParams.get("entity"); const sup = url.searchParams.get("supplier");
    const scope = ent ? "business_id IN (SELECT id FROM businesses WHERE entity_id = ?)" : "business_id = ?";
    const rows = (await env.DB.prepare(`SELECT COALESCE(issue_date, substr(created_at,1,10)) AS d, COUNT(*) AS n FROM invoices WHERE ${scope} ${sup ? "AND supplier_id = ?" : ""} GROUP BY d ORDER BY d DESC`).bind(...(sup ? [ent || biz, sup] : [ent || biz])).all()).results;
    return json({ days: rows });
  }
  if (p === "/invoices" && m === "GET") {
    const sp = url.searchParams; const where = [sp.get("entity") ? "i.business_id IN (SELECT id FROM businesses WHERE entity_id = ?)" : "i.business_id = ?"]; const args = [sp.get("entity") || sp.get("business")];
    if (sp.get("supplier")) { where.push("i.supplier_id = ?"); args.push(sp.get("supplier")); }
    const prefix = [sp.get("year"), sp.get("month"), sp.get("day")].filter(Boolean).join("-");
    if (prefix) { where.push("COALESCE(i.issue_date, substr(i.created_at,1,10)) LIKE ?"); args.push(prefix + "%"); }
    const rows = (await env.DB.prepare(`SELECT i.*, s.name AS supplier, b.name AS business, f.filename, f.mime, f.size FROM invoices i LEFT JOIN suppliers s ON s.id = i.supplier_id LEFT JOIN businesses b ON b.id = i.business_id LEFT JOIN files f ON f.id = i.file_id WHERE ${where.join(" AND ")} ORDER BY COALESCE(i.issue_date, i.created_at) DESC LIMIT 500`).bind(...args).all()).results;
    return json({ invoices: rows });
  }
  if (p === "/invoices" && m === "POST") {
    const fd = await req.formData();
    const business = fd.get("business_id");
    if (!(await env.DB.prepare("SELECT id FROM businesses WHERE id = ?").bind(business).first())) return fail("Negocio no válido.");
    const fileId = await storeFile(env, user, fd.get("file"), fd.get("original_size"));
    const id = uid();
    await env.DB.prepare("INSERT INTO invoices (id, business_id, supplier_id, file_id, kind, title, issue_date, status, card_id, lot_id, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
      .bind(id, business, fd.get("supplier_id") || null, fileId, fd.get("kind") || "factura", fd.get("title") || null, isoDate(fd.get("issue_date")), "por_revisar", fd.get("card_id") || null, fd.get("lot_id") || null, now()).run();
    return json({ id, file_id: fileId });
  }
  if ((mm = p.match(/^\/invoices\/([\w-]+)$/)) && m === "GET") {
    const inv = await env.DB.prepare("SELECT i.*, s.name AS supplier, f.filename, f.mime, f.size, f.original_size FROM invoices i LEFT JOIN suppliers s ON s.id = i.supplier_id LEFT JOIN files f ON f.id = i.file_id WHERE i.id = ?").bind(mm[1]).first();
    if (!inv) return fail("Factura no encontrada.", 404);
    return json({ invoice: { ...inv, items: JSON.parse(inv.items || "[]"), platforms: JSON.parse(inv.platforms || "[]"), confidence: JSON.parse(inv.confidence || "{}") }, checks: await invoiceChecks(env, inv), claude: !!env.ANTHROPIC_API_KEY });
  }
  if ((mm = p.match(/^\/invoices\/([\w-]+)\/extract$/)) && m === "POST") {
    const b = await body();
    const inv = await env.DB.prepare("SELECT * FROM invoices WHERE id = ?").bind(mm[1]).first();
    if (!inv) return fail("Factura no encontrada.", 404);
    if (b.image && b.image.length > 6_000_000) return fail("La imagen para leer es demasiado grande.");
    let raw;
    try { raw = b.engine === "claude" ? await extractClaude(env, b) : await extractWorkersAI(env, b); }
    catch (e) { return fail(e.message || "No se pudo leer la factura.", 502); }
    const x = cleanExtraction(raw);
    if (!x) return fail("No se pudieron leer datos de esta imagen. Llénala a mano o prueba releer.", 422);
    await env.DB.prepare("UPDATE invoices SET extracted = ?, read_by = ? WHERE id = ?").bind(JSON.stringify(x), b.engine === "claude" ? "claude" : "workers-ai", mm[1]).run();
    let supplier = null;
    if (!inv.supplier_id && x.supplier_name) {
      supplier = await findOrCreateSupplier(env, inv, x);
      if (supplier) await env.DB.prepare("UPDATE invoices SET supplier_id = ? WHERE id = ?").bind(supplier.id, mm[1]).run();
    }
    let card = null;
    if (x.payment_last4) {
      await env.DB.prepare("UPDATE invoices SET card_last4 = ? WHERE id = ?").bind(x.payment_last4, mm[1]).run();
      const c = await env.DB.prepare("SELECT id, nickname, network, last4 FROM cards WHERE last4 = ? AND active = 1").bind(x.payment_last4).all();
      if (c.results.length === 1) {
        card = c.results[0];
        if (!inv.card_id) await env.DB.prepare("UPDATE invoices SET card_id = ? WHERE id = ?").bind(card.id, mm[1]).run();
        else if (inv.card_id !== card.id) card = { ...card, mismatch: true };
      } else card = { last4: x.payment_last4, unknown: c.results.length === 0, ambiguous: c.results.length > 1 };
    }
    return json({ extracted: x, supplier, card });
  }
  const invFields = ["card_id", "lot_id", "supplier_id", "kind", "title", "invoice_number", "po_number", "issue_date", "due_date", "currency", "subtotal", "tax", "shipping", "discount", "total", "payment_status", "payment_method", "supplier_name", "supplier_address", "supplier_tax_id", "supplier_phone", "supplier_email", "supplier_website", "buyer_name", "buyer_address"];
  if ((mm = p.match(/^\/invoices\/([\w-]+)$/)) && m === "PUT") {
    if (!isAdmin) {
      const cur = await env.DB.prepare("SELECT status FROM invoices WHERE id = ?").bind(mm[1]).first();
      if (cur && cur.status === "confirmada") return fail("Solo el administrador puede editar facturas ya confirmadas.", 403);
    }
    const b = await body();
    const defaults = { kind: "factura", currency: "USD", payment_status: "pendiente" };
    const vals = invFields.map((f) => ["subtotal", "tax", "shipping", "discount", "total"].includes(f) ? num(b[f]) : ["issue_date", "due_date"].includes(f) ? isoDate(b[f]) : (b[f] ?? null) || defaults[f] || null);
    await env.DB.prepare(`UPDATE invoices SET ${invFields.map((f) => f + " = ?").join(", ")}, items = ?, platforms = ?, confidence = ?, status = ? WHERE id = ?`)
      .bind(...vals, JSON.stringify(b.items || []), JSON.stringify(b.platforms || []), JSON.stringify(b.confidence || {}), b.confirm ? "confirmada" : "por_revisar", mm[1]).run();
    let inv = await env.DB.prepare("SELECT * FROM invoices WHERE id = ?").bind(mm[1]).first();
    let supplierCreated = false;
    if (b.confirm && !inv.supplier_id && inv.supplier_name) {
      const sup = await findOrCreateSupplier(env, inv, null);
      if (sup) { await env.DB.prepare("UPDATE invoices SET supplier_id = ? WHERE id = ?").bind(sup.id, inv.id).run(); inv = { ...inv, supplier_id: sup.id }; supplierCreated = sup.created; }
    } else if (b.confirm && inv.supplier_id) {
      await env.DB.prepare("UPDATE suppliers SET email = COALESCE(NULLIF(email,''), ?), phone = COALESCE(NULLIF(phone,''), ?), website = COALESCE(NULLIF(website,''), ?), address = COALESCE(NULLIF(address,''), ?), tax_id = COALESCE(NULLIF(tax_id,''), ?) WHERE id = ?")
        .bind(inv.supplier_email, inv.supplier_phone, inv.supplier_website, inv.supplier_address, inv.supplier_tax_id, inv.supplier_id).run();
    }
    return json({ ok: true, checks: await invoiceChecks(env, inv), supplier_id: inv.supplier_id, supplier_created: supplierCreated });
  }

  // Eliminar (solo administrador)
  async function removeFile(fileId) {
    if (!fileId) return;
    const f = await env.DB.prepare("SELECT r2_key FROM files WHERE id = ?").bind(fileId).first();
    if (f) { await env.FILES.delete(f.r2_key); await env.DB.prepare("DELETE FROM files WHERE id = ?").bind(fileId).run(); }
  }
  if ((mm = p.match(/^\/invoices\/([\w-]+)$/)) && m === "DELETE") {
    if (!isAdmin) return fail("Solo el administrador puede eliminar facturas.", 403);
    const inv = await env.DB.prepare("SELECT * FROM invoices WHERE id = ?").bind(mm[1]).first();
    if (!inv) return fail("Factura no encontrada.", 404);
    await removeFile(inv.file_id);
    await env.DB.prepare("DELETE FROM invoices WHERE id = ?").bind(inv.id).run();
    return json({ ok: true, business_id: inv.business_id, supplier_id: inv.supplier_id });
  }
  if ((mm = p.match(/^\/suppliers\/([\w-]+)$/)) && m === "DELETE") {
    if (!isAdmin) return fail("Solo el administrador puede eliminar proveedores.", 403);
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM invoices WHERE supplier_id = ?").bind(mm[1]).first();
    await env.DB.batch([
      env.DB.prepare("UPDATE invoices SET supplier_id = NULL WHERE supplier_id = ?").bind(mm[1]),
      env.DB.prepare("DELETE FROM suppliers WHERE id = ?").bind(mm[1]),
      env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('backfill_suppliers_v1', ?)").bind(now()),
    ]);
    return json({ ok: true, invoices_kept: n.n });
  }
  if ((mm = p.match(/^\/docs\/([\w-]+)$/)) && m === "DELETE") {
    if (!isAdmin) return fail("Solo el administrador puede eliminar documentos.", 403);
    const d = await env.DB.prepare("SELECT group_id FROM company_docs WHERE id = ?").bind(mm[1]).first();
    if (!d) return fail("Documento no encontrado.", 404);
    const all = (await env.DB.prepare("SELECT id, file_id FROM company_docs WHERE group_id = ?").bind(d.group_id).all()).results;
    for (const v of all) await removeFile(v.file_id);
    await env.DB.prepare("DELETE FROM company_docs WHERE group_id = ?").bind(d.group_id).run();
    return json({ ok: true, versions: all.length });
  }

  // Herramientas (registros simples por negocio, p. ej. envíos FBA)
  if (p === "/records" && m === "GET") {
    const rows = (await env.DB.prepare("SELECT * FROM records WHERE business_id = ? AND tool = ? ORDER BY created_at DESC LIMIT 300").bind(url.searchParams.get("business"), url.searchParams.get("tool")).all()).results;
    return json({ records: rows.map((r) => ({ ...r, data: JSON.parse(r.data || "{}") })) });
  }
  if (p === "/records" && m === "POST") {
    const b = await body();
    await env.DB.prepare("INSERT INTO records (id, business_id, tool, data, created_at) VALUES (?,?,?,?,?)").bind(uid(), b.business_id, b.tool, JSON.stringify(b.data || {}), now()).run();
    return json({ ok: true });
  }

  // Búsqueda
  if (p === "/search") {
    const q = "%" + String(url.searchParams.get("q") || "").trim() + "%";
    if (q.length < 4) return json({ invoices: [], docs: [], suppliers: [] });
    const [inv, docs, sups] = await Promise.all([
      env.DB.prepare("SELECT i.id, i.business_id, i.invoice_number, i.title, i.issue_date, i.total, i.currency, s.name AS supplier, b.name AS business FROM invoices i LEFT JOIN suppliers s ON s.id = i.supplier_id JOIN businesses b ON b.id = i.business_id WHERE i.invoice_number LIKE ?1 OR i.title LIKE ?1 OR i.supplier_name LIKE ?1 OR s.name LIKE ?1 OR i.items LIKE ?1 OR i.po_number LIKE ?1 OR CAST(i.total AS TEXT) LIKE ?1 ORDER BY i.issue_date DESC LIMIT 25").bind(q).all(),
      env.DB.prepare("SELECT id, entity_id, title, folder, expires_on FROM company_docs WHERE title LIKE ?1 OR notes LIKE ?1 ORDER BY title LIMIT 15").bind(q).all(),
      env.DB.prepare("SELECT id, business_id, name, kind FROM suppliers WHERE name LIKE ?1 OR brands LIKE ?1 OR contact_name LIKE ?1 LIMIT 15").bind(q).all(),
    ]);
    return json({ invoices: inv.results, docs: docs.results, suppliers: sups.results });
  }

  // Envío por correo
  if (p === "/recipients" && m === "GET") return json({ recipients: (await env.DB.prepare("SELECT * FROM recipients ORDER BY created_at").all()).results });
  if (p === "/recipients" && m === "POST") {
    if (!isAdmin) return fail("Solo el administrador puede autorizar correos.", 403);
    const b = await body(); const e = normEmail(b.email);
    if (!validEmail(e)) return fail("Escribe un correo válido.");
    await env.DB.prepare("INSERT OR REPLACE INTO recipients (email, label, created_at) VALUES (?,?,?)").bind(e, b.label || "", now()).run();
    return json({ ok: true });
  }
  if ((mm = p.match(/^\/recipients\/(.+)$/)) && m === "DELETE") {
    if (!isAdmin) return fail("Solo el administrador puede quitar correos.", 403);
    await env.DB.prepare("DELETE FROM recipients WHERE email = ?").bind(normEmail(decodeURIComponent(mm[1]))).run();
    return json({ ok: true });
  }
  if (p === "/send" && m === "POST") {
    const b = await body(); const to = normEmail(b.to);
    const allowed = await env.DB.prepare("SELECT email FROM recipients WHERE email = ?").bind(to).first();
    if (!allowed) return fail("Ese correo no está autorizado para recibir documentos.", 403);
    const items = [], proofs = [], missingProof = [];
    for (const id of (b.invoice_ids || []).slice(0, 100)) {
      const r = await env.DB.prepare("SELECT i.id, i.invoice_number, i.title, i.issue_date, i.total, i.currency, i.card_id, i.card_last4, s.name AS supplier, f.id AS fid, f.r2_key, f.filename, f.mime, f.size FROM invoices i LEFT JOIN suppliers s ON s.id = i.supplier_id JOIN files f ON f.id = i.file_id WHERE i.id = ?").bind(id).first();
      if (!r) continue;
      let pay = "";
      if (b.with_payment && r.card_id) {
        const c = await env.DB.prepare("SELECT * FROM cards WHERE id = ?").bind(r.card_id).first();
        if (c) {
          pay = cardLabel(c);
          const st = r.issue_date ? await env.DB.prepare("SELECT cc.closing_date, f.id AS fid, f.r2_key, f.filename, f.mime, f.size FROM card_cycles cc JOIN files f ON f.id = cc.file_id WHERE cc.card_id = ? AND cc.closing_date >= ? ORDER BY cc.closing_date LIMIT 1").bind(c.id, r.issue_date).first() : null;
          if (st && !items.some((x) => x.fid === st.fid)) proofs.push({ kind: "estado de cuenta", id: st.fid, label: `Estado de cuenta ${c.nickname} •••• ${c.last4} (cierre ${st.closing_date})`, ...st });
          else if (!st) missingProof.push(r.invoice_number || r.title || r.issue_date || "factura");
        }
      } else if (b.with_payment && r.card_last4) pay = `Tarjeta terminada en ${r.card_last4}`;
      items.push({ kind: "factura", pay, label: [r.supplier, r.invoice_number || r.title, r.issue_date, r.total != null ? `${r.total} ${r.currency || ""}` : ""].filter(Boolean).join(" · "), ...r });
    }
    for (const id of (b.doc_ids || []).slice(0, 100)) {
      const r = await env.DB.prepare("SELECT d.id, d.title, d.issued_on, e.name AS entity, f.id AS fid, f.r2_key, f.filename, f.mime, f.size FROM company_docs d JOIN entities e ON e.id = d.entity_id JOIN files f ON f.id = d.file_id WHERE d.id = ?").bind(id).first();
      if (r) items.push({ kind: "documento", label: [r.entity, r.title, r.issued_on].filter(Boolean).join(" · "), ...r });
    }
    if (!items.length) return fail("No hay archivos para enviar.");
    items.push(...proofs);
    const batches = []; let cur = [], size = 0;
    for (const it of items) {
      if (it.size > MAX_EMAIL_BYTES) return fail(`"${it.filename}" pesa ${(it.size / 1048576).toFixed(1)} MB y el correo acepta hasta 3,5 MB por archivo. Descárgalo y súbelo directo.`);
      if ((size + it.size > MAX_EMAIL_BYTES || cur.length >= MAX_EMAIL_FILES) && cur.length) { batches.push(cur); cur = []; size = 0; }
      cur.push(it); size += it.size;
    }
    if (cur.length) batches.push(cur);
    let n = 0;
    for (const batch of batches) {
      n++;
      const subject = (b.subject || (batch.length === 1 ? batch[0].label : `${items.length} documentos de la intranet`)) + (batches.length > 1 ? ` (parte ${n} de ${batches.length})` : "");
      const attachments = [];
      for (const it of batch) {
        const obj = await env.FILES.get(it.r2_key);
        if (obj) attachments.push({ filename: it.filename, mime: it.mime, bytes: new Uint8Array(await obj.arrayBuffer()) });
      }
      const text = "Archivos enviados desde la intranet Starkum:\n\n" + batch.map((it, i) => `${i + 1}. ${it.label} (${it.filename})${it.pay ? "\n   Pagada con: " + it.pay : ""}`).join("\n") + `\n\nEnviado por ${user.email} el ${new Date().toLocaleString("es-US", { timeZone: "America/Chicago" })}.`;
      const sendId = uid();
      try {
        await sendMail(env, { to, subject, text, attachments, devNote: `adjuntos: ${attachments.map((a) => a.filename).join(", ")}` });
        await env.DB.prepare("INSERT INTO sends (id, to_email, subject, items, sent_by, sent_at, ok) VALUES (?,?,?,?,?,?,1)").bind(sendId, to, subject, JSON.stringify(batch.map((it) => ({ kind: it.kind, id: it.id, label: it.label }))), user.email, now()).run();
      } catch (e) {
        await env.DB.prepare("INSERT INTO sends (id, to_email, subject, items, sent_by, sent_at, ok, error) VALUES (?,?,?,?,?,?,0,?)").bind(sendId, to, subject, JSON.stringify(batch.map((it) => ({ kind: it.kind, id: it.id }))), user.email, now(), String(e.message || e)).run();
        return fail("No se pudo enviar el correo: " + (e.message || e), 502);
      }
    }
    return json({ ok: true, emails: batches.length, files: items.length, proofs: proofs.length, missing_proof: missingProof });
  }
  if (p === "/sends") return json({ sends: (await env.DB.prepare("SELECT * FROM sends ORDER BY sent_at DESC LIMIT 50").all()).results });

  // Accesos y ajustes
  if (p === "/users" && m === "GET") return json({ users: (await env.DB.prepare("SELECT email, name, role, active, created_at FROM users ORDER BY created_at").all()).results });
  if (p === "/users" && m === "POST") {
    if (!isAdmin) return fail("Solo el administrador puede dar acceso.", 403);
    const b = await body(); const e = normEmail(b.email);
    if (!validEmail(e)) return fail("Escribe un correo válido.");
    if (e === user.email && b.role !== "admin") return fail("No puedes quitarte el rol de administrador a ti mismo.");
    await env.DB.prepare("INSERT INTO users (email, name, role, active, created_at) VALUES (?,?,?,1,?) ON CONFLICT(email) DO UPDATE SET name = excluded.name, role = excluded.role, active = 1").bind(e, b.name || "", ROLES.includes(b.role) ? b.role : "standard", now()).run();
    return json({ ok: true });
  }
  if ((mm = p.match(/^\/users\/(.+)$/)) && m === "DELETE") {
    if (!isAdmin) return fail("Solo el administrador puede quitar accesos.", 403);
    const e = normEmail(decodeURIComponent(mm[1]));
    if (e === user.email) return fail("No puedes quitarte el acceso a ti mismo.");
    await env.DB.batch([env.DB.prepare("UPDATE users SET active = 0 WHERE email = ?").bind(e), env.DB.prepare("DELETE FROM sessions WHERE email = ?").bind(e)]);
    return json({ ok: true });
  }
  if (p === "/usage") {
    const u = await env.DB.prepare("SELECT COALESCE(SUM(size),0) AS bytes, COALESCE(SUM(original_size),0) AS original, COUNT(*) AS n FROM files").first();
    return json({ ...u, free: STORAGE_FREE_BYTES, claude: { configured: !!env.ANTHROPIC_API_KEY, ...(await claudeSpend(env)), cap: Number(env.CLAUDE_MONTHLY_CAP_USD || 2) }, ai: !!env.AI });
  }

  return fail("Ruta no encontrada.", 404);
}

async function authRoutes(req, env, url) {
  const p = url.pathname;
  if (p === "/api/auth/request" && req.method === "POST") {
    const { email } = await req.json().catch(() => ({}));
    const e = normEmail(email);
    if (!validEmail(e)) return fail("Escribe un correo válido.");
    const user = await env.DB.prepare("SELECT email FROM users WHERE email = ? AND active = 1").bind(e).first();
    if (user) {
      const prev = await env.DB.prepare("SELECT sent_at FROM login_codes WHERE email = ?").bind(e).first();
      if (prev && Date.now() - prev.sent_at < 45_000) return json({ ok: true, wait: true });
      const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
      await env.DB.prepare("INSERT OR REPLACE INTO login_codes (email, code_hash, expires_at, attempts, sent_at) VALUES (?,?,?,0,?)").bind(e, await sha256(e + ":" + code), Date.now() + 10 * 60_000, Date.now()).run();
      await sendMail(env, {
        to: e, subject: `Tu código de acceso: ${code}`,
        text: `Tu código para entrar a la intranet Starkum es ${code}.\n\nVence en 10 minutos. Si no lo pediste, ignora este correo.`,
        html: `<div style="font-family:Arial,sans-serif;font-size:15px;color:#14232b"><p>Tu código para entrar a la intranet Starkum es:</p><p style="font-size:30px;font-weight:bold;letter-spacing:6px">${code}</p><p style="color:#5b6b73">Vence en 10 minutos. Si no lo pediste, ignora este correo.</p></div>`,
        devNote: `código ${code}`,
      });
    }
    return json({ ok: true });
  }
  if (p === "/api/auth/verify" && req.method === "POST") {
    const { email, code } = await req.json().catch(() => ({}));
    const e = normEmail(email);
    const row = await env.DB.prepare("SELECT * FROM login_codes WHERE email = ?").bind(e).first();
    if (!row || row.expires_at < Date.now()) return fail("El código venció o no existe. Pide uno nuevo.", 401);
    if (row.attempts >= 5) return fail("Demasiados intentos. Pide un código nuevo.", 429);
    if ((await sha256(e + ":" + String(code || "").trim())) !== row.code_hash) {
      await env.DB.prepare("UPDATE login_codes SET attempts = attempts + 1 WHERE email = ?").bind(e).run();
      return fail("El código no coincide. Revisa el correo e inténtalo de nuevo.", 401);
    }
    const token = randomHex(32);
    await env.DB.batch([
      env.DB.prepare("DELETE FROM login_codes WHERE email = ?").bind(e),
      env.DB.prepare("INSERT INTO sessions (token_hash, email, expires_at, created_at) VALUES (?,?,?,?)").bind(await sha256(token), e, Date.now() + SESSION_DAYS * 864e5, Date.now()),
    ]);
    return json({ ok: true }, 200, { "set-cookie": sessionCookie(token, SESSION_DAYS * 86400) });
  }
  return null;
}

// ---------- aviso diario de vencimientos ----------
async function dailyDigest(env) {
  await ensureSchema(env);
  const in30 = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  const in7 = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
  const [dls, docs, invs] = await Promise.all([
    env.DB.prepare("SELECT d.title, d.due_on, e.name AS entity FROM deadlines d LEFT JOIN entities e ON e.id = d.entity_id WHERE d.done = 0 AND d.due_on <= ? ORDER BY d.due_on").bind(in30).all(),
    env.DB.prepare("SELECT d.title, d.expires_on, e.name AS entity FROM company_docs d JOIN entities e ON e.id = d.entity_id WHERE d.expires_on IS NOT NULL AND d.expires_on <= ? AND d.version = (SELECT MAX(version) FROM company_docs x WHERE x.group_id = d.group_id) ORDER BY d.expires_on").bind(in30).all(),
    env.DB.prepare("SELECT i.invoice_number, i.due_date, i.total, s.name AS supplier FROM invoices i LEFT JOIN suppliers s ON s.id = i.supplier_id WHERE i.payment_status = 'pendiente' AND i.due_date IS NOT NULL AND i.due_date <= ? ORDER BY i.due_date").bind(in7).all(),
  ]);
  await ensureCycles(env);
  const cardsDue = (await env.DB.prepare("SELECT cc.due_date, c.nickname, c.last4 FROM card_cycles cc JOIN cards c ON c.id = cc.card_id WHERE c.active = 1 AND c.card_type != 'debito' AND cc.paid = 0 AND cc.due_date <= ? AND cc.closing_date <= ? ORDER BY cc.due_date").bind(in7, new Date().toISOString().slice(0, 10)).all()).results;
  const cases = (await env.DB.prepare("SELECT title, case_number, due_date FROM amazon_cases WHERE status = 'abierto' AND due_date IS NOT NULL AND due_date <= ? ORDER BY due_date").bind(in7).all()).results;
  const tax = (await env.DB.prepare("SELECT tp.label, tp.due_date, o.name FROM tax_periods tp JOIN tax_obligations o ON o.id = tp.obligation_id WHERE o.active = 1 AND tp.status = 'pendiente' AND tp.due_date <= ? ORDER BY tp.due_date").bind(in30).all()).results;
  const today = new Date().toISOString().slice(0, 10);
  const lines = [
    ...tax.map((t) => `• ${t.due_date} — ${t.due_date < today ? "VENCIDA: " : ""}presentar ${t.name} (${t.label})`),
    ...cases.map((c) => `• ${c.due_date} — responder a Amazon: ${c.title}${c.case_number ? " (caso " + c.case_number + ")" : ""}`),
    ...cardsDue.map((c) => `• ${c.due_date} — ${c.due_date < today ? "VENCIDO: " : ""}pagar el TOTAL de la tarjeta ${c.nickname} •••• ${c.last4} (no solo el mínimo)`),
    ...dls.results.map((d) => `• ${d.due_on} — ${d.title}${d.entity ? " (" + d.entity + ")" : ""}`),
    ...docs.results.map((d) => `• ${d.expires_on} — vence ${d.title} (${d.entity})`),
    ...invs.results.map((i) => `• ${i.due_date} — pagar factura ${i.invoice_number || ""} de ${i.supplier || "proveedor"}${i.total != null ? " por " + i.total : ""}`),
  ];
  const admin = normEmail(env.ADMIN_EMAIL);
  if (!lines.length || !admin) return;
  await sendMail(env, { to: admin, subject: `Intranet Starkum: ${lines.length} fecha(s) próxima(s)`, text: "Próximos vencimientos:\n\n" + lines.join("\n") + "\n\nRevísalos en la intranet." });
}

// ---------- logo ----------
async function serveLogo(env) {
  let obj = await env.FILES.get("brand/logo.png");
  if (!obj) {
    const r = await fetch(env.LOGO_URL || LOGO_URL);
    if (!r.ok) return new Response("", { status: 404 });
    const buf = await r.arrayBuffer();
    await env.FILES.put("brand/logo.png", buf, { httpMetadata: { contentType: r.headers.get("content-type") || "image/png" } });
    return new Response(buf, { headers: { "content-type": r.headers.get("content-type") || "image/png", "cache-control": "public, max-age=86400" } });
  }
  return new Response(obj.body, { headers: { "content-type": obj.httpMetadata?.contentType || "image/png", "cache-control": "public, max-age=86400" } });
}

// ---------- página ----------
const SECURITY_HEADERS = {
  "x-frame-options": "DENY", "referrer-policy": "same-origin", "x-content-type-options": "nosniff",
  "strict-transport-security": "max-age=31536000",
  "content-security-policy": "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; worker-src 'self' blob: https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; frame-src 'self' blob:; object-src 'self'; connect-src 'self'",
};

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    try {
      await ensureSchema(env);
      if (url.pathname === "/logo.png") return await serveLogo(env);
      if (url.pathname.startsWith("/api/")) {
        if (req.method !== "GET" && req.headers.get("origin") && new URL(req.headers.get("origin")).host !== url.host) return fail("Origen no permitido.", 403);
        const auth = await authRoutes(req, env, url);
        if (auth) return auth;
        const user = await currentUser(req, env);
        if (!user) return fail("Inicia sesión.", 401);
        const fm = url.pathname.match(/^\/api\/files\/([\w-]+)$/);
        if (fm) return serveFile(env, fm[1], url.searchParams.get("download") === "1");
        return await api(req, env, url, user);
      }
      return new Response(APP_HTML, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", ...SECURITY_HEADERS } });
    } catch (e) {
      console.error(e);
      return fail("Error interno: " + (e.message || e), 500);
    }
  },
  async scheduled(_event, env, ctx) { ctx.waitUntil(dailyDigest(env)); },
};
