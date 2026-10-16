// Companions: Wrenby (the little guy) and Milyy (a cat with her ball). Same 16x16 pixel grid,
// white with black eyes (inverted mode flips them via the page filter). The choice lives on the
// account (users.companion via POST /api/auth/me {action:'set_companion'}) and is mirrored in
// localStorage. ?companion=milyy overrides it for testing.
import { authInfo } from "./auth.js";
export const COMPANIONS = { wrenby: "Wrenby", milyy: "Milyy" };
const LS = "wy.companion";
const urlPick = () => { const c = new URLSearchParams(location.search).get("companion"); return COMPANIONS[c] ? c : null; };
export function getCompanion() { return urlPick() || (COMPANIONS[localStorage.getItem(LS)] ? localStorage.getItem(LS) : "wrenby"); }
export async function setCompanion(c, { save = true } = {}) {
  if (!COMPANIONS[c]) return;
  localStorage.setItem(LS, c); refreshWalkers(); dispatchEvent(new CustomEvent("wrenby:companion", { detail: c }));
  if (!save) return true;
  const a = authInfo(); if (!a.user) return true;
  try {
    const r = await fetch((a.base || "") + "/api/auth/me", { method: "POST", credentials: "include", headers: { "content-type": "application/json", ...(a.token ? { authorization: "Bearer " + a.token } : {}) }, body: JSON.stringify({ action: "set_companion", companion: c }) });
    return r.ok;
  } catch { return false; }
}
// Inner markup (no <svg>). Classes: skin/eye/leg l1 l2 like the Thinking walker, plus
// arm (Wrenby) or ear/tailg/ballg (Milyy).
export const PARTS = {
  wrenby: `<g class="bob"><g class="mbody g-body"><rect class="skin" x="3" y="2" width="10" height="9"/><rect class="eye" x="8" y="4" width="2" height="2"/><rect class="eye" x="11" y="4" width="1" height="2"/><rect class="arm" x="13" y="5" width="2" height="3" style="display:none"/></g><rect class="leg l1" x="4" y="11" width="3" height="3"/><rect class="leg l2" x="9" y="11" width="3" height="3"/></g>`,
  milyy: `<g class="bob"><g class="mbody g-body"><g class="tailg"><rect class="skin tail" x="0" y="3" width="1" height="4"/><rect class="skin tail" x="1" y="6" width="1" height="2"/></g><rect class="skin" x="2" y="7" width="8" height="4"/><rect class="skin" x="7" y="3" width="6" height="5"/><rect class="skin ear el" x="7" y="1" width="1" height="2"/><rect class="skin ear er" x="12" y="1" width="1" height="2"/><rect class="eye" x="9" y="5" width="1" height="1"/><rect class="eye" x="11" y="5" width="1" height="1"/></g><rect class="leg l1" x="3" y="11" width="2" height="3"/><rect class="leg l2" x="8" y="11" width="2" height="3"/><g class="ballg"><rect class="ball" x="13" y="10" width="2" height="4"/><rect class="ball" x="12" y="11" width="4" height="2"/></g></g>`,
};
export const svgFor = (c, cls = "") => `<svg class="${cls}" viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true">${PARTS[c] || PARTS.wrenby}</svg>`;
export const BALL = "#ff6a2b";
const CSS = `
.mob .ball,.wy-comp .ball{fill:${BALL}}
.mob .tailg,.wy-comp .tailg,.wy-comp .ballg,.wy-comp .ear{transform-box:fill-box}
.mob .tailg{transform-origin:100% 100%;animation:wyTail 1.2s ease-in-out infinite}
@keyframes wyTail{0%,100%{transform:rotate(0)}50%{transform:rotate(-14deg)}}
@keyframes wyBall{0%,100%{transform:translateY(0)}45%{transform:translateY(-4px)}55%{transform:translateY(-4px)}}
@keyframes wyEar{0%,90%,100%{transform:translateY(0)}93%{transform:translateY(1px)}}
.wy-comp .tailg{transform-origin:100% 100%;animation:wyTail 1.4s ease-in-out infinite}
.wy-comp .ballg{animation:wyBall .9s cubic-bezier(.3,0,.4,1) infinite}
.wy-comp .er{animation:wyEar 3.1s infinite}
.wy-comp .eye{transform-box:fill-box;transform-origin:center;animation:mblink 3.4s infinite}
@media (prefers-reduced-motion:reduce){.mob .tailg,.wy-comp .tailg,.wy-comp .ballg,.wy-comp .er,.wy-comp .eye{animation:none}}
`;
// Swap the Thinking-box walker to the chosen companion (keeps its walk/blink CSS).
export function refreshWalkers(root = document) {
  const c = getCompanion();
  root.querySelectorAll?.("svg.mob").forEach(s => { if (s.dataset.comp !== c) { s.innerHTML = PARTS[c]; s.dataset.comp = c; } });
}
// ---- picker shown right after a brand-new account is created ----
const PCSS = `
html.wy-picker body>main,html.wy-picker #histbar{visibility:hidden}
html.wy-picker #wy-static{opacity:1!important}
.wy-pick-ov{position:fixed;inset:0;z-index:96;display:flex;align-items:center;justify-content:center;font-family:"Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#fff}
html.wy-inv .wy-pick-ov{filter:invert(1) hue-rotate(180deg)}
.wy-pick{background:#000;border:2px solid #fff;border-radius:16px;padding:26px 24px;width:min(560px,92vw);text-align:center}
.wy-pick h2{margin:0 0 4px;font-size:22px}.wy-pick p{margin:0 0 20px;color:#bdbdbd;font-size:14px}
.wy-pick .cards{display:flex;gap:16px;justify-content:center;flex-wrap:wrap}
.wy-pick .card{flex:1 1 200px;max-width:240px;border:1px solid #333;border-radius:14px;padding:18px 14px;display:flex;flex-direction:column;align-items:center;gap:10px;background:#000}
.wy-pick .card:focus-within{border-color:#fff}
.wy-pick .wy-comp{width:96px;height:96px;image-rendering:pixelated}
.wy-pick .wy-comp .skin,.wy-pick .wy-comp .leg,.wy-pick .wy-comp .arm{fill:#fff}.wy-pick .wy-comp .eye{fill:#000}
.wy-pick .nm{font-weight:700;font-size:16px}.wy-pick .ds{font-size:12px;color:#9a9a9a;min-height:32px}
.wy-pick button{font:inherit;font-size:14px;font-weight:600;border-radius:999px;height:38px;padding:0 18px;cursor:pointer;background:#fff;color:#000;border:0}
`;
export function showPicker() {
  return new Promise(resolve => {
    if (!document.getElementById("wy-pick-css")) { const s = document.createElement("style"); s.id = "wy-pick-css"; s.textContent = PCSS; document.head.appendChild(s); }
    const ov = document.createElement("div"); ov.className = "wy-pick-ov"; ov.setAttribute("role", "dialog"); ov.setAttribute("aria-modal", "true"); ov.setAttribute("aria-label", "Choose your companion");
    const card = (c, ds) => `<div class="card">${svgFor(c, "wy-comp")}<div class="nm">${COMPANIONS[c]}</div><div class="ds">${ds}</div><button data-c="${c}">Pick ${COMPANIONS[c]}</button></div>`;
    ov.innerHTML = `<div class="wy-pick"><h2>Choose your companion</h2><p>They'll keep you company while WrenbyAI works. You can switch any time in Settings.</p>
      <div class="cards">${card("wrenby", "The little guy. Waves hello and keeps an eye on things.")}${card("milyy", "A curious cat who never goes anywhere without her ball.")}</div></div>`;
    document.body.appendChild(ov); document.documentElement.classList.add("wy-picker");
    const btns = [...ov.querySelectorAll("button")]; btns[0].focus();
    const done = c => { removeEventListener("keydown", key, true); ov.remove(); document.documentElement.classList.remove("wy-picker"); resolve(c); };
    const key = e => { if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); btns[(btns.indexOf(document.activeElement) + 1) % 2].focus(); } else if (e.key === "Escape") { e.preventDefault(); done("wrenby"); } };
    addEventListener("keydown", key, true);
    btns.forEach(b => b.onclick = () => done(b.dataset.c));
  });
}
export function initCompanion() {
  if (!document.getElementById("wy-comp-css")) { const s = document.createElement("style"); s.id = "wy-comp-css"; s.textContent = CSS; document.head.appendChild(s); }
  // Follow the account's choice whenever /api/auth/me reports it.
  const orig = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const res = await orig(input, init);
    try {
      const url = typeof input === "string" ? input : input.url, m = (init && init.method || "GET").toUpperCase();
      if (m === "GET" && /\/api\/auth\/me\b/.test(url) && res.ok) res.clone().json().then(j => { const c = j?.user?.companion; if (COMPANIONS[c] && localStorage.getItem(LS) !== c) { localStorage.setItem(LS, c); refreshWalkers(); dispatchEvent(new CustomEvent("wrenby:companion", { detail: c })); } }).catch(() => {});
    } catch {}
    return res;
  };
  refreshWalkers();
  new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1 && (n.matches?.("svg.mob") || n.querySelector?.("svg.mob"))) { refreshWalkers(n.parentNode || document); } }).observe(document.body, { childList: true, subtree: true });
}
