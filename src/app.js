(() => {
"use strict";
// ---------- utilidades ----------
const $root = document.getElementById("root");
const MONTHS = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const MON = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
const STATUS_BIZ = { activo: ["Activo", "ok"], pausa: ["En pausa", "warn"], cerrado: ["Cerrado", ""] };
const PLAT_ST = { sin_cuenta: ["Sin cuenta", ""], por_conectar: ["Por conectar", "warn"], conectada: ["Conectada", "ok"] };
const SUP_ST = { investigar: ["Por investigar", "warn"], listo: ["Listo para contactar", "ok"], contactado: ["Contactado", "info"], activo: ["Cuenta abierta", "ok"], no_enviar: ["No contactar aún", "bad"], descartado: ["Descartado", ""] };
const AMZ_POL = { permite: ["Permite Amazon", "ok"], condicional: ["Amazon con condiciones", "warn"], pendiente: ["Política de Amazon sin confirmar", "warn"], prohibe: ["Prohíbe Amazon", "bad"] };
const RISK = { bajo: ["Riesgo de bloqueo bajo", "ok"], medio: ["Riesgo de bloqueo medio", "warn"], alto: ["Riesgo de bloqueo alto", "bad"] };
const TOOLS = {
  reventa: [["calculadora", "Calculadora FBA", "Ganancia, margen, ROI y precio mínimo"], ["envios", "Envíos FBA", "Lotes preparados y enviados a bodega"]],
  tienda: [["registro", "Registro de pedidos", "Pedidos, costos y estado mientras se conecta la tienda"]],
  general: [["registro", "Registro de ventas", "Ventas, costos y movimientos del negocio"]],
};

function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "html") el.innerHTML = v;
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, v);
  }
  for (const c of kids.flat(Infinity)) if (c !== null && c !== undefined && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
}
const money = (v, cur = "USD") => v === null || v === undefined || v === "" ? "—" : Number(v).toLocaleString("es-US", { style: "currency", currency: cur || "USD", maximumFractionDigits: 2 });
const fdate = (d) => { if (!d) return "—"; const [y, m, dd] = d.slice(0, 10).split("-"); return `${Number(dd)} ${MON[Number(m) - 1]} ${y}`; };
const bytes = (n) => n < 1024 ? n + " B" : n < 1048576 ? (n / 1024).toFixed(0) + " KB" : n < 1073741824 ? (n / 1048576).toFixed(1) + " MB" : (n / 1073741824).toFixed(2) + " GB";
const ext = (f) => (f || "").split(".").pop().toUpperCase().slice(0, 4) || "ARCH";
// El PNG del sitio trae margen y el texto "STARKUM HOLDINGS LLC" debajo: se recorta solo el ícono (x 103–197, y 25–99 de 300×163)
// Emblema Starkum (Holdings y Group unidos por una órbita). En fondos oscuros va sobre una placa clara.
function logo(tone, size = 40) {
  return h("span", { class: "emblem " + (tone || ""), "aria-hidden": "true" },
    h("img", { src: "/brand/emblem.svg", alt: "", style: `height:${size}px;width:${Math.round(size * 200 / 110)}px` }));
}
function holdingsIcon(tone, size = 40) {
  const k = size / 94;
  return h("span", { class: "logo " + (tone || ""), style: `width:${size}px;height:${Math.round(74 * k)}px`, "aria-hidden": "true" },
    h("img", { src: "/logo.png", alt: "", style: `width:${Math.round(300 * k)}px;height:${Math.round(163 * k)}px;left:${-Math.round(103 * k)}px;top:${-Math.round(25 * k)}px` }));
}
function entityLogo(e, size = 72) {
  const box = h("span", { class: "entlogo", style: `width:${size}px;height:${size}px`, "aria-hidden": "true" });
  if (e.id === "personal") { box.innerHTML = `<svg viewBox="0 0 48 48" width="${Math.round(size * 0.62)}" height="${Math.round(size * 0.62)}"><defs><linearGradient id="pg${size}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9aa5ac"/><stop offset="1" stop-color="#3f6f57"/></linearGradient></defs><circle cx="24" cy="16" r="9" fill="url(#pg${size})"/><path d="M6 44c1.5-10 9-15 18-15s16.5 5 18 15" fill="url(#pg${size})"/></svg>`; return box; }
  const fallback = () => box.replaceChildren(holdingsIcon("", Math.round(size * 0.78)));
  const img = h("img", { src: `/api/entities/${e.id}/logo?v=${state.logoV || 0}`, alt: "", onerror: fallback });
  box.append(img);
  return box;
}
// Enlace al sitio web de la empresa (dato "Sitio web" de la empresa)
function entityWeb(e, style = "") {
  const raw = String(e?.details?.["Sitio web"] || "").trim();
  if (!raw) return "";
  const href = /^https?:/i.test(raw) ? raw : "https://" + raw;
  let host = raw; try { host = new URL(href).hostname.replace(/^www\./, ""); } catch { /* texto tal cual */ }
  return h("a", { href, target: "_blank", rel: "noopener", class: "weblink", style }, host, " ↗");
}
function pill(label, cls) { return h("span", { class: "pill " + (cls || "") }, label); }
function toast(msg, err) {
  const t = h("div", { class: "toast" + (err ? " err" : ""), role: "status" }, msg);
  document.body.append(t); setTimeout(() => t.remove(), err ? 5500 : 3000);
}
async function api(path, opts = {}) {
  const o = { method: opts.method || "GET", headers: {}, credentials: "same-origin" };
  if (opts.body instanceof FormData) o.body = opts.body;
  else if (opts.body !== undefined) { o.body = JSON.stringify(opts.body); o.headers["content-type"] = "application/json"; }
  const res = await fetch("/api" + path, o);
  const v = res.headers.get("x-app-version");
  if (v && v !== APP_VERSION) state.stale = true;
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !path.startsWith("/auth")) { state.user = null; renderLogin(); throw new Error("Inicia sesión."); }
  if (!res.ok) throw new Error(data.error || "Algo falló. Inténtalo de nuevo.");
  return data;
}
async function busy(btn, fn) {
  const label = btn.textContent; btn.disabled = true; btn.replaceChildren(h("span", { class: "spinner", "aria-hidden": "true" }), " Un momento…");
  try { return await fn(); } catch (e) { toast(e.message, true); } finally { btn.disabled = false; btn.textContent = label; }
}
const state = { user: null, businesses: [], entities: [], stale: false, entity: null };
function setEntity(id) { state.entity = id || null; try { id ? localStorage.setItem("empresa", id) : localStorage.removeItem("empresa"); } catch { /* sin almacenamiento */ } }
const APP_VERSION = "__APP_VERSION__";
const ROLE_LABEL = { admin: "Administrador", standard: "Usuario estándar", viewer: "Solo consulta" };
const ROLE_HELP = { admin: "Puede hacer todo: editar, eliminar, dar accesos.", standard: "Ve todo, sube facturas y documentos, revisa lo que sube y envía a correos autorizados. No edita ni elimina.", viewer: "Solo ve y descarga. No sube ni cambia nada." };

// ---------- login ----------
function renderLogin(stepEmail) {
  const box = h("div", { class: "box" });
  if (!stepEmail) {
    const email = h("input", { id: "login-email", type: "email", autocomplete: "email", required: true, placeholder: "tucorreo@starkumholdings.com" });
    const btn = h("button", { class: "btn primary", type: "submit" }, "Enviarme un código");
    box.append(h("div", { class: "mark" }, logo("auto", 44), h("span", null, "Starkum")), h("h1", null, "Entrar a la intranet"),
      h("p", { class: "muted", style: "margin:0" }, "Escribe tu correo de Starkum. Te enviaremos un código de un solo uso."),
      h("form", { class: "stack", onsubmit: (e) => { e.preventDefault(); busy(btn, async () => { await api("/auth/request", { method: "POST", body: { email: email.value } }); renderLogin(email.value.trim().toLowerCase()); }); } },
        h("label", { class: "field", for: "login-email" }, "Correo", email), btn));
    setTimeout(() => email.focus(), 50);
  } else {
    const code = h("input", { id: "login-code", inputmode: "numeric", autocomplete: "one-time-code", maxlength: "6", pattern: "[0-9]{6}", required: true, placeholder: "000000", style: "font-family:var(--f-m);font-size:24px;letter-spacing:8px;text-align:center" });
    const btn = h("button", { class: "btn primary", type: "submit" }, "Entrar");
    box.append(h("div", { class: "mark" }, logo("auto", 44), h("span", null, "Starkum")), h("h1", null, "Revisa tu correo"),
      h("p", { class: "muted", style: "margin:0" }, "Si ", h("b", null, stepEmail), " tiene acceso, le llegó un código de 6 dígitos. Vence en 10 minutos."),
      h("form", { class: "stack", onsubmit: (e) => { e.preventDefault(); busy(btn, async () => { await api("/auth/verify", { method: "POST", body: { email: stepEmail, code: code.value } }); await boot(); }); } },
        h("label", { class: "field", for: "login-code" }, "Código", code), btn,
        h("button", { class: "linkbtn", type: "button", onclick: () => renderLogin() }, "Usar otro correo o pedir otro código")));
    setTimeout(() => code.focus(), 50);
  }
  $root.replaceChildren(h("div", { class: "login" }, box));
}

// ---------- estructura ----------
function shell(content, active) {
  const ent = state.entities.find((e) => e.id === state.entity);
  const a = (href, key, label, cls = "") => h("a", { href, class: (active === key ? "on " : "") + cls }, label);
  const nav = h("nav", { class: "side", id: "side", "aria-label": "Menú principal" },
    h("a", { class: "brand", href: "#/" }, logo("light", 30), h("span", { class: "brandtext" }, h("b", null, "Starkum"), h("span", null, "Intranet"))),
    ent && ent.id === "personal" ? [
      h("div", { class: "navgroup" }, h("span", { class: "label" }, "Personal"),
        h("a", { href: "#/", class: "entswitch", title: "Volver a elegir" }, h("b", null, "Mis finanzas"), h("span", null, "Cambiar de espacio")),
        PTABS.map(([k, l]) => a(`#/personal/${k}`, `personal-${k}`, l)))
    ] : ent ? [
      h("div", { class: "navgroup" }, h("span", { class: "label" }, "Empresa"),
        h("a", { href: "#/", class: "entswitch", title: "Volver a elegir empresa" }, h("b", null, ent.name), h("span", null, "Cambiar de empresa")),
        a(`#/empresa/${ent.id}`, `empresa-${ent.id}-inicio`, "Inicio"),
        a(`#/empresa/${ent.id}/documentos`, `empresa-${ent.id}-documentos`, "Documentos"),
        a(`#/empresa/${ent.id}/proveedores`, `empresa-${ent.id}-proveedores`, "Proveedores"),
        a(`#/empresa/${ent.id}/tarjetas`, `empresa-${ent.id}-tarjetas`, "Tarjetas"),
        a(`#/empresa/${ent.id}/suscripciones`, `empresa-${ent.id}-suscripciones`, "Suscripciones"),
        a(`#/empresa/${ent.id}/contador`, `empresa-${ent.id}-contador`, "Para el contador")),
      h("div", { class: "navgroup" }, h("span", { class: "label" }, "Negocios"),
        state.businesses.filter((b) => b.entity_id === ent.id).map((b) => a("#/negocio/" + b.id, "negocio-" + b.id, b.name)),
        h("a", { href: "#/nuevo-negocio", class: "add only-admin" }, "+ Agregar negocio"),
        a("#/plataformas", "plataformas", "Plataformas"))
    ] : [
      h("div", { class: "navgroup" }, a("#/", "inicio", "Elegir empresa"))
    ],
    h("div", { class: "navgroup" }, a("#/ajustes", "ajustes", "Accesos y ajustes")),
    h("div", { class: "who" }, h("b", null, state.user.name || "Mi cuenta"), h("span", null, state.user.email), h("span", null, ROLE_LABEL[state.user.role] || ""),
      h("button", { type: "button", onclick: async () => { await api("/auth/logout", { method: "POST" }); state.user = null; renderLogin(); } }, "Cerrar sesión")));
  nav.addEventListener("click", (e) => { if (e.target.tagName === "A") nav.classList.remove("open"); });
  const top = h("div", { class: "topbar" }, h("span", { class: "row", style: "gap:8px" }, logo("light", 22), h("b", null, "Starkum")), h("button", { type: "button", "aria-controls": "side", onclick: () => nav.classList.toggle("open") }, "Menú"));
  $root.replaceChildren(h("div", { class: "app" }, nav, h("div", { style: "flex:1;min-width:0" }, top, h("main", { id: "main" }, content))));
  window.scrollTo(0, 0);
}
function searchBox(value) {
  const inp = h("input", { id: "buscar", type: "search", value: value || "", placeholder: "Factura, monto, UPC, proveedor, documento…" });
  return h("form", { role: "search", style: "flex:0 1 380px;min-width:0", onsubmit: (e) => { e.preventDefault(); if (inp.value.trim()) location.hash = "#/buscar?q=" + encodeURIComponent(inp.value.trim()); } },
    h("label", { class: "field", for: "buscar" }, "Buscar en toda la intranet", inp));
}
function loading() { return h("div", { class: "page" }, h("p", { class: "muted" }, h("span", { class: "spinner", "aria-hidden": "true" }), " Cargando…")); }

// ---------- modal ----------
function modal(title, build, onSubmit, submitLabel = "Guardar") {
  const dlg = h("dialog");
  const err = h("p", { class: "small", style: "color:var(--bad);margin:0", role: "alert" });
  const btn = h("button", { class: "btn primary", type: "submit" }, submitLabel);
  const form = h("form", { method: "dialog", onsubmit: async (e) => {
    e.preventDefault(); err.textContent = "";
    btn.disabled = true;
    try { await onSubmit(new FormData(form), form); dlg.close(); } catch (x) { err.textContent = x.message; } finally { btn.disabled = false; }
  } }, h("h2", null, title), build(), err,
    h("div", { class: "row", style: "justify-content:flex-end" }, h("button", { class: "btn", type: "button", onclick: () => dlg.close() }, "Cancelar"), btn));
  dlg.append(form); document.body.append(dlg);
  dlg.addEventListener("close", () => dlg.remove());
  dlg.showModal();
  return dlg;
}
const fld = (label, input) => h("label", { class: "field" }, label, input);
function confirmDelete(title, message, onYes) {
  const dlg = modal(title, () => h("p", { style: "margin:0" }, message), async () => { await onYes(); }, "Eliminar");
  const b = dlg.querySelector("[type=submit]"); b.classList.add("danger");
}
const isAdmin = () => state.user && state.user.role === "admin";

// ---------- compresión y lectura ----------
let pdfjsPromise = null;
function loadPdfJs() {
  if (!pdfjsPromise) pdfjsPromise = new Promise((ok, ko) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"; ok(window.pdfjsLib); };
    s.onerror = () => ko(new Error("No se pudo cargar el lector de PDF."));
    document.head.append(s);
  });
  return pdfjsPromise;
}
function loadImage(file) {
  return new Promise((ok, ko) => { const url = URL.createObjectURL(file); const img = new Image(); img.onload = () => { URL.revokeObjectURL(url); ok(img); }; img.onerror = () => ko(new Error("No se pudo abrir la imagen.")); img.src = url; });
}
function drawTo(source, w0, h0, maxSide) {
  const s = Math.min(1, maxSide / Math.max(w0, h0));
  const c = document.createElement("canvas"); c.width = Math.round(w0 * s); c.height = Math.round(h0 * s);
  const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(source, 0, 0, c.width, c.height);
  return c;
}
const toBlob = (c, q) => new Promise((ok) => c.toBlob(ok, "image/jpeg", q));
// Devuelve { file (para guardar), originalSize, image (dataURL para leer), text }
async function prepareUpload(file) {
  const originalSize = file.size;
  if (file.type.startsWith("image/") && !/svg/.test(file.type)) {
    const img = await loadImage(file);
    const big = drawTo(img, img.naturalWidth, img.naturalHeight, 2200);
    const blob = await toBlob(big, 0.74);
    const out = blob && blob.size < file.size ? new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" }) : file;
    const small = drawTo(img, img.naturalWidth, img.naturalHeight, 1600);
    return { file: out, originalSize, image: small.toDataURL("image/jpeg", 0.82), text: "" };
  }
  if (file.type === "application/pdf") {
    let text = "", image = null;
    try {
      const pdfjs = await loadPdfJs();
      const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
      for (let i = 1; i <= Math.min(doc.numPages, 3); i++) {
        const page = await doc.getPage(i);
        const tc = await page.getTextContent();
        text += tc.items.map((it) => it.str).join(" ") + "\n";
      }
      const page = await doc.getPage(1);
      const vp0 = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: Math.min(3, 1600 / Math.max(vp0.width, vp0.height)) });
      const c = document.createElement("canvas"); c.width = vp.width; c.height = vp.height;
      await page.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
      image = c.toDataURL("image/jpeg", 0.82);
    } catch (e) { console.warn(e); }
    return { file, originalSize, image, text: text.trim().length > 80 ? text : "" };
  }
  return { file, originalSize, image: null, text: "" };
}

// ---------- envío por correo ----------
async function sendDialog({ invoice_ids = [], doc_ids = [] }) {
  const { recipients } = await api("/recipients");
  if (!recipients.length) { toast("Primero autoriza un correo en Accesos y ajustes.", true); return; }
  const n = invoice_ids.length + doc_ids.length;
  modal(n === 1 ? "Enviar a mi correo" : `Enviar ${n} archivos`, () => h("div", { class: "stack" },
    fld("Enviar a", h("select", { name: "to" }, recipients.map((r) => h("option", { value: r.email }, (r.label ? r.label + " · " : "") + r.email)))),
    fld("Asunto (opcional)", h("input", { name: "subject", placeholder: "Por ejemplo: facturas para caso de Amazon" })),
    invoice_ids.length ? h("label", { class: "row", style: "gap:8px;align-items:flex-start" }, h("input", { type: "checkbox", name: "with_payment", checked: true, style: "width:auto;margin-top:3px" }),
      h("span", { class: "small" }, h("b", null, "Incluir el soporte de pago"), h("br"), "Agrega en el correo con qué tarjeta se pagó (red, banco, últimos 4 y titular) y adjunta el estado de cuenta de ese mes si lo subiste.")) : "",
    h("p", { class: "small muted", style: "margin:0" }, "Llegan como adjuntos. Cada correo lleva hasta 3,5 MB; si pesan más juntos, se dividen en varios correos.")),
  async (fd) => {
    const r = await api("/send", { method: "POST", body: { to: fd.get("to"), subject: fd.get("subject") || undefined, invoice_ids, doc_ids, with_payment: !!fd.get("with_payment") } });
    toast((r.emails > 1 ? `Enviado en ${r.emails} correos.` : "Enviado. Revisa tu bandeja.") + (r.proofs ? ` Incluí ${r.proofs} estado(s) de cuenta.` : "") + (r.missing_proof?.length ? ` Falta el estado de cuenta de: ${r.missing_proof.join(", ")} (súbelo en Tarjetas).` : ""), !!r.missing_proof?.length);
  }, "Enviar");
}
function fileActions(fileId, onSend) {
  return h("span", { class: "row", style: "gap:4px" },
    h("a", { class: "btn sm", href: "/api/files/" + fileId, target: "_blank", rel: "noopener" }, "Ver"),
    h("a", { class: "btn sm", href: "/api/files/" + fileId + "?download=1" }, "Descargar"),
    h("button", { class: "btn sm only-upload", type: "button", onclick: onSend }, "Enviar"));
}

// ---------- subida de facturas ----------
async function uploadInvoiceDialog(businessId, supplierId, suppliers, businesses, opts = {}) {
  const chooser = !businessId && businesses?.length ? businesses : null;
  if (!businessId) businessId = chooser ? chooser[0].id : "amazon";
  const [{ cards }, lotsRes] = await Promise.all([api("/cards"), api("/lots?business=" + businessId).catch(() => ({ lots: [] }))]);
  const openLots = (lotsRes.lots || []).filter((l) => ["comprado", "etiquetado"].includes(l.stage));
  const isSub = !!opts.subId;
  modal(isSub ? "Subir factura de " + opts.subName : opts.title || "Subir factura o escaneo", () => h("div", { class: "stack" },
    chooser ? fld("Negocio", h("select", { name: "business_id" }, chooser.map((x) => h("option", { value: x.id }, x.name)))) : "",
    fld("Archivo (foto o PDF)", h("input", { name: "file", type: "file", accept: "image/*,application/pdf", required: true })),
    isSub ? "" : fld("Proveedor", h("select", { name: "supplier_id" }, h("option", { value: "" }, supplierId === undefined || !suppliers?.length ? "Detectarlo de la factura (se crea si no existe)" : "Sin proveedor / lo elijo después"),
      (suppliers || []).map((s) => h("option", { value: s.id, selected: s.id === supplierId }, s.name)))),
    isSub ? h("input", { type: "hidden", name: "kind", value: "suscripción" }) : fld("Tipo", h("select", { name: "kind" }, ["factura", "recibo", "suscripción", "nota de crédito", "otro"].map((k) => h("option", { value: k }, k[0].toUpperCase() + k.slice(1))))),
    h("div", { class: "fgrid" }, fld("Tarjeta con que pagaste", cardSelect(cards, opts.cardId || "", "Detectarla del recibo")),
      isSub ? "" : fld("Lote", h("select", { name: "lot_id" }, h("option", { value: "" }, "Sin lote"), h("option", { value: "__new" }, "+ Nuevo lote con esta compra"), openLots.map((l) => h("option", { value: l.id }, l.name))))),
    h("p", { class: "small muted", style: "margin:0" }, isSub ? "Se lee la factura, se crea el proveedor si no existe y, si la herramienta no tenía valor ni fecha, se completan con los de esta factura." : "Las fotos se comprimen antes de subir. Después la intranet lee la factura, crea el proveedor si no existe y te muestra los datos para que los confirmes.")),
  async (fd, form) => {
    const f = fd.get("file"); if (!f || !f.size) throw new Error("Elige un archivo.");
    form.querySelector("[type=submit]").textContent = "Comprimiendo…";
    const prep = await prepareUpload(f);
    const up = new FormData();
    up.append("file", prep.file); up.append("original_size", prep.originalSize);
    if (chooser) businessId = fd.get("business_id") || businessId;
    up.append("business_id", businessId); up.append("supplier_id", fd.get("supplier_id") || ""); up.append("kind", fd.get("kind"));
    if (isSub) { up.append("sub_id", opts.subId); up.append("title", opts.subName); }
    up.append("card_id", fd.get("card_id") || "");
    let lot = isSub ? "" : fd.get("lot_id") || "";
    if (lot === "__new") lot = (await api("/lots", { method: "POST", body: { business_id: businessId } })).id;
    up.append("lot_id", lot);
    form.querySelector("[type=submit]").textContent = "Subiendo…";
    const r = await api("/invoices", { method: "POST", body: up });
    sessionStorage.setItem("read:" + r.id, JSON.stringify({ image: prep.image, text: prep.text }));
    location.hash = "#/factura/" + r.id + "?leer=1";
  }, "Subir y leer");
}

// ---------- páginas ----------
async function pageHome() {
  setEntity(null);
  shell(loading(), "inicio");
  const { entities } = await api("/entities");
  state.entities = entities.map((e) => ({ ...e, ...(state.entities.find((x) => x.id === e.id) || {}), details: e.details }));
  const page = h("div", { class: "page chooser" },
    h("div", { class: "chooserhead" }, logo("auto", 72), h("h1", null, "¿En qué empresa vas a trabajar?")),
    h("div", { class: "entpick" + (entities.length > 2 ? " three" : "") }, entities.map((e) => h("div", { class: "entwrap" }, h("a", { class: "entcard", href: e.id === "personal" ? "#/personal" : "#/empresa/" + e.id },
      entityLogo(e, 96), h("span", { class: "stack", style: "gap:4px;align-items:center;text-align:center" }, h("b", { style: "font-size:22px" }, e.name), h("span", { class: "muted" }, e.country))),
      entityWeb(e)))));
  shell(page, "inicio");
}
async function companyHome(ent) {
  const d = await api("/dashboard?entity=" + ent.id);
  state.businesses = d.all_businesses; state.entities = [...d.entities, ...state.entities.filter((e) => e.id === "personal")];
  const hour = Number(new Date().toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: "America/Chicago" }));
  const hello = hour < 12 ? "Buenos días" : hour < 19 ? "Buenas tardes" : "Buenas noches";
  const today = new Date().toLocaleDateString("es-US", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "America/Chicago" });
  const pct = Math.min(100, (d.usage.bytes / d.usage.free) * 100);
  const page = h("div", { class: "stack", style: "gap:22px" },
    h("section", { class: "stack", "aria-labelledby": "t-neg" }, h("div", { class: "row between" }, h("h2", { id: "t-neg" }, "Negocios de " + ent.name), h("button", { class: "btn sm only-admin", type: "button", onclick: () => businessDialog(null) }, "+ Agregar negocio")),
      h("div", { class: "grid g3" }, d.businesses.map((b) => {
        const st = STATUS_BIZ[b.status] || STATUS_BIZ.activo;
        return h("a", { class: "card bizcard", href: "#/negocio/" + b.id },
          h("span", { class: "top" }, h("b", null, b.name), pill(st[0], st[1])),
          h("span", { class: "small muted" }, [b.entity_name || "Sin empresa asignada", b.description].filter(Boolean).join(" · ")),
          h("span", { class: "chips" }, (TOOLS[b.kind] || TOOLS.general).map((t) => h("span", { class: "chip" }, t[1])), h("span", { class: "chip" }, "Proveedores"), h("span", { class: "chip" }, "Facturas")),
          h("span", { class: "small", style: "color:var(--accent);font-weight:700" }, `Abrir ${b.name} →`));
      }))),
    h("section", { class: "card stack", "aria-labelledby": "t-pla" },
      h("div", { class: "row between" }, h("div", null, h("h2", { id: "t-pla" }, "Plataformas"), h("span", { class: "small muted" }, "Las de " + ent.name + " y las que aún no tienen negocio")), h("a", { href: "#/plataformas", style: "font-weight:700" }, "Ver todas →")),
      h("div", { class: "grid g4" }, d.platforms.slice(0, 8).map((p) => { const st = PLAT_ST[p.status]; return h("a", { href: "#/plataformas", class: "filerow", style: "flex-direction:column;align-items:flex-start;gap:2px;color:var(--ink)" }, h("b", null, p.name), h("span", { class: "small muted" }, p.business_id ? (d.businesses.find((b) => b.id === p.business_id) || {}).name || "" : p.region), pill(st[0], st[1])); }))),
    h("div", { class: "grid g2" },
      h("section", { class: "card", "aria-labelledby": "t-emp" }, h("div", { class: "row between", style: "margin-bottom:8px" }, h("h2", { id: "t-emp" }, "Accesos rápidos"), h("a", { class: "btn primary sm", href: `#/empresa/${ent.id}/contador` }, "Descargar para el contador")),
        h("div", { class: "list" }, [["documentos", "Documentos", "Legales, fiscales, bancarios y declaraciones"], ["proveedores", "Proveedores", "Todos los de la empresa, por plataforma"], ["tarjetas", "Tarjetas", "Tarjetas y estados de cuenta"], ["contador", "Para el contador", "Excel y ZIP por mes, trimestre o año"]].map(([k, t, dsc]) => h("a", { href: `#/empresa/${ent.id}/${k}` }, h("span", { class: "stack", style: "gap:0" }, h("b", null, t), h("span", { class: "small muted" }, dsc)), "→")))),
      false && h("section", null,
        h("div", { class: "list" }, d.entities.map((e) => h("a", { href: "#/empresa/" + e.id }, h("span", { class: "stack", style: "gap:0" }, h("b", null, e.name), h("span", { class: "small muted" }, `${e.country} · ${e.docs} documento${e.docs === 1 ? "" : "s"}`)), e.issues ? pill(`${e.issues} por revisar`, "warn") : pill(e.docs ? "Al día" : "Sin documentos", e.docs ? "ok" : ""))))),
      h("section", { class: "card", "aria-labelledby": "t-ven" },
        h("div", { class: "row between", style: "margin-bottom:8px" }, h("h2", { id: "t-ven" }, "Próximos vencimientos"), h("button", { class: "linkbtn only-admin", type: "button", onclick: addDeadline }, "+ Agregar fecha")),
        d.upcoming.length ? h("div", { class: "list" }, d.upcoming.map((u) => {
          const days = Math.ceil((Date.parse(u.due_on) - Date.now()) / 864e5);
          return h("div", null, h("span", null, u.link ? h("a", { href: u.link, style: "color:var(--ink)" }, u.title) : u.title, u.entity_id ? h("span", { class: "muted" }, " · " + u.entity_id.toUpperCase()) : ""),
            h("span", { class: "row", style: "gap:8px" }, h("span", { class: "mono small", style: days < 0 ? "color:var(--bad);font-weight:700" : days <= 30 ? "color:var(--warn)" : "color:var(--muted)" }, (u.kind === "lote" ? "Desde " : days < 0 ? "Vencida · " : "") + fdate(u.due_on)),
              u.kind === "fecha" ? h("button", { class: "linkbtn small only-admin", type: "button", title: "Marcar como hecha", onclick: async () => { await api("/deadlines/" + u.id, { method: "PUT", body: { done: true } }); route(); } }, "Hecho") : ""));
        })) : h("p", { class: "empty" }, "No hay fechas próximas."))),
    h("section", { class: "card", "aria-labelledby": "t-rec" },
      h("h2", { id: "t-rec" }, "Subidos recientemente"),
      d.recent.length ? h("div", { class: "tablewrap" }, h("table", null,
        h("thead", null, h("tr", null, h("th", null, "Archivo"), h("th", null, "Dónde"), h("th", null, "Fecha del documento"), h("th", null, "Estado"))),
        h("tbody", null, d.recent.map((r) => h("tr", null, h("td", null, h("a", { href: "#/factura/" + r.id, style: "font-weight:700" }, r.invoice_number ? "Factura " + r.invoice_number : r.title || "Factura sin leer")),
          h("td", null, [r.business, r.supplier].filter(Boolean).join(" › ")), h("td", { class: "mono" }, fdate(r.issue_date)),
          h("td", null, r.status === "confirmada" ? pill("Confirmada", "ok") : pill("Por revisar", "warn"))))))) : h("p", { class: "empty" }, "Todavía no has subido facturas. Entra a un negocio y usa “Subir factura o escaneo”.")));
  return page;
}
function addDeadline() {
  modal("Agregar fecha importante", () => h("div", { class: "stack" },
    fld("Qué vence o qué hay que hacer", h("input", { name: "title", required: true, placeholder: "Por ejemplo: reporte anual de Illinois" })),
    h("div", { class: "fgrid" }, fld("Fecha", h("input", { name: "due_on", type: "date", required: true })),
      fld("Empresa", h("select", { name: "entity_id" }, h("option", { value: "" }, "General"), state.entities.map((e) => h("option", { value: e.id }, e.name))))),
    fld("Notas", h("input", { name: "notes" }))),
  async (fd) => { await api("/deadlines", { method: "POST", body: Object.fromEntries(fd) }); toast("Fecha agregada."); route(); });
}

const ENT_TABS = [["inicio", "Inicio"], ["documentos", "Documentos"], ["proveedores", "Proveedores"], ["tarjetas", "Tarjetas"], ["suscripciones", "Suscripciones"], ["contador", "Para el contador"]];
async function pageEntity(id, tab, q) {
  tab = ENT_TABS.some((t) => t[0] === tab) ? tab : "inicio";
  setEntity(id);
  const act = `empresa-${id}-${tab}`;
  shell(loading(), act);
  const [{ entities, folders }, { docs }] = await Promise.all([api("/entities"), tab === "documentos" ? api("/docs?entity=" + id) : Promise.resolve({ docs: [] })]);
  const ent = entities.find((e) => e.id === id); if (!ent) return pageNotFound();
  const folder = folders.includes(q.get("carpeta")) ? q.get("carpeta") : folders[0];
  const inFolder = docs.filter((d) => d.folder === folder);
  const head = [
    h("div", { class: "head" }, h("div", { class: "row", style: "gap:14px;align-items:center;flex-wrap:nowrap;min-width:0" }, entityLogo(ent, 56), h("div", { style: "min-width:0" }, h("span", { class: "eyebrow" }, "Empresa · " + ent.country), h("h1", null, ent.name), entityWeb(ent, "font-size:14px"))),
      tab === "inicio" ? searchBox() : "",
      tab === "documentos" ? h("button", { class: "btn primary only-upload", type: "button", onclick: () => docDialog(id, folder) }, "Subir documento") : ""),
    h("div", { class: "tabs", role: "tablist" }, ENT_TABS.map(([k, l]) => h("a", { href: `#/empresa/${id}/${k}`, class: k === tab ? "on" : "", role: "tab", "aria-selected": String(k === tab) }, l)))];
  if (tab !== "documentos") {
    const content = tab === "inicio" ? await companyHome(ent) : tab === "proveedores" ? await entitySuppliers(ent, q) : tab === "tarjetas" ? await cardsView(id) : tab === "suscripciones" ? await subsView(ent, null, q) : await accountantView(ent, q);
    shell(h("div", { class: "page" }, ...head, content), act);
    return;
  }
  const page = h("div", { class: "page" }, ...head,
    h("section", { class: "card" }, h("div", { class: "row between", style: "margin-bottom:10px" }, h("h2", null, "Datos de la empresa"), h("span", { class: "row", style: "gap:14px" }, h("button", { class: "linkbtn only-admin", type: "button", onclick: () => logoDialog(ent) }, "Cambiar logo"), h("button", { class: "linkbtn only-admin", type: "button", onclick: () => entityDialog(ent) }, "Editar"))),
      h("div", { class: "kv" }, Object.entries(ent.details).map(([k, v]) => {
        const secret = /EIN|NIT|Cuenta/i.test(k) && v;
        const b = h("b", { class: secret ? "mono" : "" }, secret ? "•".repeat(Math.max(0, String(v).length - 4)) + String(v).slice(-4) : v || "—");
        return h("div", null, h("span", null, k, secret ? [" · ", h("button", { class: "linkbtn small", type: "button", style: "padding:0", onclick: (e) => { const shown = b.dataset.shown === "1"; b.textContent = shown ? "•".repeat(Math.max(0, String(v).length - 4)) + String(v).slice(-4) : v; b.dataset.shown = shown ? "0" : "1"; e.currentTarget.textContent = shown ? "mostrar" : "ocultar"; } }, "mostrar")] : ""), b);
      }))),
    await taxSection(id),
    h("div", { class: "split" },
      h("nav", { class: "card folder stack", style: "flex:1 1 220px;max-width:280px;gap:2px", "aria-label": "Carpetas" }, h("span", { class: "eyebrow", style: "padding:0 12px 6px" }, "Carpetas"),
        folders.map((f) => h("a", { href: `#/empresa/${id}/documentos?carpeta=${encodeURIComponent(f)}`, class: f === folder ? "on" : "" }, f, h("span", null, docs.filter((d) => d.folder === f).length)))),
      h("section", { class: "card", style: "flex:3 1 520px;min-width:0" }, h("h2", null, folder),
        inFolder.length ? h("div", { class: "tablewrap" }, h("table", { style: "min-width:640px" },
          h("thead", null, h("tr", null, h("th", null, "Documento"), h("th", null, "Emitido"), h("th", null, "Vence"), h("th", null, "Estado"), h("th", null, h("span", { class: "muted" }, "Acciones")))),
          h("tbody", null, inFolder.map((d) => h("tr", null,
            h("td", null, h("b", null, d.title), h("br"), h("span", { class: "small muted" }, d.file_id ? `${ext(d.filename)} · ${bytes(d.size || 0)} · ${d.versions} versión${d.versions === 1 ? "" : "es"}` : "Sin archivo"),
              folder === "Bancarios" && d.file_id ? h("div", { class: "small", style: "margin-top:4px" }, d.card_id
                ? [pill(`${bankOf(d.card_issuer)} · ${d.card} •••• ${d.card_last4}`, "info"), isAdmin() ? h("button", { class: "linkbtn small", type: "button", style: "margin-left:6px", onclick: () => statementLinkDialog(d, id) }, "Cambiar") : ""]
                : isAdmin() ? h("button", { class: "linkbtn small", type: "button", style: "padding:0;color:var(--warn)", onclick: () => statementLinkDialog(d, id) }, "Vincular a una cuenta o tarjeta") : h("span", { class: "muted" }, "Sin cuenta vinculada")) : ""),
            h("td", { class: "mono" }, fdate(d.issued_on)), h("td", { class: "mono" }, d.expires_on ? fdate(d.expires_on) : "No vence"),
            h("td", null, pill(d.state.label, d.state.key === "vigente" ? "ok" : d.state.key === "por_vencer" ? "warn" : "bad")),
            h("td", null, h("div", { class: "stack", style: "gap:6px" }, d.file_id ? fileActions(d.file_id, () => sendDialog({ doc_ids: [d.id] })) : "",
              h("span", { class: "row", style: "gap:10px" }, h("button", { class: "linkbtn small only-upload", type: "button", onclick: () => docDialog(id, folder, d) }, "Nueva versión"),
                d.file_id ? h("button", { class: "linkbtn small only-upload", type: "button", onclick: async (e) => { e.currentTarget.textContent = "Leyendo…"; const data = await rebuildReadData({ file_id: d.file_id, filename: d.filename, mime: d.mime }); await readCompanyDoc(d.id, data); route(); } }, "Leer datos") : "", h("button", { class: "linkbtn small only-admin", type: "button", onclick: () => docEditDialog(d) }, "Editar"),
              isAdmin() ? h("button", { class: "linkbtn small", type: "button", style: "color:var(--bad)", onclick: () => confirmDelete("Eliminar documento", `Se borra “${d.title}” con todas sus versiones (${d.versions}). No se puede deshacer.`, async () => { await api("/docs/" + d.id, { method: "DELETE" }); toast("Documento eliminado."); route(); }) }, "Eliminar") : "")))))))) :
          h("p", { class: "empty" }, "No hay documentos en esta carpeta. Usa “Subir documento”."))));
  shell(page, act);
}
async function statementLinkDialog(d, entityId) {
  const { cards } = await api("/cards?entity=" + entityId);
  const fm = String(d.filename || "").match(/(20\d{2})(\d{2})(\d{2})[-_ ]?statement/i);
  const guess = fm ? `${fm[1]}-${fm[2]}-${fm[3]}` : d.issued_on || "";
  modal("Vincular estado de cuenta", () => h("div", { class: "stack" },
    h("p", { class: "small", style: "margin:0" }, h("b", null, d.title), " · ", d.filename || ""),
    h("div", { class: "fgrid" },
      fld("Cuenta o tarjeta", h("select", { name: "card_id" }, h("option", { value: "" }, "Ninguna"), byBank(cards).map(([bank, list]) => h("optgroup", { label: bank }, list.map((c) => h("option", { value: c.id, selected: d.card_id === c.id }, cardText(c))))))),
      fld("Fecha de corte del estado de cuenta", h("input", { name: "closing_date", type: "date", value: guess }))),
    h("p", { class: "small muted", style: "margin:0" }, "Es el mismo archivo para la cuenta y para la tarjeta de débito: aparece aquí y en Tarjetas, sin duplicarse. En el paquete del contador va una sola vez.")),
  async (fd) => { const r = await api(`/docs/${d.id}/link`, { method: "POST", body: { card_id: fd.get("card_id"), closing_date: fd.get("closing_date") } }); toast(r.linked ? `Vinculado a ${r.linked.card} •••• ${r.linked.last4}, corte ${fdate(r.linked.closing)}.` : "Sin cuenta vinculada."); route(); }, "Vincular");
}
const PSTATE = { pendiente: ["Pendiente", "warn"], vencida: ["Vencida", "bad"], presentada: ["Presentada", "ok"], pagada: ["Pagada", "ok"], no_aplica: ["No aplica", ""] };
async function taxSection(entityId) {
  const { obligations } = await api("/tax?entity=" + entityId);
  const add = () => modal("Agregar obligación de impuestos", () => h("div", { class: "stack" },
    fld("Nombre", h("input", { name: "name", required: true, placeholder: "Por ejemplo: Impuesto de ventas Illinois (ST-1)" })),
    h("div", { class: "fgrid" }, fld("Entidad que la exige", h("input", { name: "agency", placeholder: entityId === "llc" ? "Illinois Department of Revenue" : "DIAN" })), fld("N.º de cuenta", h("input", { name: "account_id" }))),
    h("div", { class: "fgrid" }, fld("Frecuencia", h("select", { name: "frequency" }, ["mensual", "bimestral", "trimestral", "cuatrimestral", "anual"].map((f) => h("option", { value: f, selected: f === "trimestral" }, f[0].toUpperCase() + f.slice(1))))),
      fld("Desde (fecha de inicio)", h("input", { name: "start_date", type: "date", required: true }))),
    h("div", { class: "fgrid" }, fld("Día de vencimiento", h("input", { name: "due_day", type: "number", min: "1", max: "28", value: "20" })), fld("Meses después del período", h("input", { name: "due_offset", type: "number", min: "0", max: "12", value: "1" }))),
    h("p", { class: "small muted", style: "margin:0" }, "Si subes la carta del estado o de la DIAN en Fiscales, la intranet intenta crear esto sola.")),
  async (fd) => { const b = Object.fromEntries(fd); b.entity_id = entityId; b.due_offset_months = b.due_offset; await api("/tax/obligations", { method: "POST", body: b }); toast("Obligación creada con sus períodos."); route(); }, "Crear");
  const uploadFile = (per, kind) => modal(kind === "payment" ? "Subir comprobante de pago" : "Subir declaración presentada", () => h("div", { class: "stack" },
    h("p", { class: "muted", style: "margin:0" }, per.label),
    fld("Archivo (PDF o foto)", h("input", { name: "file", type: "file", accept: "image/*,application/pdf", required: true })),
    fld("Monto pagado o declarado (opcional)", h("input", { name: "amount", type: "number", step: "0.01" }))),
  async (fd, form) => {
    const f = fd.get("file"); if (!f || !f.size) throw new Error("Elige un archivo.");
    form.querySelector("[type=submit]").textContent = "Subiendo…";
    const prep = await prepareUpload(f); fd.set("file", prep.file); fd.set("original_size", prep.originalSize); fd.set("kind", kind);
    await api(`/tax/periods/${per.id}/file`, { method: "POST", body: fd }); toast(kind === "payment" ? "Pago guardado." : "Declaración guardada."); route();
  }, "Subir");
  const edit = (per) => modal("Editar " + per.label, () => h("div", { class: "stack" },
    h("div", { class: "fgrid" }, fld("Estado", h("select", { name: "status" }, ["pendiente", "presentada", "pagada", "no_aplica"].map((k) => h("option", { value: k, selected: per.status === k }, PSTATE[k][0])))),
      fld("Presentada el", h("input", { name: "filed_on", type: "date", value: per.filed_on || "" })), fld("Monto", h("input", { name: "amount", type: "number", step: "0.01", value: per.amount ?? "" }))),
    fld("Notas", h("input", { name: "notes", value: per.notes || "" }))),
  async (fd) => { await api("/tax/periods/" + per.id, { method: "PUT", body: Object.fromEntries(fd) }); toast("Período actualizado."); route(); });
  const card = (ob) => {
    let showAll = false;
    const body = h("tbody");
    const draw = () => body.replaceChildren(...ob.periods.slice(0, showAll ? 999 : 6).map((per) => h("tr", null,
      h("td", null, h("b", null, per.label)), h("td", { class: "mono" }, fdate(per.due_date)), h("td", null, pill(...PSTATE[per.state])),
      h("td", { class: "mono" }, per.amount != null ? money(per.amount) : "—"),
      h("td", null, h("div", { class: "stack", style: "gap:4px" },
        per.return_file_id ? h("a", { href: "/api/files/" + per.return_file_id, target: "_blank", rel: "noopener", class: "small" }, "Ver declaración") : "",
        per.payment_file_id ? h("a", { href: "/api/files/" + per.payment_file_id, target: "_blank", rel: "noopener", class: "small" }, "Ver pago") : "")),
      h("td", null, h("span", { class: "row", style: "gap:8px" },
        h("button", { class: "linkbtn small only-upload", type: "button", onclick: () => uploadFile(per, "return") }, per.return_file_id ? "Cambiar declaración" : "Subir declaración"),
        h("button", { class: "linkbtn small only-upload", type: "button", onclick: () => uploadFile(per, "payment") }, "Subir pago"),
        h("button", { class: "linkbtn small only-admin", type: "button", onclick: () => edit(per) }, "Editar"))))));
    draw();
    const more = ob.periods.length > 6 ? h("button", { class: "linkbtn", type: "button", onclick: (e) => { showAll = !showAll; draw(); e.currentTarget.textContent = showAll ? "Ver menos" : `Ver los ${ob.periods.length} períodos`; } }, `Ver los ${ob.periods.length} períodos`) : "";
    const overdue = ob.periods.filter((x) => x.state === "vencida").length;
    return h("div", { class: "stack", style: "gap:8px;padding-top:10px;border-top:1px solid var(--line2)" },
      h("div", { class: "row between" }, h("div", null, h("b", null, ob.name), " ", overdue ? pill(`${overdue} vencida${overdue === 1 ? "" : "s"}`, "bad") : "", h("br"),
        h("span", { class: "small muted" }, [ob.agency, ob.account_id ? "Cuenta " + ob.account_id : "", ob.frequency[0].toUpperCase() + ob.frequency.slice(1), `vence el día ${ob.due_day}`].filter(Boolean).join(" · "))),
        h("button", { class: "linkbtn small only-admin", type: "button", style: "color:var(--bad)", onclick: () => confirmDelete("Eliminar obligación", `Se borran “${ob.name}”, sus períodos y los archivos que subiste en ellos. No se puede deshacer.`, async () => { await api("/tax/obligations/" + ob.id, { method: "DELETE" }); toast("Obligación eliminada."); route(); }) }, "Eliminar")),
      h("div", { class: "tablewrap" }, h("table", { style: "min-width:720px" }, h("thead", null, h("tr", null, ["Período", "Vence", "Estado", "Monto", "Archivos", ""].map((t) => h("th", null, t)))), body)), more);
  };
  return h("section", { class: "card stack", "aria-labelledby": "t-tax" },
    h("div", { class: "row between" }, h("div", null, h("h2", { id: "t-tax" }, "Declaraciones por período"), h("span", { class: "small muted" }, "Cada obligación con sus períodos, fechas límite, declaración y comprobante de pago")),
      h("button", { class: "btn sm only-admin", type: "button", onclick: add }, "+ Agregar obligación")),
    obligations.length ? obligations.map(card) : h("p", { class: "empty" }, entityId === "llc" ? "Sube en Fiscales la carta del Illinois Department of Revenue y la intranet crea la obligación y sus trimestres." : "Agrega aquí las obligaciones de la SAS, como IVA o retención en la fuente."));
}
function logoDialog(ent) {
  modal("Logo de " + ent.name, () => h("div", { class: "stack" }, h("div", { class: "row", style: "gap:14px;align-items:center" }, entityLogo(ent, 72), h("p", { class: "small muted", style: "margin:0" }, "Se muestra en el inicio y dentro de la empresa. Mejor PNG cuadrado con fondo transparente, hasta 2 MB.")),
    fld("Imagen", h("input", { name: "file", type: "file", accept: "image/png,image/jpeg,image/webp,image/svg+xml", required: true }))),
  async (fd) => { const up = new FormData(); up.append("file", fd.get("file")); await api(`/entities/${ent.id}/logo`, { method: "POST", body: up }); state.logoV = Date.now(); toast("Logo actualizado."); route(); }, "Guardar logo");
}
function entityDialog(ent) {
  const rows = Object.entries(ent.details);
  modal("Datos de " + ent.name, () => h("div", { class: "stack" }, rows.map(([k, v], i) => fld(k, h("input", { name: "v" + i, value: v || "" }))),
    h("div", { class: "fgrid" }, fld("Nuevo dato (nombre)", h("input", { name: "nk", placeholder: "Por ejemplo: Fecha de constitución" })), fld("Valor", h("input", { name: "nv" })))),
  async (fd) => {
    const details = {}; rows.forEach(([k], i) => { details[k] = fd.get("v" + i); });
    if (fd.get("nk")) details[fd.get("nk")] = fd.get("nv");
    await api("/entities/" + ent.id, { method: "PUT", body: { details } }); toast("Datos guardados."); route();
  });
}
function docDialog(entity, folder, prev) {
  modal(prev ? "Nueva versión de " + prev.title : "Subir documento", () => h("div", { class: "stack" },
    prev ? "" : fld("Nombre del documento (opcional)", h("input", { name: "title", placeholder: "Déjalo vacío y lo tomo del documento" })),
    prev ? "" : fld("Carpeta", h("select", { name: "folder" }, ["Legales", "Fiscales", "Bancarios", "Licencias y permisos", "Contratos", "Impuestos por año"].map((f) => h("option", { selected: f === folder }, f)))),
    fld("Archivo (PDF o foto)", h("input", { name: "file", type: "file", accept: "image/*,application/pdf", required: true })),
    h("div", { class: "fgrid" }, fld("Fecha de emisión", h("input", { name: "issued_on", type: "date" })), fld("Fecha de vencimiento (si tiene)", h("input", { name: "expires_on", type: "date" }))),
    fld("Notas", h("input", { name: "notes" }))),
  async (fd, form) => {
    const f = fd.get("file"); if (!f || !f.size) throw new Error("Elige un archivo.");
    form.querySelector("[type=submit]").textContent = "Subiendo…";
    const prep = await prepareUpload(f);
    fd.set("file", prep.file); fd.set("original_size", prep.originalSize); fd.set("entity_id", entity);
    if (prev) { fd.set("group_id", prev.group_id); fd.set("title", prev.title); fd.set("folder", prev.folder); }
    const r = await api("/docs", { method: "POST", body: fd });
    form.querySelector("[type=submit]").textContent = "Leyendo…";
    await readCompanyDoc(r.id, prep, r.auto_title);
    route();
  }, "Subir");
}
async function readCompanyDoc(docId, data, autoTitle) {
  if (!data || (!data.image && !data.text)) { toast(autoTitle ? "Documento guardado con el nombre del archivo. No pude leerlo automáticamente." : "Documento guardado. No pude leerlo automáticamente.", true); return; }
  try {
    const r = await api(`/docs/${docId}/extract`, { method: "POST", body: { image: data.image, text: data.text, auto_title: !!autoTitle } });
    const parts = [];
    if (r.title) parts.push(`lo nombré “${r.title}”`);
    if (r.filled.length) parts.push("completé " + r.filled.join(", "));
    if (r.dates.length) parts.push("tomé las fechas del documento");
    if (r.obligation?.created) parts.push(`creé “${r.obligation.name}” con sus períodos`);
    if (r.tax_return?.created) parts.push(`creé “${r.tax_return.obligation}” con sus períodos`);
    if (r.tax_return?.label) parts.push(`registré la declaración de ${r.tax_return.label} como ${r.tax_return.status}`);
    else if (r.tax_return) parts.push("no encontré el período de esta declaración");
    if (r.statement) parts.push(`lo vinculé a ${r.statement.card} •••• ${r.statement.last4} (corte ${fdate(r.statement.closing)})`);
    toast(parts.length ? "Documento guardado: " + parts.join("; ") + "." : "Documento guardado. No encontré datos nuevos para completar.");
  } catch (e) { toast("Documento guardado. " + e.message, true); }
}
function docEditDialog(d) {
  modal("Editar " + d.title, () => h("div", { class: "stack" },
    fld("Nombre", h("input", { name: "title", value: d.title, required: true })),
    fld("Carpeta", h("select", { name: "folder" }, ["Legales", "Fiscales", "Bancarios", "Licencias y permisos", "Contratos", "Impuestos por año"].map((f) => h("option", { selected: f === d.folder }, f)))),
    h("div", { class: "fgrid" }, fld("Fecha de emisión", h("input", { name: "issued_on", type: "date", value: d.issued_on || "" })), fld("Fecha de vencimiento", h("input", { name: "expires_on", type: "date", value: d.expires_on || "" }))),
    fld("Notas", h("input", { name: "notes", value: d.notes || "" }))),
  async (fd) => { await api("/docs/" + d.id, { method: "PUT", body: Object.fromEntries(fd) }); toast("Cambios guardados."); route(); });
}

async function pageBusiness(id, tab, q) {
  shell(loading(), "negocio-" + id);
  const [{ business: b, platforms, stats }, { suppliers }] = await Promise.all([api("/businesses/" + id), api("/suppliers?business=" + id)]);
  if (b.entity_id) setEntity(b.entity_id);
  const platNames = platforms.map((p) => p.name);
  const mySuppliers = suppliers.filter((s) => s.business_id === b.id || s.invoices > 0 || s.platforms.some((p) => platNames.includes(p)));
  const tabs = [["resumen", "Resumen"], ...(b.kind === "reventa" ? [["escaneo", "Hoja de escaneo"], ["lotes", "Lotes"], ["inventario", "Inventario"], ["casos", "Casos de Amazon"], ["aprobaciones", "Aprobaciones de marca"]] : []), ["herramientas", "Herramientas"], ["suscripciones", "Suscripciones"], ["proveedores", "Proveedores"], ["archivo", "Facturas y documentos"]];
  tab = tabs.some((t) => t[0] === tab) ? tab : "resumen";
  const st = STATUS_BIZ[b.status] || STATUS_BIZ.activo;
  const content = h("div", { class: "stack", style: "gap:18px" });
  const page = h("div", { class: "page" },
    h("div", { class: "head" }, h("div", null, h("span", { class: "eyebrow" }, `Negocios · ${b.entity_name || "Sin empresa asignada"}`), h("h1", null, b.name)),
      h("div", { class: "row" }, pill(st[0], st[1]), h("button", { class: "btn only-admin", type: "button", onclick: () => businessDialog(b) }, "Editar negocio"),
        h("button", { class: "btn primary only-upload", type: "button", onclick: () => uploadInvoiceDialog(id, null, suppliers) }, "Subir factura o escaneo"))),
    h("div", { class: "tabs", role: "tablist" }, tabs.map(([k, l]) => h("a", { href: `#/negocio/${id}/${k}`, class: k === tab ? "on" : "", role: "tab", "aria-selected": String(k === tab) }, l))),
    content);
  if (tab === "resumen") {
    content.append(
      h("div", { class: "grid g4" },
        h("div", { class: "card stat" }, h("span", { class: "small muted" }, "Facturas archivadas"), h("br"), h("b", null, stats.n)),
        h("div", { class: "card stat" }, h("span", { class: "small muted" }, "Total facturado (compras)"), h("br"), h("b", null, money(stats.total))),
        h("div", { class: "card stat" }, h("span", { class: "small muted" }, "Por revisar"), h("br"), h("b", null, stats.pending || 0)),
        h("div", { class: "card stat" }, h("span", { class: "small muted" }, "Proveedores"), h("br"), h("b", null, mySuppliers.length))),
      b.kind === "reventa" ? await capitalCard(b) : "",
      h("section", { class: "card" }, h("h2", null, "Plataformas de este negocio"),
        platforms.length ? h("div", { class: "list" }, platforms.map((p) => h("a", { href: "#/plataformas" }, h("b", null, p.name), pill(...PLAT_ST[p.status])))) : h("p", { class: "empty" }, "Ninguna plataforma asignada. Asígnalas en Plataformas.")),
      h("section", { class: "card" }, h("h2", null, "Herramientas"), toolGrid(b)));
  } else if (tab === "herramientas") {
    const tool = q.get("h");
    if (tool === "calculadora") content.append(fbaCalculator());
    else if (tool) content.append(await recordsTool(b, tool));
    else content.append(await toolLinks(b), h("section", { class: "card" }, h("h2", null, "Herramientas de la intranet"), toolGrid(b)));
  } else if (tab === "proveedores") {
    const names = platNames;
    content.append(suppliersList(b, mySuppliers, q, { note: h("span", { class: "small muted" }, "Solo los que surten ", names.join(" o ") || b.name, ". Todos los de la empresa están en ", h("a", { href: `#/empresa/${b.entity_id || "llc"}/proveedores` }, (b.entity_name || "la empresa") + " › Proveedores"), ".") }));
  } else if (tab === "suscripciones") {
    const ent = state.entities.find((e) => e.id === b.entity_id);
    content.append(ent ? await subsView(ent, b) : h("section", { class: "card" }, h("p", { class: "empty" }, "Asigna este negocio a una empresa (en Editar negocio) para registrar sus suscripciones.")));
  } else if (tab === "escaneo") {
    content.append(await scanView(b));
  } else if (tab === "lotes") {
    content.append(await lotsView(b));
  } else if (tab === "inventario") {
    content.append(await inventoryView(b));
  } else if (tab === "aprobaciones") {
    content.append(await approvalsView(b));
  } else if (tab === "casos") {
    content.append(await casesView(b, q.get("c")));
  } else {
    content.append(await archiveView({ scope: "business", id: b.id, base: "#/negocio/" + b.id, name: b.name }, null, q));
  }
  shell(page, "negocio-" + id);
}
async function toolLinks(b) {
  const [{ tools: own }, { subs }] = await Promise.all([api("/tools?business=" + b.id), api("/subs?general=1&business=" + b.id).catch(() => ({ subs: [] }))]);
  const key = (n) => String(n || "").toLowerCase().replace(/\W/g, "");
  const tools = [...own, ...subs.filter((x) => x.url && x.active && !own.some((t) => key(t.name) === key(x.name))).map((x) => ({ name: x.name, url: x.url, description: x.notes, sub: true, general: !x.platform_ids.length }))];
  const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
  const dlg = (t) => modal(t ? "Editar " + t.name : "Agregar herramienta", () => h("div", { class: "stack" },
    fld("Nombre", h("input", { name: "name", required: true, value: t?.name || "", placeholder: "Por ejemplo: SellerAmp" })),
    fld("Enlace", h("input", { name: "url", required: true, value: t?.url || "", placeholder: "https://…", inputmode: "url" })),
    fld("Para qué la usas (opcional)", h("input", { name: "description", value: t?.description || "" })),
    t ? h("button", { class: "btn danger sm", type: "button", style: "align-self:flex-start", onclick: () => confirmDelete("Quitar herramienta", `Se quita el acceso a ${t.name} de esta lista.`, async () => { await api("/tools/" + t.id, { method: "DELETE" }); toast("Herramienta quitada."); route(); }) }, "Quitar de la lista") : ""),
  async (fd) => { await api(t ? "/tools/" + t.id : "/tools", { method: t ? "PUT" : "POST", body: { ...Object.fromEntries(fd), business_id: b.id } }); toast("Herramienta guardada."); route(); });
  const icon = (t) => {
    const letter = h("span", { class: "toolletter" }, t.name.slice(0, 1).toUpperCase());
    const d = host(t.url);
    if (!d) return letter;
    const img = h("img", { src: "/api/icon?d=" + encodeURIComponent(d), alt: "", loading: "lazy", onerror: () => img.replaceWith(letter) });
    return img;
  };
  return h("section", { class: "card stack" },
    h("div", { class: "row between" }, h("div", null, h("h2", null, "Mis herramientas"), h("span", { class: "small muted" }, "Toca una para abrirla")),
      h("button", { class: "btn sm only-admin", type: "button", onclick: () => dlg() }, "+ Agregar")),
    tools.length ? h("div", { class: "toolgrid" }, tools.map((t) => h("div", { class: "toolwrap" },
      h("a", { class: "tooltile", href: t.url, target: "_blank", rel: "noopener", title: t.description || t.name }, h("span", { class: "toolimg" }, icon(t)), h("b", null, t.name)),
      t.sub ? h("a", { class: "tooledit only-admin", href: t.general ? `#/empresa/${b.entity_id}/suscripciones` : `#/negocio/${b.id}/suscripciones`, "aria-label": "Ver " + t.name + " en Suscripciones", title: "Se edita en Suscripciones" }, "✎") : h("button", { class: "tooledit only-admin", type: "button", "aria-label": "Editar " + t.name, onclick: () => dlg(t) }, "✎"))))
      : h("p", { class: "empty" }, "Agrega los enlaces de las herramientas que usas."));
}
function toolGrid(b) {
  const tools = TOOLS[b.kind] || TOOLS.general;
  return h("div", { class: "grid g4" }, tools.map(([k, n, d]) => h("a", { class: "card bizcard", href: `#/negocio/${b.id}/herramientas?h=${k}` }, h("b", null, n), h("span", { class: "small muted" }, d))),
    b.kind === "reventa" ? h("a", { class: "card bizcard", href: `#/negocio/${b.id}/escaneo` }, h("b", null, "Hoja de escaneo"), h("span", { class: "small muted" }, "Qué escanear en la tienda, precio máximo y registro de cada escaneo")) : "",
    h("a", { class: "card bizcard", href: `#/negocio/${b.id}/proveedores` }, h("b", null, "Proveedores"), h("span", { class: "small muted" }, "Fichas, contactos y facturas por fecha")),
    h("a", { class: "card bizcard", href: `#/negocio/${b.id}/archivo` }, h("b", null, "Facturas y documentos"), h("span", { class: "small muted" }, "Archivo por año, mes y día")));
}
function businessDialog(b) {
  modal(b ? "Editar " + b.name : "Agregar negocio", () => h("div", { class: "stack" },
    fld("Nombre", h("input", { name: "name", value: b?.name || "", required: true })),
    fld("Empresa a la que pertenece", h("select", { name: "entity_id" }, h("option", { value: "" }, "Sin empresa"), state.entities.map((e) => h("option", { value: e.id, selected: (b ? b.entity_id : state.entity) === e.id }, e.name)))),
    b ? fld("Estado", h("select", { name: "status" }, Object.entries(STATUS_BIZ).map(([k, v]) => h("option", { value: k, selected: b.status === k }, v[0])))) :
      fld("Tipo de negocio", h("select", { name: "kind" }, h("option", { value: "reventa" }, "Reventa en un marketplace (Amazon, Walmart, eBay…)"), h("option", { value: "tienda" }, "Tienda propia (Shopify, WooCommerce…)"), h("option", { value: "general" }, "Otro tipo de ecommerce"))),
    fld("Descripción corta", h("input", { name: "description", value: b?.description || "" }))),
  async (fd) => {
    const body = Object.fromEntries(fd);
    if (b) { await api("/businesses/" + b.id, { method: "PUT", body }); }
    else { const r = await api("/businesses", { method: "POST", body }); location.hash = "#/negocio/" + r.id; }
    const { businesses } = await api("/businesses"); state.businesses = businesses; toast("Negocio guardado."); route();
  });
}
function fbaCalculator() {
  const f = (name, label, value, hint) => fld(label, h("input", { name, type: "number", step: "0.01", value, inputmode: "decimal", title: hint || "" }));
  const out = h("div", { class: "grid g4" });
  const form = h("form", { class: "fgrid", oninput: calc, onsubmit: (e) => e.preventDefault() },
    f("price", "Precio de venta", "39.99"), f("cost", "Costo del producto", "16.00"), f("ref", "Comisión de Amazon %", "15"),
    f("fba", "Tarifa FBA por unidad", "5.73", "Confirma la tarifa en Seller Central"), f("inbound", "Envío a bodega por unidad", "0.60"),
    f("prep", "Preparación y etiquetas", "0.35"), f("storage", "Almacenamiento por unidad", "0.25"), f("other", "Otros costos", "0"));
  function calc() {
    const v = Object.fromEntries([...new FormData(form)].map(([k, x]) => [k, Number(x) || 0]));
    const fees = v.price * v.ref / 100 + v.fba + v.inbound + v.prep + v.storage + v.other;
    const profit = v.price - v.cost - fees;
    const margin = v.price ? profit / v.price * 100 : 0;
    const roi = v.cost ? profit / v.cost * 100 : 0;
    const fixed = v.fba + v.inbound + v.prep + v.storage + v.other + v.cost;
    const minPrice = v.ref < 100 ? fixed / (1 - v.ref / 100) : 0;
    const maxCost = v.price - fees;
    const card = (l, val, cls) => h("div", { class: "card stat" }, h("span", { class: "small muted" }, l), h("br"), h("b", { style: cls || "" }, val));
    out.replaceChildren(card("Ganancia por unidad", money(profit), profit < 0 ? "color:var(--bad)" : "color:var(--ok)"), card("Margen", margin.toFixed(1) + " %"), card("ROI", roi.toFixed(1) + " %"),
      card("Precio mínimo (sin perder)", money(minPrice)), card("Costo máximo para no perder", money(maxCost)), card("Total de tarifas", money(fees)));
  }
  setTimeout(calc);
  return h("section", { class: "card stack" }, h("h2", null, "Calculadora FBA"),
    h("p", { class: "small muted", style: "margin:0" }, "Los valores iniciales son de ejemplo. Confirma la tarifa FBA y la comisión de tu categoría en Seller Central."), form, out);
}
async function recordsTool(b, tool) {
  const name = ((TOOLS[b.kind] || TOOLS.general).find((t) => t[0] === tool) || [tool, "Registro"])[1];
  const { records } = await api(`/records?business=${b.id}&tool=${tool}`);
  const cols = tool === "envios" ? [["fecha", "Fecha", "date"], ["id_envio", "ID de envío", "text"], ["unidades", "Unidades", "number"], ["costo", "Costo de envío", "number"], ["estado", "Estado", "text"]]
    : [["fecha", "Fecha", "date"], ["detalle", "Detalle", "text"], ["monto", "Monto", "number"], ["estado", "Estado", "text"]];
  const add = () => modal("Agregar a " + name, () => h("div", { class: "fgrid" }, cols.map(([k, l, t]) => fld(l, h("input", { name: k, type: t, step: t === "number" ? "0.01" : null })))),
    async (fd) => { await api("/records", { method: "POST", body: { business_id: b.id, tool, data: Object.fromEntries(fd) } }); toast("Agregado."); route(); });
  return h("section", { class: "card stack" }, h("div", { class: "row between" }, h("h2", null, name), h("button", { class: "btn primary sm only-upload", type: "button", onclick: add }, "+ Agregar")),
    records.length ? h("div", { class: "tablewrap" }, h("table", { style: "min-width:560px" }, h("thead", null, h("tr", null, cols.map((c) => h("th", null, c[1])))),
      h("tbody", null, records.map((r) => h("tr", null, cols.map(([k, , t]) => h("td", { class: t !== "text" ? "mono" : "" }, t === "date" ? fdate(r.data[k]) : r.data[k] || "—"))))))) : h("p", { class: "empty" }, "Todavía no hay registros."));
}
function supplierDialog(target, s) {
  const plats = ["Amazon US", "Walmart", "eBay", "Etsy", "TikTok Shop", "Mercado Libre", "Shopify", "WooCommerce"];
  const sp = s?.platforms || [];
  modal(s ? "Editar " + s.name : "Agregar proveedor", () => h("div", { class: "stack" },
    h("div", { class: "fgrid" }, fld("Nombre", h("input", { name: "name", required: true, value: s?.name || "" })),
      fld("Tipo", h("select", { name: "kind" }, SUP_KINDS.map((k) => h("option", { selected: s?.kind === k }, k))))),
    h("div", { class: "fgrid" }, fld("Estado", h("select", { name: "status" }, Object.entries(SUP_ST).map(([k, v]) => h("option", { value: k, selected: (s?.status || "investigar") === k }, v[0])))),
      fld("¿Permite vender en Amazon?", h("select", { name: "amazon_policy" }, h("option", { value: "" }, "Sin dato"), Object.entries(AMZ_POL).map(([k, v]) => h("option", { value: k, selected: s?.amazon_policy === k }, v[0])))),
      fld("Riesgo de bloqueo", h("select", { name: "risk" }, h("option", { value: "" }, "Sin dato"), ["bajo", "medio", "alto"].map((k) => h("option", { value: k, selected: s?.risk === k }, k[0].toUpperCase() + k.slice(1))))),
      fld("Prioridad", h("select", { name: "priority" }, h("option", { value: "" }, "Sin dato"), ["alta", "media", "baja", "muy baja"].map((k) => h("option", { value: k, selected: s?.priority === k }, k[0].toUpperCase() + k.slice(1))))),
      fld("Ubicación", h("input", { name: "location", value: s?.location || "" }))),
    h("div", { class: "fgrid" }, fld("Contacto", h("input", { name: "contact_name", value: s?.contact_name || "" })), fld("Correo", h("input", { name: "email", type: "email", value: s?.email || "" })), fld("Teléfono", h("input", { name: "phone", value: s?.phone || "" }))),
    h("div", { class: "fgrid" }, fld("Dirección", h("input", { name: "address", value: s?.address || "" })), fld("N.º fiscal (EIN o NIT)", h("input", { name: "tax_id", value: s?.tax_id || "" }))),
    h("div", { class: "fgrid" }, fld("Sitio web", h("input", { name: "website", value: s?.website || "" })), fld("Marcas que vende", h("input", { name: "brands", value: s?.brands || "" }))),
    h("div", { class: "fgrid" }, fld("Pedido mínimo", h("input", { name: "min_order", value: s?.min_order || "" })), fld("Condiciones de pago", h("input", { name: "payment_terms", value: s?.payment_terms || "", placeholder: "Net 30, pago por adelantado…" })),
      fld("Autorización de marca", h("select", { name: "brand_auth" }, [["pendiente", "Pendiente"], ["si", "Sí, probada"], ["no", "No"]].map(([k, l]) => h("option", { value: k, selected: (s?.brand_auth || "pendiente") === k }, l))))),
    h("fieldset", null, h("legend", null, "Plataformas donde vendes lo que le compras"), h("div", { class: "chips" }, plats.map((p) => h("label", { class: "chip" }, h("input", { type: "checkbox", name: "platforms", value: p, checked: sp.includes(p) }), " " + p)))),
    fld("Notas", h("textarea", { name: "notes", rows: "2" }, s?.notes || ""))),
  async (fd) => {
    const body = Object.fromEntries(fd); body.platforms = fd.getAll("platforms"); Object.assign(body, target || {});
    if (s) await api("/suppliers/" + s.id, { method: "PUT", body }); else await api("/suppliers", { method: "POST", body });
    toast("Proveedor guardado."); route();
  });
}
const TOOL_KIND = "Herramientas/Suscripciones";
const SUP_KINDS = ["Fabricante", "Distribuidor autorizado", "Mayorista", "Liquidación", "Arbitraje", TOOL_KIND, "Otro"];
const SUP_ORDER = { listo: 0, contactado: 1, activo: 2, investigar: 3, no_enviar: 4, descartado: 5 };
function suppliersList(b, suppliers, q, ctx = {}) {
  const base = ctx.base || `#/negocio/${b.id}`;
  const f = q?.get("f") || "activos";
  const isTool = (s) => s.kind === TOOL_KIND;
  const filters = [["activos", "En juego", (s) => s.status !== "descartado" && !isTool(s)], ["herramientas", "Herramientas y suscripciones", isTool], ["borrador", "Con borrador listo", (s) => s.draft_text && !["descartado", "no_enviar"].includes(s.status)],
    ["investigar", "Por investigar", (s) => (s.status || "investigar") === "investigar"], ["contactado", "Contactados", (s) => s.status === "contactado"], ["activo", "Cuenta abierta", (s) => s.status === "activo"],
    ["no_enviar", "No contactar aún", (s) => s.status === "no_enviar"], ["descartado", "Descartados", (s) => s.status === "descartado"], ["todos", "Todos", () => true]];
  const plat = q?.get("p") || "";
  if (ctx.platforms && plat) suppliers = suppliers.filter((s) => s.platforms.includes(plat));
  const cur = filters.find((x) => x[0] === f) || filters[0];
  const list = suppliers.filter(cur[2]).sort((a, z) => (a.contact_order || 99) - (z.contact_order || 99) || (SUP_ORDER[a.status || "investigar"] - SUP_ORDER[z.status || "investigar"]) || a.name.localeCompare(z.name));
  const search = h("input", { type: "text", placeholder: "Buscar proveedor, marca o ciudad", "aria-label": "Buscar proveedor", style: "max-width:320px", oninput: (e) => {
    const t = e.target.value.toLowerCase(); grid.querySelectorAll("[data-k]").forEach((el) => { el.style.display = el.dataset.k.includes(t) ? "" : "none"; }); } });
  const grid = h("div", { class: "grid g3" }, list.map((s) => h("a", { class: "card bizcard", href: `${base}/proveedor/${s.id}`, "data-k": [s.name, s.brands, s.location, s.kind].join(" ").toLowerCase() },
    h("span", { class: "top" }, h("b", { style: "font-size:17px" }, s.contact_order && s.status !== "descartado" ? h("span", { class: "mono muted", title: "Orden de contacto sugerido por el Director" }, s.contact_order + ". ") : "", s.name), pill(...(SUP_ST[s.status || "investigar"]))),
    h("span", { class: "chips" }, s.kind === TOOL_KIND ? pill("Herramienta / suscripción", "info") : "", s.platforms.map((p) => pill(p, "info")), s.amazon_policy ? pill(...AMZ_POL[s.amazon_policy]) : "", s.risk ? pill(...RISK[s.risk]) : "", s.draft_text && s.status !== "descartado" ? pill("Borrador listo", "info") : ""),
    h("span", { class: "small muted" }, [s.location, s.kind, s.priority ? "prioridad " + s.priority : "", s.used_in ? "facturas en " + s.used_in.split(",").join(", ") : ""].filter(Boolean).join(" · ")),
    s.director_note && s.status !== "descartado" ? h("span", { class: "small" }, "Condición: " + s.director_note) : "",
    s.invoices ? h("span", { class: "small" }, `${s.invoices} factura${s.invoices === 1 ? "" : "s"} · ${money(s.year_total)} este año`) : "")));
  const fromCerebro = suppliers.find((s) => s.source_updated);
  const qs = (o) => "?" + new URLSearchParams(Object.entries({ f, p: plat, ...o }).filter(([, v]) => v)).toString();
  return h("section", { class: "card stack" }, h("div", { class: "row between" }, h("div", null, h("h2", null, ctx.title || "Proveedores de " + b.name),
      ctx.note || (fromCerebro ? h("span", { class: "small muted" }, "Estados y fichas del Cerebro Amazon, actualizado el " + fdate(fromCerebro.source_updated)) : "")),
    h("div", { class: "row", style: "gap:8px" },
      h("button", { class: "btn sm only-upload", type: "button", onclick: () => { const bz = ctx.target?.entity_id ? state.businesses.filter((x) => x.entity_id === ctx.target.entity_id) : null; if (bz && !bz.length) return toast("Primero agrega un negocio a esta empresa: cada factura se archiva en un negocio.", true); uploadInvoiceDialog(bz ? null : b.id, undefined, [], bz && bz.length ? bz : null, { title: "Agregar proveedor desde una factura" }); } }, "Desde una factura"),
      h("button", { class: "btn primary sm only-admin", type: "button", onclick: () => supplierDialog(ctx.target || { business_id: b.id }) }, "+ Agregar proveedor"))),
    ctx.platforms ? h("div", { class: "chips" }, h("span", { class: "small muted", style: "align-self:center" }, "Plataforma:"), ["", ...ctx.platforms].map((pl) => h("a", { class: "chip" + (pl === plat ? " on" : ""), href: `${base}/proveedores` + qs({ p: pl }) }, pl || "Todas"))) : "",
    h("div", { class: "chips", role: "tablist" }, filters.map(([k, l, fn]) => h("a", { class: "chip" + (k === cur[0] ? " on" : ""), href: `${base}/proveedores` + qs({ f: k }), role: "tab", "aria-selected": String(k === cur[0]) }, `${l} (${suppliers.filter(fn).length})`))),
    search, list.length ? grid : h("p", { class: "empty" }, "No hay proveedores en este filtro."));
}
// ---------- hoja de escaneo (Cerebro Amazon) ----------
const SCAN_LIST = { prioritario: ["Escanear primero", "Desde casa con la app, buscando por ASIN o UPC. Cada uno destraba una decisión."], enero: ["Lista de liquidación (enero)", "Para las visitas de liquidación. Precio máximo de etiqueta, antes de impuesto."], vigilancia: ["Solo vigilancia (riesgo medio)", "Comprar solo con la app y un tercero en la Buy Box."], no_comprar: ["No comprar", "Descartados o con riesgo medio o mayor."] };
const VERDICT = { cumple: ["Cumple los filtros", "ok"], no: ["No cumple", "bad"], incompleto: ["Faltan datos", "warn"] };
const BUYBOX = [["tercero_fba", "Otro vendedor (FBA)"], ["tercero_fbm", "Otro vendedor (envía él)"], ["amazon", "Amazon"], ["marca", "La marca"], ["nadie", "Nadie / sin oferta"]];
function quickRule(bb, w) { if (!bb || bb < 35) return null; let f = bb < 60 ? 0.33 : bb <= 100 ? 0.38 : null; if (f == null) return null; if (w && w > 2.3) f -= 0.04 * Math.ceil(w - 2.3); return Math.round(bb * f * 100) / 100; }
async function scanView(b) {
  const { items, logs, guide, updated } = await api("/scan?business=" + b.id);
  const lastBy = {}; for (const l of logs) if (l.item_id && !lastBy[l.item_id]) lastBy[l.item_id] = l;
  const copy = async (t) => { try { await navigator.clipboard.writeText(t); toast("Copiado: " + t); } catch { /* sin portapapeles */ } };
  const codeOf = (c) => String(c || "").replace(/^(ASIN|UPC|EAN|GTIN)\s*/i, "");
  const card = (it) => {
    const last = lastBy[it.id];
    return h("div", { class: "card scanitem stack", style: "gap:8px" },
      h("div", { class: "row between", style: "align-items:flex-start" }, h("b", { style: "font-size:16px" }, it.name), it.max_units ? h("span", { class: "small muted" }, "máx. " + it.max_units + " u") : ""),
      it.code ? h("button", { class: "codebtn mono", type: "button", title: "Copiar código", onclick: () => copy(codeOf(it.code)) }, it.code) : h("span", { class: "small muted" }, "Buscar por nombre en la app"),
      it.ceiling != null ? h("div", { class: "ceil" }, h("span", { class: "small muted" }, "Etiqueta máxima"), h("b", null, money(it.ceiling)), it.ceiling_app != null ? h("span", { class: "small" }, " · con otro vendedor en la Buy Box: " + money(it.ceiling_app) + ((it.ceiling_note || "").match(/\(.*Buy Box ≥.*?\)/) || [""])[0].replace(/^\(/, " (")) : "")
        : it.list !== "no_comprar" ? h("div", { class: "small muted" }, it.ceiling_note || "Sin precio máximo todavía") : "",
      it.stores ? h("span", { class: "small" }, "Dónde: " + it.stores) : "",
      it.purpose ? h("span", { class: "small muted" }, it.purpose) : "",
      last ? h("span", { class: "small" }, pill(...VERDICT[last.verdict] || ["Escaneado", ""]), " " + fdate(last.created_at) + (last.store ? " · " + last.store : "")) : "",
      h("button", { class: "btn sm primary only-upload", type: "button", onclick: () => scanDialog(b, it) }, last ? "Registrar otro escaneo" : "Registrar escaneo"));
  };
  const section = (k) => {
    const list = items.filter((i) => i.list === k); if (!list.length) return "";
    if (k === "no_comprar") return h("section", { class: "card stack" }, h("h2", null, SCAN_LIST[k][0]), h("p", { class: "small muted", style: "margin:0" }, SCAN_LIST[k][1]), h("div", { class: "chips" }, list.map((i) => h("span", { class: "chip" }, i.name))));
    return h("section", { class: "stack" }, h("div", null, h("h2", null, SCAN_LIST[k][0]), h("span", { class: "small muted" }, SCAN_LIST[k][1])), h("div", { class: "grid g3" }, list.map(card)));
  };
  const calcOut = h("b", { class: "mono", style: "font-size:20px" }, "—");
  const calc = h("form", { class: "fgrid", oninput: (e) => { const f = new FormData(e.currentTarget); const r = quickRule(Number(f.get("bb")), Number(f.get("w"))); calcOut.textContent = r == null ? "Fuera de la regla" : money(r); }, onsubmit: (e) => e.preventDefault() },
    fld("Precio de la Buy Box", h("input", { name: "bb", type: "number", step: "0.01", inputmode: "decimal" })), fld("Peso de envío (lb)", h("input", { name: "w", type: "number", step: "0.1", inputmode: "decimal", value: "2" })),
    h("div", { class: "field" }, "Etiqueta máxima", calcOut));
  const g = guide || {};
  const guideBlock = (k) => g[k] ? h("details", { class: "card" }, h("summary", null, h("b", null, g[k].title)), h("ol", { class: "small", style: "margin:10px 0 0;padding-left:20px" }, g[k].lines.map((l) => h("li", { style: "margin-bottom:6px" }, l)))) : "";
  return h("div", { class: "stack", style: "gap:18px" },
    h("div", { class: "row between" }, h("p", { class: "small muted", style: "margin:0" }, updated ? "Lista del Cerebro Amazon, actualizada el " + fdate(updated) + ". Los precios máximos son de etiqueta, antes de impuesto." : "Todavía no se importó la lista del Cerebro."),
      h("div", { class: "row" }, h("button", { class: "btn sm only-upload", type: "button", onclick: () => scanDialog(b, null) }, "Escanear producto sin ficha"), h("button", { class: "btn sm only-admin", type: "button", onclick: () => scanItemDialog(b) }, "+ Agregar producto"))),
    guideBlock("B"),
    section("prioritario"), section("enero"), section("vigilancia"),
    h("section", { class: "card stack" }, h("h2", null, "Regla rápida para productos sin ficha"), h("p", { class: "small muted", style: "margin:0" }, g.D ? g.D.lines.join(" ") : "Etiqueta ≤ 0,33 × Buy Box (35–50) o ≤ 0,38 × Buy Box (60–100); restar 0,04 al factor por cada lb sobre 2,3."), calc),
    section("no_comprar"),
    guideBlock("A"), guideBlock("F"), guideBlock("G"),
    h("section", { class: "card stack" }, h("h2", null, "Historial de escaneos"),
      logs.length ? h("div", { class: "tablewrap" }, h("table", { style: "min-width:720px" }, h("thead", null, h("tr", null, ["Fecha", "Producto", "Tienda", "Buy Box", "Etiqueta", "Máximo", "Resultado", ""].map((c) => h("th", null, c)))),
        h("tbody", null, logs.map((l) => h("tr", null, h("td", { class: "mono" }, fdate(l.created_at)), h("td", null, l.name, l.notes ? h("div", { class: "small muted" }, l.notes) : ""), h("td", null, l.store || "—"),
          h("td", null, (BUYBOX.find((x) => x[0] === l.buybox) || [, "—"])[1], l.buybox_price != null ? " · " + money(l.buybox_price) : ""), h("td", { class: "mono" }, money(l.shelf_price)), h("td", { class: "mono" }, money(l.limit_price)),
          h("td", null, pill(...VERDICT[l.verdict] || ["—", ""]), h("div", { class: "small muted" }, l.reasons.join(" · "))),
          h("td", null, l.file_id ? h("a", { href: "/api/files/" + l.file_id, target: "_blank", rel: "noopener" }, "Foto") : "", isAdmin() ? h("button", { class: "linkbtn small", type: "button", style: "color:var(--bad);margin-left:8px", onclick: () => confirmDelete("Borrar escaneo", "Se borra este registro de escaneo.", async () => { await api("/scan/logs/" + l.id, { method: "DELETE" }); route(); }) }, "Borrar") : ""))))))
        : h("p", { class: "empty" }, "Todavía no hay escaneos. Usa “Registrar escaneo” en cada producto.")));
}
function scanDialog(b, it) {
  const radios = (name, opts, label) => h("fieldset", null, h("legend", null, label), h("div", { class: "chips" }, opts.map(([v, l]) => h("label", { class: "chip" }, h("input", { type: "radio", name, value: v }), " " + l))));
  const yn = [["si", "Sí"], ["no", "No"]];
  modal(it ? "Escaneo: " + it.name : "Escanear producto sin ficha", () => h("div", { class: "stack" },
    it ? (it.ceiling != null ? h("p", { class: "small", style: "margin:0" }, "Etiqueta máxima: ", h("b", null, money(it.ceiling)), it.ceiling_app != null ? " · con otro vendedor en la Buy Box: " + money(it.ceiling_app) : "") : "")
      : h("div", { class: "fgrid" }, fld("Producto", h("input", { name: "name", required: true })), fld("ASIN o UPC", h("input", { name: "code" })), fld("Peso de envío (lb)", h("input", { name: "weight", type: "number", step: "0.1", inputmode: "decimal" }))),
    fld("Tienda", h("input", { name: "store", list: "scan-stores", placeholder: "Por ejemplo: HomeGoods Countryside" })),
    h("datalist", { id: "scan-stores" }, ["HomeGoods", "TJ Maxx", "Marshalls", "Ross", "Target", "Walmart", "Home Depot", "Lowe's", "Menards", "Ace Hardware", "Michaels", "Hobby Lobby", "Woodcraft", "Northern Tool", "Tractor Supply", "Desde casa (app)"].map((x) => h("option", { value: x }))),
    radios("can_sell", [["si", "Sí, sin solicitud"], ["solicitud", "Pide aprobación"], ["no", "No"]], "¿La app dice que puedes venderlo?"),
    radios("amazon_sells", yn, "¿Amazon vende este ASIN?"),
    radios("buybox", BUYBOX, "¿Quién tiene la Buy Box?"),
    h("div", { class: "fgrid" }, fld("Precio de la Buy Box", h("input", { name: "buybox_price", type: "number", step: "0.01", inputmode: "decimal" })), fld("Precio de etiqueta en tienda", h("input", { name: "shelf_price", type: "number", step: "0.01", inputmode: "decimal" }))),
    radios("drops", [["no", "No"], ["si", "Sí"], ["nose", "No sé"]], "¿Caídas fuertes de precio en 90 días?"),
    radios("hazmat", yn, "¿La app pide revisión de producto peligroso?"),
    radios("size_ok", yn, "¿Tamaño estándar? (caja ≤ 18 × 14 × 8 in y ≤ 20 lb)"),
    fld("Foto de la etiqueta (opcional)", h("input", { name: "photo", type: "file", accept: "image/*", capture: "environment" })),
    fld("Notas", h("input", { name: "notes", placeholder: "Código de 4 cifras, fecha de rebaja, medidas…" }))),
  async (fd, form) => {
    if (it) fd.set("item_id", it.id);
    fd.set("business_id", b.id);
    const f = fd.get("photo");
    if (f && f.size) { form.querySelector("[type=submit]").textContent = "Subiendo foto…"; const prep = await prepareUpload(f); fd.set("photo", prep.file); fd.set("original_size", prep.originalSize); } else fd.delete("photo");
    const r = await api("/scan/logs", { method: "POST", body: fd });
    toast((VERDICT[r.verdict] || ["Guardado"])[0] + (r.reasons.length ? ": " + r.reasons.join("; ") : r.limit != null ? ". Máximo " + money(r.limit) + "." : "."), r.verdict === "no");
    route();
  }, "Guardar escaneo");
}
function scanItemDialog(b, it) {
  modal(it ? "Editar " + it.name : "Agregar producto a la hoja", () => h("div", { class: "stack" },
    h("div", { class: "fgrid" }, fld("Producto", h("input", { name: "name", required: true, value: it?.name || "" })), fld("ASIN, UPC o EAN", h("input", { name: "code", value: it?.code || "" }))),
    h("div", { class: "fgrid" }, fld("Etiqueta máxima", h("input", { name: "ceiling", type: "number", step: "0.01", value: it?.ceiling ?? "" })), fld("Máxima con otro vendedor en la Buy Box", h("input", { name: "ceiling_app", type: "number", step: "0.01", value: it?.ceiling_app ?? "" })), fld("Unidades máximas", h("input", { name: "max_units", type: "number", value: it?.max_units ?? "" }))),
    h("div", { class: "fgrid" }, fld("Lista", h("select", { name: "list" }, Object.entries(SCAN_LIST).map(([k, v]) => h("option", { value: k, selected: it?.list === k }, v[0])))), fld("Tiendas", h("input", { name: "stores", value: it?.stores || "" }))),
    fld("Para qué sirve / condición", h("input", { name: "purpose", value: it?.purpose || "" }))),
  async (fd) => { const body = Object.fromEntries(fd); body.business_id = b.id; await api(it ? "/scan/items/" + it.id : "/scan/items", { method: it ? "PUT" : "POST", body }); toast("Producto guardado."); route(); });
}
// ---------- tarjetas ----------
const NETS = ["Visa", "Mastercard", "American Express", "Discover", "Otra"];
const CTYPE = { credito: "Crédito", debito: "Débito" };
// Nombre del banco a partir del emisor de la tarjeta o cuenta
function bankOf(issuer) {
  const t = String(issuer || "").trim();
  if (!t) return "Sin banco";
  if (/u\.?\s?s\.?\s?bank/i.test(t)) return "U.S. Bank";
  if (/chase/i.test(t)) return "Chase";
  return t;
}
function byBank(list, get = (x) => x.issuer) {
  const m = new Map(); for (const x of list) { const k = bankOf(get(x)); if (!m.has(k)) m.set(k, []); m.get(k).push(x); }
  return [...m.entries()].sort((a, z) => (a[0] === "Sin banco") - (z[0] === "Sin banco") || a[0].localeCompare(z[0]));
}
const cardText = (c) => `${c.nickname} · ${CTYPE[c.card_type] || "Crédito"} ${c.network || ""} •••• ${c.last4}`.replace(/\s+/g, " ");
function cardSelect(cards, selected, emptyLabel) {
  return h("select", { name: "card_id" }, h("option", { value: "" }, emptyLabel), cards.map((c) => h("option", { value: c.id, selected: c.id === selected }, cardText(c))));
}
async function cardsView(entityId) {
  const { cards } = await api("/cards?entity=" + entityId);
  const today = new Date().toISOString().slice(0, 10);
  const cyclesView = (c) => {
    const debit = c.card_type === "debito";
    const rows = c.cycles.filter((x) => x.closing_date <= today || x.paid || x.file_id).slice(0, 4);
    if (!debit && (!c.closing_day || !c.due_day)) return h("p", { class: "small muted", style: "margin:0" }, "Agrega el día de cierre y el de pago para recibir recordatorios y guardar los estados de cuenta.");
    const next = [...c.cycles].reverse().find((x) => !x.paid && x.due_date >= today);
    return h("div", { class: "stack", style: "gap:6px" },
      h("b", { class: "small" }, debit ? "Extractos bancarios" : "Estados de cuenta y pagos"),
      !debit && next ? h("p", { class: "small", style: "margin:0" }, "Próximo pago: ", h("b", null, fdate(next.due_date)), ` (cierre ${fdate(next.closing_date)}). Mejor día para comprar: el día después del cierre.`) : "",
      debit ? h("p", { class: "small muted", style: "margin:0" }, "Es de débito: no hay pagos que recordar. El extracto de la cuenta es el mismo archivo que está en Documentos › Bancarios: súbelo en cualquiera de los dos lados y queda en ambos.") : "",
      rows.length ? h("div", { class: "tablewrap" }, h("table", { style: "min-width:520px" }, h("thead", null, h("tr", null, (debit ? ["Corte", "Extracto", ""] : ["Cierre", "Pago", "Estado", "Estado de cuenta", ""]).map((t) => h("th", null, t)))),
        h("tbody", null, rows.map((x) => h("tr", null, h("td", { class: "mono" }, fdate(x.closing_date)),
          debit ? "" : h("td", { class: "mono" }, fdate(x.due_date)),
          debit ? "" : h("td", null, x.paid && !x.paid_on && x.due_date < c.created_at.slice(0, 10) ? h("span", { class: "small muted" }, "Antes de registrarla") : x.paid ? pill("Pagada" + (x.paid_on ? " " + fdate(x.paid_on) : ""), "ok") : x.due_date < today ? pill("Vencida", "bad") : x.closing_date <= today ? pill("Por pagar", "warn") : pill("En curso", "")),
          h("td", null, x.file_id ? h("a", { href: "/api/files/" + x.file_id, target: "_blank", rel: "noopener" }, "Ver") : h("span", { class: "muted small" }, "—")),
          h("td", { class: "only-admin" }, h("span", { class: "row", style: "gap:6px" },
            !debit && x.closing_date <= today && !(x.paid && !x.paid_on && x.due_date < c.created_at.slice(0, 10)) ? h("button", { class: "linkbtn small", type: "button", onclick: async () => { await api("/cards/cycles/" + x.id, { method: "PUT", body: { paid: !x.paid } }); toast(x.paid ? "Marcada como no pagada." : "Pago registrado."); route(); } }, x.paid ? "Desmarcar" : "Marcar pagada (total)") : "",
            h("button", { class: "linkbtn small", type: "button", onclick: () => statementDialog(c, x, entityId) }, x.file_id ? "Cambiar archivo" : debit ? "Subir extracto" : "Subir estado de cuenta")))))))) : "");
  };
  const info = (c) => {
    const debit = c.card_type === "debito";
    const kv = (l, v) => h("div", null, h("span", null, l), h("b", null, v == null || v === "" ? "—" : v));
    return h("div", { class: "kv" },
      kv("Tipo", CTYPE[c.card_type] || "Crédito"), kv("Banco o emisor", c.issuer), kv("Red", c.network), kv("Titular", c.holder),
      kv("Últimos 4 dígitos", "•••• " + c.last4), kv("Vencimiento", c.exp_month && c.exp_year ? `${String(c.exp_month).padStart(2, "0")}/${c.exp_year}` : ""),
      debit ? kv("Día de corte del extracto", c.closing_day ? "Día " + c.closing_day : "Fin de mes") : kv("Día de cierre", c.closing_day ? "Día " + c.closing_day : ""),
      debit ? "" : kv("Día límite de pago", c.due_day ? "Día " + c.due_day : ""), debit ? "" : kv("Límite de crédito", c.credit_limit != null ? money(c.credit_limit) : ""),
      kv("Es de", c.owner === "empresa" ? "La empresa" : "Uso personal"), c.notes ? kv("Notas", c.notes) : "",
      c.balance != null ? kv(c.card_type === "debito" ? "Saldo" : "Saldo de la tarjeta", (c.card_type !== "debito" && c.balance < 0 ? "Debes " : "") + money(Math.abs(c.balance), c.currency || "USD") + (c.balance_at ? ` · ${fdate(c.balance_at)}` : "")) : "",
      c.sfin_id ? kv("Conexión", "Automática (SimpleFIN)") : "",
      entityId === "personal" ? h("div", null, h("span", null, "¿Es tu dinero?"), h("label", { class: "row", style: "gap:6px;margin-top:4px" }, h("input", { type: "checkbox", checked: !!c.others_money, style: "width:auto", onchange: async (e) => { await api(`/personal/accounts/${c.id}/others`, { method: "PUT", body: { others: e.target.checked } }); toast(e.target.checked ? "Marcada: no cuenta en tu patrimonio ni en tus gastos." : "Marcada como tuya."); route(); } }), h("span", { class: "small" }, "El dinero de esta cuenta no es mío"))) : "");
  };
  const entName = (id) => (state.entities.find((e) => e.id === id) || {}).name;
  return h("div", { class: "stack", style: "gap:14px" },
    entityId === "personal" && cards.length ? balancesTable(cards) : "",
    h("div", { class: "row between" }, h("p", { class: "small muted", style: "margin:0;max-width:660px" }, "Cada factura se asocia a la tarjeta con que pagaste. Se guardan solo el banco, la red, el tipo, el titular, los últimos 4 dígitos y el vencimiento: nunca el número completo, el código de seguridad ni la foto."),
      h("button", { class: "btn primary sm only-admin", type: "button", onclick: () => cardDialog(null, entityId) }, "+ Agregar tarjeta")),
    cards.length ? h("div", { class: "stack", style: "gap:22px" }, byBank(cards).map(([bank, list]) => h("div", { class: "stack", style: "gap:12px" },
      h("h2", { style: "margin:0" }, bank, h("span", { class: "small muted", style: "font-weight:400" }, ` · ${list.length} ${list.length === 1 ? "cuenta o tarjeta" : "cuentas o tarjetas"}`)),
      list.map((c) => h("section", { class: "card stack" },
      h("div", { class: "row between", style: "align-items:flex-start" },
        h("div", { class: "row", style: "gap:14px;align-items:center" }, h("div", { class: "cardchip" + (c.card_type === "debito" ? " debit" : ""), "aria-hidden": "true" }, h("span", null, (c.network || "Tarjeta") + " · " + (CTYPE[c.card_type] || "Crédito")), h("b", { class: "mono" }, "•••• " + c.last4)),
          h("div", { class: "stack", style: "gap:2px" }, h("b", { style: "font-size:17px" }, c.nickname),
            entityId === "personal" ? balanceLine(c) : h("span", { class: "small" }, `${c.uses.n} factura${c.uses.n === 1 ? "" : "s"} pagada${c.uses.n === 1 ? "" : "s"} con ella · ${money(c.uses.total)}`),
            !c.entity_id ? h("span", { class: "small muted" }, "Se usa en todas las empresas") : "")),
        h("div", { class: "row only-admin" }, entityId === "personal" && !c.sfin_id ? h("button", { class: "btn sm", type: "button", onclick: () => balanceDialog(c) }, "Actualizar saldo") : "", h("button", { class: "btn sm", type: "button", onclick: () => cardDialog(c, entityId) }, "Editar"),
          h("button", { class: "btn sm danger", type: "button", onclick: () => confirmDelete("Eliminar tarjeta", `Se borra ${c.nickname} •••• ${c.last4} y sus estados de cuenta. Las facturas no se borran: quedan sin tarjeta asociada.`, async () => { await api("/cards/" + c.id, { method: "DELETE" }); toast("Tarjeta eliminada."); route(); }) }, "Eliminar"))),
      info(c), cyclesView(c)))))) : h("section", { class: "card" }, h("p", { class: "empty" }, "Todavía no hay tarjetas de esta empresa. Agrega cada tarjeta con la que compras.")));
}
function cardDialog(c, entityId) {
  modal(c ? "Editar " + c.nickname : "Agregar tarjeta", () => {
    const F = {};
    const inp = (k, label, attrs = {}) => { F[k] = h("input", { name: k, value: c?.[k] ?? "", ...attrs }); return fld(label, F[k]); };
    const netSel = h("select", { name: "network" }, h("option", { value: "" }, "—"), NETS.map((n) => h("option", { selected: c?.network === n }, n))); F.network = netSel;
    const typeSel = h("select", { name: "card_type", onchange: () => sync() }, Object.entries(CTYPE).map(([k, l]) => h("option", { value: k, selected: (c?.card_type || "credito") === k }, l))); F.card_type = typeSel;
    const creditBox = h("div", { class: "fgrid" }, inp("closing_day", "Día de cierre del estado de cuenta", { type: "number", min: "1", max: "31" }), inp("due_day", "Día límite de pago", { type: "number", min: "1", max: "31" }), inp("credit_limit", "Límite de crédito (opcional)", { type: "number", step: "0.01" }));
    const debitBox = h("div", { class: "fgrid" }, fld("Día de corte del extracto (opcional, si no, fin de mes)", h("input", { name: "debit_closing_day", type: "number", min: "1", max: "31", value: c?.card_type === "debito" ? c?.closing_day ?? "" : "" })));
    function sync() { const debit = typeSel.value === "debito"; creditBox.style.display = debit ? "none" : ""; debitBox.style.display = debit ? "" : "none"; creditBox.querySelectorAll("input").forEach((x) => { x.disabled = debit; }); debitBox.querySelectorAll("input").forEach((x) => { x.disabled = !debit; }); }
    const scanNote = h("p", { class: "small muted", style: "margin:0" }, "Toma una foto del frente. Tapa o deja fuera el código de seguridad. La foto no se guarda: solo se leen los datos de abajo.");
    const scan = h("input", { type: "file", accept: "image/*", capture: "environment", onchange: async (e) => {
      const f = e.target.files[0]; if (!f) return;
      scanNote.textContent = "Leyendo la tarjeta…";
      try {
        const prep = await prepareUpload(f);
        const { card } = await api("/cards/read", { method: "POST", body: { image: prep.image } });
        for (const k of ["card_type", "issuer", "network", "holder", "last4", "exp_month", "exp_year"]) if (card[k] && F[k]) F[k].value = card[k];
        sync();
        if (!F.nickname.value && card.issuer) F.nickname.value = card.issuer + (card.network ? " " + card.network : "");
        e.target.value = "";
        scanNote.textContent = card.last4 ? "Listo. Revisa los datos (sobre todo si es de crédito o débito) y completa lo que falte." : "No pude leer los últimos 4 dígitos. Escríbelos a mano.";
      } catch (err) { scanNote.textContent = err.message; }
    } });
    setTimeout(sync);
    return h("div", { class: "stack" },
      h("fieldset", null, h("legend", null, "Escanear la tarjeta (opcional)"), scan, scanNote),
      h("div", { class: "fgrid" }, fld("Tipo", typeSel), inp("nickname", "Nombre corto", { required: true, placeholder: "Por ejemplo: Chase personal" }), inp("issuer", "Banco o emisor"), fld("Red", netSel)),
      h("div", { class: "fgrid" }, inp("holder", "Titular"), inp("last4", "Últimos 4 dígitos", { required: true, inputmode: "numeric", maxlength: "4", pattern: "\\d{4}" }), inp("exp_month", "Mes de vencimiento", { type: "number", min: "1", max: "12" }), inp("exp_year", "Año de vencimiento", { type: "number", min: "2024", max: "2099" })),
      creditBox, debitBox,
      h("div", { class: "fgrid" }, fld("Empresa donde se usa", h("select", { name: "entity_id" }, state.entities.map((e) => h("option", { value: e.id, selected: (c ? c.entity_id : entityId) === e.id }, e.name)), h("option", { value: "", selected: c && !c.entity_id }, "Todas las empresas"))),
        fld("Es de", h("select", { name: "owner" }, [["personal", "Uso personal"], ["empresa", "La empresa"]].map(([k, l]) => h("option", { value: k, selected: (c?.owner || "personal") === k }, l)))), inp("notes", "Notas")));
  }, async (fd) => {
    const body = Object.fromEntries(fd);
    if (/\d{5,}/.test(body.last4 || "")) throw new Error("Escribe solo los últimos 4 dígitos.");
    if (body.card_type === "debito") { body.closing_day = body.debit_closing_day || ""; body.due_day = ""; body.credit_limit = ""; }
    delete body.debit_closing_day;
    await api(c ? "/cards/" + c.id : "/cards", { method: c ? "PUT" : "POST", body });
    toast(c ? "Tarjeta actualizada." : "Tarjeta agregada."); route();
  });
}
function statementDialog(c, x, entityId) {
  modal(`${c.card_type === "debito" ? "Extracto" : "Estado de cuenta"} ${c.nickname} · ${fdate(x.closing_date)}`, () => h("div", { class: "stack" },
    fld("Archivo (PDF o foto)", h("input", { name: "file", type: "file", accept: "application/pdf,image/*", required: true })),
    h("label", { class: "row", style: "gap:8px" }, h("input", { type: "checkbox", name: "read", checked: true, style: "width:auto" }), h("span", { class: "small" }, "Leer los movimientos y compararlos con facturas y suscripciones (conciliación para el contador)")),
    h("p", { class: "small muted", style: "margin:0" }, "Es el soporte que se adjunta cuando envías una factura pagada con esta tarjeta en ese período. Puedes tachar los movimientos personales antes de subirlo.")),
  async (fd, form) => {
    const f = fd.get("file"); if (!f || !f.size) throw new Error("Elige un archivo.");
    form.querySelector("[type=submit]").textContent = "Subiendo…";
    const prep = await prepareUpload(f); const up = new FormData(); up.append("file", prep.file); up.append("original_size", prep.originalSize);
    const r = await api(`/cards/cycles/${x.id}/file`, { method: "POST", body: up }); toast("Estado de cuenta guardado.");
    const ent = state.entities.find((e) => e.id === (c.entity_id || entityId));
    if (fd.get("read") && ent) setTimeout(() => bankImportDialog(ent, { cardId: c.id, file: f, fileId: r.file_id }), 60); else route();
  }, "Subir");
}

// ---------- lotes ----------
const STAGES = [["comprado", "Comprado"], ["etiquetado", "Etiquetado"], ["enviado", "Enviado a FBA"], ["recibido", "Recibido por Amazon"], ["vendiendo", "Vendiendo"], ["recuperado", "Recuperado"]];
async function capitalCard(b) {
  const { lots } = await api("/lots?business=" + b.id).catch(() => ({ lots: [] }));
  if (!lots.length) return "";
  const sum = (st) => lots.filter((l) => st.includes(l.stage)).reduce((a, l) => a + l.invested, 0);
  const pending = lots.filter((l) => l.stage !== "recuperado").reduce((a, l) => a + Math.max(0, l.invested - l.recovered), 0);
  const c = (l, v) => h("div", { class: "card stat" }, h("span", { class: "small muted" }, l), h("br"), h("b", null, money(v)));
  return h("section", { class: "stack" }, h("div", { class: "row between" }, h("h2", null, "Capital en lotes"), h("a", { href: `#/negocio/${b.id}/lotes`, style: "font-weight:700" }, "Ver lotes →")),
    h("div", { class: "grid g4" }, c("Sin enviar (comprado o etiquetado)", sum(["comprado", "etiquetado"])), c("En camino o en bodega", sum(["enviado", "recibido"])), c("Vendiéndose", sum(["vendiendo"])), c("Falta por recuperar", pending)));
}
async function lotsView(b) {
  const { lots, unassigned_payouts } = await api("/lots?business=" + b.id);
  const stageBar = (l) => h("ol", { class: "stages" }, STAGES.map(([k, label], i) => {
    const done = !!l.dates[k]; const cur = l.stage === k; const idx = STAGES.findIndex((s) => s[0] === l.stage);
    return h("li", { class: (done ? "done " : "") + (cur ? "cur" : "") }, h("button", { type: "button", class: "only-admin-btn", disabled: !isAdmin() || i === idx, title: i > idx ? "Marcar esta etapa" : "Volver a esta etapa",
      onclick: () => modal(`${l.name}: ${label}`, () => h("div", { class: "stack" },
        fld("Fecha", h("input", { name: "date", type: "date", value: new Date().toISOString().slice(0, 10), required: true })),
        k === "enviado" ? fld("ID del envío a FBA (opcional)", h("input", { name: "shipment_id", value: l.shipment_id || "", placeholder: "Por ejemplo: FBA17ABC123" })) : "",
        i < idx ? h("p", { class: "small muted", style: "margin:0" }, "Vuelves a esta etapa: se borran las fechas de las etapas siguientes.") : ""),
        async (fd) => { await api("/lots/" + l.id, { method: "PUT", body: { stage: k, date: fd.get("date"), shipment_id: fd.get("shipment_id") ?? undefined } }); toast(`${l.name}: ${label}.`); route(); }, "Guardar") }, h("b", null, label), h("span", null, l.dates[k] ? fdate(l.dates[k]) : "—")));
  }));
  const lotCard = (l) => h("section", { class: "card stack" },
    h("div", { class: "row between", style: "align-items:flex-start" }, h("div", { class: "stack", style: "gap:2px" }, h("h2", null, l.name),
        h("span", { class: "small muted" }, [`${l.invoices.length} factura${l.invoices.length === 1 ? "" : "s"}`, l.units ? `${l.units} unidades` : "", l.shipment_id ? "Envío " + l.shipment_id : ""].filter(Boolean).join(" · "))),
      h("div", { class: "row" }, h("span", { class: "small" }, "Invertido ", h("b", { class: "mono" }, money(l.invested)), " · Recuperado ", h("b", { class: "mono" }, money(l.recovered))),
        h("button", { class: "btn sm only-admin", type: "button", onclick: () => payoutDialog(b, lots, l) }, "+ Pago de Amazon"),
        h("button", { class: "btn sm only-admin", type: "button", onclick: () => lotEditDialog(l) }, "Editar"))),
    stageBar(l),
    l.invoices.length ? h("div", { class: "list" }, l.invoices.map((i) => h("a", { href: "#/factura/" + i.id }, h("span", null, h("b", null, [i.supplier, i.invoice_number || i.title].filter(Boolean).join(" · ") || "Factura"), h("span", { class: "small muted" }, " · " + fdate(i.issue_date) + (i.card_name ? ` · ${i.card_name} •••• ${i.last4}` : " · sin tarjeta"))), h("span", { class: "mono" }, money(i.total, i.currency)))))
      : h("p", { class: "small muted", style: "margin:0" }, "Sin facturas. Al subir una factura, elige este lote."),
    l.payouts.length ? h("div", { class: "small" }, "Pagos de Amazon: ", l.payouts.map((x) => h("span", { class: "chip", style: "margin-right:6px" }, `${fdate(x.paid_on)} · ${money(x.amount)}`, isAdmin() ? h("button", { class: "linkbtn small", type: "button", "aria-label": "Quitar pago", style: "margin-left:6px", onclick: async () => { await api("/payouts/" + x.id, { method: "DELETE" }); route(); } }, "×") : ""))) : "");
  const active = lots.filter((l) => l.stage !== "recuperado"), closed = lots.filter((l) => l.stage === "recuperado");
  return h("div", { class: "stack", style: "gap:18px" },
    h("div", { class: "row between" }, h("p", { class: "small muted", style: "margin:0;max-width:640px" }, "Un lote es lo que compras junto y mandas en el mismo envío a Amazon. Avanza cada etapa con un toque; el costo sale de las facturas del lote."),
      h("div", { class: "row" }, h("button", { class: "btn sm only-admin", type: "button", onclick: () => payoutDialog(b, lots, null) }, "+ Pago de Amazon"),
        h("button", { class: "btn primary sm only-upload", type: "button", onclick: async () => { await api("/lots", { method: "POST", body: { business_id: b.id } }); toast("Lote creado."); route(); } }, "+ Nuevo lote"))),
    await capitalCard(b),
    active.length ? active.map(lotCard) : h("section", { class: "card" }, h("p", { class: "empty" }, "No hay lotes abiertos. Crea uno o elige “Nuevo lote” al subir una factura.")),
    unassigned_payouts.length ? h("section", { class: "card stack" }, h("h2", null, "Pagos de Amazon sin lote"), h("div", { class: "chips" }, unassigned_payouts.map((x) => h("span", { class: "chip" }, `${fdate(x.paid_on)} · ${money(x.amount)}${x.notes ? " · " + x.notes : ""}`)))) : "",
    closed.length ? h("details", { class: "card" }, h("summary", null, h("b", null, `Lotes recuperados (${closed.length})`)), h("div", { class: "stack", style: "margin-top:12px" }, closed.map(lotCard))) : "");
}
function payoutDialog(b, lots, lot) {
  modal("Registrar pago de Amazon", () => h("div", { class: "stack" },
    h("div", { class: "fgrid" }, fld("Fecha del depósito", h("input", { name: "paid_on", type: "date", required: true, value: new Date().toISOString().slice(0, 10) })), fld("Monto", h("input", { name: "amount", type: "number", step: "0.01", required: true, inputmode: "decimal" }))),
    fld("Lote", h("select", { name: "lot_id" }, h("option", { value: "" }, "Sin asignar"), lots.map((l) => h("option", { value: l.id, selected: lot?.id === l.id }, l.name)))),
    fld("Notas", h("input", { name: "notes", placeholder: "Por ejemplo: pago del 3 al 17 de febrero" }))),
  async (fd) => { await api("/payouts", { method: "POST", body: { ...Object.fromEntries(fd), business_id: b.id } }); toast("Pago registrado."); route(); });
}
function lotEditDialog(l) {
  modal("Editar " + l.name, () => h("div", { class: "stack" }, fld("Nombre", h("input", { name: "name", value: l.name, required: true })), fld("ID del envío a FBA", h("input", { name: "shipment_id", value: l.shipment_id || "" })), fld("Notas", h("input", { name: "notes", value: l.notes || "" })),
    h("button", { class: "btn danger sm", type: "button", style: "align-self:flex-start", onclick: () => confirmDelete("Eliminar lote", "Se borra el lote. Sus facturas y pagos no se borran: quedan sin lote.", async () => { await api("/lots/" + l.id, { method: "DELETE" }); toast("Lote eliminado."); route(); }) }, "Eliminar lote")),
  async (fd) => { await api("/lots/" + l.id, { method: "PUT", body: Object.fromEntries(fd) }); toast("Lote actualizado."); route(); });
}
// ---------- casos de Amazon ----------
const CASE_KIND = { verificacion: "Verificación de la cuenta", aprobacion: "Aprobación de marca o categoría", autenticidad: "Queja de autenticidad o de estado", cadena: "Cadena de suministro / facturas", otro: "Otro" };
const CASE_ST = { abierto: ["Abierto", "warn"], enviado: ["Enviado", "info"], resuelto: ["Resuelto", "ok"], rechazado: ["Rechazado", "bad"] };
async function casesView(b, openId) {
  if (openId) return await caseDetail(b, openId);
  const { cases } = await api("/cases?business=" + b.id);
  const today = new Date().toISOString().slice(0, 10);
  return h("div", { class: "stack", style: "gap:18px" },
    h("div", { class: "row between" }, h("p", { class: "small muted", style: "margin:0;max-width:660px" }, "Cuando Amazon te pida soportes, abre un caso: eliges las facturas y la intranet arma el paquete con el soporte de pago de cada una y los documentos de la LLC. Todo queda registrado."),
      h("button", { class: "btn primary sm only-admin", type: "button", onclick: () => caseDialog(b) }, "+ Nuevo caso")),
    cases.length ? h("div", { class: "list card" }, cases.map((c) => h("a", { href: `#/negocio/${b.id}/casos?c=${c.id}` },
      h("span", { class: "stack", style: "gap:2px" }, h("b", { style: "color:var(--ink)" }, c.title), h("span", { class: "small muted" }, [c.case_number ? "Caso " + c.case_number : "", CASE_KIND[c.kind] || "", `${c.invoice_ids.length} factura${c.invoice_ids.length === 1 ? "" : "s"}`, c.sent_at ? "enviado " + fdate(c.sent_at) : ""].filter(Boolean).join(" · "))),
      h("span", { class: "row", style: "gap:8px" }, c.due_date && c.status === "abierto" ? h("span", { class: "mono small", style: c.due_date < today ? "color:var(--bad);font-weight:700" : "color:var(--warn)" }, "Límite " + fdate(c.due_date)) : "", pill(...CASE_ST[c.status]))))) : h("section", { class: "card" }, h("p", { class: "empty" }, "No hay casos. Ábrelo cuando Amazon te pida facturas o documentos.")));
}
function caseDialog(b, c) {
  modal(c ? "Editar caso" : "Nuevo caso de Amazon", () => h("div", { class: "stack" },
    fld("Qué pide Amazon", h("input", { name: "title", required: true, value: c?.title || "", placeholder: "Por ejemplo: facturas para aprobar Milescraft" })),
    h("div", { class: "fgrid" }, fld("Número de caso (si lo tiene)", h("input", { name: "case_number", value: c?.case_number || "" })),
      fld("Tipo", h("select", { name: "kind" }, Object.entries(CASE_KIND).map(([k, l]) => h("option", { value: k, selected: c?.kind === k }, l)))),
      fld("Fecha límite", h("input", { name: "due_date", type: "date", value: c?.due_date || "" }))),
    fld("Notas (lo que dice el mensaje de Amazon)", h("textarea", { name: "notes", rows: "3" }, c?.notes || ""))),
  async (fd) => {
    const body = Object.fromEntries(fd); body.business_id = b.id;
    if (c) { await api("/cases/" + c.id, { method: "PUT", body }); toast("Caso actualizado."); route(); }
    else { const r = await api("/cases", { method: "POST", body }); toast("Caso creado. Ahora elige las facturas."); location.hash = `#/negocio/${b.id}/casos?c=${r.id}`; }
  });
}
async function caseDetail(b, id) {
  const [{ case: c, invoices }, { invoices: all }, docsRes] = await Promise.all([api("/cases/" + id), api("/invoices?business=" + b.id), api("/docs?entity=" + (b.entity_id || "llc")).catch(() => ({}))]);
  const docs = Array.isArray(docsRes) ? docsRes : (Object.values(docsRes).find(Array.isArray) || []);
  const latestDocs = docs.filter((d, i, arr) => d.file_id && arr.findIndex((x) => x.group_id === d.group_id) === i);
  const ready = (inv) => inv.checks.some((x) => x.level === "bien" && /lo básico que pide Amazon/.test(x.text)) && inv.kind !== "recibo";
  const save = async (patch, msg) => { await api("/cases/" + c.id, { method: "PUT", body: patch }); if (msg) toast(msg); route(); };
  const pickInvoices = () => modal("Facturas del caso", () => {
    const search = h("input", { type: "text", placeholder: "Buscar por proveedor, número o fecha", oninput: (e) => { const t = e.target.value.toLowerCase(); box.querySelectorAll("label").forEach((l) => { l.style.display = l.dataset.k.includes(t) ? "" : "none"; }); } });
    const box = h("div", { class: "stack", style: "gap:4px;max-height:50vh;overflow:auto" }, all.map((i) => h("label", { class: "row", style: "gap:10px;padding:6px 4px;border-bottom:1px solid var(--line)", "data-k": [i.supplier, i.supplier_name, i.invoice_number, i.issue_date].join(" ").toLowerCase() },
      h("input", { type: "checkbox", name: "inv", value: i.id, checked: c.invoice_ids.includes(i.id), style: "width:auto" }),
      h("span", { class: "small" }, h("b", null, [i.supplier || i.supplier_name, i.invoice_number || i.title].filter(Boolean).join(" · ") || "Factura"), " · " + fdate(i.issue_date) + " · " + money(i.total, i.currency)))));
    return h("div", { class: "stack" }, search, all.length ? box : h("p", { class: "empty" }, "No hay facturas en este negocio."));
  }, async (fd) => save({ invoice_ids: fd.getAll("inv") }, "Facturas actualizadas."));
  const docBoxes = latestDocs.map((d) => h("label", { class: "chip" }, h("input", { type: "checkbox", value: d.id, checked: c.doc_ids.includes(d.id), onchange: () => save({ doc_ids: docBoxes.map((l) => l.querySelector("input")).filter((x) => x.checked).map((x) => x.value) }) }), " " + d.title));
  const readyN = invoices.filter(ready).length;
  const send = async () => {
    const { recipients } = await api("/recipients");
    if (!recipients.length) { toast("Primero autoriza un correo en Accesos y ajustes.", true); return; }
    modal("Enviar el paquete del caso", () => h("div", { class: "stack" },
      fld("Enviar a", h("select", { name: "to" }, recipients.map((r) => h("option", { value: r.email }, (r.label ? r.label + " · " : "") + r.email)))),
      h("p", { class: "small", style: "margin:0" }, `Van ${invoices.length} factura(s), el soporte de pago de cada una (tarjeta y estado de cuenta, si está subido) y ${c.doc_ids.length} documento(s) de la empresa. Te llega a tu correo para que lo revises y lo subas a Seller Central.`),
      readyN < invoices.length ? h("p", { class: "small", style: "margin:0;color:var(--warn)" }, `${invoices.length - readyN} factura(s) no tienen todo lo que pide Amazon. Revísalas antes de presentarlas.`) : ""),
    async (fd) => {
      const r = await api("/send", { method: "POST", body: { to: fd.get("to"), subject: `Caso Amazon${c.case_number ? " " + c.case_number : ""}: ${c.title}`, invoice_ids: c.invoice_ids, doc_ids: c.doc_ids, with_payment: true } });
      await api("/cases/" + c.id, { method: "PUT", body: { status: c.status === "abierto" ? "enviado" : c.status, sent_at: new Date().toISOString(), sent_to: fd.get("to") } });
      toast(`Paquete enviado${r.emails > 1 ? ` en ${r.emails} correos` : ""}.` + (r.missing_proof?.length ? ` Falta el estado de cuenta de: ${r.missing_proof.join(", ")}.` : ""), !!r.missing_proof?.length); route();
    }, "Enviar");
  };
  return h("div", { class: "stack", style: "gap:18px" },
    h("nav", { class: "crumbs" }, h("a", { href: `#/negocio/${b.id}/casos` }, "Casos de Amazon"), "›", h("b", { style: "color:var(--ink)" }, c.title)),
    h("section", { class: "card stack" },
      h("div", { class: "row between", style: "align-items:flex-start" }, h("div", { class: "stack", style: "gap:4px" }, h("h2", null, c.title),
          h("span", { class: "chips" }, pill(...CASE_ST[c.status]), c.case_number ? pill("Caso " + c.case_number) : "", c.kind ? pill(CASE_KIND[c.kind] || c.kind) : "", c.due_date ? pill("Límite " + fdate(c.due_date), c.due_date < new Date().toISOString().slice(0, 10) && c.status === "abierto" ? "bad" : "warn") : "")),
        h("div", { class: "row" }, h("button", { class: "btn sm only-admin", type: "button", onclick: () => caseDialog(b, c) }, "Editar"),
          h("select", { class: "only-admin", "aria-label": "Estado del caso", style: "width:auto", onchange: (e) => save({ status: e.target.value }, "Estado actualizado.") }, Object.entries(CASE_ST).map(([k, v]) => h("option", { value: k, selected: c.status === k }, v[0]))),
          h("button", { class: "btn primary sm only-upload", type: "button", disabled: !invoices.length && !c.doc_ids.length, onclick: send }, c.sent_at ? "Enviar de nuevo" : "Enviar paquete a mi correo"))),
      c.notes ? h("p", { class: "small", style: "margin:0;white-space:pre-wrap" }, c.notes) : "",
      c.sent_at ? h("p", { class: "small muted", style: "margin:0" }, `Enviado el ${fdate(c.sent_at)} a ${c.sent_to || "tu correo"}.`) : ""),
    h("section", { class: "card stack" },
      h("div", { class: "row between" }, h("div", null, h("h2", null, "Facturas"), h("span", { class: "small muted" }, invoices.length ? `${readyN} de ${invoices.length} listas para Amazon` : "Elige las facturas que vas a presentar")),
        h("button", { class: "btn sm only-admin", type: "button", onclick: pickInvoices }, invoices.length ? "Cambiar facturas" : "Elegir facturas")),
      invoices.length ? h("div", { class: "list" }, invoices.map((i) => h("a", { href: "#/factura/" + i.id },
        h("span", { class: "stack", style: "gap:2px" }, h("b", { style: "color:var(--ink)" }, [i.supplier, i.invoice_number || i.title].filter(Boolean).join(" · ") || "Factura"),
          h("span", { class: "small muted" }, [fdate(i.issue_date), money(i.total, i.currency), i.card ? "pagada con " + i.card : "sin tarjeta asociada", i.card ? (i.proof ? "estado de cuenta listo" : "falta el estado de cuenta") : ""].filter(Boolean).join(" · ")),
          !ready(i) ? h("span", { class: "small", style: "color:var(--warn)" }, (i.checks.find((x) => x.level !== "bien" && /Amazon/.test(x.text)) || i.checks.find((x) => x.level !== "bien") || {}).text || "") : ""),
        pill(ready(i) ? "Lista" : "Revisar", ready(i) ? "ok" : "warn")))) : h("p", { class: "empty" }, "Todavía no hay facturas en este caso.")),
    h("section", { class: "card stack" }, h("h2", null, "Documentos de la empresa que van en el paquete"),
      latestDocs.length ? h("div", { class: "chips" }, docBoxes) : h("p", { class: "empty" }, "Sube el EIN, el certificado de reventa y los demás documentos en la página de la empresa."),
      h("p", { class: "small muted", style: "margin:0" }, "Por ejemplo: EIN, certificado de reventa, Articles of Organization.")),
    isAdmin() ? h("button", { class: "btn danger sm", type: "button", style: "align-self:flex-start", onclick: () => confirmDelete("Eliminar caso", "Se borra el registro del caso. Las facturas y los documentos no se tocan.", async () => { await api("/cases/" + c.id, { method: "DELETE" }); toast("Caso eliminado."); location.hash = `#/negocio/${b.id}/casos`; }) }, "Eliminar caso") : "");
}
async function entitySuppliers(ent, q) {
  const [{ suppliers }, { platforms }] = await Promise.all([api("/suppliers?entity=" + ent.id), api("/platforms").catch(() => ({ platforms: [] }))]);
  const used = [...new Set([...platforms.map((p) => p.name), ...suppliers.flatMap((s) => s.platforms)])].filter((p) => suppliers.some((s) => s.platforms.includes(p)));
  return suppliersList({ id: ent.id, name: ent.name }, suppliers, q, { base: `#/empresa/${ent.id}`, title: "Proveedores de " + ent.name, platforms: used, target: { entity_id: ent.id },
    note: h("span", { class: "small muted" }, "Todos los proveedores de la empresa. En cada negocio solo aparecen los de su plataforma.") });
}
// ---------- paquete para el contador ----------
const libs = {};
function loadLib(url, name) {
  return libs[url] ||= new Promise((ok, ko) => { const el = document.createElement("script"); el.src = url; el.onload = () => ok(window[name]); el.onerror = () => { delete libs[url]; ko(new Error("No se pudo cargar una herramienta para armar el archivo. Revisa tu conexión.")); }; document.head.append(el); });
}
function periodRange(kind, year, n) {
  const pad = (x) => String(x).padStart(2, "0"); const last = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (kind === "anio") return [`${year}-01-01`, `${year}-12-31`, `Año ${year}`];
  if (kind === "trimestre") { const m1 = (n - 1) * 3 + 1, m3 = m1 + 2; return [`${year}-${pad(m1)}-01`, `${year}-${pad(m3)}-${last(year, m3)}`, `${year} · ${n}.º trimestre`]; }
  return [`${year}-${pad(n)}-01`, `${year}-${pad(n)}-${last(year, n)}`, `${MONTHS[n - 1]} de ${year}`];
}
async function accountantView(ent, q) {
  const now = new Date(); const kind = q.get("periodo") || "mes"; const year = Number(q.get("anio")) || now.getFullYear();
  const n = Number(q.get("n")) || (kind === "trimestre" ? Math.floor(now.getMonth() / 3) + 1 : now.getMonth() + 1);
  const [from, to, label] = periodRange(kind, year, n);
  const d = await api(`/accounting?entity=${ent.id}&from=${from}&to=${to}`);
  const nav = (o) => `#/empresa/${ent.id}/contador?` + new URLSearchParams({ periodo: kind, anio: year, n, ...o }).toString();
  const sel = h("div", { class: "row", style: "gap:8px;flex-wrap:wrap" },
    h("select", { "aria-label": "Tipo de período", style: "width:auto", onchange: (e) => { location.hash = nav({ periodo: e.target.value, n: e.target.value === "trimestre" ? Math.floor(now.getMonth() / 3) + 1 : now.getMonth() + 1 }); } }, [["mes", "Mes"], ["trimestre", "Trimestre"], ["anio", "Año"]].map(([k, l]) => h("option", { value: k, selected: k === kind }, l))),
    kind === "mes" ? h("select", { "aria-label": "Mes", style: "width:auto", onchange: (e) => { location.hash = nav({ n: e.target.value }); } }, MONTHS.map((l, i) => h("option", { value: i + 1, selected: i + 1 === n }, l))) : "",
    kind === "trimestre" ? h("select", { "aria-label": "Trimestre", style: "width:auto", onchange: (e) => { location.hash = nav({ n: e.target.value }); } }, [1, 2, 3, 4].map((t) => h("option", { value: t, selected: t === n }, `${t}.º trimestre`))) : "",
    h("select", { "aria-label": "Año", style: "width:auto", onchange: (e) => { location.hash = nav({ anio: e.target.value }); } }, [now.getFullYear() + 1, now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2].map((y) => h("option", { value: y, selected: y === year }, y))));
  const inv = d.invoices.filter((i) => i.kind !== "nota de crédito" && i.kind !== "suscripción"), credits = d.invoices.filter((i) => i.kind === "nota de crédito"), subInv = d.invoices.filter((i) => i.kind === "suscripción");
  const movIn = d.moves.filter((x) => x.kind === "ingreso"), movOut = d.moves.filter((x) => x.kind === "gasto"), movTr = d.moves.filter((x) => x.kind === "transferencia");
  const movRet = d.moves.filter((x) => x.kind === "retiro"), movAp = d.moves.filter((x) => x.kind === "aporte");
  const subTot = d.sub_charges.filter((x) => x.currency === (ent.id === "sas" ? "COP" : "USD")).reduce((a, x) => a + x.amount, 0);
  const sett = {}; for (const st of d.settlements) for (const [k, v] of Object.entries(st.breakdown)) sett[k] = (sett[k] || 0) + v;
  const bankMiss = d.bank.filter((l) => l.status === "sin_soporte").length;
  const sum = (arr, k) => arr.reduce((a, x) => a + (Number(x[k]) || 0), 0);
  const group = (arr, key) => { const m = new Map(); for (const x of arr) { const k = x[key] || "Sin dato"; const g = m.get(k) || { k, n: 0, total: 0, tax: 0 }; g.n++; g.total += Number(x.total) || 0; g.tax += Number(x.tax) || 0; m.set(k, g); } return [...m.values()].sort((a, z) => z.total - a.total); };
  const cardOf = (i) => i.card ? `${i.card} · ${i.card_type === "debito" ? "Débito" : "Crédito"} •••• ${i.last4}` : i.card_last4 ? `•••• ${i.card_last4} (no registrada)` : "Sin tarjeta";
  const bySup = group(inv, "supplier"), byBiz = group(inv, "business"), byCard = group(inv.map((i) => ({ ...i, cardtxt: cardOf(i) })), "cardtxt");
  const stat = (l, v) => h("div", { class: "card stat" }, h("span", { class: "small muted" }, l), h("br"), h("b", null, v));
  const table = (title, rows, cols) => rows.length ? h("section", { class: "card stack" }, h("h2", null, title), h("div", { class: "tablewrap" }, h("table", { style: "min-width:480px" }, h("thead", null, h("tr", null, cols.map((c) => h("th", null, c[0])))), h("tbody", null, rows.map((r) => h("tr", null, cols.map((c) => h("td", { class: c[2] || "" }, c[1](r))))))))) : "";
  const missing = { noCard: inv.filter((i) => !i.card && !i.card_last4).length, unconfirmed: inv.filter((i) => i.status !== "confirmada").length };
  const fileName = (st) => (st || "").replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 90);
  async function buildXlsx() {
    const XLSX = await loadLib("https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js", "XLSX");
    const wb = XLSX.utils.book_new();
    const add = (name, rows) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{ "Sin datos": "" }]), name);
    add("Resumen", [
      { Concepto: "Empresa", Valor: ent.name }, { Concepto: "Período", Valor: `${label} (${from} a ${to})` },
      { Concepto: "Facturas de compra", Valor: inv.length }, { Concepto: "Subtotal compras", Valor: sum(inv, "subtotal") }, { Concepto: "Impuesto de venta pagado en compras", Valor: sum(inv, "tax") },
      { Concepto: "Envíos cobrados", Valor: sum(inv, "shipping") }, { Concepto: "Descuentos", Valor: sum(inv, "discount") }, { Concepto: "Total compras", Valor: sum(inv, "total") },
      { Concepto: "Notas de crédito", Valor: sum(credits, "total") }, { Concepto: "Pagos recibidos de Amazon (depósitos)", Valor: sum(d.payouts, "amount") },
      ...Object.keys(SETT_LABEL).filter((k) => sett[k]).map((k) => ({ Concepto: "Amazon · " + SETT_LABEL[k], Valor: Math.round(sett[k] * 100) / 100 })),
      { Concepto: "Suscripciones cobradas", Valor: subTot }, { Concepto: "Facturas de suscripciones (soporte)", Valor: subInv.length },
      { Concepto: "Otros ingresos", Valor: sum(movIn, "amount") }, { Concepto: "Otros gastos", Valor: sum(movOut, "amount") },
      { Concepto: "Retiros del dueño", Valor: sum(movRet, "amount") }, { Concepto: "Aportes del dueño", Valor: sum(movAp, "amount") }, { Concepto: "Transferencias entre cuentas propias", Valor: sum(movTr, "amount") },
      { Concepto: "Movimientos del banco leídos", Valor: d.bank.length }, { Concepto: "Movimientos del banco sin soporte", Valor: bankMiss },
      { Concepto: "Facturas sin confirmar", Valor: missing.unconfirmed }, { Concepto: "Facturas sin tarjeta asociada", Valor: missing.noCard },
      { Concepto: "Generado", Valor: new Date().toLocaleString("es-US", { timeZone: "America/Chicago" }) }]);
    add("Compras", d.invoices.map((i) => ({ Fecha: i.issue_date || "", Tipo: i.kind, Negocio: i.business, Proveedor: i.supplier || "", "N.º fiscal proveedor": i.supplier_tax_id || "", "Factura": i.invoice_number || "", "Orden de compra": i.po_number || "",
      Subtotal: Number(i.subtotal) || 0, Impuesto: Number(i.tax) || 0, Envío: Number(i.shipping) || 0, Descuento: Number(i.discount) || 0, Total: Number(i.total) || 0, Moneda: i.currency || "USD",
      "Pagada con": cardOf(i), "Estado del pago": i.payment_status || "", Lote: i.lot || "", Estado: i.status === "confirmada" ? "Confirmada" : "Por revisar", Archivo: i.filename || "" })));
    add("Productos", d.invoices.flatMap((i) => i.items.map((it) => ({ Fecha: i.issue_date || "", Proveedor: i.supplier || "", Factura: i.invoice_number || "", Producto: it.description || "", "UPC / SKU": it.upc || it.sku || "", Cantidad: Number(it.qty) || 0, "Costo unitario": Number(it.unit_cost) || 0, "Total línea": Number(it.line_total) || (Number(it.qty) || 0) * (Number(it.unit_cost) || 0), Lote: i.lot || "" }))));
    add("Por proveedor", bySup.map((g) => ({ Proveedor: g.k, Facturas: g.n, Impuesto: g.tax, Total: g.total })));
    add("Por tarjeta", byCard.map((g) => ({ Tarjeta: g.k, Facturas: g.n, Total: g.total })));
    add("Pagos de Amazon", d.payouts.map((x) => ({ Fecha: x.paid_on, Negocio: x.business, Monto: x.amount, Lote: x.lot || "", Notas: x.notes || "" })));
    add("Declaraciones", d.tax.map((t) => ({ Obligación: t.obligation, Período: t.label, Desde: t.period_start, Hasta: t.period_end, Vence: t.due_date, Estado: t.status, Monto: t.amount ?? "", Presentada: t.filed_on || "", Notas: t.notes || "" })));
    add("Otros movimientos", d.moves.map((x) => ({ Fecha: x.moved_on, Tipo: MOVE_KIND[x.kind], Categoría: x.category || "", Concepto: x.concept, Monto: MOVE_OUT(x.kind) ? -x.amount : x.amount, Moneda: x.currency, "Cuenta o tarjeta": x.card ? `${x.card} •••• ${x.last4}` : "", Negocio: x.business || "", Soporte: x.filename || "", Notas: x.notes || "" })));
    add("Suscripciones", d.sub_charges.map((x) => ({ Fecha: x.date, Herramienta: x.name, Plataforma: x.business, Valor: x.amount, Moneda: x.currency, Tipo: CYCLE[x.cycle], Uso: x.use_kind === "mixto" ? "Mixto (empresa y personal)" : "Empresa", Tarjeta: x.card, "En el banco": x.bank ? `Sí, ${x.bank.posted_on} por ${Math.abs(x.bank.amount)}` : d.bank.length ? "No aparece" : "Sin extracto leído", Factura: x.invoice ? [x.invoice.invoice_number, x.invoice.issue_date].filter(Boolean).join(" · ") : "Falta", Enlace: x.url || "" })));
    add("Liquidaciones Amazon", d.settlements.map((x) => ({ Negocio: x.business, Reporte: x.kind === "liquidacion" ? "Liquidación " + x.ref : x.ref, Desde: x.period_start || "", Hasta: x.period_end, Depósito: x.deposit_date || "", ...Object.fromEntries(Object.keys(SETT_LABEL).map((k) => [SETT_LABEL[k], x.breakdown[k] ? Math.round(x.breakdown[k] * 100) / 100 : 0])), Neto: x.total, Moneda: x.currency })));
    add("Banco (conciliación)", byBank(d.bank).flatMap(([, list]) => list).map((l) => ({ Banco: bankOf(l.issuer), Fecha: l.posted_on, Cuenta: l.card ? `${l.card} •••• ${l.last4}` : "", Descripción: l.description, Monto: l.amount, Estado: BANK_ST[l.status][0], Soporte: l.match_label || "", Archivo: l.filename || "" })));
    add("Documentos", d.docs.map((x) => ({ Carpeta: x.folder, Documento: x.title, Fecha: x.issued_on || x.created_at.slice(0, 10), Archivo: x.filename })));
    add("Estados de cuenta", byBank(d.statements).flatMap(([, list]) => list).map((x) => ({ Banco: bankOf(x.issuer), Tarjeta: `${x.nickname} •••• ${x.last4}`, Tipo: x.card_type === "debito" ? "Débito" : "Crédito", Corte: x.closing_date, Pago: x.card_type === "debito" ? "" : x.due_date, Pagada: x.card_type === "debito" ? "" : x.paid ? "Sí" : "No", Archivo: x.filename })));
    return XLSX.write(wb, { bookType: "xlsx", type: "array" });
  }
  const base = `${fileName(ent.name)} - ${fileName(label)}`;
  const save = (blob, name) => { const a = h("a", { href: URL.createObjectURL(blob), download: name }); document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000); };
  const xlsBtn = h("button", { class: "btn sm", type: "button", onclick: (e) => busy(e.currentTarget, async () => { save(new Blob([await buildXlsx()], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), base + ".xlsx"); toast("Excel descargado."); }) }, "Descargar Excel");
  const zipBtn = h("button", { class: "btn primary sm", type: "button", onclick: (e) => busy(e.currentTarget, async () => {
    const JSZip = await loadLib("https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js", "JSZip");
    const zip = new JSZip(); zip.file(base + ".xlsx", await buildXlsx());
    const get = async (id) => { const r = await fetch("/api/files/" + id, { credentials: "same-origin" }); if (!r.ok) throw new Error("No se pudo descargar un archivo."); return r.arrayBuffer(); };
    const used = new Set(); const uniq = (path) => { let p = path, k = 2; while (used.has(p)) p = path.replace(/(\.[^.]+)?$/, ` (${k++})$1`); used.add(p); return p; };
    const extOf = (f) => (f && f.includes(".") ? f.slice(f.lastIndexOf(".")) : "");
    let nfiles = 0;
    for (const i of d.invoices) if (i.file_id) { zip.file(uniq(`Facturas/${fileName(i.business)}/${(i.issue_date || "sin-fecha").slice(0, 7)}/${fileName([i.issue_date, i.supplier, i.invoice_number].filter(Boolean).join(" "))}${extOf(i.filename)}`), await get(i.file_id)); nfiles++; }
    for (const x of d.statements) { zip.file(uniq(`Estados de cuenta/${fileName(bankOf(x.issuer))}/${fileName(x.nickname + " " + x.last4)}/${x.closing_date}${extOf(x.filename)}`), await get(x.file_id)); nfiles++; }
    for (const x of d.moves) if (x.file_id) { zip.file(uniq(`Otros movimientos/${x.moved_on.slice(0, 7)}/${fileName(`${x.moved_on} ${MOVE_KIND[x.kind]} ${x.concept}`)}${extOf(x.filename)}`), await get(x.file_id)); nfiles++; }
    const stIds = new Set(d.statements.map((x) => x.file_id));
    for (const fid of [...new Set(d.bank.map((l) => l.file_id).filter((f) => f && !stIds.has(f)))]) { const l = d.bank.find((x) => x.file_id === fid); zip.file(uniq(`Estados de cuenta/${fileName(bankOf(l.issuer))}/${fileName((l.card || "Cuenta") + " " + (l.last4 || ""))}/${fileName(l.filename || fid)}`), await get(fid)); nfiles++; }
    for (const x of d.settlements) if (x.file_id) { zip.file(uniq(`Liquidaciones de Amazon/${fileName(x.kind === "liquidacion" ? `${x.period_end} liquidación ${x.ref}` : x.ref)}${extOf(x.filename)}`), await get(x.file_id)); nfiles++; }
    for (const x of d.docs) { zip.file(uniq(`Documentos de la empresa/${fileName(x.folder)}/${fileName(x.title)}${extOf(x.filename)}`), await get(x.file_id)); nfiles++; }
    for (const t of d.tax) for (const [fid, fn, tag] of [[t.return_file_id, t.return_filename, "declaración"], [t.payment_file_id, t.payment_filename, "pago"]]) if (fid) { zip.file(uniq(`Declaraciones/${fileName(t.obligation)}/${fileName(t.label)} - ${tag}${extOf(fn)}`), await get(fid)); nfiles++; }
    save(await zip.generateAsync({ type: "blob" }), base + ".zip"); toast(`Paquete listo: Excel y ${nfiles} archivo${nfiles === 1 ? "" : "s"}.`);
  }) }, "Descargar paquete (ZIP)");
  return h("div", { class: "stack", style: "gap:18px" },
    h("section", { class: "card stack" }, h("div", { class: "row between" }, h("div", null, h("h2", null, "Paquete para el contador"), h("span", { class: "small muted" }, `${label} · todo lo de ${ent.name}, de todos sus negocios`)), sel),
      h("p", { class: "small", style: "margin:0" }, "Todo lo financiero de la empresa llega aquí solo, sin importar dónde lo subas: facturas de cualquier negocio, ventas y pagos de Amazon, suscripciones, extractos del banco, documentos bancarios y fiscales, declaraciones y los movimientos que agregues abajo."),
      h("div", { class: "row" }, zipBtn, xlsBtn, h("span", { class: "small muted" }, "El ZIP trae el Excel y todos los archivos ordenados por carpeta.")),
      missing.unconfirmed || missing.noCard || bankMiss ? h("p", { class: "small", style: "margin:0;color:var(--warn)" }, [missing.unconfirmed ? `${missing.unconfirmed} factura(s) sin confirmar` : "", missing.noCard ? `${missing.noCard} sin tarjeta asociada` : "", bankMiss ? `${bankMiss} movimiento(s) del banco sin soporte` : ""].filter(Boolean).join(" · ") + ". Conviene revisarlos antes de mandarle el paquete.") : ""),
    h("div", { class: "grid g4" }, stat("Compras (facturas)", money(sum(inv, "total"))), stat("Ventas de Amazon", money((sett.ventas || 0) + (sett.reembolsos || 0))), stat("Depósitos de Amazon", money(sum(d.payouts, "amount"))), stat("Facturas", inv.length),
      stat("Suscripciones", money(subTot, ent.id === "sas" ? "COP" : "USD")), stat("Otros gastos", money(sum(movOut, "amount"))), stat("Otros ingresos", money(sum(movIn, "amount"))), stat("Retiros del dueño", money(sum(movRet, "amount")))),
    settlementSection(ent, d),
    bankSection(ent, d),
    d.sub_charges.length ? h("section", { class: "card stack" }, h("div", { class: "row between" }, h("div", null, h("h2", null, "Suscripciones cobradas en el período"), h("span", { class: "small muted" }, "Cada cobro esperado y si ya aparece en el extracto del banco.")), h("a", { href: `#/empresa/${ent.id}/suscripciones`, style: "font-weight:700" }, "Administrar →")),
      h("div", { class: "tablewrap" }, h("table", { style: "min-width:560px" }, h("thead", null, h("tr", null, ["Fecha", "Herramienta", "Plataforma", "Valor", "En el banco", "Factura"].map((c) => h("th", null, c)))),
        h("tbody", null, d.sub_charges.map((x) => h("tr", null, h("td", { class: "mono" }, fdate(x.date)), h("td", null, x.name), h("td", { class: "small" }, x.business), h("td", { class: "mono" }, money(x.amount, x.currency)),
          h("td", null, x.bank ? pill(`Sí · ${fdate(x.bank.posted_on)}${Math.abs(Math.abs(x.bank.amount) - x.amount) > 0.01 ? " · " + money(Math.abs(x.bank.amount)) : ""}`, "ok") : x.date > new Date().toISOString().slice(0, 10) ? pill("Próximo") : d.bank.length ? pill("No aparece", "warn") : h("span", { class: "small muted" }, "Sin extracto leído")),
          h("td", null, x.invoice ? h("a", { href: "#/factura/" + x.invoice.id }, "Ver") : h("span", { class: "small muted" }, "Falta")))))))) : "",
    h("section", { class: "card stack" }, h("div", { class: "row between" }, h("div", null, h("h2", null, "Otros movimientos"), h("span", { class: "small muted" }, "Lo que no es una factura ni una suscripción: comisiones del banco, depósitos, retiros o aportes del dueño…")),
        h("button", { class: "btn primary sm only-upload", type: "button", onclick: () => moveDialog(ent) }, "+ Agregar movimiento")),
      d.moves.length ? h("div", { class: "tablewrap" }, h("table", { style: "min-width:620px" }, h("thead", null, h("tr", null, ["Fecha", "Tipo", "Concepto", "Monto", "Cuenta", "Soporte", ""].map((c) => h("th", null, c)))),
        h("tbody", null, d.moves.map((x) => h("tr", null, h("td", { class: "mono" }, fdate(x.moved_on)), h("td", null, pill(MOVE_KIND[x.kind], MOVE_PILL[x.kind])),
          h("td", null, x.concept, x.category ? h("div", { class: "small muted" }, x.category) : ""), h("td", { class: "mono" }, (MOVE_OUT(x.kind) ? "−" : "") + money(x.amount, x.currency)),
          h("td", { class: "small" }, x.card ? `${x.card} •••• ${x.last4}` : "—"), h("td", null, x.file_id ? h("a", { href: "/api/files/" + x.file_id, target: "_blank", rel: "noopener" }, "Ver") : "—"),
          h("td", { class: "only-admin" }, h("button", { class: "linkbtn small", type: "button", style: "color:var(--bad)", onclick: () => confirmDelete("Eliminar movimiento", "Se borra el movimiento y su soporte.", async () => { await api("/moves/" + x.id, { method: "DELETE" }); route(); }) }, "Eliminar")))))))
        : h("p", { class: "empty" }, "No hay otros movimientos en este período.")),
    d.docs.length ? table("Documentos bancarios y fiscales del período", d.docs, [["Carpeta", (x) => x.folder], ["Documento", (x) => x.title], ["Fecha", (x) => fdate(x.issued_on || x.created_at), "mono"], ["", (x) => h("a", { href: "/api/files/" + x.file_id, target: "_blank", rel: "noopener" }, "Ver")]]) : "",
    table("Por negocio", byBiz, [["Negocio", (g) => g.k], ["Facturas", (g) => g.n, "mono"], ["Impuesto", (g) => money(g.tax), "mono"], ["Total", (g) => money(g.total), "mono"]]),
    table("Por proveedor", bySup, [["Proveedor", (g) => g.k], ["Facturas", (g) => g.n, "mono"], ["Impuesto", (g) => money(g.tax), "mono"], ["Total", (g) => money(g.total), "mono"]]),
    table("Por tarjeta", byCard, [["Tarjeta", (g) => g.k], ["Facturas", (g) => g.n, "mono"], ["Total", (g) => money(g.total), "mono"]]),
    table("Declaraciones del período", d.tax, [["Obligación", (t) => t.obligation], ["Período", (t) => t.label], ["Vence", (t) => fdate(t.due_date), "mono"], ["Estado", (t) => pill(...(PSTATE[t.status] || [t.status, ""]))], ["Monto", (t) => t.amount != null ? money(t.amount) : "—", "mono"]]),
    !d.invoices.length && !d.payouts.length && !d.tax.length && !d.moves.length && !d.bank.length && !d.settlements.length && !d.sub_charges.length ? h("section", { class: "card" }, h("p", { class: "empty" }, "No hay facturas ni pagos en este período.")) : "");
}

const MOVE_KIND = { ingreso: "Ingreso", gasto: "Gasto", retiro: "Retiro del dueño", aporte: "Aporte del dueño", transferencia: "Entre cuentas propias" };
const MOVE_PILL = { ingreso: "ok", gasto: "warn", retiro: "bad", aporte: "info", transferencia: "" };
const MOVE_OUT = (k) => k === "gasto" || k === "retiro";
const MOVE_CAT = {
  gasto: ["Inventario / costo de mercancía", "Tarifas de Amazon u otras plataformas", "Envíos y fletes", "Empaque y etiquetas", "Software y suscripciones", "Comisiones bancarias", "Impuestos, licencias y trámites", "Publicidad", "Oficina y equipo", "Servicios profesionales", "Otros gastos"],
  ingreso: ["Ventas", "Reembolsos", "Intereses", "Otros ingresos"],
  retiro: ["Retiro del dueño"],
  aporte: ["Aporte del dueño"],
  transferencia: ["Entre cuentas propias", "Pago de tarjeta de crédito"],
};
const MOVE_HELP = {
  retiro: "Dinero que sacas de la empresa para ti. No es un gasto: el contador lo registra aparte.",
  aporte: "Dinero tuyo que pones en la empresa. No es un ingreso por ventas.",
  transferencia: "Pasar dinero entre cuentas de la misma empresa o pagar una tarjeta. No es gasto ni ingreso.",
  gasto: "Si es una suscripción que se repite, mejor agrégala en la pestaña Suscripciones para no contarla dos veces.", ingreso: "",
};
async function moveDialog(ent, line) {
  const { cards } = await api("/cards?entity=" + ent.id);
  const bizs = state.businesses.filter((b) => b.entity_id === ent.id);
  modal(line ? "Registrar movimiento del banco" : "Agregar movimiento", () => {
    const cat = h("select", { name: "category" });
    const help = h("p", { class: "small muted", style: "margin:0" });
    const kindSel = h("select", { name: "kind", onchange: () => fill() }, Object.entries(MOVE_KIND).map(([k, l]) => h("option", { value: k, selected: k === (line ? (line.amount < 0 ? "gasto" : "ingreso") : "gasto") }, l)));
    const fill = () => { cat.replaceChildren(...MOVE_CAT[kindSel.value].map((c) => h("option", null, c))); help.textContent = MOVE_HELP[kindSel.value] || ""; };
    fill();
    return h("div", { class: "stack" },
      line ? h("p", { class: "small", style: "margin:0" }, "Del extracto: ", h("b", null, line.description), ` · ${fdate(line.posted_on)} · ${money(line.amount)}`) : "",
      line ? h("input", { type: "hidden", name: "bank_line_id", value: line.id }) : "",
      h("div", { class: "fgrid" }, fld("Tipo", kindSel), fld("Categoría", cat), fld("Fecha", h("input", { name: "moved_on", type: "date", required: true, value: line?.posted_on || new Date().toISOString().slice(0, 10) }))),
      help,
      h("div", { class: "fgrid" }, fld("Monto", h("input", { name: "amount", type: "number", step: "0.01", required: true, inputmode: "decimal", value: line ? Math.abs(line.amount) : "" })), fld("Moneda", h("select", { name: "currency" }, (ent.id === "sas" ? ["COP", "USD"] : ["USD", "COP"]).map((c) => h("option", null, c)))),
        fld("Cuenta o tarjeta", h("select", { name: "card_id" }, h("option", { value: "" }, "—"), cards.map((c) => h("option", { value: c.id, selected: line?.card_id === c.id }, cardText(c)))))),
      fld("Concepto", h("input", { name: "concept", required: true, value: line?.description || "", placeholder: "Por ejemplo: comisión mensual del banco, retiro para gastos personales…" })),
      bizs.length ? fld("Negocio (opcional)", h("select", { name: "business_id" }, h("option", { value: "" }, "General de la empresa"), bizs.map((b) => h("option", { value: b.id }, b.name)))) : "",
      fld("Soporte (opcional: foto, PDF del extracto o comprobante)", h("input", { name: "file", type: "file", accept: "image/*,application/pdf" })),
      fld("Notas", h("input", { name: "notes" })));
  }, async (fd, form) => {
    fd.set("entity_id", ent.id);
    const f = fd.get("file");
    if (f && f.size) { form.querySelector("[type=submit]").textContent = "Subiendo…"; const prep = await prepareUpload(f); fd.set("file", prep.file); fd.set("original_size", prep.originalSize); } else fd.delete("file");
    await api("/moves", { method: "POST", body: fd }); toast("Movimiento agregado al resumen del contador."); route();
  }, line ? "Registrar" : "Agregar");
}

// ---------- espacio Personal (solo el administrador lo ve) ----------
const PTABS = [["resumen", "Resumen"], ["movimientos", "Movimientos"], ["cuentas", "Cuentas y tarjetas"], ["suscripciones", "Suscripciones"], ["conexion", "Conexión bancaria"]];
function monthNav(base, month, year) {
  const [y, m] = month.split("-").map(Number);
  const shift = (k) => { const d = new Date(Date.UTC(y, m - 1 + k, 1)); return d.toISOString().slice(0, 7); };
  const toggle = h("span", { class: "chips", style: "margin-left:10px" }, h("a", { class: "pill" + (year ? "" : " ok"), href: base + "?mes=" + month, style: "text-decoration:none" }, "Mes"), h("a", { class: "pill" + (year ? " ok" : ""), href: base + "?anio=" + (year || y), style: "text-decoration:none" }, "Año"));
  if (year) return h("div", { class: "row", style: "gap:8px" }, h("a", { class: "btn sm", href: base + "?anio=" + (Number(year) - 1) }, "‹"), h("b", { style: "min-width:150px;text-align:center" }, "Todo " + year), h("a", { class: "btn sm", href: base + "?anio=" + (Number(year) + 1) }, "›"), toggle);
  return h("div", { class: "row", style: "gap:8px" }, h("a", { class: "btn sm", href: base + "?mes=" + shift(-1) }, "‹"), h("b", { style: "min-width:150px;text-align:center" }, MONTHS[m - 1] + " " + y), h("a", { class: "btn sm", href: base + "?mes=" + shift(1) }, "›"), toggle);
}
async function pagePersonal(tab, q) {
  tab = PTABS.some((t) => t[0] === tab) ? tab : "resumen";
  setEntity("personal");
  const act = "personal-" + tab;
  shell(loading(), act);
  const ent = state.entities.find((e) => e.id === "personal") || { id: "personal", name: "Personal", details: {} };
  const head = [h("div", { class: "head" }, h("div", { class: "row", style: "gap:14px;align-items:center;flex-wrap:nowrap" }, entityLogo(ent, 56), h("div", null, h("span", { class: "eyebrow" }, "Personal · solo tú lo ves"), h("h1", null, "Mis finanzas")))),
    h("div", { class: "tabs", role: "tablist" }, PTABS.map(([k, l]) => h("a", { href: `#/personal/${k}`, class: k === tab ? "on" : "", role: "tab", "aria-selected": String(k === tab) }, l)))];
  const month = /^\d{4}-\d{2}$/.test(q.get("mes") || "") ? q.get("mes") : new Date().toISOString().slice(0, 7);
  const year = /^\d{4}$/.test(q.get("anio") || "") ? q.get("anio") : null;
  let content;
  if (tab === "cuentas") content = await cardsView("personal");
  else if (tab === "suscripciones") content = await subsView(ent, null, q);
  else if (tab === "conexion") content = await sfinView();
  else {
    const d = await api("/personal/summary?" + (year ? "year=" + year : "month=" + month) + (tab === "movimientos" ? "" : "&scope=resumen"));
    content = tab === "movimientos" ? personalMoves(d, month, year) : personalSummary(d, month, year);
  }
  shell(h("div", { class: "page" }, ...head, content), act);
}
function catBars(list, usd) {
  const max = Math.max(1, ...list.map((c) => c.total));
  return list.length ? h("div", { class: "stack", style: "gap:8px" }, list.map((c) => h("div", null,
    h("div", { class: "row between small" }, h("span", null, c.category), h("b", { class: "mono" }, usd(c.total))),
    h("div", { style: "height:8px;border-radius:5px;background:var(--line);overflow:hidden" }, h("div", { style: `height:100%;width:${(c.total / max) * 100}%;background:linear-gradient(90deg,#6b767e,#3f6f57)` }))))) : h("p", { class: "empty" }, "Sin gastos en este período.");
}
function personalSummary(d, month, year) {
  const usd = (v) => money(v, "USD");
  const mineAccts = d.accounts.filter((a) => !a.others_money);
  const debit = mineAccts.filter((a) => a.card_type === "debito"), credit = mineAccts.filter((a) => a.card_type !== "debito");
  const cash = debit.reduce((s, a) => s + (effBal(a) || 0), 0), owed = credit.reduce((s, a) => s + Math.abs(Math.min(0, Number(a.balance) || 0)), 0);
  const othersCash = d.accounts.filter((a) => a.others_money).reduce((s, a) => s + (effBal(a) || 0), 0);
  const stat = (l, v, cls) => h("div", { class: "card stat" }, h("span", { class: "small muted" }, l), h("br"), h("b", { style: cls || "" }, v));
  const label = year ? "del año" : "del mes";
  const base = "#/personal/resumen";
  const acctCard = (a) => h("section", { class: "card stack", style: "gap:8px" + (a.others_money ? ";border-style:dashed" : "") },
    h("span", { class: "stack", style: "gap:2px" }, h("span", { class: "row between", style: "gap:8px;flex-wrap:nowrap" }, h("b", null, a.nickname), a.others_money ? pill("No es tu dinero", "info") : ""), h("span", { class: "small muted" }, [bankOf(a.issuer), CTYPE[a.card_type], "•••• " + a.last4].join(" · "))),
    h("div", { style: "padding:8px 10px;border-radius:10px;background:var(--line)" }, h("span", { class: "small muted" }, a.card_type === "debito" ? "Saldo disponible" : "Deuda actual", a.balance_at ? " · al " + fdate(a.balance_at) : ""), h("br"),
      h("b", { class: "mono", style: "font-size:20px;" + (a.card_type !== "debito" && a.balance < 0 ? "color:var(--warn)" : "") }, balanceText(a)),
      ledgerNote(a) ? h("div", { class: "small muted" }, ledgerNote(a)) : ""),
    h("span", { class: "small muted" }, year ? `Movimientos de ${year}:` : "Movimientos del mes:"),
    h("div", { class: "row small", style: "gap:14px;flex-wrap:wrap" }, h("span", null, "Entró ", h("b", { class: "mono", style: "color:var(--ok)" }, usd(a.in_total))), h("span", null, "Salió ", h("b", { class: "mono" }, usd(a.out_total))), h("span", { class: "muted" }, `${a.n} movimiento${a.n === 1 ? "" : "s"}`)),
    a.by_category.length ? h("span", { class: "small muted" }, "En qué: " + a.by_category.slice(0, 3).map((c) => `${c.category} ${usd(c.total)}`).join(" · ")) : "",
    h("a", { class: "small", href: `#/personal/movimientos?${year ? "anio=" + year : "mes=" + month}&cuenta=${a.id}`, style: "font-weight:700" }, "Ver movimientos →"));
  return h("div", { class: "stack", style: "gap:18px" },
    h("div", { class: "row between" }, monthNav(base, month, year), h("div", { class: "row only-admin", style: "gap:8px" },
      h("button", { class: "btn sm", type: "button", onclick: () => bankImportDialog({ id: "personal", name: "Personal" }) }, "Leer extracto"),
      h("button", { class: "btn primary sm", type: "button", onclick: () => personalMoveDialog(d.categories) }, "+ Movimiento manual"))),
    !d.sfin.connected ? h("section", { class: "card row between" }, h("span", { class: "small" }, "Conecta tus bancos para que los movimientos y saldos lleguen solos todos los días."), h("a", { class: "btn sm", href: "#/personal/conexion" }, "Conectar bancos")) : "",
    h("h2", { style: "margin:0" }, "Lo tuyo", h("span", { class: "small muted", style: "font-weight:400" }, " · sin las cuentas cuyo dinero no es tuyo")),
    h("div", { class: "grid g4" }, stat("Patrimonio (cuentas − tarjetas)", usd(cash - owed), cash - owed < 0 ? "color:var(--bad)" : ""), stat("Disponible en tus cuentas", usd(cash)), stat("Debes en tarjetas", usd(owed), owed ? "color:var(--warn)" : ""), stat("Ahorro " + label, usd(d.income - d.spend), d.income - d.spend < 0 ? "color:var(--bad)" : "color:var(--ok)")),
    h("div", { class: "grid g4" }, stat("Ingresos " + label, usd(d.income)), stat("Gastos " + label, usd(d.spend)), stat("Suscripciones " + label, usd(d.sub_charges.reduce((s, x) => s + (x.currency === "USD" ? x.amount : 0), 0))), stat("Promedio de gasto al mes", usd(year ? d.spend / Math.max(1, Number(year) === new Date().getFullYear() ? new Date().getMonth() + 1 : 12) : d.spend))),
    h("div", { class: "split" },
      h("section", { class: "card stack", style: "flex:1 1 360px" }, h("h2", null, "En qué se fue tu dinero"), catBars(d.by_category, usd)),
      h("section", { class: "card stack", style: "flex:1 1 300px" }, h("h2", null, "General: todas las cuentas"),
        h("div", { class: "kv" }, h("div", null, h("span", null, "Entradas " + label), h("b", { class: "mono" }, usd(d.general.income))), h("div", null, h("span", null, "Gastos " + label), h("b", { class: "mono" }, usd(d.general.spend))),
          h("div", null, h("span", null, "Saldo en cuentas de otras personas"), h("b", { class: "mono" }, usd(othersCash)))),
        h("b", { class: "small" }, "En qué se fue (todas)"), catBars(d.general.by_category.slice(0, 8), usd),
        d.due.length ? h("div", { class: "stack", style: "gap:4px" }, h("b", { class: "small" }, "Próximos pagos de tarjeta"), d.due.map((x) => h("span", { class: "small" }, `${x.nickname} •••• ${x.last4}: ${fdate(x.due_date)}`))) : "")),
    h("h2", { style: "margin:0" }, "Por cuenta"),
    d.per_account.length ? h("div", { class: "grid g3" }, d.per_account.map(acctCard)) : h("p", { class: "empty" }, "Todavía no hay cuentas. Conéctalas o agrégalas en Cuentas y tarjetas."),
    h("section", { class: "card stack" }, h("div", { class: "row between" }, h("h2", null, "Últimos movimientos"), h("a", { href: `#/personal/movimientos?${year ? "anio=" + year : "mes=" + month}`, style: "font-weight:700" }, "Ver todos →")),
      d.items.length ? movesTable(d.items.slice(0, 8), d.categories) : h("p", { class: "empty" }, "No hay movimientos en este período.")));
}
function movesTable(items, cats) {
  const setCat = async (x, cat) => { const r = await api("/personal/lines/" + x.id, { method: "PUT", body: { category: cat, learn: true } }); toast(r.same ? `Listo. También cambié ${r.same} movimiento(s) del mismo comercio y lo recordaré.` : "Listo. Lo recordaré para este comercio."); route(); };
  return h("div", { class: "tablewrap" }, h("table", { style: "min-width:720px" }, h("thead", null, h("tr", null, ["Fecha", "Descripción", "Categoría", "Monto", ""].map((c) => h("th", null, c)))),
    h("tbody", null, items.map((x) => h("tr", { style: x.status === "empresa" ? "opacity:.6" : "" }, h("td", { class: "mono" }, fdate(x.date)),
      h("td", { class: "small" }, h("b", { style: "color:var(--ink)" }, x.desc), x.pending ? [" ", pill("Pendiente", "warn")] : "", h("div", { class: "muted" }, x.kind === "manual" ? "Movimiento manual" : x.card)),
      h("td", null, x.kind === "banco" && x.status !== "empresa" ? h("select", { "aria-label": "Categoría", style: "width:auto;max-width:210px", onchange: (e) => setCat(x, e.target.value) }, cats.map((c) => h("option", { selected: c === x.category }, c))) : h("span", { class: "small" }, x.status === "empresa" ? "Pasado a la empresa" : x.category)),
      h("td", { class: "mono", style: x.amount > 0 ? "color:var(--ok)" : "" }, (x.amount < 0 ? "−" : "+") + money(Math.abs(x.amount))),
      h("td", null, h("span", { class: "row", style: "gap:10px" },
        x.kind === "banco" && x.status !== "empresa" ? h("button", { class: "linkbtn small", type: "button", onclick: () => toCompanyDialog(x) }, "Es de Starkum") : "",
        x.kind === "banco" && x.status !== "empresa" ? h("button", { class: "linkbtn small", type: "button", onclick: async () => { await api("/bank/lines/" + x.id, { method: "PUT", body: { status: "ignorado" } }); toast("Ignorado: ya no cuenta en tus gastos."); route(); } }, "Ignorar") : "",
        x.kind === "manual" ? h("button", { class: "linkbtn small", type: "button", style: "color:var(--bad)", onclick: () => confirmDelete("Eliminar movimiento", "Se borra este movimiento manual.", async () => { await api("/moves/" + x.id, { method: "DELETE" }); route(); }) }, "Eliminar") : "")))))));
}
function personalMoves(d, month, year) {
  let cat = "", text = "", acct = new URLSearchParams(location.hash.split("?")[1] || "").get("cuenta") || "";
  const box = h("div");
  const draw = () => box.replaceChildren(movesTable(d.items.filter((x) => (!cat || x.category === cat) && (!acct || x.card_id === acct) && (!text || x.desc.toLowerCase().includes(text))), d.categories));
  draw();
  return h("div", { class: "stack", style: "gap:16px" },
    h("div", { class: "row between" }, monthNav("#/personal/movimientos", month, year), h("div", { class: "row only-admin", style: "gap:8px" },
      h("button", { class: "btn sm", type: "button", onclick: () => bankImportDialog({ id: "personal", name: "Personal" }) }, "Leer extracto"),
      h("button", { class: "btn primary sm", type: "button", onclick: () => personalMoveDialog(d.categories) }, "+ Movimiento manual"))),
    h("div", { class: "row", style: "gap:10px;flex-wrap:wrap" }, h("input", { type: "search", placeholder: "Buscar comercio o descripción", style: "max-width:300px", oninput: (e) => { text = e.target.value.toLowerCase(); draw(); } }),
      h("select", { "aria-label": "Filtrar por categoría", style: "width:auto", onchange: (e) => { cat = e.target.value; draw(); } }, h("option", { value: "" }, "Todas las categorías"), d.categories.map((c) => h("option", null, c))),
      h("select", { "aria-label": "Filtrar por cuenta", style: "width:auto", onchange: (e) => { acct = e.target.value; draw(); } }, h("option", { value: "" }, "Todas las cuentas"), d.accounts.map((a) => h("option", { value: a.id, selected: a.id === acct }, `${a.nickname} •••• ${a.last4}`)))),
    h("section", { class: "card stack" }, h("p", { class: "small muted", style: "margin:0" }, "Si cambias la categoría de un movimiento, la intranet la recuerda para ese comercio. \"Es de Starkum\" lo pasa a la empresa como gasto pagado con tu cuenta personal (para el contador es un aporte del dueño)."), box));
}
function personalMoveDialog(cats) {
  modal("Movimiento manual", () => h("div", { class: "stack" },
    h("div", { class: "fgrid" }, fld("Tipo", h("select", { name: "kind" }, [["gasto", "Gasto"], ["ingreso", "Ingreso"], ["transferencia", "Transferencia"]].map(([k, l]) => h("option", { value: k }, l)))),
      fld("Categoría", h("select", { name: "category" }, cats.map((c) => h("option", { selected: c === "Otros" }, c)))), fld("Fecha", h("input", { name: "moved_on", type: "date", required: true, value: new Date().toISOString().slice(0, 10) }))),
    h("div", { class: "fgrid" }, fld("Monto", h("input", { name: "amount", type: "number", step: "0.01", required: true, inputmode: "decimal" })), fld("Moneda", h("select", { name: "currency" }, ["USD", "COP"].map((c) => h("option", null, c))))),
    fld("Concepto", h("input", { name: "concept", required: true, placeholder: "Por ejemplo: efectivo para el mercado" }))),
  async (fd) => { fd.set("entity_id", "personal"); await api("/moves", { method: "POST", body: fd }); toast("Movimiento agregado."); route(); }, "Agregar");
}
function toCompanyDialog(x) {
  modal("Pasar a la empresa", () => h("div", { class: "stack" },
    h("p", { class: "small", style: "margin:0" }, h("b", null, x.desc), ` · ${fdate(x.date)} · ${money(Math.abs(x.amount))}`),
    h("div", { class: "fgrid" }, fld("Empresa", h("select", { name: "entity_id" }, [["llc", "Starkum Holdings LLC"], ["sas", "Starkum Group SAS"]].map(([k, l]) => h("option", { value: k }, l)))),
      fld("Categoría en la empresa", h("select", { name: "category" }, (x.amount < 0 ? MOVE_CAT.gasto : MOVE_CAT.ingreso).map((c) => h("option", null, c))))),
    h("p", { class: "small muted", style: "margin:0" }, "Queda en \"Para el contador\" de la empresa como gasto pagado con tu cuenta personal, y deja de contar en tus gastos personales.")),
  async (fd) => { await api(`/personal/lines/${x.id}/company`, { method: "POST", body: Object.fromEntries(fd) }); toast("Pasado a la empresa."); route(); }, "Pasar");
}
// En cuentas de débito se muestra el saldo disponible (como la app del banco); en tarjetas, la deuda
const effBal = (c) => (c.card_type === "debito" && c.available != null && Number(c.available) !== 0 ? Number(c.available) : c.balance == null ? null : Number(c.balance));
const ledgerNote = (c) => (c.card_type === "debito" && c.available != null && Number(c.available) !== 0 && c.balance != null && Math.abs(Number(c.available) - Number(c.balance)) > 0.009 ? `Saldo contable ${money(c.balance, c.currency || "USD")} (hay movimientos por registrarse)` : "");
function balanceText(c) {
  const b = effBal(c);
  if (b == null) return "Sin saldo";
  const debt = c.card_type !== "debito" && b < 0;
  return (debt ? "Debes " : "") + money(Math.abs(b), c.currency || "USD");
}
function balanceLine(c) {
  const debt = c.card_type !== "debito" && c.balance < 0;
  return h("span", { class: "stack", style: "gap:0" },
    h("b", { class: "mono", style: `font-size:22px;${debt ? "color:var(--warn)" : ""}` }, balanceText(c)),
    h("span", { class: "small muted" }, c.balance == null ? (c.sfin_id ? "Sincroniza para traer el saldo" : "Actualízalo a mano o conéctala") : `${c.card_type === "debito" ? "Saldo disponible" : "Saldo de la tarjeta"} al ${fdate(c.balance_at)}${c.sfin_id ? " · automático" : ""}${c.others_money ? " · no es tu dinero" : ""}`),
    ledgerNote(c) ? h("span", { class: "small muted" }, ledgerNote(c)) : "");
}
function balancesTable(cards) {
  const mine = cards.filter((c) => !c.others_money);
  const cash = mine.filter((c) => c.card_type === "debito").reduce((s2, c) => s2 + (effBal(c) || 0), 0);
  const owed = mine.filter((c) => c.card_type !== "debito").reduce((s2, c) => s2 + Math.abs(Math.min(0, Number(c.balance) || 0)), 0);
  return h("section", { class: "card stack" }, h("div", { class: "row between" }, h("h2", null, "Saldos actuales"),
      h("span", { class: "small" }, "Tuyo: ", h("b", { class: "mono" }, money(cash)), " en cuentas · ", h("b", { class: "mono", style: "color:var(--warn)" }, money(owed)), " de deuda · patrimonio ", h("b", { class: "mono" }, money(cash - owed)))),
    h("div", { class: "tablewrap" }, h("table", { style: "min-width:560px" }, h("thead", null, h("tr", null, ["Cuenta", "Banco", "Tipo", "Saldo disponible / deuda", "Actualizado"].map((t) => h("th", null, t)))),
      h("tbody", null, byBank(cards).flatMap(([, list]) => list).map((c) => h("tr", { style: c.others_money ? "opacity:.65" : "" },
        h("td", null, h("b", null, c.nickname), " ", h("span", { class: "muted small" }, "•••• " + c.last4), c.others_money ? [" ", pill("No es tu dinero", "info")] : ""),
        h("td", { class: "small" }, bankOf(c.issuer)), h("td", { class: "small" }, CTYPE[c.card_type]),
        h("td", { class: "mono", style: c.card_type !== "debito" && c.balance < 0 ? "color:var(--warn);font-weight:700" : "font-weight:700" }, balanceText(c), ledgerNote(c) ? h("div", { class: "small muted", style: "font-weight:400" }, "contable " + money(c.balance)) : ""),
        h("td", { class: "small muted" }, c.balance_at ? fdate(c.balance_at) : "—")))))));
}
function balanceDialog(c) {
  modal("Saldo de " + c.nickname, () => h("div", { class: "stack" },
    fld(c.card_type === "debito" ? "Saldo actual de la cuenta" : "Lo que debes en la tarjeta", h("input", { name: "balance", type: "number", step: "0.01", required: true, inputmode: "decimal", value: c.balance != null ? Math.abs(c.balance) : "" })),
    h("p", { class: "small muted", style: "margin:0" }, "Si conectas esta cuenta con SimpleFIN, el saldo se actualiza solo todos los días.")),
  async (fd) => { const v = Math.abs(Number(fd.get("balance")) || 0); await api(`/personal/accounts/${c.id}/balance`, { method: "PUT", body: { balance: c.card_type === "debito" ? v : -v } }); toast("Saldo actualizado."); route(); });
}
let sfinCheck = false;
async function sfinView() {
  const d = await api("/personal/summary");
  const st = d.sfin;
  const steps = h("ol", { class: "small", style: "margin:0;padding-left:20px;line-height:1.7" },
    h("li", null, "Entra a ", h("a", { href: "https://beta-bridge.simplefin.org", target: "_blank", rel: "noopener" }, "SimpleFIN Bridge"), ", crea tu cuenta y paga el plan ($15 al año o $1.50 al mes)."),
    h("li", null, "Dentro de SimpleFIN, conecta tus bancos (Chase, U.S. Bank, Discover…). Tu usuario y contraseña del banco los escribes allá, nunca aquí."),
    h("li", null, "En SimpleFIN crea una conexión para una app nueva: te da un \"Setup Token\" (un texto largo)."),
    h("li", null, "Pégalo abajo. La intranet lo cambia por un acceso de solo lectura y lo guarda cifrado."));
  const key = (() => { const a = new Uint8Array(32); crypto.getRandomValues(a); return [...a].map((b) => b.toString(16).padStart(2, "0")).join(""); })();
  const vaultBox = !st.vault ? h("section", { class: "card stack", style: "border-color:var(--warn)" }, h("h2", null, "Paso previo: la clave para cifrar"),
    h("p", { class: "small", style: "margin:0" }, "El acceso a tus bancos se guarda cifrado con una clave que solo existe en Cloudflare (no en la base de datos ni en el código). Hay que crearla una sola vez:"),
    h("ol", { class: "small", style: "margin:0;padding-left:20px;line-height:1.7" },
      h("li", null, "Abre Cloudflare → Workers y Pages → ", h("b", null, "intranet"), " → Settings → Variables and Secrets → Add."),
      h("li", null, "Tipo ", h("b", null, "Secret"), ", nombre ", h("code", null, "VAULT_KEY"), ", y como valor pega esta clave (se generó solo para ti y no se guarda en ningún lado):"),
      h("li", null, "Guarda (Deploy). Vuelve aquí y recarga la página.")),
    h("div", { class: "row", style: "gap:8px" }, h("code", { class: "mono", style: "padding:8px 10px;background:var(--line);border-radius:8px;word-break:break-all" }, key), h("button", { class: "btn sm", type: "button", onclick: () => navigator.clipboard.writeText(key).then(() => toast("Clave copiada.")) }, "Copiar")),
    h("p", { class: "small muted", style: "margin:0" }, "Si recargas esta página antes de guardarla, sale otra clave distinta; usa la que pegues en Cloudflare.")) : "";
  const connectBox = h("section", { class: "card stack" }, h("h2", null, st.connected ? "Conexión activa" : "Conectar con SimpleFIN"),
    st.connected ? h("p", { class: "small", style: "margin:0" }, st.status ? `Última sincronización: ${new Date(st.status.last_sync).toLocaleString("es-US", { timeZone: "America/Chicago" })} · ${st.status.added} movimiento(s) nuevos.` : "Conectado. Todavía no se ha sincronizado.",
      st.status?.errors?.length ? h("span", { style: "color:var(--warn)" }, " Avisos de SimpleFIN: " + st.status.errors.join(" · ")) : "") : steps,
    st.connected ? "" : h("form", { class: "row", style: "gap:8px", onsubmit: async (e) => { e.preventDefault(); const t = e.target.elements.tok.value; await busy(e.target.querySelector("button"), async () => { await api("/personal/sfin/connect", { method: "POST", body: { setup_token: t } }); toast("Conectado. Ahora asigna cada cuenta."); route(); }); } },
      h("input", { name: "tok", required: true, placeholder: "Pega aquí el Setup Token de SimpleFIN", autocomplete: "off", style: "flex:1;min-width:240px", disabled: !st.vault }), h("button", { class: "btn primary", type: "submit", disabled: !st.vault }, "Conectar")),
    h("p", { class: "small muted", style: "margin:0" }, "Solo lectura: SimpleFIN no permite mover dinero. Se sincroniza sola una vez al día; puedes forzarla con \"Sincronizar ahora\"."));
  let accBox = "";
  if (st.connected) {
    const doCheck = sfinCheck; sfinCheck = false;
    const [r, { cards }] = await Promise.all([api("/personal/sfin/accounts" + (doCheck ? "?check=1" : "")).catch((e) => ({ error: e.message })), api("/cards")]);
    const ck = doCheck && r.check ? r.check : null;
    const checkBox = ck ? h("div", { class: "card stack", style: "gap:4px;background:var(--line);border-color:" + (ck.added.length || ck.removed.length ? "var(--warn)" : "var(--line)") },
      h("b", null, ck.added.length || ck.removed.length ? "Hay cambios en SimpleFIN" : "Todo al día: no hay cuentas nuevas ni eliminadas."),
      h("span", { class: "small" }, `SimpleFIN tiene ${ck.total} cuenta(s) conectada(s).`),
      ck.added.length ? h("span", { class: "small" }, h("b", null, "Nuevas: "), ck.added.join(" · "), ". Asígnalas abajo para traer sus movimientos.") : "",
      ck.removed.length ? h("span", { class: "small" }, h("b", null, "Ya no están en SimpleFIN: "), ck.removed.join(" · "), ". Sus movimientos se conservan; abajo puedes quitar el vínculo.") : "") : "";
    const missBox = r.missing?.length ? h("div", { class: "stack", style: "gap:8px;padding:10px;border:1px dashed var(--warn);border-radius:10px" },
      h("b", { class: "small" }, "Vinculadas en la intranet pero ya no aparecen en SimpleFIN"),
      ...r.missing.map((c) => h("div", { class: "row between", style: "flex-wrap:wrap;gap:8px" }, h("span", null, `${c.nickname} •••• ${c.last4}`, " ", pill("Eliminada en SimpleFIN", "warn")),
        h("button", { class: "btn sm", type: "button", onclick: (e) => busy(e.currentTarget, async () => { await api("/personal/sfin/map", { method: "POST", body: { sfin_id: c.sfin_id, card_id: null } }); toast("Vínculo quitado. La cuenta y sus movimientos se quedan."); route(); }) }, "Quitar vínculo"))),
      h("span", { class: "small muted" }, "Si la volviste a conectar en SimpleFIN, aparece como cuenta nueva: asígnala a la misma cuenta y sigue donde iba.")) : "";
    const pcards = (await api("/cards?entity=personal")).cards;
    const all = [...cards, ...pcards.filter((c) => !cards.some((x) => x.id === c.id))];
    accBox = h("section", { class: "card stack" }, h("div", { class: "row between" }, h("h2", null, "Cuentas conectadas"),
        h("span", { class: "row", style: "gap:8px" }, h("button", { class: "btn sm", type: "button", title: "Revisa en SimpleFIN si agregaste o eliminaste cuentas", onclick: (e) => busy(e.currentTarget, async () => { sfinCheck = true; await route(); }) }, "↻ Actualizar cuentas"),
          h("button", { class: "btn primary sm", type: "button", onclick: (e) => busy(e.currentTarget, async () => { const s2 = await api("/personal/sfin/sync", { method: "POST" }); toast(`Sincronizado: ${s2.added} movimiento(s) nuevos.`); route(); }) }, "Sincronizar ahora"),
          h("button", { class: "btn sm danger", type: "button", onclick: () => confirmDelete("Desconectar SimpleFIN", "Se borra el acceso guardado. Los movimientos ya traídos se quedan.", async () => { await api("/personal/sfin", { method: "DELETE" }); toast("Desconectado."); route(); }) }, "Desconectar"))),
      checkBox, missBox,
      r.error ? h("p", { class: "small", style: "color:var(--bad);margin:0" }, r.error) : h("div", { class: "stack", style: "gap:10px" }, r.accounts.map((a) => {
        const sel = h("select", { "aria-label": "Asignar " + a.name, style: "width:auto;max-width:320px" }, h("option", { value: "" }, "Sin asignar (no se trae)"),
          h("optgroup", { label: "Crear nueva" }, h("option", { value: "new:personal:debito" }, "Nueva cuenta personal"), h("option", { value: "new:personal:credito" }, "Nueva tarjeta de crédito personal")),
          ...byBank(all).map(([bank, list]) => h("optgroup", { label: bank }, list.map((c) => h("option", { value: c.id, selected: a.card?.id === c.id }, `${c.nickname} •••• ${c.last4}` + (c.entity_id === "personal" ? " (personal)" : c.entity_id ? " (" + (c.entity_id === "llc" ? "LLC" : "SAS") + ")" : ""))))));
        sel.onchange = async () => { const v = sel.value; const body = { sfin_id: a.id };
          if (v.startsWith("new:")) { const [, e2, t] = v.split(":"); body.create = { entity_id: e2, card_type: t, nickname: a.name.slice(0, 60), issuer: a.org, last4: (a.name.match(/(\d{4})\D*$/) || [])[1] || "0000" }; } else body.card_id = v || null;
          await api("/personal/sfin/map", { method: "POST", body }); toast(v ? "Cuenta asignada. Sincroniza para traer sus movimientos." : "Cuenta sin asignar."); route(); };
        const vis = a.card ? h("label", { class: "row small", style: "gap:6px;white-space:nowrap;cursor:pointer", title: "Si la desmarcas, esta cuenta no aparece en el Resumen (ni en sus totales). Sigue sincronizándose y sus movimientos siguen en Movimientos." },
          h("input", { type: "checkbox", checked: !a.card.hide_summary, style: "width:auto", onchange: async (e) => { const on = e.target.checked; e.target.disabled = true;
            try { await api(`/personal/accounts/${a.card.id}/visible`, { method: "PUT", body: { show: on } }); a.card.hide_summary = on ? 0 : 1; toast(on ? `${a.name}: se muestra en el Resumen.` : `${a.name}: oculta en el Resumen.`); } catch (err) { e.target.checked = !on; toast(err.message); } finally { e.target.disabled = false; } } }),
          "Mostrar en Resumen") : h("span", { class: "small muted", style: "white-space:nowrap" }, "Asígnala para mostrarla");
        return h("div", { class: "row between", style: "padding:10px 0;border-bottom:1px solid var(--line);flex-wrap:wrap;gap:10px" }, h("span", { class: "stack", style: "gap:2px" }, h("span", null, h("b", null, a.name), a.is_new ? [" ", pill("Nueva", "ok")] : !a.card ? [" ", pill("Sin asignar")] : ""), h("span", { class: "small muted" }, `${a.org} · ` + (a.balance < 0 ? `debes ${money(Math.abs(a.balance), a.currency || "USD")}` : `disponible ${money(a.available ? a.available : a.balance || 0, a.currency || "USD")}`))), h("span", { class: "row", style: "gap:14px;flex-wrap:wrap" }, vis, sel));
      })),
      (() => { const loose = pcards.filter((c) => c.active !== 0 && !c.sfin_id);
        return loose.length ? h("div", { class: "stack", style: "gap:6px;padding-top:6px" }, h("b", { class: "small" }, "Cuentas sin conexión automática"),
          ...loose.map((c) => h("div", { class: "row between", style: "padding:6px 0;border-bottom:1px solid var(--line);flex-wrap:wrap;gap:10px" }, h("span", null, h("b", null, c.nickname), h("span", { class: "small muted" }, ` · ${bankOf(c.issuer)} · •••• ${c.last4}`)),
            h("label", { class: "row small", style: "gap:6px;white-space:nowrap;cursor:pointer" }, h("input", { type: "checkbox", checked: !c.hide_summary, style: "width:auto", onchange: async (e) => { const on = e.target.checked; e.target.disabled = true;
              try { await api(`/personal/accounts/${c.id}/visible`, { method: "PUT", body: { show: on } }); toast(on ? `${c.nickname}: se muestra en el Resumen.` : `${c.nickname}: oculta en el Resumen.`); } catch (err) { e.target.checked = !on; toast(err.message); } finally { e.target.disabled = false; } } }), "Mostrar en Resumen")))) : ""; })(),
      h("p", { class: "small muted", style: "margin:0" }, "Si una cuenta es de la empresa (por ejemplo, la Chase de Starkum), asígnala a la cuenta de la LLC: sus movimientos llegan solos a la conciliación del banco de la empresa."));
  }
  return h("div", { class: "stack", style: "gap:16px" }, vaultBox, connectBox, accBox);
}
// ---------- suscripciones ----------
const CYCLE = { mensual: "Mensual", anual: "Anual", gratis: "Gratis (sin cobro)" };
async function subsView(ent, biz, q) {
  const [{ subs }, { cards }, { platforms }] = await Promise.all([api(biz ? "/subs?business=" + biz.id : "/subs?entity=" + ent.id), api("/cards?entity=" + ent.id), api("/platforms")]);
  const plat = biz ? null : q?.get("p") || "";
  const shown = subs.filter((s) => !plat || (plat === "general" ? !s.platform_ids.length : s.platform_ids.includes(plat)));
  const act = shown.filter((s) => s.active && !s.pending && s.cycle !== "gratis");
  const per = {}; for (const s of act) { const c = s.currency || "USD"; per[c] = per[c] || { m: 0, y: 0 }; per[c].m += s.cycle === "anual" ? s.amount / 12 : s.amount; per[c].y += s.cycle === "anual" ? s.amount : s.amount * 12; }
  const curs = Object.keys(per).length ? Object.keys(per) : [ent.id === "sas" ? "COP" : "USD"];
  const stat = (l, v) => h("div", { class: "card stat" }, h("span", { class: "small muted" }, l), h("br"), h("b", null, v));
  const base = biz ? `#/negocio/${biz.id}/suscripciones` : `#/empresa/${ent.id}/suscripciones`;
  const usedPlats = platforms.filter((p) => subs.some((s) => s.platform_ids.includes(p.id)));
  const filt = biz || !subs.length ? "" : h("div", { class: "chips", role: "tablist", "aria-label": "Plataforma" },
    [["", "Todas"], ...usedPlats.map((p) => [p.id, p.name]), ...(subs.some((s) => !s.platform_ids.length) ? [["general", "General de la empresa"]] : [])].map(([k, l]) => h("a", { href: base + (k ? "?p=" + k : ""), class: "pill" + (plat === k ? " ok" : ""), role: "tab", "aria-selected": String(plat === k), style: "text-decoration:none" }, l)));
  const pend = shown.filter((s) => s.pending && s.active).length;
  const row = (s) => h("tr", { style: s.active ? "" : "opacity:.55" },
    h("td", null, s.url ? h("a", { href: s.url, target: "_blank", rel: "noopener", style: "font-weight:700" }, s.name) : h("b", null, s.name), s.notes ? h("div", { class: "small muted", style: "max-width:320px" }, s.notes) : ""),
    h("td", null, h("span", { class: "chips" }, s.platforms.length ? s.platforms.map((n) => pill(n, "info")) : pill("General"))),
    h("td", { class: "mono" }, s.cycle === "gratis" ? pill("Gratis", "ok") : s.amount > 0 ? money(s.amount, s.currency) : "—"), h("td", null, s.pending || s.cycle === "gratis" ? "—" : CYCLE[s.cycle]),
    h("td", { class: "mono" }, !s.active ? h("span", { class: "small muted" }, "Cancelada " + fdate(s.ended_on)) : s.pending ? pill("Por completar", "warn") : s.cycle === "gratis" ? "—" : fdate(s.next_charge)),
    h("td", { class: "small" }, s.card ? `${s.card} •••• ${s.last4}` : "—"),
    h("td", { class: "small" }, h("span", { class: "stack", style: "gap:2px" },
      s.invoices.length ? h("a", { href: "#/factura/" + s.invoices[0].id, style: "font-weight:700" }, `${s.invoices.length} factura${s.invoices.length === 1 ? "" : "s"}`) : h("span", { class: "muted" }, "Sin facturas"),
      s.invoices.length ? h("span", { class: "muted" }, `Última: ${fdate(s.invoices[0].issue_date || s.invoices[0].created_at)}${s.invoices[0].total ? " · " + money(s.invoices[0].total, s.invoices[0].currency) : ""}`) : "",
      s.cycle !== "gratis" ? h("button", { class: "linkbtn small only-upload", type: "button", style: "padding:0;text-align:left", onclick: () => subInvoice(s, ent, platforms) }, "+ Subir factura") : "")),
    h("td", { class: "only-admin" }, h("button", { class: "linkbtn small", type: "button", onclick: () => subDialog(s, ent, cards, platforms) }, s.pending ? "Completar" : "Editar")));
  return h("div", { class: "stack", style: "gap:16px" },
    h("div", { class: "row between" }, h("p", { class: "small muted", style: "margin:0;max-width:660px" }, biz ? `Las herramientas que usas en ${biz.name}. Si una también la usas en otra plataforma, es el mismo registro: se cobra una sola vez.` : "Cada herramienta es un solo registro aunque la uses en varias plataformas, así el cobro no se duplica. Cada cobro sale en el paquete del contador y se compara con el estado de cuenta."),
      h("button", { class: "btn primary sm only-admin", type: "button", onclick: () => subDialog(null, ent, cards, platforms, plat && plat !== "general" ? plat : biz ? platforms.filter((p) => p.business_id === biz.id).map((p) => p.id)[0] : "") }, "+ Agregar herramienta")),
    filt,
    h("div", { class: "grid g4" }, stat("Con cobro activo", act.length), ...curs.flatMap((c) => [stat("Al mes" + (curs.length > 1 ? " · " + c : ""), money(per[c]?.m || 0, c)), stat("Al año" + (curs.length > 1 ? " · " + c : ""), money(per[c]?.y || 0, c))]), stat("Por completar", pend)),
    shown.length ? h("section", { class: "card stack" },
      h("div", { class: "tablewrap" }, h("table", { style: "min-width:860px" }, h("thead", null, h("tr", null, ["Herramienta", "Plataformas", "Valor", "Tipo", "Próximo cobro", "Tarjeta", "Facturas", ""].map((c) => h("th", null, c)))), h("tbody", null, shown.map(row)))),
      pend ? h("p", { class: "small muted", style: "margin:0" }, "Las que dicen \"Por completar\" todavía no cuentan como gasto. Cuando empieces a pagarlas, agrega el valor, el tipo, la fecha de cobro y la tarjeta.") : "")
      : h("section", { class: "card" }, h("p", { class: "empty" }, "Todavía no hay herramientas aquí.")),
    ent.id === "personal" ? "" : h("section", { class: "card stack" }, h("h2", null, "¿Cuentan como gasto de la empresa?"),
      h("p", { class: "small", style: "margin:0" }, ent.id === "sas"
        ? "Sí, si la herramienta se usa para el negocio. En Colombia el gasto necesita soporte: la factura electrónica del proveedor o, si es del exterior, el documento soporte. Guarda la factura de cada cobro y confirma con el contador el IVA y la retención de servicios del exterior."
        : "Sí, si la herramienta se usa para el negocio: en la LLC (Schedule C) son gastos deducibles y bajan la utilidad sobre la que pagas impuestos. Si también la usas para algo personal, solo cuenta la parte del negocio: márcala como \"Mixto\" y el contador decide el porcentaje."),
      h("p", { class: "small muted", style: "margin:0" }, "No soy contador: el contador confirma cómo se clasifica cada una.")));
}
function subInvoice(s, ent, platforms) {
  const bizIds = s.platform_ids.map((pid) => (platforms.find((p) => p.id === pid) || {}).business_id).filter(Boolean);
  const own = state.businesses.filter((b) => b.entity_id === ent.id);
  const bid = bizIds.find((id) => own.some((b) => b.id === id)) || own[0]?.id;
  if (!bid) return toast("Primero agrega un negocio a esta empresa: cada factura se archiva en un negocio.", true);
  uploadInvoiceDialog(bid, undefined, [], null, { subId: s.id, subName: s.name, cardId: s.card_id });
}
function subDialog(s, ent, cards, platforms, platDefault) {
  const sel = new Set(s ? s.platform_ids : platDefault ? [platDefault] : []);
  modal(s ? s.name : "Agregar herramienta", () => h("div", { class: "stack" },
    h("div", { class: "fgrid" },
      fld("Herramienta", h("input", { name: "name", required: true, value: s?.name || "", placeholder: "Por ejemplo: Keepa" })),
      fld("Enlace (opcional)", h("input", { name: "url", value: s?.url || "", placeholder: "https://…", inputmode: "url" }))),
    ent.id === "personal" ? "" : h("fieldset", null, h("legend", null, "Plataformas donde la usas"),
      h("div", { class: "row", style: "gap:6px 16px;flex-wrap:wrap" }, platforms.map((p) => h("label", { class: "row", style: "gap:6px" }, h("input", { type: "checkbox", name: "plat", value: p.id, checked: sel.has(p.id), style: "width:auto" }), h("span", { class: "small" }, p.name, p.status === "sin_cuenta" ? h("span", { class: "muted" }, " (sin cuenta)") : "")))),
      h("p", { class: "small muted", style: "margin:4px 0 0" }, "Marca todas las que apliquen. Es un solo registro: el cobro cuenta una vez. Sin marcar ninguna queda como general de la empresa.")),
    h("p", { class: "small muted", style: "margin:0" }, "Datos del cobro: déjalos vacíos si todavía no la pagas. Si no tiene costo, elige el tipo \"Gratis\"."),
    h("div", { class: "fgrid" },
      fld("Valor", h("input", { name: "amount", type: "number", step: "0.01", min: "0", inputmode: "decimal", value: s?.amount > 0 ? s.amount : "" })),
      fld("Moneda", h("select", { name: "currency" }, (ent.id === "sas" ? ["COP", "USD"] : ["USD", "COP"]).map((c) => h("option", { selected: s?.currency === c }, c)))),
      fld("Tipo", h("select", { name: "cycle" }, Object.entries(CYCLE).map(([k, l]) => h("option", { value: k, selected: (s?.cycle || "mensual") === k }, l)))),
      fld("Fecha de cobro o renovación", h("input", { name: "charge_date", type: "date", value: s?.charge_date || "" }))),
    h("div", { class: "fgrid" },
      fld("Tarjeta con que se paga", h("select", { name: "card_id" }, h("option", { value: "" }, "—"), cards.map((c) => h("option", { value: c.id, selected: s?.card_id === c.id }, cardText(c))))),
      fld("Uso", h("select", { name: "use_kind" }, [["empresa", "Solo de la empresa"], ["mixto", "Mixto (empresa y personal)"]].map(([k, l]) => h("option", { value: k, selected: (s?.use_kind || "empresa") === k }, l)))),
      fld("Cancelada desde (si ya no la pagas)", h("input", { name: "ended_on", type: "date", value: s?.ended_on || "" }))),
    fld("Notas", h("input", { name: "notes", value: s?.notes || "" })),
    s && isAdmin() ? h("button", { class: "btn danger sm", type: "button", style: "align-self:flex-start", onclick: () => confirmDelete("Eliminar herramienta", `Se borra ${s.name} de todas las plataformas y deja de salir en el paquete del contador. Si solo la cancelaste, mejor pon la fecha en "Cancelada desde" para conservar los cobros pasados.`, async () => { await api("/subs/" + s.id, { method: "DELETE" }); toast("Herramienta eliminada."); route(); }) }, "Eliminar") : ""),
  async (fd) => {
    const body = { ...Object.fromEntries(fd), platform_ids: fd.getAll("plat"), entity_id: ent.id }; delete body.plat;
    if (body.cycle !== "gratis" && ((body.amount && !body.charge_date) || (!body.amount && body.charge_date))) throw new Error("Para que cuente el cobro, completa el valor y la fecha juntos (o deja los dos vacíos).");
    await api(s ? "/subs/" + s.id : "/subs", { method: s ? "PUT" : "POST", body }); toast(s ? "Guardado." : "Herramienta agregada."); route();
  });
}
// ---------- lectura de archivos: CSV, Excel y PDF ----------
function parseDelimited(text) {
  text = text.replace(/^\uFEFF/, "");
  const sample = text.split(/\r?\n/).slice(0, 30).join("\n");
  const delim = ["\t", ",", ";"].map((d) => [d, sample.split(d).length]).sort((a, z) => z[1] - a[1])[0][0];
  const rows = []; let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"' && cur.trim() === "") { q = true; cur = ""; }
    else if (ch === delim) { row.push(cur.trim()); cur = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cur.trim()); if (row.some((c) => c)) rows.push(row); row = []; cur = ""; }
    else cur += ch;
  }
  row.push(cur.trim()); if (row.some((c) => c)) rows.push(row);
  return rows;
}
async function readRows(file) {
  if (/\.(xlsx|xls)$/i.test(file.name)) {
    const XLSX = await loadLib("https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js", "XLSX");
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
    return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: "" }).map((r) => r.map((c) => String(c).trim()));
  }
  return parseDelimited(await file.text());
}
const MONTHS_EN = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTHS_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const monIdx = (w) => { w = String(w).toLowerCase().slice(0, 3); const i = MONTHS_EN.indexOf(w); return i >= 0 ? i + 1 : MONTHS_ES.indexOf(w) + 1; };
const iso = (y, m, d) => (y > 1990 && m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` : null);
// Lee fechas como 2026-10-03, 10/03/2026, 10/03/26, 03.10.2026, Oct 3, 2026, 3 oct 2026 o 10/03 (con el año que se pase)
function parseAnyDate(v, { dmy = false, year = null, endMonth = null } = {}) {
  const s = String(v || "").trim(); let m;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return iso(+m[1], +m[2], +m[3]);
  if ((m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/))) return iso(+m[3], +m[2], +m[1]);
  const fy = (y) => (y < 100 ? 2000 + y : y);
  if ((m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/))) { let a = +m[1], b = +m[2]; if (a > 12 || (dmy && b <= 12)) [a, b] = [b, a]; return iso(fy(+m[3]), a, b); }
  if ((m = s.match(/^([A-Za-zé]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})/)) && monIdx(m[1])) return iso(+m[3], monIdx(m[1]), +m[2]);
  if ((m = s.match(/^(\d{1,2})\s+(?:de\s+)?([A-Za-zé]{3,9})\.?(?:\s+(?:de\s+)?(\d{4}))?/)) && monIdx(m[2])) { const mo = monIdx(m[2]); const y = m[3] ? +m[3] : year && endMonth && mo > endMonth ? year - 1 : year; return y ? iso(y, mo, +m[1]) : null; }
  if ((m = s.match(/^([A-Za-z]{3})\.?\s+(\d{1,2})\b/)) && monIdx(m[1]) && year) { const mo = monIdx(m[1]); return iso(endMonth && mo > endMonth ? year - 1 : year, mo, +m[2]); }
  if ((m = s.match(/^(\d{1,2})[/-](\d{1,2})\b/)) && year) { let a = +m[1], b = +m[2]; if (dmy) [a, b] = [b, a]; return iso(endMonth && a > endMonth ? year - 1 : year, a, b); }
  return null;
}
// "$1,234.56", "-12.00", "(12.00)", "12.00-", "12.00 CR", "1.234,56"
function parseMoney(v) {
  let s = String(v ?? "").trim(); if (!s) return null;
  const neg = /^-|^\(|\)$|-$|\bCR$/i.test(s.replace(/\s+/g, " ")) || /^\$?\s*-/.test(s);
  s = s.replace(/CR$/i, "").replace(/[^0-9.,]/g, "");
  if (!s) return null;
  if (/,\d{2}$/.test(s) && !/\.\d{2}$/.test(s)) s = s.replace(/\./g, "").replace(",", "."); else s = s.replace(/,/g, "");
  const n = Number(s); return Number.isFinite(n) ? (neg ? -n : n) : null;
}
async function pdfTextLines(file) {
  const pdfjs = await loadPdfJs();
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const lines = [];
  for (let i = 1; i <= Math.min(doc.numPages, 30); i++) {
    const tc = await (await doc.getPage(i)).getTextContent();
    const items = tc.items.filter((it) => it.str.trim()).map((it) => ({ x: it.transform[4], y: it.transform[5], s: it.str.trim() })).sort((a, z) => z.y - a.y || a.x - z.x);
    let cur = [], y0 = null;
    const flush = () => { if (cur.length) lines.push(cur.sort((a, z) => a.x - z.x).map((x) => x.s).join(" ").replace(/\s+/g, " ")); cur = []; };
    for (const it of items) { if (y0 !== null && Math.abs(it.y - y0) > 2.5) flush(); if (!cur.length) y0 = it.y; cur.push(it); }
    flush();
  }
  return lines;
}

// ---------- extractos del banco ----------
const PAY_RE = /(payment|pymt|pmt|autopay|thank you|pago)/i;
const IN_HINT = /(deposit|transfer from|xfer from|zelle from|interest paid|refund|reembolso|payroll|abono|consignaci|amazon.*(pmts|payments|seller))/i;
function bankFromRows(rows, { dmy }) {
  const hi = rows.findIndex((r) => r.some((c) => /date|fecha/i.test(c)) && r.some((c) => /amount|monto|valor|importe|debit|credit|withdraw|deposit|cargo|abono/i.test(c)));
  if (hi < 0) return null;
  const H = rows[hi].map((c) => c.toLowerCase());
  const col = (re, not) => H.findIndex((c) => re.test(c) && !(not && not.test(c)));
  let cDate = col(/post/); if (cDate < 0 || !/date|fecha/.test(H[cDate])) cDate = col(/date|fecha/);
  let cDesc = col(/desc|memo|payee|detail|concepto|merchant|referencia|name|nombre/, /date|fecha|amount|monto|type/); if (cDesc < 0) cDesc = col(/transaction|transacci/, /date|fecha|amount|monto|id/);
  const cAmt = col(/amount|monto|valor|importe/, /balance|saldo|debit|credit|d[ée]bito|cr[ée]dito/);
  const cDeb = col(/debit|withdraw|cargo|retiro|d[ée]bito/), cCred = col(/credit|deposit|abono|cr[ée]dito/, /card|tarjeta/);
  const lines = [];
  for (const r of rows.slice(hi + 1)) {
    const d = parseAnyDate(r[cDate], { dmy }); if (!d) continue;
    let amount = null;
    if (cAmt >= 0 && r[cAmt] !== "") amount = parseMoney(r[cAmt]);
    else if (cDeb >= 0 || cCred >= 0) { const de = Math.abs(parseMoney(r[cDeb]) || 0), cr = Math.abs(parseMoney(r[cCred]) || 0); amount = cr - de; }
    if (!amount) continue;
    const desc = (cDesc >= 0 ? r[cDesc] : r.filter((c, i) => i !== cDate && i !== cAmt && i !== cDeb && i !== cCred && !/^[\d.,$-]*$/.test(c)).join(" ")) || "Movimiento";
    lines.push({ posted_on: d, description: desc.replace(/\s+/g, " ").trim(), amount });
  }
  return { lines, single: cAmt >= 0 };
}
function bankFromPdf(textLines, { credit, dmy }) {
  const all = textLines.join("\n");
  // Año y mes de cierre: la fecha completa más reciente del documento
  const fulls = [...all.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/g)].map((m) => parseAnyDate(m[0], { dmy })).concat([...all.matchAll(/\b([A-Z][a-z]{2,8})\.? (\d{1,2}), (\d{4})\b/g)].map((m) => parseAnyDate(m[0]))).filter(Boolean).sort();
  const end = fulls[fulls.length - 1] || new Date().toISOString().slice(0, 10);
  const year = +end.slice(0, 4), endMonth = +end.slice(5, 7);
  const DATE = /^(\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?|[A-Za-z]{3}\.? \d{1,2}(?:,? \d{4})?|\d{1,2} [A-Za-z]{3}\.?(?: \d{4})?)\s+/;
  const AMT = /\(?-?\$?\s?\d{1,3}(?:,\d{3})*\.\d{2}\)?(?:\s?(?:-|CR)(?=\s|$))?/g;
  let section = null, sectionName = ""; const lines = [];
  for (const raw of textLines) {
    const ln = raw.trim();
    const m = ln.match(DATE);
    if (!m) {
      if (/^[A-Z][A-Za-z ]{3,40}$/.test(ln) && !/balance|summary|total|page|date|amount|number|fecha|monto/i.test(ln)) sectionName = ln;
      if (/(balance summary|daily (ending )?balance|resumen de saldos|saldo diario)/i.test(ln)) { section = "skip"; continue; }
      if (/^(customer deposits|payments?|credits?|deposits?|other additions|abonos|cr[ée]ditos|electronic deposits)/i.test(ln) || /payments and (other )?credits|deposits and (other )?(additions|credits)/i.test(ln)) section = "in";
      else if (/^(purchases?|charges?|withdrawals?|debits?|other subtractions|card transactions|checks|fees|cargos|retiros|compras)/i.test(ln) || /purchases and (other )?(charges|debits)|withdrawals and (other )?(subtractions|debits)/i.test(ln)) section = "out";
      continue;
    }
    if (section === "skip") continue;
    const d = parseAnyDate(m[1], { dmy, year, endMonth }); if (!d) continue;
    let rest = ln.slice(m[0].length);
    const m2 = rest.match(DATE); if (m2) rest = rest.slice(m2[0].length);
    const amts = [...rest.matchAll(AMT)];
    if (!amts.length) continue;
    const first = amts[0];
    let desc = rest.slice(0, first.index).replace(/^\d{4,}\s*/, "").replace(/\s+/g, " ").trim();
    if (/balance|saldo|^total|minimum payment|pago m[íi]nimo/i.test(desc)) continue;
    if (!desc) desc = sectionName || (section === "in" ? "Depósito" : "Cargo");
    const tok = first[0]; const v = Math.abs(parseMoney(tok) || 0); if (!v) continue;
    const neg = /^\(|^-|-$|CR$|\$\s?-/.test(tok.trim()) || /^-/.test(tok.replace("$", ""));
    let inflow;
    if (credit) inflow = neg || section === "in" || PAY_RE.test(desc);
    else inflow = neg ? false : section === "in" ? true : section === "out" ? false : IN_HINT.test(desc);
    lines.push({ posted_on: d, description: desc.replace(/\d{9,}/g, (x) => "•••• " + x.slice(-4)), amount: inflow ? v : -v });
  }
  return lines;
}
async function bankImportDialog(ent, opts = {}) {
  const { cards } = await api("/cards?entity=" + ent.id);
  let lines = [], file = null, fileId = opts.fileId || null;
  const list = h("div", { class: "stack", style: "gap:6px" });
  const info = h("p", { class: "small muted", style: "margin:0" }, "Sube el extracto o estado de cuenta: PDF descargado del banco, o mejor aún el CSV o Excel de movimientos. Se leen los movimientos y se comparan con tus facturas, suscripciones, pagos de Amazon y movimientos registrados.");
  const cardSel = h("select", { name: "card_id", required: true }, h("option", { value: "" }, "Elige la cuenta o tarjeta"), byBank(cards).map(([bank, list]) => h("optgroup", { label: bank }, list.map((c) => h("option", { value: c.id, selected: opts.cardId === c.id }, cardText(c))))));
  const isCredit = () => (cards.find((c) => c.id === cardSel.value) || {}).card_type !== "debito";
  const render = () => {
    if (!lines.length) { list.replaceChildren(); return; }
    const outN = lines.filter((l) => l.on && l.amount < 0).length, inN = lines.filter((l) => l.on && l.amount > 0).length;
    list.replaceChildren(
      h("div", { class: "row between" }, h("b", { class: "small" }, `${lines.length} movimientos leídos · ${outN} salidas · ${inN} entradas`),
        h("button", { class: "linkbtn small", type: "button", onclick: () => { lines.forEach((l) => { l.amount = -l.amount; }); render(); } }, "¿Signos al revés? Invertir")),
      h("div", { class: "tablewrap", style: "max-height:42vh;overflow:auto" }, h("table", { style: "min-width:520px" }, h("thead", null, h("tr", null, ["", "Fecha", "Descripción", "Monto"].map((c) => h("th", null, c)))),
        h("tbody", null, lines.map((l) => h("tr", { style: l.on ? "" : "opacity:.45" }, h("td", null, h("input", { type: "checkbox", checked: l.on, style: "width:auto", "aria-label": "Incluir", onchange: (e) => { l.on = e.target.checked; render(); } })),
          h("td", { class: "mono" }, fdate(l.posted_on)), h("td", { class: "small" }, l.description), h("td", { class: "mono", style: `color:var(${l.amount < 0 ? "--ink" : "--ok"})` }, (l.amount < 0 ? "−" : "+") + money(Math.abs(l.amount)))))))),
      h("p", { class: "small muted", style: "margin:0" }, "Quita la marca a lo que no quieras guardar. Revisa que las compras salgan con − y los depósitos o pagos con +."));
  };
  const read = async (f) => {
    if (!cardSel.value) { info.textContent = "Primero elige la cuenta o tarjeta del extracto."; return; }
    file = f; lines = []; render(); info.textContent = "Leyendo el extracto…";
    const dmy = ent.id === "sas", credit = isCredit();
    try {
      let got = [];
      if (/\.pdf$/i.test(f.name) || f.type === "application/pdf") {
        const tl = await pdfTextLines(f).catch(() => []);
        got = bankFromPdf(tl, { credit, dmy });
        if (!got.length) {
          info.textContent = "El PDF no trae los movimientos en un formato claro. Leyéndolo con IA (tarda unos segundos)…";
          const prep = tl.join("\n").trim().length > 80 ? { text: tl.join("\n") } : await prepareUpload(f);
          got = (await api("/bank/read", { method: "POST", body: { text: prep.text, image: prep.text ? null : prep.image } })).lines;
        }
      } else if (/\.(csv|txt|tsv|xlsx|xls)$/i.test(f.name)) {
        const r = bankFromRows(await readRows(f), { dmy });
        if (!r) throw new Error("No encontré las columnas de fecha y monto en el archivo.");
        got = r.lines;
        if (r.single && credit) { const pays = got.filter((l) => PAY_RE.test(l.description)); const flip = pays.length ? pays.filter((l) => l.amount < 0).length > pays.length / 2 : got.filter((l) => l.amount > 0).length > got.length * 0.6; if (flip) got.forEach((l) => { l.amount = -l.amount; }); }
      } else if (f.type.startsWith("image/")) {
        info.textContent = "Leyendo la foto con IA…";
        const prep = await prepareUpload(f); file = prep.file;
        got = (await api("/bank/read", { method: "POST", body: { image: prep.image } })).lines;
      } else throw new Error("Sube un PDF, CSV, Excel o foto del extracto.");
      lines = got.map((l) => ({ ...l, on: true }));
      info.textContent = lines.length ? "Listo. Revisa los movimientos y guarda." : "No encontré movimientos en el archivo. Prueba con el CSV o Excel que descarga el banco.";
      render();
    } catch (e) { info.textContent = e.message; }
  };
  const dlg = modal("Leer extracto del banco", () => h("div", { class: "stack" },
    fld("Cuenta o tarjeta", cardSel),
    opts.file ? h("p", { class: "small", style: "margin:0" }, "Archivo: ", h("b", null, opts.file.name)) : fld("Archivo (PDF, CSV, Excel o foto)", h("input", { type: "file", accept: "application/pdf,.csv,.txt,.tsv,.xlsx,.xls,image/*", onchange: (e) => e.target.files[0] && read(e.target.files[0]) })),
    info, list,
    !cards.length ? h("p", { class: "small", style: "margin:0;color:var(--warn)" }, "Primero agrega la cuenta o tarjeta en la pestaña Tarjetas.") : ""),
  async (fd, form) => {
    const keep = lines.filter((l) => l.on);
    if (!keep.length) throw new Error("No hay movimientos para guardar.");
    const up = new FormData(); up.append("entity_id", ent.id); up.append("card_id", cardSel.value); up.append("lines", JSON.stringify(keep.map(({ posted_on, description, amount }) => ({ posted_on, description, amount }))));
    if (fileId) up.append("file_id", fileId);
    else if (file) { form.querySelector("[type=submit]").textContent = "Guardando…"; const prep = file.type.startsWith("image/") || file.type === "application/pdf" ? await prepareUpload(file) : { file, originalSize: file.size }; up.append("file", prep.file); up.append("original_size", prep.originalSize); }
    const r = await api("/bank/lines", { method: "POST", body: up });
    toast(`${r.added} movimiento(s) guardados${r.duplicates ? ` (${r.duplicates} ya estaban)` : ""}: ${r.matched} con soporte y ${r.missing} sin soporte.`, !!r.missing); route();
  }, "Guardar y conciliar");
  if (opts.file) { dlg.addEventListener("close", () => route()); setTimeout(() => read(opts.file), 50); }
}
const BANK_ST = { conciliado: ["Con soporte", "ok"], sin_soporte: ["Sin soporte", "warn"], personal: ["Personal", ""], ignorado: ["Ignorado", ""], empresa: ["Pasado a la empresa", "info"] };
function bankHint(l) {
  if (l.amount > 0 && /amazon/i.test(l.description)) return "Parece un depósito de Amazon: sube el reporte de liquidación o regístralo en Lotes.";
  if (l.amount < 0 && /(fee|cargo|comisi|maintenance|service charge)/i.test(l.description)) return "Parece una comisión del banco.";
  if (l.amount < 0 && /(atm|cash|retiro|withdrawal)/i.test(l.description)) return "Si fue para ti, regístralo como Retiro del dueño.";
  return "";
}
async function pickInvoiceDialog(ent, l) {
  const today = l.posted_on; const from = new Date(Date.parse(today) - 120 * 864e5).toISOString().slice(0, 10);
  const { invoices } = await api(`/accounting?entity=${ent.id}&from=${from}&to=${today}`);
  const A = Math.abs(l.amount);
  const list = invoices.filter((i) => i.kind !== "nota de crédito").sort((a, z) => Math.abs((a.total || 0) - A) - Math.abs((z.total || 0) - A)).slice(0, 40);
  modal("Asignar factura", () => h("div", { class: "stack" },
    h("p", { class: "small", style: "margin:0" }, `${l.description} · ${fdate(l.posted_on)} · ${money(A)}`),
    list.length ? h("div", { class: "stack", style: "gap:4px;max-height:46vh;overflow:auto" }, list.map((i, k) => h("label", { class: "row", style: "gap:10px;padding:4px" }, h("input", { type: "radio", name: "inv", value: i.id, required: true, checked: k === 0, style: "width:auto" }),
      h("span", { class: "small" }, [i.supplier, i.invoice_number].filter(Boolean).join(" · ") || "Factura", ` · ${fdate(i.issue_date)} · `, h("b", null, money(i.total, i.currency)))))) : h("p", { class: "empty" }, "No hay facturas en los últimos 4 meses.")),
  async (fd) => { await api("/bank/lines/" + l.id, { method: "PUT", body: { status: "conciliado", match_kind: "factura", match_id: fd.get("inv") } }); toast("Factura asignada."); route(); }, "Asignar");
}
function bankSection(ent, d) {
  const L = d.bank; const cnt = (st) => L.filter((l) => l.status === st).length;
  const miss = L.filter((l) => l.status === "sin_soporte");
  const setSt = async (l, status, msg) => { await api("/bank/lines/" + l.id, { method: "PUT", body: { status } }); toast(msg); route(); };
  const acct = (l) => (l.card ? `${bankOf(l.issuer)} · ${l.card} •••• ${l.last4}` : "");
  const banks = byBank(L);
  return h("section", { class: "card stack" },
    h("div", { class: "row between" }, h("div", null, h("h2", null, "Conciliación del banco"), h("span", { class: "small muted" }, "Cada movimiento del extracto con su soporte: factura, suscripción, pago de Amazon, declaración o movimiento registrado.")),
      h("button", { class: "btn primary sm only-upload", type: "button", onclick: () => bankImportDialog(ent) }, "Leer extracto del banco")),
    L.length ? h("div", { class: "chips" }, pill(`${L.length} movimientos`), pill(`${cnt("conciliado")} con soporte`, "ok"), cnt("sin_soporte") ? pill(`${cnt("sin_soporte")} sin soporte`, "warn") : "", cnt("personal") ? pill(`${cnt("personal")} personales`) : "", cnt("ignorado") ? pill(`${cnt("ignorado")} ignorados`) : "")
      : h("p", { class: "empty" }, "Todavía no hay extractos leídos en este período."),
    banks.length > 1 || (banks[0] && banks[0][0] !== "Sin banco") ? h("div", { class: "grid g3" }, banks.map(([bank, list]) => h("div", { class: "card stat" }, h("span", { class: "small muted" }, bank), h("br"),
      h("b", null, `${list.length} movimiento${list.length === 1 ? "" : "s"}`), h("div", { class: "small", style: list.some((l) => l.status === "sin_soporte") ? "color:var(--warn)" : "color:var(--ok)" }, list.some((l) => l.status === "sin_soporte") ? `${list.filter((l) => l.status === "sin_soporte").length} sin soporte` : "Todo con soporte")))) : "",
    miss.length ? h("div", { class: "stack", style: "gap:8px" }, h("b", { class: "small" }, "Sin soporte: dime qué es cada uno"),
      h("div", { class: "stack", style: "gap:0;border-top:1px solid var(--line)" }, miss.map((l) => h("div", { class: "stack", style: "gap:6px;padding:10px 4px;border-bottom:1px solid var(--line);text-align:left;align-items:stretch" },
        h("div", { class: "row between", style: "align-items:flex-start" }, h("span", { class: "stack", style: "gap:2px" }, h("b", { style: "color:var(--ink)" }, l.description), h("span", { class: "small muted" }, [fdate(l.posted_on), acct(l)].filter(Boolean).join(" · ")), bankHint(l) ? h("span", { class: "small", style: "color:var(--warn)" }, bankHint(l)) : ""),
          h("b", { class: "mono", style: l.amount > 0 ? "color:var(--ok)" : "" }, (l.amount < 0 ? "−" : "+") + money(Math.abs(l.amount)))),
        h("div", { class: "row only-upload", style: "gap:12px;flex-wrap:wrap" },
          h("button", { class: "linkbtn small", type: "button", onclick: () => moveDialog(ent, l) }, l.amount < 0 ? "Registrar gasto o retiro" : "Registrar ingreso o aporte"),
          l.amount < 0 ? h("button", { class: "linkbtn small", type: "button", onclick: () => pickInvoiceDialog(ent, l) }, "Es de una factura") : "",
          l.amount < 0 ? h("a", { class: "small", href: `#/empresa/${ent.id}/suscripciones`, style: "font-weight:700" }, "Es una suscripción") : "",
          h("button", { class: "linkbtn small only-admin", type: "button", onclick: () => setSt(l, "personal", "Marcado como personal.") }, "Es personal"),
          h("button", { class: "linkbtn small only-admin", type: "button", onclick: () => setSt(l, "ignorado", "Ignorado.") }, "Ignorar")))))) : "",
    L.length ? h("details", null, h("summary", { class: "small", style: "cursor:pointer;font-weight:700" }, "Ver todos los movimientos del banco"),
      h("div", { class: "tablewrap", style: "margin-top:8px" }, h("table", { style: "min-width:640px" }, h("thead", null, h("tr", null, ["Fecha", "Banco", "Descripción", "Monto", "Estado", "Soporte", ""].map((c) => h("th", null, c)))),
        h("tbody", null, banks.flatMap(([, list]) => list).map((l) => h("tr", null, h("td", { class: "mono" }, fdate(l.posted_on)), h("td", { class: "small" }, bankOf(l.issuer)), h("td", { class: "small" }, l.description, l.card ? h("div", { class: "muted" }, `${l.card} •••• ${l.last4}`) : ""),
          h("td", { class: "mono" }, (l.amount < 0 ? "−" : "+") + money(Math.abs(l.amount))), h("td", null, pill(...BANK_ST[l.status])), h("td", { class: "small" }, l.match_label || "—"),
          h("td", { class: "only-admin" }, l.locked ? h("button", { class: "linkbtn small", type: "button", onclick: () => setSt(l, "sin_soporte", "Listo: vuelve a buscar su soporte.") }, "Deshacer") : h("button", { class: "linkbtn small", type: "button", style: "color:var(--bad)", onclick: () => confirmDelete("Quitar movimiento", "Se quita esta línea del extracto leído. El archivo del extracto no se borra.", async () => { await api("/bank/lines/" + l.id, { method: "DELETE" }); route(); }) }, "Quitar")))))))) : "");
}

// ---------- liquidaciones de Amazon ----------
const SETT_LABEL = {
  ventas: "Ventas de productos", envios_cobrados: "Envíos cobrados al cliente", impuesto_cobrado: "Impuesto de venta cobrado al cliente", impuesto_retenido: "Impuesto retenido y pagado por Amazon",
  promociones: "Promociones y descuentos", reembolsos: "Reembolsos a clientes", comision: "Comisión de Amazon (referral)", tarifas_fba: "Tarifas de FBA (envío al cliente)",
  almacenamiento: "Almacenamiento en bodegas de Amazon", envio_a_amazon: "Envío y colocación en bodegas de Amazon", publicidad: "Publicidad", suscripcion_vendedor: "Suscripción de vendedor",
  reembolsos_amazon: "Reembolsos de Amazon (inventario perdido o dañado)", reserva: "Reserva retenida", otros: "Otros cargos y ajustes",
};
function settKeyFor(text) {
  if (/storage/i.test(text)) return "almacenamiento";
  if (/inbound|transportation|placement|carrier/i.test(text)) return "envio_a_amazon";
  if (/subscription/i.test(text)) return "suscripcion_vendedor";
  if (/advertis/i.test(text)) return "publicidad";
  if (/reserve/i.test(text)) return "reserva";
  if (/reimburs|reversal|lost|damaged|warehouse/i.test(text)) return "reembolsos_amazon";
  return "otros";
}
function parseSettlement(rows) {
  const lc = rows.map((r) => r.map((c) => c.toLowerCase()));
  // Archivo plano V2 de liquidación
  let hi = lc.findIndex((r) => r.includes("settlement-id") && r.includes("amount-type"));
  if (hi >= 0) {
    const H = lc[hi], ix = (n) => H.indexOf(n), R = rows.slice(hi + 1);
    const first = R.find((r) => r[ix("total-amount")]) || R[0]; if (!first) return null;
    const bd = {}; const add = (k, v) => { if (v) bd[k] = (bd[k] || 0) + v; };
    for (const r of R) {
      const tt = r[ix("transaction-type")] || "", at = r[ix("amount-type")] || "", ad = r[ix("amount-description")] || "", v = parseMoney(r[ix("amount")]) || 0;
      if (!v) continue;
      const refund = /refund|chargeback/i.test(tt);
      if (/^itemprice$/i.test(at)) add(/tax/i.test(ad) ? "impuesto_cobrado" : /shipping/i.test(ad) ? (refund ? "reembolsos" : "envios_cobrados") : refund ? "reembolsos" : "ventas", v);
      else if (/withheld/i.test(at)) add("impuesto_retenido", v);
      else if (/promotion/i.test(at)) add("promociones", v);
      else if (/itemfees/i.test(at)) add(/fba|fulfil|pick|weight|handling/i.test(ad) ? "tarifas_fba" : "comision", v);
      else add(settKeyFor(`${tt} ${at} ${ad}`), v);
    }
    const total = parseMoney(first[ix("total-amount")]), dep = parseAnyDate(first[ix("deposit-date")]);
    return { kind: "liquidacion", ref: first[ix("settlement-id")], period_start: parseAnyDate(first[ix("settlement-start-date")]), period_end: parseAnyDate(first[ix("settlement-end-date")]), deposit_date: dep, currency: first[ix("currency")] || "USD", total, breakdown: bd, transfers: total > 0 && dep ? [{ date: dep, amount: total }] : [] };
  }
  // Reporte de transacciones por fechas (CSV de Pagos › Repositorio de informes)
  hi = lc.findIndex((r) => r.includes("settlement id") && r.includes("total") && r.includes("type"));
  if (hi >= 0) {
    const H = lc[hi], ix = (n) => H.indexOf(n), val = (r, n) => (ix(n) >= 0 ? parseMoney(r[ix(n)]) || 0 : 0);
    const bd = {}; const add = (k, v) => { if (v) bd[k] = (bd[k] || 0) + v; };
    const transfers = []; let net = 0, min = null, max = null;
    for (const r of rows.slice(hi + 1)) {
      const d = parseAnyDate(r[ix("date/time")]); if (!d) continue;
      const t = r[ix("type")] || "", desc = r[ix("description")] || "", tot = val(r, "total");
      if (!min || d < min) min = d; if (!max || d > max) max = d;
      if (/transfer/i.test(t)) { if (tot < 0) transfers.push({ date: d, amount: -tot }); continue; }
      net += tot;
      const sales = val(r, "product sales") + val(r, "gift wrap credits");
      add(/refund|chargeback/i.test(t) ? "reembolsos" : "ventas", sales);
      add(/refund/i.test(t) ? "reembolsos" : "envios_cobrados", val(r, "shipping credits"));
      add("impuesto_cobrado", val(r, "product sales tax") + val(r, "shipping credits tax") + val(r, "giftwrap credits tax") + val(r, "promotional rebates tax"));
      add("impuesto_retenido", val(r, "marketplace withheld tax"));
      add("promociones", val(r, "promotional rebates"));
      add("comision", val(r, "selling fees"));
      add("tarifas_fba", val(r, "fba fees"));
      const other = val(r, "other transaction fees") + val(r, "other") + val(r, "regulatory fee") + val(r, "tax on regulatory fee");
      add(/^order$/i.test(t) ? "otros" : /fba inventory fee/i.test(t) ? settKeyFor(desc || "storage") : settKeyFor(`${t} ${desc}`), other);
    }
    if (!max) return null;
    return { kind: "transacciones", ref: `Transacciones ${min} a ${max}`, period_start: min, period_end: max, deposit_date: null, currency: "USD", total: Math.round(net * 100) / 100, breakdown: bd, transfers };
  }
  return null;
}
function settlementDialog(ent) {
  const bizs = state.businesses.filter((b) => b.entity_id === ent.id && b.kind === "reventa");
  let data = null, file = null;
  const out = h("div", { class: "stack", style: "gap:6px" });
  const info = h("p", { class: "small muted", style: "margin:0" }, "En Seller Central: Pagos › Repositorio de informes. Descarga el reporte de Liquidación (archivo plano V2, .txt) de cada depósito, o el de Transacciones (.csv) del mes. Se separan las ventas, comisiones, tarifas de FBA y reembolsos, y cada depósito queda como pago recibido.");
  modal("Subir reporte de Amazon", () => h("div", { class: "stack" },
    bizs.length > 1 ? fld("Negocio", h("select", { name: "business_id" }, bizs.map((b) => h("option", { value: b.id }, b.name)))) : h("input", { type: "hidden", name: "business_id", value: bizs[0]?.id || "amazon" }),
    fld("Reporte (.txt o .csv)", h("input", { type: "file", accept: ".txt,.tsv,.csv,.xlsx", required: true, onchange: async (e) => {
      file = e.target.files[0]; data = null; out.replaceChildren(); if (!file) return;
      try {
        data = parseSettlement(await readRows(file));
        if (!data) { info.textContent = "No reconocí el reporte. Debe ser el de Liquidación (archivo plano V2) o el de Transacciones en CSV."; return; }
        const rows = Object.entries(data.breakdown).filter(([, v]) => Math.abs(v) >= 0.005).sort((a, z) => Object.keys(SETT_LABEL).indexOf(a[0]) - Object.keys(SETT_LABEL).indexOf(z[0]));
        info.textContent = `Del ${fdate(data.period_start)} al ${fdate(data.period_end)}${data.deposit_date ? " · depósito " + fdate(data.deposit_date) : ""}.`;
        out.replaceChildren(h("div", { class: "tablewrap" }, h("table", null, h("tbody", null, rows.map(([k, v]) => h("tr", null, h("td", { class: "small" }, SETT_LABEL[k] || k), h("td", { class: "mono", style: "text-align:right" }, money(v, data.currency)))),
          h("tr", null, h("td", null, h("b", null, data.kind === "liquidacion" ? "Depósito al banco" : "Neto del período")), h("td", { class: "mono", style: "text-align:right" }, h("b", null, money(data.total, data.currency))))))),
          data.transfers.length ? h("p", { class: "small muted", style: "margin:0" }, `${data.transfers.length} depósito(s) al banco quedarán como pagos recibidos de Amazon (si no estaban ya).`) : "");
      } catch (err) { info.textContent = err.message; }
    } })),
    info, out),
  async (fd, form) => {
    if (!data) throw new Error("Elige un reporte válido.");
    form.querySelector("[type=submit]").textContent = "Guardando…";
    const up = new FormData(); up.append("business_id", fd.get("business_id")); up.append("data", JSON.stringify(data)); up.append("file", file); up.append("original_size", file.size);
    const r = await api("/settlements", { method: "POST", body: up });
    toast("Reporte guardado" + (r.payouts ? ` y ${r.payouts} depósito(s) registrados como pago.` : ".")); route();
  }, "Guardar");
}
function settlementSection(ent, d) {
  const S = d.settlements;
  const tot = {}; for (const s of S) for (const [k, v] of Object.entries(s.breakdown)) tot[k] = (tot[k] || 0) + v;
  const keys = Object.keys(SETT_LABEL).filter((k) => Math.abs(tot[k] || 0) >= 0.005);
  const hasAmazon = state.businesses.some((b) => b.entity_id === ent.id && b.kind === "reventa");
  if (!hasAmazon && !S.length) return "";
  return h("section", { class: "card stack" },
    h("div", { class: "row between" }, h("div", null, h("h2", null, "Ventas de Amazon"), h("span", { class: "small muted" }, "Del reporte de liquidación: ventas, comisiones, tarifas y reembolsos por separado.")),
      h("button", { class: "btn primary sm only-upload", type: "button", onclick: () => settlementDialog(ent) }, "Subir reporte de Amazon")),
    S.length ? h("div", { class: "tablewrap" }, h("table", null, h("tbody", null, keys.map((k) => h("tr", null, h("td", { class: "small" }, SETT_LABEL[k]), h("td", { class: "mono", style: "text-align:right" }, money(tot[k])))),
      h("tr", null, h("td", null, h("b", null, "Neto que Amazon te dejó")), h("td", { class: "mono", style: "text-align:right" }, h("b", null, money(S.reduce((a, s) => a + (s.total || 0), 0)))))))) : h("p", { class: "empty" }, "No hay reportes de Amazon en este período."),
    S.length ? h("div", { class: "list" }, S.map((s) => h("div", { class: "row between", style: "padding:8px 12px;border-bottom:1px solid var(--line)" },
      h("span", { class: "small" }, h("b", null, s.kind === "liquidacion" ? "Liquidación " + s.ref : s.ref), ` · ${fdate(s.period_start)} a ${fdate(s.period_end)}`, s.deposit_date ? ` · depósito ${fdate(s.deposit_date)}` : ""),
      h("span", { class: "row", style: "gap:10px" }, h("b", { class: "mono small" }, money(s.total, s.currency)), s.file_id ? h("a", { class: "small", href: "/api/files/" + s.file_id, target: "_blank", rel: "noopener" }, "Archivo") : "",
        h("button", { class: "linkbtn small only-admin", type: "button", style: "color:var(--bad)", onclick: () => confirmDelete("Eliminar reporte", "Se borra el reporte y los pagos que creó. Puedes volver a subirlo.", async () => { await api("/settlements/" + s.id, { method: "DELETE" }); route(); }) }, "Eliminar"))))) : "");
}
// ---------- aprobaciones de marca y categoría ----------
const APR_ST = { por_solicitar: ["Por solicitar", "warn"], solicitada: ["Solicitada", "info"], aprobada: ["Aprobada", "ok"], rechazada: ["Rechazada", "bad"] };
async function approvalsView(b) {
  const [{ approvals, legal_name }, { invoices }] = await Promise.all([api("/approvals?business=" + b.id), api("/invoices?business=" + b.id)]);
  const dlg = (a) => modal(a ? "Editar " + a.brand : "Nueva aprobación", () => h("div", { class: "stack" },
    h("div", { class: "fgrid" }, fld("Marca", h("input", { name: "brand", required: true, value: a?.brand || "", placeholder: "Por ejemplo: Milescraft" })), fld("Categoría (si aplica)", h("input", { name: "category", value: a?.category || "" })), fld("ASIN de ejemplo", h("input", { name: "asin", value: a?.asin || "" }))),
    h("div", { class: "fgrid" }, fld("Estado", h("select", { name: "status" }, Object.entries(APR_ST).map(([k, v]) => h("option", { value: k, selected: (a?.status || "por_solicitar") === k }, v[0])))),
      fld("Unidades mínimas que pide Amazon", h("input", { name: "min_units", type: "number", min: "1", value: a?.min_units ?? 10 })), fld("Solicitada el", h("input", { name: "requested_on", type: "date", value: a?.requested_on || "" })), fld("Respuesta el", h("input", { name: "decided_on", type: "date", value: a?.decided_on || "" }))),
    fld("Facturas que vas a presentar", h("div", { class: "stack", style: "gap:4px;max-height:34vh;overflow:auto" }, invoices.length ? invoices.map((i) => h("label", { class: "row", style: "gap:10px;padding:4px" }, h("input", { type: "checkbox", name: "inv", value: i.id, checked: (a?.invoice_ids || []).includes(i.id), style: "width:auto" }), h("span", { class: "small" }, [i.supplier || i.supplier_name, i.invoice_number || i.title].filter(Boolean).join(" · ") || "Factura", " · " + fdate(i.issue_date)))) : h("span", { class: "small muted" }, "No hay facturas en este negocio."))),
    fld("Notas", h("textarea", { name: "notes", rows: "2" }, a?.notes || ""))),
  async (fd) => { const body = Object.fromEntries(fd); body.invoice_ids = fd.getAll("inv"); delete body.inv; body.business_id = b.id; await api(a ? "/approvals/" + a.id : "/approvals", { method: a ? "PUT" : "POST", body }); toast("Guardado."); route(); });
  return h("div", { class: "stack", style: "gap:18px" },
    h("div", { class: "row between" }, h("p", { class: "small muted", style: "margin:0;max-width:680px" }, `Para desbloquear una marca, Amazon suele pedir facturas de un mayorista o del fabricante, de los últimos 180 días, con 10 unidades o más y con tu nombre y dirección iguales a los de Seller Central${legal_name ? ` (${legal_name})` : ""}. Revisa los requisitos exactos en la solicitud de cada marca.`),
      h("button", { class: "btn primary sm only-admin", type: "button", onclick: () => dlg() }, "+ Nueva aprobación")),
    approvals.length ? approvals.map((a) => h("section", { class: "card stack" },
      h("div", { class: "row between", style: "align-items:flex-start" }, h("div", { class: "stack", style: "gap:4px" }, h("h2", null, a.brand + (a.category ? " · " + a.category : "")),
          h("span", { class: "chips" }, pill(...APR_ST[a.status]), a.asin ? pill("ASIN " + a.asin) : "", a.requested_on ? pill("Solicitada " + fdate(a.requested_on)) : "", a.decided_on ? pill("Respuesta " + fdate(a.decided_on)) : "", a.invoices.length ? pill(a.ready ? "Tienes una factura que cumple" : "Ninguna factura cumple todavía", a.ready ? "ok" : "warn") : "")),
        h("div", { class: "row only-admin" }, h("button", { class: "btn sm", type: "button", onclick: () => dlg(a) }, "Editar"), h("button", { class: "btn sm danger", type: "button", onclick: () => confirmDelete("Eliminar", `Se borra el registro de ${a.brand}.`, async () => { await api("/approvals/" + a.id, { method: "DELETE" }); route(); }) }, "Eliminar"))),
      a.notes ? h("p", { class: "small", style: "margin:0;white-space:pre-wrap" }, a.notes) : "",
      a.invoices.length ? h("div", { class: "list" }, a.invoices.map((i) => h("a", { href: "#/factura/" + i.id }, h("span", { class: "stack", style: "gap:2px" }, h("b", { style: "color:var(--ink)" }, [i.supplier, i.invoice_number].filter(Boolean).join(" · ") || "Factura"),
        h("span", { class: "small muted" }, `${fdate(i.issue_date)} · ${i.units} unidades`), i.fails.length ? h("span", { class: "small", style: "color:var(--warn)" }, "Falta: " + i.fails.join("; ") + ".") : ""), pill(i.ok ? "Cumple" : "Revisar", i.ok ? "ok" : "warn"))))
        : h("p", { class: "small muted", style: "margin:0" }, "Elige con “Editar” las facturas que vas a presentar y la intranet revisa si cumplen."))) : h("section", { class: "card" }, h("p", { class: "empty" }, "Registra aquí cada marca o categoría que quieras desbloquear.")));
}

// ---------- inventario por producto ----------
async function inventoryView(b) {
  const { items } = await api("/inventory?business=" + b.id);
  const tot = (k) => items.reduce((a, x) => a + x.by[k], 0);
  const stat = (l, v) => h("div", { class: "card stat" }, h("span", { class: "small muted" }, l), h("br"), h("b", null, v));
  const search = h("input", { type: "text", placeholder: "Buscar por producto, UPC o proveedor", style: "max-width:340px", oninput: (e) => { const t = e.target.value.toLowerCase(); body.querySelectorAll("tr").forEach((r) => { r.style.display = r.dataset.k.includes(t) ? "" : "none"; }); } });
  const body = h("tbody", null, items.map((x) => h("tr", { "data-k": [x.description, x.upc, x.sku, x.suppliers.join(" ")].join(" ").toLowerCase() },
    h("td", null, h("b", null, x.description || "Sin descripción"), h("div", { class: "small muted" }, [x.upc || x.sku, x.suppliers.join(", ")].filter(Boolean).join(" · "))),
    ...["casa", "camino", "vendiendo", "recuperado"].map((k) => h("td", { class: "mono" }, x.by[k] || "—")),
    h("td", { class: "mono" }, x.units), h("td", { class: "mono" }, x.avg_cost != null ? money(x.avg_cost) : "—"), h("td", { class: "mono" }, fdate(x.last_date)))));
  return h("div", { class: "stack", style: "gap:18px" },
    h("p", { class: "small muted", style: "margin:0;max-width:700px" }, "Unidades compradas según los productos de cada factura, y dónde están según la etapa de su lote. Las ventas y el stock en bodega de Amazon se ven en Seller Central."),
    h("div", { class: "grid g4" }, stat("En casa (sin enviar)", tot("casa")), stat("En camino o en bodega", tot("camino")), stat("Vendiéndose", tot("vendiendo")), stat("Lote recuperado", tot("recuperado"))),
    h("section", { class: "card stack" }, h("div", { class: "row between" }, h("h2", null, "Productos"), search),
      items.length ? h("div", { class: "tablewrap" }, h("table", { style: "min-width:760px" }, h("thead", null, h("tr", null, ["Producto", "En casa", "En camino / bodega", "Vendiéndose", "Recuperado", "Total", "Costo prom.", "Última compra"].map((c) => h("th", null, c)))), body))
        : h("p", { class: "empty" }, "Todavía no hay productos. Aparecen cuando confirmas facturas con sus productos y cantidades.")));
}
async function pageSupplier(scope, ownerId, sid, q) {
  const active = scope === "entity" ? `empresa-${ownerId}-proveedores` : "negocio-" + ownerId;
  if (scope === "entity") setEntity(ownerId);
  shell(loading(), active);
  let b, ctx, suppliers;
  if (scope === "entity") {
    const ent = state.entities.find((e) => e.id === ownerId); if (!ent) return pageNotFound();
    suppliers = (await api("/suppliers?entity=" + ownerId)).suppliers;
    b = { id: ownerId, name: ent.name };
    ctx = { scope: "entity", id: ownerId, base: "#/empresa/" + ownerId, name: ent.name, businesses: state.businesses.filter((x) => x.entity_id === ownerId) };
  } else {
    const r = await Promise.all([api("/businesses/" + ownerId), api("/suppliers?business=" + ownerId)]);
    b = r[0].business; suppliers = r[1].suppliers;
    ctx = { scope: "business", id: ownerId, base: "#/negocio/" + ownerId, name: b.name };
  }
  const bid = ownerId;
  const s = suppliers.find((x) => x.id === sid); if (!s) return pageNotFound();
  const page = h("div", { class: "page" },
    h("nav", { class: "crumbs", "aria-label": "Ruta" }, h("a", { href: ctx.base }, b.name), "›", h("a", { href: `${ctx.base}/proveedores` }, "Proveedores"), "›", h("b", { style: "color:var(--ink)" }, s.name)),
    h("section", { class: "card stack" },
      h("div", { class: "row between", style: "align-items:flex-start" }, h("div", { class: "stack", style: "gap:6px" }, h("h1", null, s.name),
        h("span", { class: "chips" }, pill(...(SUP_ST[s.status || "investigar"])), s.amazon_policy ? pill(...AMZ_POL[s.amazon_policy]) : "", s.risk ? pill(...RISK[s.risk]) : "", s.kind ? pill(s.kind.split(" (")[0]) : "", s.platforms.map((p) => pill(p)), s.kind === TOOL_KIND ? "" : s.brand_auth === "si" ? pill("Autorización de marca: probada", "ok") : s.brand_auth === "no" ? pill("Sin autorización de marca", "bad") : pill("Autorización de marca: pendiente", "warn"))),
        h("div", { class: "row" }, h("button", { class: "btn only-admin", type: "button", onclick: () => supplierDialog(null, s) }, "Editar"),
          isAdmin() ? h("button", { class: "btn danger", type: "button", onclick: () => confirmDelete("Eliminar proveedor", `Se borra la ficha de ${s.name}. Sus facturas no se borran: quedan en el archivo del negocio, sin proveedor asignado.`, async () => {
            await api("/suppliers/" + s.id, { method: "DELETE" }); toast("Proveedor eliminado."); location.hash = `${ctx.base}/proveedores`;
          }) }, "Eliminar") : "",
          h("button", { class: "btn primary only-upload", type: "button", onclick: () => uploadInvoiceDialog(scope === "business" ? bid : null, sid, suppliers, ctx.businesses) }, "Subir factura de este proveedor"))),
      h("div", { class: "kv" }, h("div", null, h("span", null, `Comprado en ${new Date().getFullYear()}`), h("b", { class: "mono" }, money(s.year_total))), h("div", null, h("span", null, "Facturas"), h("b", { class: "mono" }, s.invoices)), h("div", null, h("span", null, "Plataformas"), h("b", null, s.platforms.join(", ") || "—")),
        h("div", null, h("span", null, "Pedido mínimo"), h("b", { title: s.min_order || "" }, s.min_order ? s.min_order.split(/ \(| · /)[0].slice(0, 60) : "—")), h("div", null, h("span", null, "Condiciones de pago"), h("b", null, s.payment_terms || "—"))),
      h("div", { class: "row small muted", style: "gap:22px" }, h("span", null, "Contacto: ", h("b", { style: "color:var(--ink)" }, s.contact_name || "—"), s.email ? " · " + s.email : "", s.phone ? " · " + s.phone : ""),
        h("span", null, "Dirección: ", h("b", { style: "color:var(--ink)" }, s.address || "—")), s.tax_id ? h("span", null, "N.º fiscal: ", h("b", { style: "color:var(--ink)" }, s.tax_id)) : "",
        h("span", null, "Marcas: ", h("b", { style: "color:var(--ink)" }, s.brands || "—")), s.location ? h("span", null, "Ubicación: ", h("b", { style: "color:var(--ink)" }, s.location)) : "",
        s.website ? h("a", { href: /^https?:/.test(s.website) ? s.website : "https://" + s.website, target: "_blank", rel: "noopener" }, "Sitio web") : ""),
      isAdmin() ? h("div", { class: "row", style: "gap:8px" }, h("span", { class: "small muted" }, "Cambiar estado:"), h("select", { "aria-label": "Estado del proveedor", style: "width:auto", onchange: async (e) => {
        await api(`/suppliers/${s.id}/status`, { method: "PUT", body: { status: e.target.value } }); toast("Estado actualizado: " + SUP_ST[e.target.value][0] + "."); route(); } },
        Object.entries(SUP_ST).map(([k, v]) => h("option", { value: k, selected: (s.status || "investigar") === k }, v[0]))),
        h("span", { class: "small muted", style: "margin-left:14px" }, "Clasificación:"), h("select", { "aria-label": "Clasificación del proveedor", style: "width:auto", onchange: async (e) => {
          const r = await api(`/suppliers/${s.id}/kind`, { method: "PUT", body: { kind: e.target.value } });
          toast("Clasificación: " + e.target.value + "." + (r.invoices ? ` ${r.invoices} factura(s) actualizada(s).` : "") + (r.linked ? ` Ligadas a ${r.linked} en Suscripciones.` : "")); route(); } },
          SUP_KINDS.map((k) => h("option", { value: k, selected: (s.kind || "Otro") === k }, k)))) : ""),
    s.decision || s.amazon_note || s.risk_note ? h("section", { class: "card stack" }, h("h2", null, "Lo que encontró el Cerebro"),
      h("div", { class: "stack small", style: "gap:8px" },
        s.decision ? h("div", null, h("b", null, "Decisión: "), s.decision) : "",
        s.director_note ? h("div", null, h("b", null, "Condición del Director para contactarlo: "), s.director_note) : "",
        s.amazon_note ? h("div", null, h("b", null, "Amazon: "), s.amazon_note) : "",
        s.risk_note ? h("div", null, h("b", null, "Riesgo de bloqueo: "), s.risk_note) : "",
        s.min_order ? h("div", null, h("b", null, "Pedido mínimo: "), s.min_order) : "",
        s.source_updated ? h("div", { class: "muted" }, "Actualizado desde el Cerebro Amazon el " + fdate(s.source_updated) + ".") : "")) : "",
    s.draft_text ? h("section", { class: "card stack" }, h("div", { class: "row between" }, h("h2", null, "Borrador de primer contacto"),
        h("div", { class: "row" }, h("button", { class: "btn sm", type: "button", onclick: async () => { try { await navigator.clipboard.writeText(s.draft_text); toast("Texto copiado. Revísalo y complétalo antes de enviarlo."); } catch { toast("No pude copiar. Selecciona el texto a mano.", true); } } }, "Copiar texto"),
          isAdmin() && s.status !== "contactado" ? h("button", { class: "btn sm", type: "button", onclick: async () => { await api(`/suppliers/${s.id}/status`, { method: "PUT", body: { status: "contactado" } }); toast("Marcado como contactado."); route(); } }, "Ya lo envié") : "")),
      s.draft_condition ? h("p", { class: "small", style: "margin:0" }, h("b", null, "Cuándo enviarlo: "), s.draft_condition) : "",
      s.draft_channel ? h("p", { class: "small muted", style: "margin:0" }, "Canal: " + s.draft_channel) : "",
      h("pre", { class: "draft" }, s.draft_text),
      h("p", { class: "small muted", style: "margin:0" }, "La intranet no envía este correo. Cópialo, completa tus datos y envíalo tú cuando se cumpla la condición.")) : "",
    await archiveView(ctx, s, q));
  shell(page, active);
}
async function archiveView(ctx, sup, q) {
  const y = q.get("a"), m = q.get("m"), d = q.get("d");
  const b = { id: ctx.id, name: ctx.name };
  const scopeQ = `${ctx.scope === "entity" ? "entity" : "business"}=${ctx.id}`;
  const base = sup ? `${ctx.base}/proveedor/${sup.id}` : `${ctx.base}/archivo`;
  const link = (yy, mm, dd) => base + "?" + new URLSearchParams(Object.entries({ a: yy, m: mm, d: dd }).filter(([, v]) => v)).toString();
  const [{ days }, { invoices }] = await Promise.all([
    api(`/invoices/tree?${scopeQ}${sup ? "&supplier=" + sup.id : ""}`),
    api(`/invoices?${scopeQ}${sup ? "&supplier=" + sup.id : ""}${y ? "&year=" + y : ""}${m ? "&month=" + m : ""}${d ? "&day=" + d : ""}`),
  ]);
  const years = {}; for (const r of days) { const [yy, mm, dd] = r.d.split("-"); ((years[yy] ||= {})[mm] ||= {})[dd] = r.n; }
  const sum = (o) => Object.values(o).reduce((a, v) => a + (typeof v === "number" ? v : sum(v)), 0);
  const selected = new Set();
  const sendBtn = h("button", { class: "btn sm only-upload", type: "button", disabled: true, onclick: () => sendDialog({ invoice_ids: [...selected] }) }, "Enviar seleccionadas");
  const updateSel = () => { sendBtn.disabled = !selected.size; sendBtn.textContent = selected.size ? `Enviar ${selected.size} seleccionada${selected.size === 1 ? "" : "s"}` : "Enviar seleccionadas"; };
  const colY = h("div", { class: "col" }, h("span", { class: "eyebrow" }, "Año"), h("a", { href: link(), class: !y ? "on" : "" }, "Todos", h("span", null, days.reduce((a, r) => a + r.n, 0))),
    Object.keys(years).sort().reverse().map((yy) => h("a", { href: link(yy), class: y === yy ? "on" : "" }, yy, h("span", null, sum(years[yy])))));
  const colM = y && years[y] ? h("div", { class: "col" }, h("span", { class: "eyebrow" }, "Mes"), Object.keys(years[y]).sort().reverse().map((mm) => h("a", { href: link(y, mm), class: m === mm ? "on" : "" }, MONTHS[Number(mm) - 1], h("span", null, sum(years[y][mm]))))) : "";
  const colD = y && m && years[y]?.[m] ? h("div", { class: "col" }, h("span", { class: "eyebrow" }, "Día"), Object.keys(years[y][m]).sort().reverse().map((dd) => h("a", { href: link(y, m, dd), class: d === dd ? "on" : "" }, `${Number(dd)} ${MON[Number(m) - 1]}`, h("span", null, years[y][m][dd])))) : "";
  const title = d ? `Archivos del ${Number(d)} de ${MONTHS[Number(m) - 1].toLowerCase()} de ${y}` : m ? `${MONTHS[Number(m) - 1]} de ${y}` : y ? `Año ${y}` : "Todos los archivos";
  const list = h("div", { class: "stack", style: "flex:3 1 420px;min-width:0" },
    h("div", { class: "row between" }, h("span", { class: "eyebrow" }, title), sendBtn),
    invoices.length ? invoices.map((i) => h("div", { class: "filerow" },
      h("input", { type: "checkbox", "aria-label": "Seleccionar", onchange: (e) => { e.target.checked ? selected.add(i.id) : selected.delete(i.id); updateSel(); } }),
      h("span", { class: "thumb", "aria-hidden": "true" }, ext(i.filename)),
      h("span", { class: "info" }, h("a", { href: "#/factura/" + i.id, style: "font-weight:700;color:var(--ink)" }, [i.supplier || i.supplier_name, i.invoice_number ? "Factura " + i.invoice_number : i.title || i.kind].filter(Boolean).join(" · ")),
        h("span", { class: "small muted" }, [ctx.scope === "entity" ? i.business : "", fdate(i.issue_date), i.total != null ? money(i.total, i.currency) : "", bytes(i.size || 0)].filter(Boolean).join(" · "), " ", i.status === "confirmada" ? pill("Confirmada", "ok") : pill("Por revisar", "warn"))),
      fileActions(i.file_id, () => sendDialog({ invoice_ids: [i.id] })))) : h("p", { class: "empty" }, "No hay facturas en esta fecha."));
  return h("section", { class: "card stack", style: "gap:16px" },
    h("div", { class: "row between" }, h("div", null, h("h2", null, sup ? "Facturas por fecha" : "Archivo de facturas y escaneos"), h("span", { class: "small muted" }, "Se ordenan por la fecha del documento: año › mes › día")),
      ""),
    h("nav", { class: "crumbs", "aria-label": "Ruta del archivo" }, h("a", { href: link() }, sup ? sup.name : b.name), y ? ["›", h("a", { href: link(y) }, y)] : "", m ? ["›", h("a", { href: link(y, m) }, MONTHS[Number(m) - 1])] : "", d ? ["›", h("b", { style: "color:var(--ink)" }, "Día " + Number(d))] : ""),
    h("div", { class: "cols" }, colY, colM, colD, list));
}

async function pageInvoice(id, q) {
  shell(loading(), "");
  let { invoice: inv, checks, claude } = await api("/invoices/" + id);
  const [{ business: b }, { suppliers }] = await Promise.all([api("/businesses/" + inv.business_id), api("/suppliers?business=" + inv.business_id)]);
  const readData = JSON.parse(sessionStorage.getItem("read:" + id) || "null");
  const previewEl = /^image\//.test(inv.mime) ? h("img", { src: "/api/files/" + inv.file_id, alt: "Factura escaneada" }) : inv.mime === "application/pdf" ? h("iframe", { src: "/api/files/" + inv.file_id, title: "Factura en PDF" }) : h("p", { class: "empty" }, "Vista previa no disponible.");
  const status = h("div", { class: "card stack", style: "gap:4px" });
  const conf = inv.confidence || {};
  const low = (k) => typeof conf[k] === "number" && conf[k] < 0.7;
  const F = {};
  const inp = (k, label, type = "text", extra = {}) => { F[k] = h("input", { name: k, type, value: inv[k] ?? "", step: type === "number" ? "0.01" : null, ...extra }); return h("label", { class: "field" + (low(k) || (k === "supplier_name" && low("supplier")) ? " low" : "") }, label + (low(k) ? " · revisar" : ""), F[k]); };
  let items = inv.items || [];
  const itemsBody = h("tbody");
  const drawItems = () => itemsBody.replaceChildren(...items.map((it, idx) => h("tr", null,
    ["description", "upc", "qty", "unit_cost"].map((k) => h("td", null, h("input", { "aria-label": k, value: it[k] ?? "", type: k === "qty" || k === "unit_cost" ? "number" : "text", step: "0.01", style: "width:100%;min-width:" + (k === "description" ? "180px" : "80px") + ";padding:7px 8px;border:1px solid var(--line);border-radius:6px;background:var(--panel)", oninput: (e) => { it[k] = e.target.value; } }))),
    h("td", null, h("button", { class: "linkbtn small", type: "button", onclick: () => { items.splice(idx, 1); drawItems(); } }, "Quitar")))));
  drawItems();
  const supSel = h("select", { name: "supplier_id" }, h("option", { value: "" }, "Sin proveedor"), suppliers.map((s) => h("option", { value: s.id, selected: s.id === inv.supplier_id }, s.name)));
  const plats = ["Amazon US", "Walmart", "eBay", "Etsy", "TikTok Shop", "Mercado Libre", "Shopify", "WooCommerce"];
  const platBoxes = plats.map((p) => h("label", { class: "chip" }, h("input", { type: "checkbox", value: p, checked: (inv.platforms || []).includes(p) }), " " + p));
  const [{ cards }, lotsRes] = await Promise.all([api("/cards"), api("/lots?business=" + inv.business_id).catch(() => ({ lots: [] }))]);
  const cardSel = cardSelect(cards, inv.card_id, "Sin tarjeta / otro medio");
  const lotSel = h("select", { name: "lot_id" }, h("option", { value: "" }, "Sin lote"), (lotsRes.lots || []).map((l) => h("option", { value: l.id, selected: l.id === inv.lot_id }, l.name)));
  const cardHint = h("p", { class: "small muted", style: "margin:8px 0 0" }, inv.card_last4 && !inv.card_id ? `El recibo dice que se pagó con una tarjeta terminada en ${inv.card_last4}, que no está registrada. Agrégala en Tarjetas.` : "");
  const paySel = h("select", { name: "payment_status" }, [["pendiente", "Pendiente"], ["pagada", "Pagada"]].map(([k, l]) => h("option", { value: k, selected: inv.payment_status === k }, l)));
  function drawChecks(list) {
    status.replaceChildren(h("h2", { style: "margin-bottom:6px" }, "Revisión automática"), ...list.map((c) => h("div", { class: "check" }, pill(c.level === "bien" ? "Bien" : c.level === "mal" ? "Revisar" : "Atención", c.level === "bien" ? "ok" : c.level === "mal" ? "bad" : "warn"), h("span", null, c.text, c.link ? [" ", h("a", { href: "#/factura/" + c.link }, "Ver la otra")] : ""))));
  }
  drawChecks(checks);
  function fill(x) {
    for (const k of ["invoice_number", "po_number", "issue_date", "due_date", "currency", "subtotal", "tax", "shipping", "discount", "total", "payment_method", "supplier_name", "supplier_address", "supplier_tax_id", "supplier_phone", "supplier_email", "supplier_website", "buyer_name", "buyer_address"]) if (F[k] && x[k] !== null && x[k] !== undefined && x[k] !== "") F[k].value = x[k];
    if (x.items?.length) { items = x.items; drawItems(); }
    if (x.payment_status) paySel.value = x.payment_status;
    inv.confidence = x.confidence || {};
    if (!supSel.value && x.supplier_name) { const match = suppliers.find((s) => s.name.toLowerCase().includes(x.supplier_name.toLowerCase().slice(0, 12)) || x.supplier_name.toLowerCase().includes(s.name.toLowerCase())); if (match) supSel.value = match.id; }
    for (const [k, c] of Object.entries(x.confidence || {})) { const key = k === "supplier" ? "supplier_name" : k; const lab = F[key]?.closest(".field"); if (lab) lab.classList.toggle("low", typeof c === "number" && c < 0.7); }
  }
  const readNote = h("p", { class: "small muted", style: "margin:0" }, inv.read_by ? `Leída con ${inv.read_by === "claude" ? "Claude" : "la IA gratuita de Cloudflare"}. Corrige lo que no coincida.` : "");
  async function read(engine, btn) {
    let data = readData;
    if (!data) data = await rebuildReadData(inv);
    if (!data || (!data.image && !data.text)) { toast("No hay imagen para leer. Llena los datos a mano.", true); return; }
    const run = async () => {
      const r = await api(`/invoices/${id}/extract`, { method: "POST", body: { ...data, engine } });
      if (r.card?.id && !r.card.mismatch) { cardSel.value = r.card.id; cardHint.textContent = `Pagada con ${r.card.nickname} •••• ${r.card.last4} (detectada en el recibo).`; }
      else if (r.card?.mismatch) cardHint.textContent = `Ojo: el recibo dice tarjeta •••• ${r.card.last4}, pero la factura está asociada a otra tarjeta.`;
      else if (r.card?.unknown) cardHint.textContent = `El recibo dice que se pagó con una tarjeta terminada en ${r.card.last4}, que no está registrada. Agrégala en Tarjetas.`;
      if (r.supplier) {
        if (![...supSel.options].some((o) => o.value === r.supplier.id)) supSel.append(h("option", { value: r.supplier.id }, r.supplier.name));
        supSel.value = r.supplier.id; inv.supplier_id = r.supplier.id;
      }
      fill(r.extracted);
      readNote.textContent = `Leída con ${engine === "claude" ? "Claude" : "la IA gratuita de Cloudflare"}. Los campos en ámbar tienen poca seguridad: revísalos.`;
      toast(r.supplier?.created ? `Proveedor nuevo: agregué “${r.supplier.name}” con los datos de la factura.` : r.supplier ? `Proveedor reconocido: ${r.supplier.name}.` : "Datos leídos. Revísalos y confirma.");
    };
    btn ? await busy(btn, run) : await run().catch((e) => { readNote.textContent = e.message; toast(e.message, true); });
  }
  async function save(confirm, btn) {
    await busy(btn, async () => {
      const body = {};
      for (const [k, el] of Object.entries(F)) body[k] = el.value;
      body.supplier_id = supSel.value || null; body.payment_status = paySel.value; body.card_id = cardSel.value || null; body.lot_id = lotSel.value || null; body.kind = inv.kind; body.title = inv.title;
      body.items = items.filter((i) => i.description || i.upc || i.qty); body.platforms = platBoxes.map((l) => l.querySelector("input")).filter((c) => c.checked).map((c) => c.value);
      body.confidence = inv.confidence; body.confirm = confirm;
      const r = await api("/invoices/" + id, { method: "PUT", body });
      drawChecks(r.checks); sessionStorage.removeItem("read:" + id);
      toast(!confirm ? "Cambios guardados." : (r.supplier_created ? "Factura archivada. Creé el proveedor con los datos de la factura." : "Factura confirmada y archivada.") + (r.sub_filled ? " La suscripción tomó el valor y la fecha de esta factura." : ""));
      const sid = r.supplier_id || supSel.value;
      if (confirm) location.hash = sid ? `#/negocio/${b.id}/proveedor/${sid}?` + new URLSearchParams(dateParts(F.issue_date.value)) : `#/negocio/${b.id}/archivo?` + new URLSearchParams(dateParts(F.issue_date.value));
    });
  }
  const reread = claude ? h("button", { class: "btn ghost", type: "button", onclick: (e) => read("claude", e.currentTarget) }, "Releer con Claude") : "";
  const page = h("div", { class: "page" },
    h("div", { class: "head" }, h("div", null,
      h("nav", { class: "crumbs", "aria-label": "Ruta" }, h("a", { href: "#/negocio/" + b.id + "/archivo" }, b.name), inv.supplier_id ? ["›", h("a", { href: `#/negocio/${b.id}/proveedor/${inv.supplier_id}` }, inv.supplier)] : "", "›", h("span", null, inv.invoice_number ? "Factura " + inv.invoice_number : "Nueva factura")),
      h("h1", null, inv.status === "confirmada" ? "Factura " + (inv.invoice_number || "") : "Revisa lo que se leyó de la factura"), readNote),
      h("div", { class: "row" }, fileActions(inv.file_id, () => sendDialog({ invoice_ids: [id] })),
        isAdmin() ? h("button", { class: "btn sm danger", type: "button", onclick: () => confirmDelete("Eliminar factura", "Se borran la factura y su archivo escaneado. No se puede deshacer.", async () => {
          const r = await api("/invoices/" + id, { method: "DELETE" }); toast("Factura eliminada.");
          location.hash = r.supplier_id ? `#/negocio/${r.business_id}/proveedor/${r.supplier_id}` : `#/negocio/${r.business_id}/archivo`;
        }) }, "Eliminar") : "")),
    h("div", { class: "split" },
      h("figure", { class: "l preview", style: "margin:0" }, previewEl, h("figcaption", { class: "small muted", style: "margin-top:8px" }, `${inv.filename} · ${bytes(inv.size || 0)}${inv.original_size && inv.original_size > inv.size ? ` (original ${bytes(inv.original_size)})` : ""}`)),
      h("form", { class: "r", onsubmit: (e) => e.preventDefault(), "aria-label": "Datos de la factura" },
        status,
        h("fieldset", null, h("legend", null, "Factura"), h("div", { class: "fgrid" }, inp("invoice_number", "Número de factura"), inp("po_number", "Orden de compra"), inp("issue_date", "Fecha de emisión", "date"), inp("due_date", "Fecha de vencimiento", "date"))),
        h("fieldset", null, h("legend", null, "Montos"), h("div", { class: "fgrid" }, inp("subtotal", "Subtotal", "number"), inp("tax", "Impuesto", "number"), inp("shipping", "Envío", "number"), inp("discount", "Descuento", "number"), inp("total", "Total", "number"), inp("currency", "Moneda", "text", { maxlength: "3" }))),
        h("fieldset", null, h("legend", null, "Proveedor (como aparece en la factura)"), h("div", { class: "fgrid" }, inp("supplier_name", "Nombre"), inp("supplier_tax_id", "N.º fiscal (EIN o NIT)"), inp("supplier_address", "Dirección"), inp("supplier_phone", "Teléfono", "tel"), inp("supplier_email", "Correo", "email"), inp("supplier_website", "Sitio web")),
          h("p", { class: "small muted", style: "margin:10px 0 0" }, "Al confirmar, estos datos completan la ficha del proveedor. Si no existe en la intranet, se crea con ellos.")),
        h("fieldset", null, h("legend", null, "Comprador (debe coincidir con Seller Central)"), h("div", { class: "fgrid" }, inp("buyer_name", "Nombre"), inp("buyer_address", "Dirección"))),
        h("fieldset", null, h("legend", null, "Productos"), h("div", { class: "tablewrap" }, h("table", { style: "min-width:560px" }, h("thead", null, h("tr", null, h("th", null, "Descripción"), h("th", null, "UPC / SKU"), h("th", null, "Cant."), h("th", null, "Costo unit."), h("th", null, ""))), itemsBody)),
          h("button", { class: "linkbtn", type: "button", onclick: () => { items.push({ description: "", upc: "", qty: "", unit_cost: "" }); drawItems(); } }, "+ Agregar producto")),
        h("fieldset", null, h("legend", null, "Pago"), h("div", { class: "fgrid" }, fld("Tarjeta con que se pagó", cardSel), fld("Estado del pago", paySel), inp("payment_method", "Método de pago (como aparece)")), cardHint),
        h("fieldset", null, h("legend", null, "Dónde se archiva"), h("div", { class: "fgrid" }, fld("Proveedor en la intranet", supSel), fld("Lote", lotSel)),
          h("div", { class: "chips", style: "margin-top:10px" }, platBoxes)),
        h("div", { class: "row", style: "justify-content:flex-end" }, reread,
          h("button", { class: "btn", type: "button", onclick: (e) => read("workers-ai", e.currentTarget) }, "Volver a leer"),
          h("button", { class: "btn", type: "button", onclick: (e) => save(false, e.currentTarget) }, "Guardar sin confirmar"),
          h("button", { class: "btn primary", type: "button", onclick: (e) => save(true, e.currentTarget) }, "Confirmar y archivar")))));
  shell(page, "negocio-" + b.id);
  const editable = isAdmin() || (state.user.role === "standard" && inv.status !== "confirmada");
  if (!editable) {
    page.querySelectorAll("form[aria-label] input, form[aria-label] select, form[aria-label] textarea").forEach((el) => { el.disabled = true; });
    page.querySelectorAll("form[aria-label] button").forEach((el) => { el.hidden = true; });
    readNote.textContent = state.user.role === "viewer" ? "Tu acceso es de solo consulta." : "Esta factura ya está confirmada. Solo el administrador puede editarla.";
    return;
  }
  if (inv.extracted && inv.status !== "confirmada" && !inv.invoice_number) fill(JSON.parse(inv.extracted));
  else if (q.get("leer") && !inv.extracted) { readNote.textContent = "Leyendo la factura…"; read("workers-ai"); }
}
function dateParts(v) { const m = String(v || "").match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? { a: m[1], m: m[2], d: m[3] } : {}; }
async function rebuildReadData(inv) {
  try {
    const res = await fetch("/api/files/" + inv.file_id, { credentials: "same-origin" });
    const blob = await res.blob();
    const prep = await prepareUpload(new File([blob], inv.filename, { type: inv.mime }));
    return { image: prep.image, text: prep.text };
  } catch { return null; }
}

async function pagePlatforms() {
  shell(loading(), "plataformas");
  const [{ platforms, policies }, { businesses }] = await Promise.all([api("/platforms"), api("/businesses")]);
  const connected = platforms.filter((p) => p.status === "conectada").length;
  const page = h("div", { class: "page" },
    h("div", { class: "head" }, h("div", null, h("span", { class: "eyebrow" }, "Multiplataforma · computador, iPhone y Android"), h("h1", null, "Plataformas"),
      h("p", { class: "muted", style: "margin:0;max-width:64ch" }, "Cada marketplace donde vendes o podrías vender, asignado a su negocio. Las facturas de cualquier plataforma se archivan en su negocio, por proveedor y por fecha."))),
    h("div", { class: "grid g4" },
      h("div", { class: "card stat" }, h("span", { class: "small muted" }, "Plataformas conectadas"), h("br"), h("b", null, `${connected} de ${platforms.length}`)),
      h("div", { class: "card stat" }, h("span", { class: "small muted" }, "Asignadas a un negocio"), h("br"), h("b", null, platforms.filter((p) => p.business_id).length)),
      h("div", { class: "card stat" }, h("span", { class: "small muted" }, "Cambios de políticas registrados"), h("br"), h("b", null, policies.length))),
    h("section", { class: "stack" }, h("h2", null, "Marketplaces"),
      h("div", { class: "grid g4" }, platforms.map((p) => {
        const bizSel = h("select", { "aria-label": "Negocio de " + p.name }, h("option", { value: "" }, "Sin negocio"), businesses.map((b) => h("option", { value: b.id, selected: b.id === p.business_id }, b.name)));
        const stSel = h("select", { "aria-label": "Estado de " + p.name }, Object.entries(PLAT_ST).map(([k, v]) => h("option", { value: k, selected: k === p.status }, v[0])));
        const save = async () => { await api("/platforms/" + p.id, { method: "PUT", body: { business_id: bizSel.value || null, status: stSel.value } }); toast(p.name + " actualizado."); };
        bizSel.onchange = save; stSel.onchange = save;
        if (!isAdmin()) { bizSel.disabled = true; stSel.disabled = true; }
        const owner = businesses.find((b) => b.id === p.business_id);
        const shortcut = owner ? h("a", { class: "btn sm", href: "#/negocio/" + owner.id }, "Abrir " + owner.name + " →")
          : h("button", { class: "btn primary sm only-admin", type: "button", onclick: () => createShortcut(p) }, "+ Crear acceso en Negocios");
        return h("div", { class: "card stack", style: "gap:8px" }, h("div", { class: "row between" }, h("b", null, p.name), pill(...PLAT_ST[p.status])), h("span", { class: "small muted" }, p.region),
          shortcut, fld("Negocio", bizSel), fld("Estado", stSel));
      }))),
    h("p", { class: "small muted", style: "margin:0" }, "La conexión automática (ventas y pedidos en vivo) se activa plataforma por plataforma, cuando cada una te dé acceso. Mientras tanto, sube sus facturas y registros a mano."),
    h("section", { class: "card stack" }, h("div", { class: "row between" }, h("div", null, h("h2", null, "Cambios de políticas de las plataformas"), h("span", { class: "small muted" }, "Anota cada cambio y a qué negocio afecta")),
      h("button", { class: "btn sm only-admin", type: "button", onclick: () => modal("Registrar cambio de política", () => h("div", { class: "stack" },
        fld("Plataforma", h("select", { name: "platform_id" }, platforms.map((p) => h("option", { value: p.id }, p.name)))), fld("Qué cambió", h("input", { name: "title", required: true })),
        h("div", { class: "fgrid" }, fld("Fecha", h("input", { name: "happened_on", type: "date" })), fld("Enlace de la fuente", h("input", { name: "url", type: "url" }))), fld("Notas", h("input", { name: "notes" }))),
        async (fd) => { await api("/policies", { method: "POST", body: Object.fromEntries(fd) }); toast("Cambio registrado."); route(); }) }, "+ Registrar cambio")),
      policies.length ? h("div", { class: "list" }, policies.map((po) => h("div", null, h("span", null, h("b", null, po.platform_name || ""), " · ", po.title, po.url ? [" ", h("a", { href: po.url, target: "_blank", rel: "noopener" }, "Fuente")] : ""), h("span", { class: "small muted" }, (po.business_name ? "Afecta a: " + po.business_name + " · " : "") + fdate(po.happened_on))))) : h("p", { class: "empty" }, "No hay cambios registrados.")));
  shell(page, "plataformas");
}

function createShortcut(p) {
  const defEntity = state.entity || (p.id === "mercadolibre" ? "sas" : "llc");
  modal(`Crear acceso a ${p.name} en Negocios`, () => h("div", { class: "stack" },
    h("p", { class: "muted", style: "margin:0" }, `Se crea el negocio “${p.name}” en el menú, con sus herramientas, sus proveedores y su archivo de facturas por año, mes y día.`),
    fld("Empresa a la que pertenece", h("select", { name: "entity_id" }, state.entities.map((e) => h("option", { value: e.id, selected: e.id === defEntity }, e.name)), h("option", { value: "" }, "Sin empresa")))),
  async (fd) => {
    const r = await api(`/platforms/${p.id}/business`, { method: "POST", body: { entity_id: fd.get("entity_id") } });
    const { businesses } = await api("/businesses"); state.businesses = businesses;
    toast(`${p.name} ya está en Negocios.`); location.hash = "#/negocio/" + r.id;
  }, "Crear acceso");
}
async function pageSearch(qs) {
  shell(loading(), "");
  const r = await api("/search?q=" + encodeURIComponent(qs));
  const total = r.invoices.length + r.docs.length + r.suppliers.length;
  const page = h("div", { class: "page" }, h("div", { class: "head" }, h("div", null, h("span", { class: "eyebrow" }, "Búsqueda"), h("h1", null, `${total} resultado${total === 1 ? "" : "s"} para “${qs}”`)), searchBox(qs)),
    r.invoices.length ? h("section", { class: "card" }, h("h2", null, "Facturas"), h("div", { class: "list" }, r.invoices.map((i) => h("a", { href: "#/factura/" + i.id }, h("span", null, h("b", null, [i.supplier, i.invoice_number ? "Factura " + i.invoice_number : i.title].filter(Boolean).join(" · ") || "Factura"), h("span", { class: "muted" }, " · " + i.business)), h("span", { class: "mono small" }, fdate(i.issue_date) + " · " + money(i.total, i.currency)))))) : "",
    r.docs.length ? h("section", { class: "card" }, h("h2", null, "Documentos de las empresas"), h("div", { class: "list" }, r.docs.map((d) => h("a", { href: `#/empresa/${d.entity_id}/documentos?carpeta=${encodeURIComponent(d.folder)}` }, h("b", null, d.title), h("span", { class: "small muted" }, d.entity_id.toUpperCase() + " · " + d.folder))))) : "",
    r.suppliers.length ? h("section", { class: "card" }, h("h2", null, "Proveedores"), h("div", { class: "list" }, r.suppliers.map((s) => h("a", { href: `#/negocio/${s.business_id}/proveedor/${s.id}` }, h("b", null, s.name), h("span", { class: "small muted" }, s.kind || ""))))) : "",
    total ? "" : h("p", { class: "empty" }, "No encontré nada. Prueba con el número de factura, un monto, un UPC o el nombre del proveedor."));
  shell(page, "");
}

async function pageSettings() {
  shell(loading(), "ajustes");
  const [{ users }, { recipients }, usage, { sends }] = await Promise.all([api("/users"), api("/recipients"), api("/usage"), api("/sends")]);
  const admin = state.user.role === "admin";
  const pct = Math.min(100, usage.bytes / usage.free * 100);
  const orphans = state.businesses.filter((b) => !b.entity_id);
  const page = h("div", { class: "page" }, h("div", { class: "head" }, h("div", null, h("span", { class: "eyebrow" }, "Configuración"), h("h1", null, "Accesos y ajustes"))),
    orphans.length ? h("section", { class: "card stack" }, h("h2", null, "Negocios sin empresa asignada"), h("p", { class: "small muted", style: "margin:0" }, "No aparecen dentro de ninguna empresa hasta que les asignes una."),
      h("div", { class: "list" }, orphans.map((b) => h("div", null, h("b", null, b.name), h("span", { class: "row", style: "gap:10px" }, h("a", { href: "#/negocio/" + b.id }, "Abrir"), h("button", { class: "linkbtn only-admin", type: "button", onclick: () => businessDialog(b) }, "Asignar empresa")))))) : "",
    h("div", { class: "grid g2" },
      h("section", { class: "card stack" }, h("div", { class: "row between" }, h("h2", null, "Quién puede entrar"), admin ? h("button", { class: "btn sm", type: "button", onclick: () => modal("Dar acceso", () => h("div", { class: "stack" }, fld("Correo", h("input", { name: "email", type: "email", required: true })), fld("Nombre", h("input", { name: "name" })), fld("Rol", h("select", { name: "role" }, ["standard", "viewer", "admin"].map((r) => h("option", { value: r }, ROLE_LABEL[r])))),
          h("ul", { class: "small muted", style: "margin:0;padding-left:18px" }, ["admin", "standard", "viewer"].map((r) => h("li", null, h("b", null, ROLE_LABEL[r] + ": "), ROLE_HELP[r])))),
        async (fd) => { await api("/users", { method: "POST", body: Object.fromEntries(fd) }); toast("Acceso dado."); route(); }, "Dar acceso") }, "+ Dar acceso") : ""),
        h("div", { class: "list" }, users.filter((u) => u.active).map((u) => h("div", null, h("span", { class: "stack", style: "gap:0" }, h("b", null, u.email), h("span", { class: "small muted" }, [...new Set([u.name, ROLE_LABEL[u.role === "member" ? "standard" : u.role]].filter(Boolean))].join(" · "))),
          admin && u.email !== state.user.email ? h("select", { "aria-label": "Rol de " + u.email, style: "padding:6px 8px;border:1px solid var(--line);border-radius:8px;background:var(--panel)", onchange: async (e) => { try { await api("/users", { method: "POST", body: { email: u.email, name: u.name, role: e.target.value } }); toast("Rol actualizado."); } catch (x) { toast(x.message, true); } } },
            ["admin", "standard", "viewer"].map((r) => h("option", { value: r, selected: (u.role === "member" ? "standard" : u.role) === r }, ROLE_LABEL[r]))) : "",
          admin && u.email !== state.user.email ? h("button", { class: "linkbtn small", type: "button", onclick: async () => { await api("/users/" + encodeURIComponent(u.email), { method: "DELETE" }); toast("Acceso quitado."); route(); } }, "Quitar acceso") : "")))),
      h("section", { class: "card stack" }, h("div", { class: "row between" }, h("h2", null, "Correos que pueden recibir documentos"), admin ? h("button", { class: "btn sm", type: "button", onclick: () => modal("Autorizar correo", () => h("div", { class: "stack" }, fld("Correo", h("input", { name: "email", type: "email", required: true })), fld("Etiqueta", h("input", { name: "label", placeholder: "Mi Gmail, contador…" })),
        h("p", { class: "small muted", style: "margin:0" }, "Este correo también debe estar verificado en Cloudflare (Email Routing › Destination addresses).")),
        async (fd) => { await api("/recipients", { method: "POST", body: Object.fromEntries(fd) }); toast("Correo autorizado."); route(); }, "Autorizar") }, "+ Autorizar") : ""),
        recipients.length ? h("div", { class: "list" }, recipients.map((r) => h("div", null, h("span", { class: "stack", style: "gap:0" }, h("b", null, r.email), h("span", { class: "small muted" }, r.label || "")),
          admin ? h("button", { class: "linkbtn small", type: "button", onclick: async () => { await api("/recipients/" + encodeURIComponent(r.email), { method: "DELETE" }); toast("Correo quitado."); route(); } }, "Quitar") : ""))) : h("p", { class: "empty" }, "Ninguno todavía."))),
    h("section", { class: "card stack" }, h("h2", null, "Almacenamiento y lectura automática"),
      h("div", { class: "row between small" }, h("span", null, `${bytes(usage.bytes)} usados de ${bytes(usage.free)} gratis · ${usage.n} archivos`), usage.original > usage.bytes ? h("span", { class: "muted" }, `La compresión ahorró ${bytes(usage.original - usage.bytes)}`) : ""),
      h("div", { class: "meter", role: "img", "aria-label": `Usado ${pct.toFixed(1)}%` }, h("i", { style: `width:${Math.max(pct, 0.5)}%` })),
      h("div", { class: "list" }, h("div", null, h("span", null, "Lectura con la IA gratuita de Cloudflare"), usage.ai ? pill("Activa", "ok") : pill("No configurada", "warn")),
        h("div", null, h("span", null, "Relectura con Claude"), usage.claude.configured ? h("span", { class: "small mono" }, `$${usage.claude.usd.toFixed(3)} de $${usage.claude.cap} este mes`) : pill("No configurada")))),
    h("section", { class: "card" }, h("h2", null, "Historial de envíos por correo"),
      sends.length ? h("div", { class: "tablewrap" }, h("table", { style: "min-width:560px" }, h("thead", null, h("tr", null, h("th", null, "Fecha"), h("th", null, "Para"), h("th", null, "Asunto"), h("th", null, "Archivos"))),
        h("tbody", null, sends.map((s) => h("tr", null, h("td", { class: "mono" }, new Date(s.sent_at).toLocaleString("es-US", { timeZone: "America/Chicago", dateStyle: "medium", timeStyle: "short" })), h("td", null, s.to_email), h("td", null, s.subject, s.ok ? "" : [" ", pill("Falló", "bad")]), h("td", null, JSON.parse(s.items).length)))))) : h("p", { class: "empty" }, "Todavía no has enviado documentos.")));
  shell(page, "ajustes");
}
function pageNotFound() { shell(h("div", { class: "page" }, h("h1", null, "No encontré esa página"), h("p", null, h("a", { href: "#/" }, "Volver al inicio"))), ""); }

// ---------- rutas ----------
async function route() {
  if (!state.user) return;
  if (state.stale) { location.reload(); return; }
  const raw = location.hash.replace(/^#/, "") || "/";
  const [path, qs] = raw.split("?");
  const q = new URLSearchParams(qs || "");
  const parts = path.split("/").filter(Boolean);
  try {
    if (!parts.length) return await pageHome();
    if (parts[0] === "plataformas") return await pagePlatforms();
    if (parts[0] === "personal") return await pagePersonal(parts[1], q);
    if (parts[0] === "empresa" && parts[2] === "proveedor") return await pageSupplier("entity", parts[1], parts[3], q);
    if (parts[0] === "empresa") return await pageEntity(parts[1], parts[2], q);
    if (parts[0] === "negocio" && parts[2] === "proveedor") return await pageSupplier("business", parts[1], parts[3], q);
    if (parts[0] === "negocio") return await pageBusiness(parts[1], parts[2], q);
    if (parts[0] === "factura") return await pageInvoice(parts[1], q);
    if (parts[0] === "buscar") return await pageSearch(q.get("q") || "");
    if (parts[0] === "ajustes") return await pageSettings();
    if (parts[0] === "tarjetas") { location.replace("#/empresa/llc/tarjetas"); return; }
    if (parts[0] === "nuevo-negocio") { history.replaceState(null, "", "#/"); await pageHome(); return businessDialog(null); }
    return pageNotFound();
  } catch (e) {
    if (state.user) shell(h("div", { class: "page" }, h("h1", null, "No se pudo cargar"), h("p", { class: "muted" }, e.message), h("p", null, h("button", { class: "btn", type: "button", onclick: route }, "Intentar de nuevo"))), "");
  }
}
async function boot() {
  try {
    const { user } = await api("/me");
    state.user = user;
    document.body.dataset.role = user.role;
    const [{ businesses }, { entities }] = await Promise.all([api("/businesses"), api("/entities")]);
    state.businesses = businesses; state.entities = entities;
    try { const e = localStorage.getItem("empresa"); if (e && entities.some((x) => x.id === e)) state.entity = e; } catch { /* sin almacenamiento */ }
    route();
  } catch { /* la pantalla de acceso ya se mostró */ }
}
window.addEventListener("hashchange", route);
boot();
})();
