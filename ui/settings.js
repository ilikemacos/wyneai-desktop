// WrenbyAI Settings: General, Account, Usage, and Updates (desktop app only).
// Opens from the gear in the header or Cmd/Ctrl+,. Usage numbers come from GET /api/auth/me?usage=1.
import { authInfo, setPassword, logout, reloadMe } from "./auth.js";
import { getMode, setMode } from "./cloudtask.js";
import { staticPrefs, setStaticPrefs, isInverted, setInverted } from "./static.js";
const T = window.__TAURI__; const DESKTOP = !!T?.core;
const invoke = (c, a) => T.core.invoke(c, a);
const AU = "wy.autoupdate", LAST = "wy.update.last";
export const autoUpdateOn = () => localStorage.getItem(AU) !== "0";
const el = (tag, cls, txt) => { const d = document.createElement(tag); if (cls) d.className = cls; if (txt != null) d.textContent = txt; return d; };
const CSS = `
.wy-settings{padding:0;border:1px solid #262626;border-radius:18px;background:#0e0e0e;color:#ececec;width:min(860px,94vw);height:min(600px,88vh);max-width:none;max-height:none;overflow:hidden;font-family:inherit}
.wy-settings::backdrop{background:#000a}
.wy-settings .sg{display:flex;height:100%}.wy-settings nav{width:190px;flex:none;border-right:1px solid #1f1f1f;padding:16px 10px;display:flex;flex-direction:column;gap:2px;background:#0b0b0b}
.wy-settings nav .st{font-weight:600;font-size:14px;padding:4px 10px 14px;display:flex;align-items:center;gap:8px}.wy-settings nav .st img{width:20px;height:20px;border-radius:5px}
.wy-settings nav button{all:unset;cursor:pointer;padding:8px 10px;border-radius:10px;font-size:13px;color:#a8a8a8}.wy-settings nav button:hover{background:#161616;color:#eee}.wy-settings nav button.on{background:#1c1c1c;color:#f2f2f2}
.wy-settings .sb{flex:1;overflow:auto;padding:22px 28px;position:relative}.wy-settings h2{font-size:18px;margin:0 0 4px;font-weight:600}.wy-settings .sub{color:#8a8a8a;font-size:12px;margin:0 0 18px}
.wy-settings .x{position:absolute;top:12px;right:12px;height:30px;width:30px;border-radius:999px;padding:0}
.wy-settings .row{display:flex;align-items:center;gap:16px;padding:14px 0;border-bottom:1px solid #1b1b1b}.wy-settings .row .l{flex:1}.wy-settings .row .t{font-size:13px}.wy-settings .row .d{font-size:12px;color:#858585;margin-top:2px}
.wy-settings button{border-radius:999px;height:32px;padding:0 14px;font-size:12px}.wy-settings .pri{background:#f2f2f2;color:#111;border:0;font-weight:600}.wy-settings .danger{color:#f87171;border-color:#4a2020}
.wy-sw{position:relative;width:38px;height:22px;flex:none;border-radius:999px;background:#2a2a2a;cursor:pointer;border:0;padding:0!important}.wy-sw::after{content:"";position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:#bbb;transition:left .15s}.wy-sw.on{background:#f2f2f2}.wy-sw.on::after{left:19px;background:#111}
.wy-seg{display:inline-flex;border:1px solid #2c2c2c;border-radius:999px;overflow:hidden}.wy-seg button{border:0;border-radius:0;background:transparent;color:#9a9a9a;height:30px}.wy-seg button.on{background:#262626;color:#f2f2f2}
.wy-settings .card{border:1px solid #1f1f1f;border-radius:14px;padding:14px 16px;margin-bottom:12px;background:#121212}.wy-settings .card .h{display:flex;justify-content:space-between;font-size:13px;margin-bottom:8px}.wy-settings .card .h b{font-weight:600}.wy-settings .card .h span{color:#9a9a9a}
.wy-bar{height:8px;border-radius:999px;background:#222;overflow:hidden}.wy-bar i{display:block;height:100%;background:#f2f2f2;border-radius:999px}.wy-bar.warn i{background:#f59e0b}
.wy-settings .muted{color:#7d7d7d;font-size:12px}.wy-settings .kv{display:grid;grid-template-columns:auto 1fr;gap:6px 18px;font-size:13px}.wy-settings .kv span:nth-child(odd){color:#8a8a8a}
.wy-settings .pill{display:inline-block;font-size:11px;padding:2px 9px;border-radius:999px;border:1px solid #333;color:#ccc;margin-right:6px}.wy-settings .pill.ok{border-color:#1f4d2c;color:#4ade80}
#wy-gear{width:34px;height:34px;padding:0!important;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;font-size:16px}
@media(max-width:640px){.wy-settings .sg{flex-direction:column}.wy-settings nav{width:auto;flex-direction:row;overflow-x:auto;border-right:0;border-bottom:1px solid #1f1f1f;padding:8px}.wy-settings nav .st{display:none}.wy-settings .sb{padding:16px}}`;
const fmtTime = t => t ? new Date(t).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "never";
function sw(on, onchange) { const b = el("button", "wy-sw" + (on ? " on" : "")); b.type = "button"; b.setAttribute("role", "switch"); b.setAttribute("aria-checked", on);
  b.onclick = () => { on = !on; b.classList.toggle("on", on); b.setAttribute("aria-checked", on); onchange(on); }; return b; }
function row(title, desc, control) { const r = el("div", "row"), l = el("div", "l"); l.append(el("div", "t", title)); if (desc) l.append(el("div", "d", desc)); r.append(l); if (control) r.append(control); return r; }
function bar(used, limit) { const b = el("div", "wy-bar" + (limit && used / limit >= 0.8 ? " warn" : "")), i = el("i"); i.style.width = Math.min(100, limit ? (used / limit) * 100 : 0) + "%"; b.append(i); return b; }
function card(title, right, ...kids) { const c = el("div", "card"), h = el("div", "h"); h.append(el("b", "", title), el("span", "", right)); c.append(h, ...kids); return c; }

const SECTIONS = [["general", "General"], ["account", "Account"], ["usage", "Usage"], ...(DESKTOP ? [["updates", "Updates"]] : [])];
async function renderGeneral(b) {
  b.append(el("h2", "", "General"), el("p", "sub", "How WrenbyAI looks and how cloud tasks run."));
  const seg = el("div", "wy-seg"); for (const [m, label] of [["ask", "Ask before running"], ["auto", "Auto-run"]]) { const x = el("button", getMode() === m ? "on" : "", label); x.type = "button";
    x.onclick = () => { setMode(m); seg.querySelectorAll("button").forEach(y => y.classList.toggle("on", y === x)); document.querySelectorAll(".ctmode .ctm").forEach((y, i) => y.classList.toggle("on", (i === 0) === (m === "ask"))); }; seg.append(x); }
  b.append(row("Cloud task commands", "Ask pauses before every command or file write in a cloud sandbox. Also next to the message box.", seg));
  const p = staticPrefs();
  b.append(row("Inverted theme", "White background, black squares. You can also click the empty background.", sw(isInverted(), v => setInverted(v))));
  b.append(row("Shimmer", "Squares flicker slowly. Off keeps the static still.", sw(p.shimmer, v => setStaticPrefs({ shimmer: v }))));
  b.append(row("Chunky squares", "Twice the square size.", sw(p.chunky, v => setStaticPrefs({ chunky: v }))));
}
async function renderAccount(b, me) {
  b.append(el("h2", "", "Account"));
  const u = me?.user; if (!u) { b.append(el("p", "sub", "You're not signed in."), row("Sign in", "Save chats, run cloud tasks and see your usage.", (() => { const x = el("button", "pri", "Sign in"); x.onclick = () => { close(); [...document.querySelectorAll("button")].find(y => y.textContent.trim() === "Sign in")?.click(); }; return x; })())); return; }
  b.append(el("p", "sub", u.email));
  const m = el("div"); m.append(el("span", "pill ok", "Email code"), el("span", "pill" + (u.hasPassword ? " ok" : ""), u.hasPassword ? "Password set" : "No password"));
  if (me.googleClientId) m.append(el("span", "pill", "Google (same email)"));
  b.append(row("Sign-in methods", DESKTOP ? "Google opens your browser. Passkeys aren't available in the desktop app." : "Google works when your Google account uses this email.", m));
  const pw = el("button", "", u.hasPassword ? "Change password" : "Set password"); pw.onclick = () => { close(); setPassword(); };
  b.append(row("Password", u.hasPassword ? "Change it with your current password. Forgot it? Use the email-code reset on the sign-in screen." : "Add a password so you can sign in without a code.", pw));
  const so = el("button", "", "Sign out"); so.onclick = async () => { close(); await logout(); };
  b.append(row("Sign out", "Sign out on this device.", so));
  const all = el("button", "danger", "Sign out everywhere"); all.onclick = async () => {
    if (!confirm("Sign out of WrenbyAI on all devices, including this one?")) return; all.disabled = true; const a = authInfo();
    try { const r = await fetch((a.base || "") + "/api/auth/me", { method: "POST", credentials: "include", headers: { "content-type": "application/json", ...(a.token ? { authorization: "Bearer " + a.token } : {}) }, body: JSON.stringify({ action: "logout_all" }) });
      if (!r.ok) throw new Error("HTTP " + r.status); close(); await logout(); } catch (e) { all.disabled = false; alert("Couldn't sign out everywhere: " + e.message); } };
  b.append(row("All devices", "Ends every session: browsers, desktop apps and the CLI.", all));
}
async function renderUsage(b, me) {
  b.append(el("h2", "", "Usage"));
  const u = me?.user?.usage; if (!me?.user) { b.append(el("p", "sub", "Sign in to see your usage.")); return; }
  if (!u) { b.append(el("p", "sub", "Usage isn't available right now.")); return; }
  b.append(el("p", "sub", "Plan: " + u.plan + ". Numbers come from your account on the server."));
  const ct = u.cloudTasks;
  b.append(card("Cloud tasks", `${ct.used} / ${ct.limit} in the last 24 hours`, bar(ct.used, ct.limit), el("div", "muted", `Zenith tasks count as ${ct.zenithWeight}. ${ct.tasks} task${ct.tasks === 1 ? "" : "s"} started in the last 24 hours, ${ct.month} this month.`)));
  b.append(card("Running now", `${ct.running} / ${ct.concurrentLimit}`, bar(ct.running, ct.concurrentLimit), el("div", "muted", `Up to ${ct.stepLimit.forge} steps on Forge and ${ct.stepLimit.zenith} on Zenith, ${ct.maxMinutes} minutes per task.`)));
  const kv = el("div", "kv"); for (const [k, v] of [["Today", u.messages.today], ["This month", u.messages.month], ["All time", u.messages.total], ["Chats", u.chats]]) kv.append(el("span", "", k), el("span", "", String(v)));
  b.append(card("Messages", "saved to your history", kv, el("div", "muted", "Counts messages you sent in saved chats.")));
  const cl = u.chatLimits; b.append(card("Chat limits", cl.scope, el("div", "muted", `${cl.perMinute} messages a minute and ${cl.perDay} a day. Zenith counts as ${cl.zenithWeight}, with up to ${cl.zenithPerDay} Zenith messages a day. These are counted per network address, so they aren't shown as a bar.`)));
}
async function renderUpdates(b) {
  b.append(el("h2", "", "Updates"));
  let cur = "?"; try { cur = await invoke("app_version"); } catch {}
  b.append(el("p", "sub", "WrenbyAI " + cur));
  const st = el("div", "d"); st.textContent = "Last checked: " + fmtTime(+localStorage.getItem(LAST) || 0);
  const btn = el("button", "", "Check for updates"); const r = row("Check for updates", null, btn); r.querySelector(".l").append(st); b.append(r);
  btn.onclick = async () => { btn.disabled = true; btn.textContent = "Checking…";
    try { const u = await invoke("update_check"); localStorage.setItem(LAST, Date.now()); st.textContent = "Last checked: " + fmtTime(Date.now());
      if (u?.available) { st.textContent += ` · Version ${u.version} is available.`; btn.textContent = "Install and restart"; btn.className = "pri"; btn.disabled = false;
        btn.onclick = async () => { btn.disabled = true; btn.textContent = "Installing…"; try { await invoke("update_install"); } catch (e) { btn.textContent = "Install failed"; st.textContent = String(e); btn.disabled = false; } }; }
      else { st.textContent += " · You're up to date."; btn.textContent = "Check for updates"; btn.disabled = false; } }
    catch (e) { st.textContent = "Check failed: " + e; btn.textContent = "Check for updates"; btn.disabled = false; } };
  b.append(row("Automatic updates", "Check on launch and install updates automatically.", sw(autoUpdateOn(), v => localStorage.setItem(AU, v ? "1" : "0"))));
}
let dlg = null; const close = () => { dlg?.close(); dlg?.remove(); dlg = null; };
export async function openSettings(section = "general") {
  if (dlg) return; if (!document.getElementById("wy-settings-css")) { const s = el("style"); s.id = "wy-settings-css"; s.textContent = CSS; document.head.append(s); }
  dlg = el("dialog", "wy-settings"); const g = el("div", "sg"), nav = el("nav"), body = el("div", "sb"); const t = el("div", "st"); const img = el("img"); img.src = "favicon.svg"; img.alt = ""; t.append(img, "Settings"); nav.append(t);
  g.append(nav, body); dlg.append(g); document.body.append(dlg); dlg.showModal(); dlg.addEventListener("close", () => { dlg?.remove(); dlg = null; });
  dlg.addEventListener("click", e => { if (e.target === dlg) close(); });
  let me = null; const meP = authInfo().user || authInfo().token ? reloadMe().catch(() => null) : Promise.resolve(null);
  const show = async id => { nav.querySelectorAll("button").forEach(x => x.classList.toggle("on", x.dataset.s === id)); body.innerHTML = ""; const x = el("button", "x", "✕"); x.title = "Close"; x.onclick = close; body.append(x);
    if (id === "general") await renderGeneral(body); else if (id === "updates") await renderUpdates(body);
    else { if (!me) { body.append(el("p", "sub", "Loading…")); me = await meP; body.lastChild.remove(); } id === "account" ? await renderAccount(body, me) : await renderUsage(body, me); } dlg?.dataset && (dlg.dataset.section = id); };
  for (const [id, label] of SECTIONS) { const b = el("button", "", label); b.dataset.s = id; b.onclick = () => show(id); nav.append(b); }
  await show(SECTIONS.some(s => s[0] === section) ? section : "general");
}
export function initSettings() {
  const header = document.querySelector("header"); if (header && !document.getElementById("wy-gear")) { const g = el("button", "", "⚙"); g.id = "wy-gear"; g.type = "button"; g.title = "Settings (" + (/Mac/.test(navigator.platform) ? "⌘" : "Ctrl") + "+,)"; g.setAttribute("aria-label", "Settings"); g.onclick = () => openSettings();
    const reset = document.getElementById("reset"); reset ? header.insertBefore(g, reset) : header.append(g); }
  addEventListener("keydown", e => { if ((e.metaKey || e.ctrlKey) && e.key === ",") { e.preventDefault(); dlg ? close() : openSettings(); } });
  if (DESKTOP && autoUpdateOn()) setTimeout(() => invoke("update_install").then(() => localStorage.setItem(LAST, Date.now())).catch(() => {}), 4000);
}
