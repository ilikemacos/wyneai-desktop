// WrenbyAI auth + chat-history UI. Self-contained ES module.
// Enables itself only when /api/auth/me reports { configured:true } (the DB flag).
// Stores a bearer token in localStorage (for GitHub Pages and Tauri where the
// session cookie is cross-site) and also sends credentials for same-origin cookies.
const LS = "wy.token";
const DESKTOP = !!window.__TAURI__?.core; // desktop app: no passkeys in the webview; Google/passkey go through the system browser
const S = { base: "", token: null, user: null, configured: false, chats: [], chatId: null, guest: [], opts: {}, els: {}, feat: {} };

function api(path, { method = "GET", body } = {}) {
  const headers = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (S.token) headers["authorization"] = "Bearer " + S.token;
  return fetch(S.base + path, { method, headers, credentials: "include", body: body !== undefined ? JSON.stringify(body) : undefined });
}

export async function initAuth(opts) {
  S.opts = opts || {}; S.base = opts.base || ""; S.token = localStorage.getItem(LS) || null;
  let me; try { me = await (await api("/api/auth/me")).json(); } catch { me = { configured: false }; }
  S.configured = !!me.configured;
  S.feat = { recaptchaSiteKey: me.recaptchaSiteKey || null, googleClientId: me.googleClientId || null };
  if (S.configured && S.feat.recaptchaSiteKey) loadScript("https://www.google.com/recaptcha/api.js?render=" + encodeURIComponent(S.feat.recaptchaSiteKey)).catch(() => {});
  if (!S.configured) return session();        // backend not ready: no auth UI at all
  injectStyle(); buildChrome();
  S.user = me.user || null; render();
  if (S.user) await refreshChats();
  return session();
}

function session() {
  return {
    get enabled() { return S.configured; },
    get signedIn() { return !!S.user; },
    get chatId() { return S.chatId; },
    startNewChat() { S.chatId = null; markActive(); },
    async saveTurn(turn) { return saveTurn(turn); },
  };
}

// ---- persistence ----
async function saveTurn({ user, assistant, files, mode }) {
  if (!S.configured) return;
  const msgs = [{ role: "user", content: user }, { role: "assistant", content: assistant, files: files || null }];
  if (!S.user) { S.guest.push(...msgs); return; }            // guest: buffer for import on sign-in
  try {
    if (!S.chatId) {
      const r = await api("/api/chats", { method: "POST", body: { action: "create", title: titleOf(user), mode: mode || "forge", messages: msgs } });
      const j = await r.json(); if (j.chat) S.chatId = j.chat.id;
    } else {
      await api("/api/chats", { method: "POST", body: { action: "append", id: S.chatId, messages: msgs } });
    }
    await refreshChats();
  } catch (e) { console.warn("saveTurn failed", e); }
}
const titleOf = (t) => (String(t || "New chat").replace(/\s+/g, " ").trim().slice(0, 60)) || "New chat";

async function refreshChats() {
  try { const j = await (await api("/api/chats")).json(); S.chats = j.chats || []; renderList(); } catch {}
}

// ---- UI chrome ----
function buildChrome() {
  const header = document.querySelector("header");
  // hamburger (mobile) + auth control, appended to header
  const hamb = el("button", "wy-hamb", "\u2630"); hamb.title = "Chats"; hamb.onclick = () => S.els.bar.classList.toggle("open");
  header.insertBefore(hamb, header.firstChild);
  const slot = el("span", "wy-authslot"); slot.style.marginLeft = "8px"; header.appendChild(slot); S.els.slot = slot;
  // sidebar
  const bar = el("aside"); bar.id = "histbar"; bar.hidden = true;
  bar.innerHTML = '<div class="hhead"><span class="htitle">Chats</span><button class="hnew">New chat</button></div><div class="hlist"></div>';
  document.body.insertBefore(bar, document.body.firstChild);
  bar.querySelector(".hnew").onclick = () => { S.chatId = null; if (S.opts.onNewChat) S.opts.onNewChat(); markActive(); if (window.innerWidth <= 860) bar.classList.remove("open"); };
  S.els.bar = bar; S.els.list = bar.querySelector(".hlist");
}

function render() {
  const slot = S.els.slot; slot.innerHTML = "";
  if (S.user) {
    S.els.bar.hidden = false;
    const av = el("button", "wy-avatar", (S.user.email[0] || "?").toUpperCase());
    av.title = S.user.email; av.onclick = toggleMenu; slot.appendChild(av);
  } else {
    S.els.bar.hidden = true;
    const b = el("button", "", "Sign in"); b.onclick = openSignin; slot.appendChild(b);
  }
}

function toggleMenu() {
  let m = document.querySelector(".wy-menu"); if (m) { m.remove(); return; }
  m = el("div", "wy-menu");
  m.innerHTML = '<div class="wy-email"></div>';
  m.querySelector(".wy-email").textContent = S.user.email;
  const setPw = el("button", "", "Set or change password"); setPw.onclick = setPassword; m.appendChild(setPw);
  if (!DESKTOP && window.PublicKeyCredential) { const pk = el("button", "", "Add a passkey"); pk.onclick = addPasskey; m.appendChild(pk); }
  const out = el("button", "", "Log out"); out.onclick = logout; m.appendChild(out);
  document.body.appendChild(m);
  setTimeout(() => document.addEventListener("click", function h(e) { if (!m.contains(e.target) && !e.target.classList.contains("wy-avatar")) { m.remove(); document.removeEventListener("click", h); } }), 0);
}

async function setPassword() {
  document.querySelector(".wy-menu")?.remove();
  const changing = !!S.user?.hasPassword;
  formDialog({
    title: changing ? "Change password" : "Set a password",
    hint: changing ? "Forgot it? Log out and use Forgot password on the sign-in screen." : "Then you can sign in with your email and this password.",
    submit: "Save password",
    fields: [
      ...(changing ? [{ name: "current", type: "password", placeholder: "Current password", autocomplete: "current-password" }] : []),
      { name: "password", type: "password", placeholder: "New password (10+ characters)", autocomplete: "new-password" },
      { name: "confirm", type: "password", placeholder: "Repeat new password", autocomplete: "new-password" },
    ],
    async onSubmit(v) {
      if (v.password.length < 10) return "Use at least 10 characters.";
      if (v.password !== v.confirm) return "The new passwords don't match.";
      const r = await api("/api/auth/password?action=set", { method: "POST", body: { password: v.password, currentPassword: v.current || "" } });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return j.error || "Could not set password.";
      if (S.user) S.user.hasPassword = true;
      return { done: "Password saved. You can now sign in with it." };
    },
  });
}

// Reusable modal built on the sign-in dialog's classes. Fields: { name, type, placeholder, autocomplete, value }.
// onSubmit(values) returns an error string (shown inline), or { done: "message" } to show a final note, or nothing to close.
function formDialog({ title, hint, fields = [], submit = "Save", onSubmit }) {
  const dlg = document.createElement("dialog"); dlg.className = "wy-dialog wy-form";
  dlg.setAttribute("aria-label", title);
  dlg.innerHTML = `<div class="wy-dh"></div><form class="wy-db" novalidate><div class="wy-hint"></div><div class="wy-fields"></div>
    <div class="wy-err" role="alert" aria-live="polite"></div>
    <div class="wy-df"><button type="button" class="wy-cancel">Cancel</button><button type="submit" class="primary wy-go"></button></div></form>`;
  dlg.querySelector(".wy-dh").textContent = title;
  const hintEl = dlg.querySelector(".wy-hint"); if (hint) hintEl.textContent = hint; else hintEl.remove();
  const box = dlg.querySelector(".wy-fields"), err = dlg.querySelector(".wy-err"), go = dlg.querySelector(".wy-go"), form = dlg.querySelector("form");
  go.textContent = submit;
  const inputs = {};
  for (const f of fields) {
    const wrap = el("div", "wy-field");
    const inp = document.createElement("input");
    inp.type = f.type || "text"; inp.name = f.name; inp.placeholder = f.placeholder || ""; inp.setAttribute("aria-label", f.placeholder || f.name);
    if (f.autocomplete) inp.autocomplete = f.autocomplete; if (f.value != null) inp.value = f.value; if (f.maxLength) inp.maxLength = f.maxLength;
    wrap.appendChild(inp);
    if (inp.type === "password") {
      wrap.classList.add("wy-pwwrap");
      const eye = el("button", "wy-eye", "Show"); eye.type = "button"; eye.setAttribute("aria-label", "Show password"); eye.setAttribute("aria-pressed", "false");
      eye.onclick = () => { const show = inp.type === "password"; inp.type = show ? "text" : "password"; eye.textContent = show ? "Hide" : "Show";
        eye.setAttribute("aria-label", show ? "Hide password" : "Show password"); eye.setAttribute("aria-pressed", String(show)); inp.focus(); };
      wrap.appendChild(eye);
    }
    box.appendChild(wrap); inputs[f.name] = inp;
  }
  document.body.appendChild(dlg); dlg.showModal();
  const prevFocus = document.activeElement;
  (Object.values(inputs)[0] || go).focus();
  const close = () => dlg.close();
  dlg.querySelector(".wy-cancel").onclick = close;           // Esc is handled natively by <dialog> (cancel event)
  dlg.addEventListener("close", () => { dlg.remove(); prevFocus?.focus?.(); });
  dlg.addEventListener("keydown", (e) => {                   // focus trap: keep Tab inside the dialog
    if (e.key !== "Tab") return;
    const f = [...dlg.querySelectorAll("input,button,a[href]")].filter(x => !x.disabled && !x.hidden && x.offsetParent !== null);
    if (!f.length) return; const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  form.onsubmit = async (e) => {
    e.preventDefault(); err.textContent = ""; go.disabled = true;
    const values = Object.fromEntries(Object.entries(inputs).map(([k, i]) => [k, i.value]));
    let out; try { out = await onSubmit(values); } catch { out = "Something went wrong. Try again."; }
    go.disabled = false;
    if (typeof out === "string") { err.textContent = out; return; }
    if (out && out.done) { showDone(dlg, out.done); return; }
    close();
  };
  return dlg;
}
function showDone(dlg, msg) {
  const db = dlg.querySelector(".wy-db"); db.innerHTML = '<div class="wy-hint wy-done" role="status"></div><div class="wy-df"><button type="button" class="primary wy-ok">OK</button></div>';
  db.querySelector(".wy-done").textContent = msg;
  const ok = db.querySelector(".wy-ok"); ok.onclick = () => dlg.close(); ok.focus();
}
function notice(title, msg) { const d = formDialog({ title, fields: [] }); showDone(d, msg); }

// ---- passkeys (WebAuthn). The browser helper is vendored next to this file. ----
async function swa() {
  await loadScript(new URL("./vendor/simplewebauthn-browser-13.3.0.umd.min.js", import.meta.url).href);
  return window.SimpleWebAuthnBrowser;
}
async function passkeyLogin() {
  if (!window.PublicKeyCredential) return { error: "This browser doesn't support passkeys." };
  const o = await api("/api/auth/passkey?action=login-options", { method: "POST", body: {} });
  const oj = await o.json().catch(() => ({})); if (!o.ok) return { error: oj.error || "Passkey sign-in failed." };
  let response; try { response = await (await swa()).startAuthentication({ optionsJSON: oj.options }); }
  catch { return { error: "Passkey sign-in was cancelled." }; }
  const r = await api("/api/auth/passkey?action=login-verify", { method: "POST", body: { challengeId: oj.challengeId, response } });
  const j = await r.json().catch(() => ({})); return r.ok ? j : { error: j.error || "Passkey sign-in failed." };
}
async function addPasskey() {
  document.querySelector(".wy-menu")?.remove();
  try {
    const o = await api("/api/auth/passkey?action=register-options", { method: "POST", body: {} });
    const oj = await o.json().catch(() => ({})); if (!o.ok) { notice("Add a passkey", oj.error || "Could not start passkey setup."); return; }
    let response; try { response = await (await swa()).startRegistration({ optionsJSON: oj.options }); } catch { return; }
    const r = await api("/api/auth/passkey?action=register-verify", { method: "POST", body: { challengeId: oj.challengeId, response } });
    const j = await r.json().catch(() => ({}));
    notice("Add a passkey", r.ok ? "Passkey added. Next time, pick Passkey to sign in." : (j.error || "Could not save passkey."));
  } catch { notice("Add a passkey", "Something went wrong. Try again."); }
}

async function logout() {
  try { await api("/api/auth/logout", { method: "POST" }); } catch {}
  localStorage.removeItem(LS); S.token = null; S.user = null; S.chats = []; S.chatId = null;
  document.querySelector(".wy-menu")?.remove(); render(); renderList();
  if (S.opts.onNewChat) S.opts.onNewChat();
}

function renderList() {
  const list = S.els.list; if (!list) return; list.innerHTML = "";
  if (!S.chats.length) { const e = el("div", "hempty", "No chats yet"); e.style.cssText = "padding:10px;color:var(--muted);font-size:12px"; list.appendChild(e); return; }
  for (const c of S.chats) {
    const row = el("div", "hitem" + (c.id === S.chatId ? " on" : ""));
    const name = el("span", "hname", c.title || "New chat"); row.appendChild(name);
    const act = el("span", "hact");
    const rn = el("button", "", "\u270e"); rn.title = "Rename"; rn.onclick = (e) => { e.stopPropagation(); renameChat(c); };
    const dl = el("button", "", "\u00d7"); dl.title = "Delete"; dl.onclick = (e) => { e.stopPropagation(); deleteChat(c); };
    act.append(rn, dl); row.appendChild(act);
    row.onclick = () => loadChat(c.id);
    list.appendChild(row);
  }
}
function markActive() { document.querySelectorAll(".hitem").forEach(r => r.classList.remove("on")); renderList(); }

async function loadChat(id) {
  try {
    const j = await (await api("/api/chats?id=" + encodeURIComponent(id))).json();
    if (!j.chat) return;
    S.chatId = id; markActive();
    if (S.opts.onLoadChat) S.opts.onLoadChat(j.messages || [], j.chat);
    if (window.innerWidth <= 860) S.els.bar.classList.remove("open");
  } catch (e) { console.warn("loadChat failed", e); }
}

async function renameChat(c) {
  formDialog({ title: "Rename chat", submit: "Rename", fields: [{ name: "title", value: c.title || "", placeholder: "Chat name", autocomplete: "off", maxLength: 120 }],
    async onSubmit(v) {
      const t = v.title.trim(); if (!t) return "Enter a name.";
      const r = await api("/api/chats", { method: "POST", body: { action: "rename", id: c.id, title: t } });
      if (!r.ok) return "Could not rename chat.";
      await refreshChats();
    } });
}
async function deleteChat(c) {
  if (!confirm("Delete this chat?")) return;
  try { await api("/api/chats", { method: "POST", body: { action: "delete", id: c.id } });
    if (S.chatId === c.id) { S.chatId = null; if (S.opts.onNewChat) S.opts.onNewChat(); }
    await refreshChats(); } catch {}
}

// ---- reCAPTCHA v3 + Google Identity Services (both optional, server-flagged) ----
const scripts = {};
function loadScript(src) {
  return scripts[src] || (scripts[src] = new Promise((res, rej) => {
    const sc = document.createElement("script"); sc.src = src; sc.async = true; sc.defer = true;
    sc.onload = res; sc.onerror = () => { delete scripts[src]; rej(new Error("load failed")); }; document.head.appendChild(sc);
  }));
}
async function captcha(action) {
  const key = S.feat.recaptchaSiteKey; if (!key) return undefined;
  try {
    await loadScript("https://www.google.com/recaptcha/api.js?render=" + encodeURIComponent(key));
    await new Promise(r => window.grecaptcha.ready(r));
    return await window.grecaptcha.execute(key, { action });
  } catch { return undefined; }            // server decides; it rejects if captcha is required
}
async function finishSignin(j, dlg) {
  S.token = j.token || null; if (S.token) localStorage.setItem(LS, S.token);
  S.user = j.user; dlg.close(); render(); await refreshChats();
  await offerImport();
}
async function mountGoogle(dlg, err) {
  const cid = S.feat.googleClientId; if (!cid) return;
  const wrap = dlg.querySelector(".wy-google"); wrap.hidden = false;
  try { await loadScript("https://accounts.google.com/gsi/client"); } catch { wrap.hidden = true; return; }
  window.google.accounts.id.initialize({
    client_id: cid, ux_mode: "popup", auto_select: false,
    callback: async ({ credential }) => {
      err.textContent = "";
      try {
        const r = await api("/api/auth/google", { method: "POST", body: { credential, recaptcha: await captcha("google_signin") } });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) { err.textContent = j.error || "Google sign-in failed."; return; }
        await finishSignin(j, dlg);
      } catch { err.textContent = "Something went wrong. Try again."; }
    },
  });
  window.google.accounts.id.renderButton(wrap.querySelector(".wy-gbtn"), { theme: "filled_black", size: "large", text: "continue_with", shape: "rectangular", width: 300 });
}

// ---- sign-in dialog ----
function openSignin() {
  const dlg = document.createElement("dialog"); dlg.className = "wy-dialog";
  dlg.innerHTML = `<div class="wy-dh">Sign in to WrenbyAI</div><div class="wy-db">
    <div class="wy-methods" role="tablist"><button type="button" data-m="password">Password</button><button type="button" data-m="email" class="on">Email code</button><button type="button" data-m="passkey">Passkey</button></div>
    <div class="wy-google" hidden><div class="wy-gbtn"></div><div class="wy-or">or</div></div>
    <div class="wy-hint">We'll email you a 6-digit code. No password needed.</div>
    <input class="wy-email-in" type="email" placeholder="you@example.com" autocomplete="email">
    <input class="wy-code-in" type="text" inputmode="numeric" maxlength="6" placeholder="6-digit code" hidden>
    <input class="wy-pw-in" type="password" placeholder="Password" autocomplete="current-password" hidden>
    <div class="wy-pwlinks"><a href="#" class="wy-pw-forgot" hidden>Forgot password?</a></div>
    <div class="wy-err"></div>
    <div class="wy-legal" hidden>Protected by reCAPTCHA. Google <a href="https://policies.google.com/privacy" target="_blank" rel="noopener">Privacy</a> &amp; <a href="https://policies.google.com/terms" target="_blank" rel="noopener">Terms</a> apply.</div>
    <div class="wy-df"><button class="wy-cancel">Cancel</button><button class="primary wy-go">Send code</button></div></div>`;
  document.body.appendChild(dlg); dlg.showModal();
  const emailIn = dlg.querySelector(".wy-email-in"), codeIn = dlg.querySelector(".wy-code-in");
  const err = dlg.querySelector(".wy-err"), go = dlg.querySelector(".wy-go");
  dlg.querySelector(".wy-cancel").onclick = () => dlg.close();
  dlg.addEventListener("close", () => dlg.remove());
  let stage = "email", email = "";
  const pwIn = dlg.querySelector(".wy-pw-in"), hint = dlg.querySelector(".wy-hint");
  { const w = el("div", "wy-pwwrap"); pwIn.before(w); w.appendChild(pwIn);
    const eye = el("button", "wy-eye", "Show"); eye.type = "button"; eye.setAttribute("aria-label", "Show password");
    eye.onclick = () => { const show = pwIn.type === "password"; pwIn.type = show ? "text" : "password"; eye.textContent = show ? "Hide" : "Show"; eye.setAttribute("aria-label", show ? "Hide password" : "Show password"); pwIn.focus(); };
    w.appendChild(eye);
    new MutationObserver(() => { w.hidden = pwIn.hidden; }).observe(pwIn, { attributes: true, attributeFilter: ["hidden"] }); w.hidden = pwIn.hidden; }
  const tabs = dlg.querySelectorAll(".wy-methods button"), pwForgot = dlg.querySelector(".wy-pw-forgot");
  // Password modes: "password" = email + password login; "reset" = email code + new password (also sign-up).
  const setMode = (m) => {
    stage = m; err.textContent = ""; emailIn.disabled = false; codeIn.hidden = true; codeIn.value = "";
    pwIn.hidden = m !== "password"; pwIn.value = ""; pwForgot.hidden = m !== "password";
    pwIn.autocomplete = m === "password" ? "current-password" : "new-password";
    pwIn.placeholder = m === "password" ? "Password" : "New password (10+ characters)";
    const tab = m === "reset" || m === "password" ? "password" : m; tabs.forEach(t => t.classList.toggle("on", t.dataset.m === tab));
    emailIn.hidden = m === "passkey";
    hint.textContent = m === "email" ? "We'll email you a 6-digit code. No password needed."
      : m === "password" ? "Sign in with your email and password. New? Use Forgot password to create one."
      : m === "passkey" ? (window.PublicKeyCredential ? "Use the passkey saved on this device or phone. New here? Sign up with an email code, then add a passkey from your account menu." : "This browser doesn't support passkeys.")
      : "We'll email you a code, then you pick a new password.";
    go.textContent = m === "password" ? "Sign in" : m === "passkey" ? "Use passkey" : "Send code";
  };
  tabs.forEach(t => t.onclick = () => { setMode(t.dataset.m); if (t.dataset.m !== "passkey") emailIn.focus(); });
  pwForgot.onclick = (e) => { e.preventDefault(); setMode("reset"); emailIn.focus(); };
  emailIn.focus();
  if (DESKTOP) { dlg.querySelector('[data-m="passkey"]')?.remove(); const gw = dlg.querySelector(".wy-google"); gw.hidden = false;
    gw.querySelector(".wy-gbtn").innerHTML = '<button type="button" class="wy-browser" style="width:100%;height:40px;border-radius:999px">Continue with Google in your browser</button>';
    gw.querySelector(".wy-browser").onclick = () => { dlg.close(); dlg.remove(); window.__desktopSignin?.(); };
  } else mountGoogle(dlg, err);
  if (S.feat.recaptchaSiteKey) dlg.querySelector(".wy-legal").hidden = false;
  go.onclick = async () => {
    err.textContent = ""; go.disabled = true;
    try {
      if (stage === "passkey") {
        const j = await passkeyLogin();
        if (j.error) { err.textContent = j.error; go.disabled = false; return; }
        await finishSignin(j, dlg); return;
      } else if (stage === "password") {
        email = emailIn.value.trim().toLowerCase();
        const r = await api("/api/auth/password?action=login", { method: "POST", body: { email, password: pwIn.value, recaptcha: await captcha("password_login") } });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) { err.textContent = j.error || "Incorrect email or password."; go.disabled = false; return; }
        await finishSignin(j, dlg); return;
      } else if (stage === "reset" || stage === "reset-code") {
        if (stage === "reset") {
          email = emailIn.value.trim().toLowerCase();
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { err.textContent = "Enter a valid email."; go.disabled = false; return; }
          const r = await api("/api/auth/start", { method: "POST", body: { email, recaptcha: await captcha("request_code") } });
          if (!r.ok) { err.textContent = (await r.json().catch(() => ({}))).error || "Could not send code."; go.disabled = false; return; }
          stage = "reset-code"; emailIn.disabled = true; codeIn.hidden = false; pwIn.hidden = false; codeIn.focus(); go.textContent = "Set password";
        } else {
          const r = await api("/api/auth/password?action=reset", { method: "POST", body: { email, code: codeIn.value.trim(), password: pwIn.value, recaptcha: await captcha("password_reset") } });
          const j = await r.json().catch(() => ({}));
          if (!r.ok) { err.textContent = j.error || "Could not set password."; go.disabled = false; return; }
          await finishSignin(j, dlg); return;
        }
      } else if (stage === "email") {
        email = emailIn.value.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { err.textContent = "Enter a valid email."; go.disabled = false; return; }
        const r = await api("/api/auth/start", { method: "POST", body: { email, recaptcha: await captcha("request_code") } });
        if (!r.ok) { err.textContent = (await r.json().catch(() => ({}))).error || "Could not send code."; go.disabled = false; return; }
        stage = "code"; emailIn.disabled = true; codeIn.hidden = false; codeIn.focus(); go.textContent = "Verify";
      } else {
        const code = codeIn.value.trim();
        const r = await api("/api/auth/verify", { method: "POST", body: { email, code, recaptcha: await captcha("verify_code") } });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) { err.textContent = j.error || "Incorrect code."; go.disabled = false; return; }
        await finishSignin(j, dlg); return;
      }
    } catch (e) { err.textContent = "Something went wrong. Try again."; }
    go.disabled = false;
  };
  codeIn.addEventListener("keydown", e => { if (e.key === "Enter") go.click(); });
  emailIn.addEventListener("keydown", e => { if (e.key === "Enter") go.click(); });
  pwIn.addEventListener("keydown", e => { if (e.key === "Enter") go.click(); });
}

async function offerImport() {
  if (!S.guest.length) return;
  if (!confirm("Import your current guest chat into your account?")) { S.guest = []; return; }
  try {
    const first = S.guest.find(m => m.role === "user");
    const r = await api("/api/chats", { method: "POST", body: { action: "create", title: titleOf(first && first.content), mode: (S.opts.getMode && S.opts.getMode()) || "forge", messages: S.guest } });
    const j = await r.json(); S.guest = []; await refreshChats();
    if (j.chat) S.chatId = j.chat.id, markActive();
  } catch (e) { console.warn("import failed", e); }
}

// ---- helpers ----
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

function injectStyle() {
  if (document.getElementById("wy-auth-style")) return;
  const s = document.createElement("style"); s.id = "wy-auth-style";
  s.textContent = `
#histbar{flex:0 0 240px;display:flex;flex-direction:column;border-right:1px solid var(--rule);background:var(--bg);height:100vh;overflow:hidden}
#histbar[hidden]{display:none!important}
.hhead{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--rule);min-height:56px}
.hhead .htitle{font-weight:600;font-size:13px;color:var(--muted)}.hnew{margin-left:auto}
.hlist{flex:1;overflow:auto;padding:6px}
.hitem{display:flex;align-items:center;gap:6px;padding:7px 8px;border-radius:4px;cursor:pointer;font-size:13px;color:var(--fg)}
.hitem:hover{background:var(--card)}.hitem.on{background:var(--card);border:1px solid var(--rule)}
.hitem .hname{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.hitem .hact{opacity:0;display:flex;gap:2px;flex:none}.hitem:hover .hact{opacity:1}
.hact button{height:22px;width:22px;padding:0;font-size:12px;border:0;background:transparent;color:var(--muted)}
.hact button:hover{color:var(--fg);background:transparent}
.wy-avatar{width:30px;height:30px;border-radius:50%;background:var(--accent);color:#111;font-weight:700;border:0;display:grid;place-items:center;cursor:pointer;padding:0;font-size:13px}
.wy-avatar:hover{background:#ff7d45}
.wy-menu{position:absolute;right:16px;top:54px;background:var(--card);border:1px solid var(--rule);border-radius:6px;min-width:200px;z-index:80;padding:6px;box-shadow:0 8px 30px rgba(0,0,0,.5)}
.wy-menu .wy-email{font-size:12px;color:var(--muted);padding:8px 10px;border-bottom:1px solid var(--rule);overflow:hidden;text-overflow:ellipsis}
.wy-menu button{width:100%;text-align:left;border:0;background:transparent;height:34px;border-radius:4px}
.wy-menu button:hover{background:#2a2a2a}
.wy-hamb{display:none}
.wy-dialog{border:1px solid var(--rule);border-radius:8px;background:var(--card);color:var(--fg);padding:0;width:340px;max-width:92vw}
.wy-dialog::backdrop{background:rgba(0,0,0,.5)}
.wy-dh{padding:16px 18px;border-bottom:1px solid var(--rule);font-weight:600}
.wy-db{padding:18px}.wy-hint{font-size:12px;color:var(--muted);margin-bottom:12px}
.wy-dialog input{width:100%;background:var(--bg);border:1px solid var(--rule);color:var(--fg);border-radius:4px;height:40px;padding:0 12px;font:inherit;outline:none;margin-bottom:10px}
.wy-dialog input:focus{border-color:#555}.wy-dialog input:disabled{opacity:.6}
.wy-err{color:#e06a5a;font-size:12px;min-height:16px;margin-bottom:8px}
.wy-google{margin-bottom:12px}.wy-gbtn{display:flex;justify-content:center;min-height:40px}
.wy-or{text-align:center;font-size:12px;color:var(--muted);margin-top:10px}
.grecaptcha-badge{visibility:hidden}.wy-legal{font-size:10px;color:var(--muted);margin-bottom:10px}.wy-legal a{color:var(--muted)}
.wy-methods{display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;margin-bottom:14px}.wy-methods button{height:32px;font-size:12px;padding:0}.wy-methods button.on{border-color:var(--accent);color:var(--fg)}
.wy-pwwrap{position:relative}.wy-pwwrap[hidden]{display:none}.wy-pwwrap>input[hidden]{display:none}.wy-pwwrap input{padding-right:58px}
.wy-eye{position:absolute;right:6px;top:6px;height:28px;padding:0 8px;font-size:11px;border:0;background:transparent;color:var(--muted)}.wy-eye:hover{color:var(--fg);background:transparent}
.wy-done{font-size:13px;color:var(--fg)}
.wy-pwlinks{display:flex;justify-content:space-between;font-size:12px;margin:-4px 0 8px}.wy-pwlinks a{color:var(--muted)}.wy-pwlinks a[hidden]{display:none}
.wy-df{display:flex;gap:8px;justify-content:flex-end}
.wy-dialog .primary{background:var(--accent);border:0;color:#111;font-weight:600}.wy-dialog .primary:hover{background:#ff7d45}
@media(max-width:860px){.wy-hamb{display:inline-flex}#histbar{position:fixed;top:0;left:0;bottom:0;width:260px;z-index:70;flex-basis:260px;transform:translateX(-100%);transition:transform .2s;box-shadow:8px 0 30px rgba(0,0,0,.5)}#histbar.open{transform:none}}
`;
  document.head.appendChild(s);
}

// Used by cloud tasks.
export const authInfo = () => ({ base: S.base, token: S.token, user: S.user });
// Used by the Settings page.
export { setPassword, logout };
export const reloadMe = async () => { const r = await api("/api/auth/me?usage=1"); const j = await r.json(); return j; };
