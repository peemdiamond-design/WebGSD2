/* =========================================================
   ฝอ.๒ บช.ตชด. — application script
   Firebase project: gsd2-532a1  (Auth + Firestore + Analytics)
   ========================================================= */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAnalytics, isSupported as analyticsSupported } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-analytics.js";
import {
  getFirestore, collection, addDoc, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  query, orderBy, limit, serverTimestamp, Timestamp
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import {
  getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut, sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

/* ---------------- Config ---------------- */
// ค่า config ของ Firebase เป็นข้อมูลสาธารณะ (ไม่ใช่ความลับ) — ความปลอดภัยอยู่ที่ firestore.rules
const firebaseConfig = {
  apiKey: "AIzaSyBzECZZASPXJQOWX5gwIcadg5IW5T7kdmU",
  authDomain: "gsd2-532a1.firebaseapp.com",
  projectId: "gsd2-532a1",
  storageBucket: "gsd2-532a1.firebasestorage.app",
  messagingSenderId: "958972994255",
  appId: "1:958972994255:web:ef9d5e56b447e41cd78dba",
  measurementId: "G-BGSWEHR9VZ"
};

const CONFIG = {
  // เซิร์ฟเวอร์ไฟล์ลับ: ต้องเป็น HTTPS และเข้าถึงได้จากอินเทอร์เน็ต (เช่น Cloudflare Tunnel / Tailscale Funnel)
  // ตั้งเป็น "" เพื่อปิดส่วนแฟ้มลับ
  secureApiBase: "http://100.92.143.123:1009",
  reportCooldownMs: 60_000,
};

const REPORT_TYPES = ["ความมั่นคงแนวชายแดน", "ยาเสพติด/สิ่งผิดกฎหมาย", "อื่นๆ"];
const CATEGORY = {
  news: { label: "ประชาสัมพันธ์" },
  alert: { label: "แจ้งเตือนภัย" },
  wanted: { label: "ประกาศสืบหา" },
};
const STATUS = {
  new: "ใหม่",
  reviewing: "กำลังตรวจสอบ",
  closed: "ปิดเรื่องแล้ว",
};
const STAT_KEYS = ["drugSeizures", "illegalEntry", "intelReports", "patrols"];
const PAGE_TITLES = {
  home: "",
  command: "โครงสร้างสายบังคับบัญชา",
  stats: "สถิติผลการปฏิบัติงาน",
  news: "ข่าวสารและประกาศ",
  docs: "คลังเอกสาร",
  contact: "ติดต่อหน่วยงาน",
  console: "ระบบเจ้าหน้าที่",
};
const BASE_TITLE = "ฝ่ายอำนวยการ ๒ กองบัญชาการตำรวจตระเวนชายแดน";

/* ---------------- Firebase ---------------- */
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
auth.languageCode = "th";
analyticsSupported().then((ok) => { if (ok) getAnalytics(app); }).catch(() => {});

/* ---------------- State ---------------- */
const state = {
  user: null,
  isStaff: false,
  authReady: false,
  route: { name: "home", sub: null },
  stats: null,
  bulletins: null,        // array | null (not loaded)
  documents: null,
  reports: [],
  reportsLoaded: false,
  newsFilter: "all",
  reportsFilter: "new",
  docsQuery: "",
  consoleTab: "reports",
};

/* =========================================================
   Utilities
   ========================================================= */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function icon(name, cls = "") {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", `icon ${cls}`.trim());
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", `#i-${name}`);
  svg.appendChild(use);
  return svg;
}

/** สร้าง element อย่างปลอดภัย (ข้อความทั้งหมดใส่เป็น text node — กัน XSS) */
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === "class") node.className = v;
    else if (k === "dataset") Object.assign(node.dataset, v);
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else if (k === "text") node.textContent = v;
    else if (v === true) node.setAttribute(k, "");
    else node.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.append(c instanceof Node ? c : String(c));
  }
  return node;
}

const thDate = new Intl.DateTimeFormat("th-TH", { dateStyle: "long" });
const thDateShort = new Intl.DateTimeFormat("th-TH", { dateStyle: "medium" });
const thDateTime = new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" });
const thNumber = new Intl.NumberFormat("th-TH");

const toDate = (v) => (v && typeof v.toDate === "function" ? v.toDate() : v instanceof Date ? v : null);
const fmtDate = (v) => { const d = toDate(v); return d ? thDate.format(d) : "—"; };
const fmtDateShort = (v) => { const d = toDate(v); return d ? thDateShort.format(d) : "—"; };
const fmtDateTime = (v) => { const d = toDate(v); return d ? thDateTime.format(d) : "—"; };
const isHttps = (s) => { try { return new URL(s).protocol === "https:"; } catch { return false; } };
const refCode = (id) => String(id || "").slice(0, 8).toUpperCase();

function debounce(fn, ms = 200) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

async function copyText(text, label = "คัดลอกแล้ว") {
  try {
    if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(text);
    else {
      const ta = el("textarea", { style: "position:fixed;opacity:0" }); ta.value = text;
      document.body.append(ta); ta.select(); document.execCommand("copy"); ta.remove();
    }
    toast(label, text, "success");
  } catch {
    toast("คัดลอกไม่สำเร็จ", "เลือกข้อความแล้วคัดลอกด้วยตนเอง", "error");
  }
}

/* ---------------- Toasts ---------------- */
const TOAST_ICON = { success: "check", error: "alert", warning: "alert", info: "info" };
function toast(title, text = "", type = "info", ms = 4500) {
  const t = el("div", { class: `toast ${type}`, role: type === "error" ? "alert" : null },
    icon(TOAST_ICON[type] || "info"),
    el("div", {}, el("strong", { text: title }), text ? el("p", { text }) : null),
    el("button", { class: "x", type: "button", "aria-label": "ปิดข้อความ", onclick: () => dismiss() }, icon("x")),
  );
  const dismiss = () => { t.classList.add("leaving"); setTimeout(() => t.remove(), 200); };
  $("#toasts").append(t);
  if (ms) setTimeout(dismiss, ms);
}

/* ---------------- Dialogs ---------------- */
function openDialog(dlg) {
  if (!dlg.open) {
    if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
  }
}
function closeDialog(dlg) {
  if (typeof dlg.close === "function") dlg.close(); else dlg.removeAttribute("open");
}
// ปุ่ม [data-close] และคลิกฉากหลังเพื่อปิด
document.addEventListener("click", (e) => {
  const closer = e.target.closest("[data-close]");
  if (closer) { const d = closer.closest("dialog"); if (d) closeDialog(d); }
});
$$("dialog.modal").forEach((d) => {
  d.addEventListener("mousedown", (e) => { d._downOnBackdrop = e.target === d; });
  d.addEventListener("click", (e) => { if (e.target === d && d._downOnBackdrop && d.id !== "dlg-confirm") closeDialog(d); });
});

function confirmDialog(title, text, okLabel = "ลบ") {
  const dlg = $("#dlg-confirm");
  $("#confirm-title").textContent = title;
  $("#confirm-text").textContent = text;
  $("#confirm-ok").textContent = okLabel;
  openDialog(dlg);
  return new Promise((resolve) => {
    const done = (v) => { cleanup(); closeDialog(dlg); resolve(v); };
    const onClick = (e) => { const b = e.target.closest("[data-confirm]"); if (b) done(b.dataset.confirm === "yes"); };
    const onCancel = (e) => { e.preventDefault(); done(false); };
    const cleanup = () => { dlg.removeEventListener("click", onClick); dlg.removeEventListener("cancel", onCancel); };
    dlg.addEventListener("click", onClick);
    dlg.addEventListener("cancel", onCancel);
    setTimeout(() => $("[data-confirm='no']", dlg).focus(), 0);
  });
}

function setBusy(btn, busy, busyText) {
  if (!btn) return;
  if (busy) {
    btn._html = btn.innerHTML; btn.disabled = true; btn.setAttribute("aria-busy", "true");
    btn.replaceChildren(el("span", { class: "spinner", "aria-hidden": "true" }), busyText ? el("span", { text: busyText }) : "");
  } else {
    btn.disabled = false; btn.removeAttribute("aria-busy");
    if (btn._html != null) btn.innerHTML = btn._html;
  }
}

function emptyState(iconName, title, text, action) {
  return el("div", { class: "empty" }, icon(iconName), el("strong", { text: title }), text ? el("p", { text }) : null, action || null);
}
function errorState(text, retry) {
  return emptyState("alert", "โหลดข้อมูลไม่สำเร็จ", text,
    retry ? el("button", { class: "btn btn-sm", type: "button", onclick: retry }, icon("refresh"), "ลองอีกครั้ง") : null);
}
function loadingState(text = "กำลังโหลด…") {
  return el("div", { class: "empty" }, el("span", { class: "spinner", style: "margin:0 auto 12px;color:var(--accent)" }), el("p", { text }));
}

function fbErrorText(err) {
  const code = err && err.code;
  if (code === "permission-denied") return "บัญชีนี้ไม่มีสิทธิ์ทำรายการนี้";
  if (code === "unavailable") return "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง";
  return "เกิดข้อผิดพลาด ลองอีกครั้ง";
}

/* =========================================================
   Clock / misc chrome
   ========================================================= */
const clockFmt = new Intl.DateTimeFormat("th-TH", { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
const clockFmtShort = new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const smallScreen = window.matchMedia("(max-width: 520px)");
function tick() { $("#clock").textContent = (smallScreen.matches ? clockFmtShort : clockFmt).format(new Date()); }
tick(); setInterval(tick, 1000);
$("#year").textContent = new Date().getFullYear();

// copy buttons
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-copy]");
  if (b) copyText(b.dataset.copy);
});

// character counters
function updateCounter(input) {
  const out = $(`[data-counter-for="${input.id}"]`);
  if (!out) return;
  const max = Number(input.maxLength) || 0;
  out.textContent = `${thNumber.format(input.value.length)} / ${thNumber.format(max)}`;
  out.classList.toggle("over", max && input.value.length >= max);
}
$$("[data-counter-for]").forEach((c) => {
  const input = document.getElementById(c.dataset.counterFor);
  if (input) input.addEventListener("input", () => updateCounter(input));
});

/* ---------------- Drawer ---------------- */
const drawer = $("#drawer");
const drawerBtn = $("[data-action='open-drawer']");
function openDrawer() {
  drawer.classList.add("open"); drawer.setAttribute("aria-hidden", "false"); drawerBtn.setAttribute("aria-expanded", "true");
  document.body.style.overflow = "hidden";
  setTimeout(() => $("[data-action='close-drawer'].btn", drawer).focus(), 0);
}
function closeDrawer() {
  if (!drawer.classList.contains("open")) return;
  drawer.classList.remove("open"); drawer.setAttribute("aria-hidden", "true"); drawerBtn.setAttribute("aria-expanded", "false");
  document.body.style.overflow = "";
}

/* ---------------- Account menu ---------------- */
const accountBtn = $("#account-btn");
const accountMenu = $("#account-menu");
function toggleAccountMenu(force) {
  const open = force ?? accountMenu.hidden;
  accountMenu.hidden = !open;
  accountBtn.setAttribute("aria-expanded", String(open));
  if (open) $(".menu-item:not([hidden])", accountMenu)?.focus();
}
accountBtn.addEventListener("click", (e) => { e.stopPropagation(); toggleAccountMenu(); });
document.addEventListener("click", (e) => { if (!accountMenu.hidden && !e.target.closest(".account")) toggleAccountMenu(false); });
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!accountMenu.hidden) { toggleAccountMenu(false); accountBtn.focus(); }
  closeDrawer();
});

/* ---------------- Global actions ---------------- */
document.addEventListener("click", (e) => {
  const a = e.target.closest("[data-action]");
  if (!a) return;
  const action = a.dataset.action;
  switch (action) {
    case "report": closeDrawer(); toggleAccountMenu(false); openReport(); break;
    case "login": closeDrawer(); openLogin(); break;
    case "logout": closeDrawer(); toggleAccountMenu(false); doLogout(); break;
    case "reset-own-password": toggleAccountMenu(false); resetOwnPassword(); break;
    case "open-drawer": openDrawer(); break;
    case "close-drawer": closeDrawer(); break;
    case "report-again": resetReportForm(); break;
    case "reload-reports": loadReports(true); break;
    case "new-bulletin": openBulletinEditor(null); break;
    case "new-document": openDocumentEditor(null); break;
    default: return;
  }
});

/* =========================================================
   Router (hash-based — ใช้ได้กับ GitHub Pages)
   ========================================================= */
function parseHash() {
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  const name = PAGE_TITLES.hasOwnProperty(parts[0]) ? parts[0] : "home";
  return { name, sub: parts[1] || null, unknown: parts[0] && !PAGE_TITLES.hasOwnProperty(parts[0]) };
}

let firstRoute = true;
function route() {
  const r = parseHash();
  const prev = state.route.name;
  state.route = r;
  closeDrawer();

  $$("[data-page]").forEach((p) => p.classList.toggle("active", p.dataset.page === r.name));
  $$("[data-route]").forEach((a) => {
    if (a.dataset.route === r.name) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
  document.title = PAGE_TITLES[r.name] ? `${PAGE_TITLES[r.name]} | ฝอ.๒ บช.ตชด.` : BASE_TITLE;

  if (r.name !== prev || firstRoute) {
    window.scrollTo(0, 0);
    if (!firstRoute) $("#main").focus({ preventScroll: true });
  }
  firstRoute = false;

  // page-specific behaviour
  if (r.name === "stats" && !state.stats) loadStats();
  if (r.name === "news") {
    ensureBulletins().then(() => { if (r.sub) openArticleById(r.sub); });
  }
  if (r.name === "docs") ensureDocuments();
  if (r.name === "console") renderConsole();
}
window.addEventListener("hashchange", route);

/* =========================================================
   Auth
   ========================================================= */
function applyAuthUI() {
  const { user, isStaff } = state;
  $$("[data-guest-only]").forEach((n) => (n.hidden = !!user));
  $$("[data-user-only]").forEach((n) => (n.hidden = !user));
  $$("[data-staff-only]").forEach((n) => (n.hidden = !isStaff));
  if (user) {
    $("#account-avatar").textContent = (user.email || "?").charAt(0);
    $("#account-email").textContent = user.email || "";
    $("#account-role").textContent = isStaff ? "เจ้าหน้าที่" : "บัญชีนี้ยังไม่ได้รับสิทธิ์เจ้าหน้าที่";
  } else {
    toggleAccountMenu(false);
  }
}

onAuthStateChanged(auth, async (user) => {
  state.user = user;
  state.isStaff = false;
  if (user) {
    try { state.isStaff = (await getDoc(doc(db, "staff", user.uid))).exists(); }
    catch (err) { console.warn("staff check failed", err); }
  }
  state.authReady = true;
  if (!state.isStaff) { state.reports = []; state.reportsLoaded = false; }
  applyAuthUI();
  renderSecureFiles();
  if (state.route.name === "console") renderConsole();
});

const LOGIN_ERRORS = {
  "auth/invalid-credential": "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
  "auth/wrong-password": "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
  "auth/user-not-found": "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
  "auth/invalid-email": "รูปแบบอีเมลไม่ถูกต้อง",
  "auth/missing-password": "กรอกรหัสผ่าน",
  "auth/user-disabled": "บัญชีนี้ถูกระงับการใช้งาน ติดต่อผู้ดูแลระบบ",
  "auth/too-many-requests": "พยายามเข้าสู่ระบบหลายครั้งเกินไป รอสักครู่แล้วลองใหม่",
  "auth/network-request-failed": "เชื่อมต่ออินเทอร์เน็ตไม่ได้",
  "auth/unauthorized-domain": "โดเมนนี้ยังไม่ได้รับอนุญาตใน Firebase Authentication (ติดต่อผู้ดูแลระบบ)",
};

const loginDlg = $("#dlg-login");
const loginForm = $("#login-form");
let loginMode = "login";

function setLoginMode(mode) {
  loginMode = mode;
  const reset = mode === "reset";
  $("#login-title").textContent = reset ? "ตั้งรหัสผ่านใหม่" : "เข้าสู่ระบบเจ้าหน้าที่";
  $("#login-sub").textContent = reset ? "กรอกอีเมลของคุณ ระบบจะส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ไปให้" : "ใช้อีเมลและรหัสผ่านที่ผู้ดูแลระบบออกให้";
  $("#login-pw-field").hidden = reset;
  $("#login-password").required = !reset;
  $("#login-submit").textContent = reset ? "ส่งลิงก์ตั้งรหัสผ่าน" : "เข้าสู่ระบบ";
  $("#login-mode-toggle").textContent = reset ? "กลับไปหน้าเข้าสู่ระบบ" : "ลืมรหัสผ่าน?";
  $("#login-error").hidden = true;
}
function openLogin() {
  loginForm.reset(); setLoginMode("login");
  openDialog(loginDlg);
  setTimeout(() => $("#login-email").focus(), 0);
}
$("#login-mode-toggle").addEventListener("click", () => setLoginMode(loginMode === "login" ? "reset" : "login"));
$("#pw-toggle").addEventListener("click", (e) => {
  const input = $("#login-password");
  const show = input.type === "password";
  input.type = show ? "text" : "password";
  e.currentTarget.setAttribute("aria-pressed", String(show));
  e.currentTarget.setAttribute("aria-label", show ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน");
  $("use", e.currentTarget).setAttribute("href", show ? "#i-eye-off" : "#i-eye");
});
function loginError(msg) {
  $("#login-error-text").textContent = msg;
  $("#login-error").hidden = false;
}

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("#login-email").value.trim();
  const password = $("#login-password").value;
  const btn = $("#login-submit");
  $("#login-error").hidden = true;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { loginError("กรอกอีเมลให้ถูกต้อง"); $("#login-email").focus(); return; }

  if (loginMode === "reset") {
    setBusy(btn, true, "กำลังส่ง…");
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (err) {
      if (err.code === "auth/invalid-email" || err.code === "auth/network-request-failed" || err.code === "auth/too-many-requests") {
        setBusy(btn, false); loginError(LOGIN_ERRORS[err.code]); return;
      }
      // ไม่บอกว่ามีบัญชีหรือไม่ เพื่อกันการสุ่มหาอีเมล
    }
    setBusy(btn, false);
    closeDialog(loginDlg);
    toast("ส่งลิงก์แล้ว", "หากอีเมลนี้มีบัญชีอยู่ จะได้รับลิงก์ตั้งรหัสผ่านใหม่ภายในไม่กี่นาที (ตรวจโฟลเดอร์สแปมด้วย)", "success", 8000);
    return;
  }

  if (!password) { loginError("กรอกรหัสผ่าน"); $("#login-password").focus(); return; }
  setBusy(btn, true, "กำลังตรวจสอบ…");
  try {
    await signInWithEmailAndPassword(auth, email, password);
    closeDialog(loginDlg);
    toast("เข้าสู่ระบบแล้ว", email, "success");
  } catch (err) {
    loginError(LOGIN_ERRORS[err.code] || `เข้าสู่ระบบไม่สำเร็จ (${err.code || "unknown"})`);
  } finally {
    setBusy(btn, false);
  }
});

async function doLogout() {
  try {
    await signOut(auth);
    toast("ออกจากระบบแล้ว", "", "info");
    if (state.route.name === "console") location.hash = "#/";
  } catch {
    toast("ออกจากระบบไม่สำเร็จ", "ลองอีกครั้ง", "error");
  }
}

async function resetOwnPassword() {
  if (!state.user?.email) return;
  try {
    await sendPasswordResetEmail(auth, state.user.email);
    toast("ส่งลิงก์แล้ว", `ตรวจอีเมล ${state.user.email} เพื่อตั้งรหัสผ่านใหม่`, "success", 7000);
  } catch (err) {
    toast("ส่งลิงก์ไม่สำเร็จ", LOGIN_ERRORS[err.code] || "ลองอีกครั้งภายหลัง", "error");
  }
}

/* =========================================================
   Stats (public/stats)
   ========================================================= */
function animateNumber(node, value) {
  if (reduceMotion || value === 0) { node.textContent = thNumber.format(value); return; }
  const start = performance.now(), dur = 900;
  const step = (t) => {
    const p = Math.min(1, (t - start) / dur);
    const eased = 1 - Math.pow(1 - p, 3);
    node.textContent = thNumber.format(Math.round(value * eased));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function renderStats(failed = false) {
  const data = state.stats;
  const updatedEl = $("#stats-updated");
  $$("[data-stat]").forEach((n) => n.classList.remove("skeleton"));
  const grid = $("#stats-grid");
  const oldEmpty = $("#stats-empty");
  if (oldEmpty) oldEmpty.replaceWith();
  grid.hidden = !data && !failed;
  if (!data) {
    $$("[data-stat]").forEach((n) => (n.textContent = "—"));
    if (!failed) {
      grid.after(el("div", { id: "stats-empty", class: "panel-box" },
        emptyState("chart", "ยังไม่มีการเผยแพร่ตัวเลขสถิติ", "ตัวเลขผลการปฏิบัติงานประจำเดือนจะแสดงที่นี่เมื่อเจ้าหน้าที่บันทึกข้อมูล")));
    }
    return;
  }
  $$("[data-stat]").forEach((n) => {
    const v = data[n.dataset.stat];
    if (typeof v === "number") animateNumber(n, v); else n.textContent = "—";
  });
  const notes = data.notes || {};
  $$("[data-stat-note]").forEach((n) => { const t = notes[n.dataset.statNote]; n.textContent = typeof t === "string" ? t : ""; });
  updatedEl.textContent = data.updatedAt ? `ข้อมูล ณ วันที่ ${fmtDate(data.updatedAt)}` : "";
  const homeStat = $("#home-reports-stat");
  if (typeof data.intelReports === "number") {
    homeStat.textContent = thNumber.format(data.intelReports);
    $("#home-reports-fact").hidden = false;
  }
}

let statsPromise = null;
function loadStats(force = false) {
  if (statsPromise && !force) return statsPromise;
  statsPromise = (async () => {
    try {
      const snap = await getDoc(doc(db, "public", "stats"));
      state.stats = snap.exists() ? snap.data() : null;
      renderStats();
      if (!snap.exists()) $("#stats-updated").textContent = "";
    } catch (err) {
      console.error(err);
      statsPromise = null;
      renderStats(true);
      const u = $("#stats-updated");
      u.replaceChildren("โหลดข้อมูลสถิติไม่สำเร็จ ", el("button", { class: "linkish", type: "button", onclick: () => loadStats(true) }, "ลองอีกครั้ง"));
    }
  })();
  return statsPromise;
}

/* =========================================================
   Bulletins (bulletins/*)
   ========================================================= */
let bulletinsPromise = null;
function ensureBulletins(force = false) {
  if (bulletinsPromise && !force) return bulletinsPromise;
  if (state.bulletins === null) {
    $("#news-list").replaceChildren(loadingState("กำลังโหลดข่าว…"));
  }
  bulletinsPromise = (async () => {
    try {
      const snap = await getDocs(query(collection(db, "bulletins"), orderBy("publishedAt", "desc"), limit(200)));
      state.bulletins = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (err) {
      if (err.code === "permission-denied") {
        console.warn("[bulletins] อ่านไม่ได้ — ตรวจว่า deploy firestore.rules ล่าสุดแล้ว");
        state.bulletins = [];
      } else {
        console.error(err);
        bulletinsPromise = null;
        $("#news-list").replaceChildren(errorState(fbErrorText(err), () => ensureBulletins(true)));
        $("#home-news").replaceChildren(errorState(fbErrorText(err), () => ensureBulletins(true)));
        return;
      }
    }
    renderNews(); renderHomeNews(); renderAdminBulletins();
  })();
  return bulletinsPromise;
}

function bulletinCard(b) {
  const cat = CATEGORY[b.category] ? b.category : "news";
  const img = b.imageUrl && isHttps(b.imageUrl)
    ? el("img", { class: "bulletin-img", src: b.imageUrl, alt: "", loading: "lazy", decoding: "async", referrerpolicy: "no-referrer", onerror: (e) => e.currentTarget.remove() })
    : null;
  return el("button", { class: `bulletin ${cat}`, type: "button", onclick: () => openArticle(b) },
    img,
    el("div", { class: "bulletin-body" },
      el("span", { class: `tag ${cat}`, text: CATEGORY[cat].label }),
      el("h3", { text: b.title || "(ไม่มีหัวข้อ)" }),
      b.summary || b.body ? el("p", { text: b.summary || b.body }) : null,
      el("time", { datetime: toDate(b.publishedAt)?.toISOString() || null, text: fmtDate(b.publishedAt) }),
    ),
  );
}

function renderNews() {
  const list = $("#news-list");
  const all = state.bulletins || [];
  // chip counts
  $$("#news-filter .chip").forEach((c) => {
    const f = c.dataset.filter;
    const n = f === "all" ? all.length : all.filter((b) => b.category === f).length;
    let cnt = $(".count", c);
    if (!cnt) { cnt = el("span", { class: "count" }); c.append(" ", cnt); }
    cnt.textContent = n;
  });
  const items = state.newsFilter === "all" ? all : all.filter((b) => b.category === state.newsFilter);
  if (!items.length) {
    list.replaceChildren(emptyState("news", all.length ? "ไม่มีข่าวในหมวดนี้" : "ยังไม่มีข่าวประกาศ",
      all.length ? "ลองเลือกหมวดอื่น" : "ติดตามข่าวสารจากหน่วยงานได้ที่หน้านี้"));
    return;
  }
  list.replaceChildren(el("div", { class: "bulletins" }, items.map(bulletinCard)));
}

function renderHomeNews() {
  const box = $("#home-news");
  const items = (state.bulletins || []).slice(0, 3);
  if (!items.length) {
    box.replaceChildren(emptyState("news", "ยังไม่มีข่าวประกาศ", "ข่าวประชาสัมพันธ์และประกาศสืบหาจะแสดงที่นี่"));
    return;
  }
  box.replaceChildren(el("div", { class: "bulletins" }, items.map(bulletinCard)));
}

$("#news-filter").addEventListener("click", (e) => {
  const c = e.target.closest(".chip"); if (!c) return;
  state.newsFilter = c.dataset.filter;
  $$("#news-filter .chip").forEach((x) => x.setAttribute("aria-pressed", String(x === c)));
  renderNews();
});

const articleDlg = $("#dlg-article");
let currentArticle = null;
function openArticle(b) {
  currentArticle = b;
  const cat = CATEGORY[b.category] ? b.category : "news";
  $("#article-title").textContent = b.title || "";
  const body = $("#article-body");
  body.replaceChildren(...[
    el("div", { class: "article-meta" }, el("span", { class: `tag ${cat}`, text: CATEGORY[cat].label }), el("span", { text: fmtDate(b.publishedAt) })),
    b.imageUrl && isHttps(b.imageUrl) ? el("img", { class: "article-img", src: b.imageUrl, alt: b.title || "", referrerpolicy: "no-referrer", onerror: (e) => e.currentTarget.remove() }) : null,
    b.summary ? el("p", { class: "article-summary", text: b.summary }) : null,
    b.body ? el("div", { class: "article-body", text: b.body }) : null,
  ].filter(Boolean));
  $("#article-report").hidden = cat === "news";
  openDialog(articleDlg);
  body.scrollTop = 0;
}
function openArticleById(id) {
  const b = (state.bulletins || []).find((x) => x.id === id);
  if (b) openArticle(b);
  else if (state.bulletins) toast("ไม่พบข่าวนี้", "ข่าวอาจถูกลบไปแล้ว", "warning");
}
articleDlg.addEventListener("close", () => {
  if (state.route.name === "news" && state.route.sub) {
    history.replaceState(null, "", "#/news");
    state.route.sub = null;
  }
});
$("#article-report").addEventListener("click", () => closeDialog(articleDlg));
$("#article-share").addEventListener("click", () => {
  if (!currentArticle) return;
  const url = `${location.origin}${location.pathname}#/news/${encodeURIComponent(currentArticle.id)}`;
  copyText(url, "คัดลอกลิงก์ข่าวแล้ว");
});

/* =========================================================
   Documents (documents/*) + secure files
   ========================================================= */
let documentsPromise = null;
function ensureDocuments(force = false) {
  if (documentsPromise && !force) return documentsPromise;
  if (state.documents === null) $("#docs-list").replaceChildren(loadingState("กำลังโหลดรายการเอกสาร…"));
  documentsPromise = (async () => {
    try {
      const snap = await getDocs(query(collection(db, "documents"), orderBy("title"), limit(500)));
      state.documents = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (err) {
      if (err.code === "permission-denied") {
        console.warn("[documents] อ่านไม่ได้ — ตรวจว่า deploy firestore.rules ล่าสุดแล้ว");
        state.documents = [];
      } else {
        console.error(err);
        documentsPromise = null;
        $("#docs-list").replaceChildren(errorState(fbErrorText(err), () => ensureDocuments(true)));
        return;
      }
    }
    renderDocs(); renderAdminDocuments();
  })();
  return documentsPromise;
}

function docTypeBadge(type, extra = "") {
  const t = String(type || "FILE").toUpperCase().slice(0, 5);
  return el("span", { class: `doc-type ${t.toLowerCase()} ${extra}`.trim(), "aria-hidden": "true", text: t });
}

function renderDocs() {
  const list = $("#docs-list");
  const all = state.documents || [];
  const q = state.docsQuery.trim().toLowerCase();
  const items = q ? all.filter((d) => `${d.title || ""} ${d.code || ""} ${d.category || ""}`.toLowerCase().includes(q)) : all;

  if (!all.length) { list.replaceChildren(el("div", { class: "doclist" }, emptyState("folder", "ยังไม่มีเอกสารเผยแพร่", "หากต้องการแบบฟอร์ม ติดต่อหน่วยงานทางอีเมลหรือโทรศัพท์"))); return; }
  if (!items.length) { list.replaceChildren(el("div", { class: "doclist" }, emptyState("search", "ไม่พบเอกสารที่ค้นหา", `ไม่มีเอกสารที่ตรงกับ “${state.docsQuery}”`))); return; }

  const groups = new Map();
  for (const d of items) {
    const g = d.category || "เอกสารทั่วไป";
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(d);
  }
  const box = el("div", { class: "doclist" });
  for (const [g, docs] of groups) {
    box.append(el("div", { class: "docgroup-title" }, icon("folder"), g, el("span", { class: "mono", text: `(${docs.length})` })));
    for (const d of docs) {
      const safe = isHttps(d.url);
      box.append(el("div", { class: "doc" },
        docTypeBadge(d.fileType),
        el("div", {},
          el("div", { class: "doc-title", text: d.title }),
          el("div", { class: "doc-meta" }, d.code ? el("span", { class: "mono", text: d.code }) : null, d.updatedAt ? el("span", { text: `ปรับปรุง ${fmtDateShort(d.updatedAt)}` }) : null),
        ),
        safe
          ? el("a", { class: "btn btn-sm", href: d.url, target: "_blank", rel: "noopener noreferrer", "aria-label": `เปิด ${d.title}` }, icon(d.fileType === "LINK" ? "external" : "download"), d.fileType === "LINK" ? "เปิดลิงก์" : "ดาวน์โหลด")
          : el("span", { class: "muted", text: "ลิงก์ไม่พร้อมใช้งาน" }),
      ));
    }
  }
  list.replaceChildren(box);
}
$("#docs-search").addEventListener("input", debounce((e) => { state.docsQuery = e.target.value; renderDocs(); }, 150));

function fetchWithTimeout(url, opts = {}, ms = 10_000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(t));
}

function secureApiProblem() {
  if (!CONFIG.secureApiBase) return "ยังไม่ได้ตั้งค่าเซิร์ฟเวอร์แฟ้มลับ";
  if (location.protocol === "https:" && CONFIG.secureApiBase.startsWith("http:")) {
    return "เซิร์ฟเวอร์แฟ้มลับยังไม่รองรับ HTTPS เบราว์เซอร์จึงบล็อกการเชื่อมต่อ แจ้งผู้ดูแลระบบให้เปิด HTTPS (เช่น Cloudflare Tunnel)";
  }
  return null;
}

async function renderSecureFiles() {
  const box = $("#secure-docs");
  if (!state.isStaff) { box.replaceChildren(); return; }
  const problem = secureApiProblem();
  const wrap = (content) => el("div", { class: "doclist", style: "margin-bottom:24px" },
    el("div", { class: "docgroup-title" }, icon("lock"), "แฟ้มลับ (เฉพาะเจ้าหน้าที่)"), content);
  if (problem) {
    box.replaceChildren(el("div", { class: "notice warn" }, icon("alert"), el("div", {}, el("strong", { text: "เปิดแฟ้มลับไม่ได้" }), problem)));
    return;
  }
  box.replaceChildren(wrap(loadingState("กำลังดึงรายการแฟ้มลับ…")));
  try {
    const token = await state.user.getIdToken();
    const res = await fetchWithTimeout(`${CONFIG.secureApiBase}/api/files`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 401 || res.status === 403) { box.replaceChildren(wrap(emptyState("lock", "บัญชีนี้ไม่มีสิทธิ์เข้าถึงแฟ้มลับ", "ติดต่อผู้ดูแลระบบเพื่อขอสิทธิ์"))); return; }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const files = await res.json();
    if (!Array.isArray(files) || !files.length) { box.replaceChildren(wrap(emptyState("folder", "ไม่มีแฟ้มลับในคลัง", ""))); return; }
    box.replaceChildren(wrap(files.map((f) => {
      const name = String(f.filename || "");
      const ext = name.includes(".") ? name.split(".").pop().toUpperCase().slice(0, 5) : "FILE";
      const btn = el("button", { class: "btn btn-sm btn-danger", type: "button" }, icon("download"), "ดาวน์โหลด");
      btn.addEventListener("click", () => downloadSecureFile(name, btn));
      return el("div", { class: "doc secure" }, docTypeBadge(ext),
        el("div", {}, el("div", { class: "doc-title", text: name }), el("div", { class: "doc-meta" }, el("span", { class: "tag secret", text: "ลับ" }))),
        btn);
    })));
  } catch (err) {
    console.error(err);
    box.replaceChildren(wrap(errorState("เชื่อมต่อเซิร์ฟเวอร์แฟ้มลับไม่ได้", () => renderSecureFiles())));
  }
}

async function downloadSecureFile(fileName, btn) {
  if (!state.user) { toast("ต้องเข้าสู่ระบบก่อน", "", "warning"); return; }
  const problem = secureApiProblem();
  if (problem) { toast("ดาวน์โหลดไม่ได้", problem, "warning"); return; }
  setBusy(btn, true, "กำลังดาวน์โหลด…");
  try {
    const token = await state.user.getIdToken();
    const res = await fetchWithTimeout(`${CONFIG.secureApiBase}/api/download/${encodeURIComponent(fileName)}`, { headers: { Authorization: `Bearer ${token}` } }, 120_000);
    if (!res.ok) throw new Error(res.status === 403 ? "บัญชีนี้ไม่มีสิทธิ์ดาวน์โหลดไฟล์นี้" : `ดาวน์โหลดไม่สำเร็จ (HTTP ${res.status})`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = el("a", { href: url, download: fileName.split(/[\\/]/).pop() });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast("ดาวน์โหลดแล้ว", fileName, "success");
  } catch (err) {
    toast("ดาวน์โหลดไม่สำเร็จ", err.message, "error");
  } finally {
    setBusy(btn, false);
  }
}

/* =========================================================
   Report clue (clue_reports/*)
   ========================================================= */
const reportDlg = $("#dlg-report");
const reportForm = $("#report-form");
const COOLDOWN_KEY = "gsd2:lastReportAt";

function showReportStep(step) {
  $$("[data-step]", reportForm).forEach((n) => (n.hidden = n.dataset.step !== step));
}
function resetReportForm() {
  reportForm.reset();
  $$("[aria-invalid]", reportForm).forEach((n) => n.removeAttribute("aria-invalid"));
  $$(".field-error", reportForm).forEach((n) => (n.hidden = true));
  updateCounter($("#report-details"));
  showReportStep("form");
  setTimeout(() => $("input[name='type']", reportForm).focus(), 0);
}
function openReport() {
  resetReportForm();
  openDialog(reportDlg);
}
reportForm.addEventListener("change", (e) => {
  if (e.target.name === "type") $("#err-type").hidden = true;
});
$("#report-details").addEventListener("input", (e) => {
  if (e.target.value.trim()) { e.target.removeAttribute("aria-invalid"); $("#err-details").hidden = true; }
});

reportForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(reportForm);
  const type = String(fd.get("type") || "");
  const details = String(fd.get("details") || "").trim();
  const contact = String(fd.get("contact") || "").trim();
  const btn = $("#report-submit");

  let ok = true;
  if (!REPORT_TYPES.includes(type)) { $("#err-type").hidden = false; ok = false; }
  if (!details) { $("#err-details").hidden = false; $("#report-details").setAttribute("aria-invalid", "true"); ok = false; }
  if (!ok) { (REPORT_TYPES.includes(type) ? $("#report-details") : $("input[name='type']", reportForm)).focus(); return; }
  if (details.length > 5000 || contact.length > 200) { toast("ข้อมูลยาวเกินไป", "รายละเอียดไม่เกิน 5,000 ตัวอักษร และช่องทางติดต่อไม่เกิน 200 ตัวอักษร", "warning"); return; }

  const last = Number(localStorage.getItem(COOLDOWN_KEY) || 0);
  const wait = CONFIG.reportCooldownMs - (Date.now() - last);
  if (wait > 0) { toast("ส่งถี่เกินไป", `ส่งเบาะแสครั้งถัดไปได้ในอีก ${Math.ceil(wait / 1000)} วินาที`, "warning"); return; }

  // honeypot: บอทจะกรอกช่องที่ซ่อนอยู่ — แสดงผลว่าสำเร็จแต่ไม่บันทึก
  if (fd.get("website")) { $("#report-ref").textContent = refCode(Math.random().toString(36).slice(2, 10)); showReportStep("done"); return; }

  setBusy(btn, true, "กำลังส่ง…");
  try {
    const ref = await addDoc(collection(db, "clue_reports"), { type, details, contact, createdAt: serverTimestamp() });
    localStorage.setItem(COOLDOWN_KEY, String(Date.now()));
    $("#report-ref").textContent = refCode(ref.id);
    showReportStep("done");
    $("[data-step='done'] .btn-primary", reportForm).focus();
  } catch (err) {
    console.error(err);
    toast("ส่งเบาะแสไม่สำเร็จ", err.code === "unavailable" ? "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ตรวจสอบอินเทอร์เน็ต หรือโทร 1199" : "ลองอีกครั้ง หรือโทรแจ้งที่สายด่วน 1199", "error", 8000);
  } finally {
    setBusy(btn, false);
  }
});
$("#copy-ref").addEventListener("click", () => copyText($("#report-ref").textContent, "คัดลอกเลขอ้างอิงแล้ว"));

/* =========================================================
   Staff console
   ========================================================= */
function renderConsole() {
  const gate = $("#console-gate");
  const appBox = $("#console-app");
  if (!state.authReady) { gate.replaceChildren(loadingState("กำลังตรวจสอบสิทธิ์…")); appBox.hidden = true; return; }
  if (!state.user) {
    appBox.hidden = true;
    gate.replaceChildren(el("div", { class: "panel-box" }, emptyState("lock", "ต้องเข้าสู่ระบบก่อน", "หน้านี้สำหรับเจ้าหน้าที่ ฝอ.๒ เท่านั้น",
      el("button", { class: "btn btn-primary", type: "button", onclick: openLogin }, icon("key"), "เข้าสู่ระบบเจ้าหน้าที่"))));
    return;
  }
  if (!state.isStaff) {
    appBox.hidden = true;
    gate.replaceChildren(el("div", { class: "notice danger" }, icon("alert"), el("div", {},
      el("strong", { text: "บัญชีนี้ยังไม่ได้รับสิทธิ์เจ้าหน้าที่" }),
      `บัญชี ${state.user.email} เข้าสู่ระบบแล้ว แต่ยังไม่อยู่ในรายชื่อเจ้าหน้าที่ แจ้งผู้ดูแลระบบให้เพิ่มเอกสาร staff/${state.user.uid} ใน Firestore`)));
    return;
  }
  gate.replaceChildren();
  appBox.hidden = false;
  const tab = ["reports", "bulletins", "documents", "stats"].includes(state.route.sub) ? state.route.sub : state.consoleTab;
  selectTab(tab, false);
  if (!state.reportsLoaded) loadReports();
  ensureBulletins().then(renderAdminBulletins);
  ensureDocuments().then(renderAdminDocuments);
  loadStats().then(fillStatsForm);
}

function selectTab(name, updateHash = true) {
  state.consoleTab = name;
  $$(".tab").forEach((t) => {
    const on = t.dataset.tab === name;
    t.setAttribute("aria-selected", String(on));
    t.tabIndex = on ? 0 : -1;
  });
  $$("[role='tabpanel']").forEach((p) => (p.hidden = p.id !== `panel-${name}`));
  if (updateHash) history.replaceState(null, "", `#/console/${name}`);
  if (name === "stats") fillStatsForm();
}
$(".tabs").addEventListener("click", (e) => { const t = e.target.closest(".tab"); if (t) selectTab(t.dataset.tab); });
$(".tabs").addEventListener("keydown", (e) => {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
  const tabs = $$(".tab"); const i = tabs.indexOf(document.activeElement);
  let n = i;
  if (e.key === "ArrowRight") n = (i + 1) % tabs.length;
  if (e.key === "ArrowLeft") n = (i - 1 + tabs.length) % tabs.length;
  if (e.key === "Home") n = 0;
  if (e.key === "End") n = tabs.length - 1;
  e.preventDefault(); tabs[n].focus(); selectTab(tabs[n].dataset.tab);
});

/* ---------- Reports ---------- */
async function loadReports(force = false) {
  if (!state.isStaff) return;
  const list = $("#reports-list");
  list.replaceChildren(loadingState("กำลังโหลดเบาะแส…"));
  try {
    const snap = await getDocs(query(collection(db, "clue_reports"), orderBy("createdAt", "desc"), limit(500)));
    state.reports = snap.docs.map((d) => ({ id: d.id, status: "new", staffNote: "", ...d.data() }));
    state.reportsLoaded = true;
    renderReports();
    if (force) toast("โหลดเบาะแสล่าสุดแล้ว", `${state.reports.length} รายการ`, "info", 2500);
  } catch (err) {
    console.error(err);
    list.replaceChildren(el("div", { class: "panel-box" }, errorState(fbErrorText(err), () => loadReports(true))));
  }
}

function renderReports() {
  const all = state.reports;
  const counts = { all: all.length, new: 0, reviewing: 0, closed: 0 };
  all.forEach((r) => { counts[STATUS[r.status] ? r.status : "new"]++; });
  $$("[data-count]").forEach((n) => (n.textContent = counts[n.dataset.count]));
  const badge = $("#badge-new");
  badge.textContent = counts.new; badge.hidden = !counts.new;

  const items = state.reportsFilter === "all" ? all : all.filter((r) => (STATUS[r.status] ? r.status : "new") === state.reportsFilter);
  const list = $("#reports-list");
  if (!items.length) {
    list.replaceChildren(el("div", { class: "panel-box" }, emptyState("inbox",
      state.reportsFilter === "new" ? "ไม่มีเบาะแสใหม่" : "ไม่มีรายการในสถานะนี้",
      state.reportsFilter === "new" ? "เบาะแสที่ประชาชนส่งเข้ามาจะแสดงที่นี่" : "")));
    return;
  }
  list.replaceChildren(el("div", { class: "panel-box" }, items.map(reportItem)));
}

function reportItem(r) {
  const status = STATUS[r.status] ? r.status : "new";
  const select = el("select", { class: "select", "aria-label": "สถานะ" },
    Object.entries(STATUS).map(([v, label]) => el("option", { value: v, selected: v === status }, label)));
  const note = el("textarea", { class: "textarea", maxlength: "2000", rows: "3", placeholder: "บันทึกภายใน เช่น ผลการตรวจสอบ หน่วยที่ส่งต่อ", "aria-label": "บันทึกภายใน", style: "min-height:90px" });
  note.value = r.staffNote || "";
  const saveBtn = el("button", { class: "btn btn-primary btn-sm", type: "button" }, icon("check"), "บันทึก");
  const delBtn = el("button", { class: "btn btn-danger btn-sm", type: "button" }, icon("trash"), "ลบเบาะแส");

  saveBtn.addEventListener("click", async () => {
    setBusy(saveBtn, true, "กำลังบันทึก…");
    try {
      await updateDoc(doc(db, "clue_reports", r.id), { status: select.value, staffNote: note.value.trim(), updatedAt: serverTimestamp() });
      r.status = select.value; r.staffNote = note.value.trim(); r.updatedAt = new Date();
      toast("บันทึกแล้ว", `เบาะแส ${refCode(r.id)} · ${STATUS[r.status]}`, "success");
      renderReports();
    } catch (err) { toast("บันทึกไม่สำเร็จ", fbErrorText(err), "error"); setBusy(saveBtn, false); }
  });
  delBtn.addEventListener("click", async () => {
    if (!(await confirmDialog("ลบเบาะแสนี้?", `เบาะแส ${refCode(r.id)} จะถูกลบถาวรและกู้คืนไม่ได้`, "ลบเบาะแส"))) return;
    try {
      await deleteDoc(doc(db, "clue_reports", r.id));
      state.reports = state.reports.filter((x) => x.id !== r.id);
      toast("ลบเบาะแสแล้ว", refCode(r.id), "success");
      renderReports();
    } catch (err) { toast("ลบไม่สำเร็จ", fbErrorText(err), "error"); }
  });

  return el("details", { class: "report" },
    el("summary", {},
      el("div", {},
        el("div", { class: "excerpt", text: r.details || "" }),
        el("div", { class: "row-meta" },
          el("span", { class: `tag ${status}`, text: STATUS[status] }),
          el("span", { class: "mono", text: refCode(r.id) }),
          el("span", { text: r.type || "" }),
          el("span", { text: fmtDateTime(r.createdAt) }),
        ),
      ),
      icon("chevron", "chev"),
    ),
    el("div", { class: "report-detail" },
      el("div", { class: "report-text", text: r.details || "" }),
      el("dl", { class: "kv" },
        el("dt", { text: "เลขอ้างอิง" }), el("dd", { class: "mono", text: refCode(r.id) }),
        el("dt", { text: "ประเภท" }), el("dd", { text: r.type || "—" }),
        el("dt", { text: "ส่งเมื่อ" }), el("dd", { text: fmtDateTime(r.createdAt) }),
        el("dt", { text: "ติดต่อกลับ" }), el("dd", { text: r.contact || "ไม่ระบุ (ไม่เปิดเผยตัวตน)" }),
        r.updatedAt ? [el("dt", { text: "แก้ไขล่าสุด" }), el("dd", { text: fmtDateTime(r.updatedAt) })] : null,
      ),
      el("div", { class: "grid-2" },
        el("label", { class: "field" }, el("span", { class: "label", text: "สถานะ" }), select),
        el("div"),
      ),
      el("label", { class: "field" }, el("span", { class: "label", text: "บันทึกภายใน" }), note),
      el("div", { class: "report-actions" }, delBtn, saveBtn),
    ),
  );
}
$("#reports-filter").addEventListener("click", (e) => {
  const c = e.target.closest(".chip"); if (!c) return;
  state.reportsFilter = c.dataset.filter;
  $$("#reports-filter .chip").forEach((x) => x.setAttribute("aria-pressed", String(x === c)));
  renderReports();
});

/* ---------- Bulletins admin ---------- */
function renderAdminBulletins() {
  const box = $("#admin-bulletins");
  if (!box || !state.isStaff) return;
  const all = state.bulletins || [];
  if (!all.length) {
    box.replaceChildren(el("div", { class: "panel-box" }, emptyState("news", "ยังไม่มีข่าว", "เพิ่มข่าวแรกเพื่อแสดงบนหน้าข่าวสารและหน้าหลัก",
      el("button", { class: "btn btn-primary btn-sm", type: "button", onclick: () => openBulletinEditor(null) }, icon("plus"), "เพิ่มข่าว"))));
    return;
  }
  box.replaceChildren(el("div", { class: "panel-box" }, all.map((b) => {
    const cat = CATEGORY[b.category] ? b.category : "news";
    return el("div", { class: "row" },
      el("div", {}, el("div", { class: "row-title", text: b.title }),
        el("div", { class: "row-meta" }, el("span", { class: `tag ${cat}`, text: CATEGORY[cat].label }), el("span", { text: fmtDate(b.publishedAt) }))),
      el("div", { class: "row-actions" },
        el("button", { class: "btn btn-sm btn-ghost btn-icon", type: "button", "aria-label": `แก้ไข ${b.title}`, onclick: () => openBulletinEditor(b) }, icon("edit")),
        el("button", { class: "btn btn-sm btn-ghost btn-icon", type: "button", "aria-label": `ลบ ${b.title}`, onclick: () => deleteBulletin(b) }, icon("trash")),
      ));
  })));
}

const bulletinDlg = $("#dlg-bulletin");
const bulletinForm = $("#bulletin-form");
let editingBulletin = null;
const toInputDate = (d) => { const x = d || new Date(); return new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };

function openBulletinEditor(b) {
  editingBulletin = b;
  bulletinForm.reset();
  $("#bulletin-edit-title").textContent = b ? "แก้ไขข่าว" : "เพิ่มข่าว";
  $("#b-category").value = b?.category || "news";
  $("#b-date").value = toInputDate(toDate(b?.publishedAt));
  $("#b-title").value = b?.title || "";
  $("#b-summary").value = b?.summary || "";
  $("#b-body").value = b?.body || "";
  $("#b-image").value = b?.imageUrl || "";
  ["b-summary", "b-body"].forEach((id) => updateCounter(document.getElementById(id)));
  $$("[aria-invalid]", bulletinForm).forEach((n) => n.removeAttribute("aria-invalid"));
  openDialog(bulletinDlg);
  setTimeout(() => $("#b-title").focus(), 0);
}

bulletinForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = $("#b-title").value.trim();
  const imageUrl = $("#b-image").value.trim();
  const date = $("#b-date").value;
  $$("[aria-invalid]", bulletinForm).forEach((n) => n.removeAttribute("aria-invalid"));
  if (!title) { $("#b-title").setAttribute("aria-invalid", "true"); $("#b-title").focus(); toast("กรอกหัวข้อข่าว", "", "warning"); return; }
  if (!date) { $("#b-date").setAttribute("aria-invalid", "true"); $("#b-date").focus(); toast("เลือกวันที่เผยแพร่", "", "warning"); return; }
  if (imageUrl && !isHttps(imageUrl)) { $("#b-image").setAttribute("aria-invalid", "true"); $("#b-image").focus(); toast("ลิงก์รูปภาพต้องขึ้นต้นด้วย https://", "", "warning"); return; }

  const data = {
    title,
    summary: $("#b-summary").value.trim(),
    body: $("#b-body").value.trim(),
    category: $("#b-category").value,
    imageUrl,
    publishedAt: Timestamp.fromDate(new Date(`${date}T09:00:00`)),
    updatedAt: serverTimestamp(),
    authorUid: state.user.uid,
  };
  const btn = $("button[type='submit']", bulletinForm);
  setBusy(btn, true, "กำลังบันทึก…");
  try {
    if (editingBulletin) await setDoc(doc(db, "bulletins", editingBulletin.id), data);
    else await addDoc(collection(db, "bulletins"), data);
    closeDialog(bulletinDlg);
    toast(editingBulletin ? "บันทึกการแก้ไขแล้ว" : "เผยแพร่ข่าวแล้ว", title, "success");
    await ensureBulletins(true);
  } catch (err) {
    console.error(err);
    toast("บันทึกข่าวไม่สำเร็จ", fbErrorText(err), "error");
  } finally { setBusy(btn, false); }
});

async function deleteBulletin(b) {
  if (!(await confirmDialog("ลบข่าวนี้?", `“${b.title}” จะถูกนำออกจากเว็บไซต์ทันทีและกู้คืนไม่ได้`, "ลบข่าว"))) return;
  try {
    await deleteDoc(doc(db, "bulletins", b.id));
    toast("ลบข่าวแล้ว", b.title, "success");
    await ensureBulletins(true);
  } catch (err) { toast("ลบไม่สำเร็จ", fbErrorText(err), "error"); }
}

/* ---------- Documents admin ---------- */
function renderAdminDocuments() {
  const box = $("#admin-documents");
  if (!box || !state.isStaff) return;
  const all = state.documents || [];
  if (!all.length) {
    box.replaceChildren(el("div", { class: "panel-box" }, emptyState("folder", "ยังไม่มีเอกสาร", "เพิ่มลิงก์แบบฟอร์มเพื่อให้ประชาชนดาวน์โหลดได้",
      el("button", { class: "btn btn-primary btn-sm", type: "button", onclick: () => openDocumentEditor(null) }, icon("plus"), "เพิ่มเอกสาร"))));
    return;
  }
  box.replaceChildren(el("div", { class: "panel-box" }, all.map((d) => el("div", { class: "row" },
    el("div", {}, el("div", { class: "row-title", text: d.title }),
      el("div", { class: "row-meta" }, d.code ? el("span", { class: "mono", text: d.code }) : null, el("span", { text: d.fileType || "" }), d.category ? el("span", { text: d.category }) : null)),
    el("div", { class: "row-actions" },
      isHttps(d.url) ? el("a", { class: "btn btn-sm btn-ghost btn-icon", href: d.url, target: "_blank", rel: "noopener noreferrer", "aria-label": `เปิด ${d.title}` }, icon("external")) : null,
      el("button", { class: "btn btn-sm btn-ghost btn-icon", type: "button", "aria-label": `แก้ไข ${d.title}`, onclick: () => openDocumentEditor(d) }, icon("edit")),
      el("button", { class: "btn btn-sm btn-ghost btn-icon", type: "button", "aria-label": `ลบ ${d.title}`, onclick: () => deleteDocument(d) }, icon("trash")),
    )))));
}

const documentDlg = $("#dlg-document");
const documentForm = $("#document-form");
let editingDocument = null;

function openDocumentEditor(d) {
  editingDocument = d;
  documentForm.reset();
  $("#doc-edit-title").textContent = d ? "แก้ไขเอกสาร" : "เพิ่มเอกสาร";
  $("#d-title").value = d?.title || "";
  $("#d-url").value = d?.url || "";
  $("#d-code").value = d?.code || "";
  $("#d-type").value = d?.fileType || "PDF";
  $("#d-category").value = d?.category || "";
  $$("[aria-invalid]", documentForm).forEach((n) => n.removeAttribute("aria-invalid"));
  openDialog(documentDlg);
  setTimeout(() => $("#d-title").focus(), 0);
}

documentForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = $("#d-title").value.trim();
  const url = $("#d-url").value.trim();
  $$("[aria-invalid]", documentForm).forEach((n) => n.removeAttribute("aria-invalid"));
  if (!title) { $("#d-title").setAttribute("aria-invalid", "true"); $("#d-title").focus(); toast("กรอกชื่อเอกสาร", "", "warning"); return; }
  if (!isHttps(url)) { $("#d-url").setAttribute("aria-invalid", "true"); $("#d-url").focus(); toast("ลิงก์ไฟล์ต้องขึ้นต้นด้วย https://", "", "warning"); return; }
  const data = {
    title, url,
    code: $("#d-code").value.trim(),
    fileType: $("#d-type").value,
    category: $("#d-category").value.trim(),
    updatedAt: serverTimestamp(),
  };
  const btn = $("button[type='submit']", documentForm);
  setBusy(btn, true, "กำลังบันทึก…");
  try {
    if (editingDocument) await setDoc(doc(db, "documents", editingDocument.id), data);
    else await addDoc(collection(db, "documents"), data);
    closeDialog(documentDlg);
    toast(editingDocument ? "บันทึกการแก้ไขแล้ว" : "เพิ่มเอกสารแล้ว", title, "success");
    await ensureDocuments(true);
  } catch (err) {
    console.error(err);
    toast("บันทึกเอกสารไม่สำเร็จ", fbErrorText(err), "error");
  } finally { setBusy(btn, false); }
});

async function deleteDocument(d) {
  if (!(await confirmDialog("ลบเอกสารนี้?", `“${d.title}” จะถูกนำออกจากคลังเอกสาร (ไฟล์ต้นทางไม่ถูกลบ)`, "ลบเอกสาร"))) return;
  try {
    await deleteDoc(doc(db, "documents", d.id));
    toast("ลบเอกสารแล้ว", d.title, "success");
    await ensureDocuments(true);
  } catch (err) { toast("ลบไม่สำเร็จ", fbErrorText(err), "error"); }
}

/* ---------- Stats editor ---------- */
const statsForm = $("#stats-form");
let statsFormDirty = false;
statsForm.addEventListener("input", () => { statsFormDirty = true; });

function fillStatsForm() {
  if (statsFormDirty) return;
  const s = state.stats || {};
  const notes = s.notes || {};
  STAT_KEYS.forEach((k) => {
    statsForm.elements[k].value = typeof s[k] === "number" ? s[k] : "";
    statsForm.elements[`note-${k}`].value = notes[k] || "";
  });
  $("#stats-form-meta").textContent = s.updatedAt ? `บันทึกล่าสุด ${fmtDateTime(s.updatedAt)}` : "ยังไม่เคยบันทึกสถิติ";
}

statsForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = { notes: {} };
  for (const k of STAT_KEYS) {
    const input = statsForm.elements[k];
    const v = Number(input.value);
    input.removeAttribute("aria-invalid");
    if (input.value === "" || !Number.isInteger(v) || v < 0) {
      input.setAttribute("aria-invalid", "true"); input.focus();
      toast("ตัวเลขไม่ถูกต้อง", "กรอกจำนวนเต็มตั้งแต่ 0 ขึ้นไปให้ครบทุกช่อง", "warning"); return;
    }
    data[k] = v;
    const n = statsForm.elements[`note-${k}`].value.trim();
    if (n) data.notes[k] = n;
  }
  data.updatedAt = serverTimestamp();
  const btn = $("button[type='submit']", statsForm);
  setBusy(btn, true, "กำลังบันทึก…");
  try {
    await setDoc(doc(db, "public", "stats"), data);
    statsFormDirty = false;
    toast("บันทึกสถิติแล้ว", "ตัวเลขบนหน้าสถิติอัปเดตแล้ว", "success");
    await loadStats(true);
    fillStatsForm();
  } catch (err) {
    console.error(err);
    toast("บันทึกสถิติไม่สำเร็จ", fbErrorText(err), "error");
  } finally { setBusy(btn, false); }
});

/* =========================================================
   Boot
   ========================================================= */
route();
loadStats();          // ตัวเลขบนหน้าแรก
ensureBulletins();    // ข่าวล่าสุดบนหน้าแรก
