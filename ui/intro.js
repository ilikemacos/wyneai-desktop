// Wrenby's first-run intro. Shown once, right after a brand-new account is created
// (the server's verify/google response says isNew). Replay any time with ?intro=1.
// Self-contained: watches auth responses instead of editing auth.js.
import { getCompanion, setCompanion, showPicker, svgFor, BALL } from "./companion.js";
const MILYY_STEPS = [
  "Hi! I'm Milyy! I brought my ball. Welcome to WrenbyAI, I'm so happy you're here.",
  "I can chat, help you write and fix code, and run things in a terminal. For bigger jobs I start a fresh cloud machine and work through the task step by step.",
  "You're in charge of commands. Pick Ask and I'll check with you before running anything, or Auto and I'll just get on with it. Switch any time next to the message box.",
  "That's the tour! Ask me anything and I'll keep my ball ready. Let's go!",
];
const WRENBY_STEPS = [
  "Hi! My name is Wrenby! Welcome to WrenbyAI. I'm really glad you're here.",
  "I can chat, help you write and fix code, and run things in a terminal. For bigger jobs I start a fresh cloud machine and work through the task step by step.",
  "You're in charge of commands. Pick Ask and I'll check with you before running anything, or Auto and I'll just get on with it. Switch any time next to the message box.",
  "That's the tour! Ask me anything to get started. Let's go!",
];
const RM = matchMedia("(prefers-reduced-motion: reduce)");
const FLAG = id => "wy.onboarded." + (id || "anon");

const CSS = `
html.wy-intro body>main,html.wy-intro #histbar{visibility:hidden}
html.wy-intro #wy-static{opacity:1!important}
.wy-intro-ov{position:fixed;inset:0;z-index:95;display:flex;align-items:center;justify-content:center;font-family:"Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#fff}
html.wy-inv .wy-intro-ov{filter:invert(1) hue-rotate(180deg)}
.wy-intro-stage{position:relative;width:min(560px,92vw);display:flex;flex-direction:column;align-items:center;gap:18px}
.wy-intro-bub{position:relative;background:#000;border:2px solid #fff;border-radius:14px;padding:18px 20px;min-height:96px;width:100%;box-sizing:border-box;font-size:17px;line-height:1.5;opacity:0;transform:translateY(6px);transition:opacity .25s,transform .25s}
.wy-intro-bub.on{opacity:1;transform:none}
.wy-intro-bub:after{content:"";position:absolute;left:50%;bottom:-11px;width:16px;height:16px;background:#000;border-right:2px solid #fff;border-bottom:2px solid #fff;transform:translateX(-50%) rotate(45deg)}
.wy-intro-caret{display:inline-block;width:.55em;height:1em;background:#fff;vertical-align:-2px;margin-left:2px;animation:wyc 1s steps(1) infinite}
@keyframes wyc{50%{opacity:0}}
.wy-intro-row{position:relative;width:100%;height:150px;overflow:visible}
.wy-intro-guy{position:absolute;left:0;bottom:0;width:128px;height:128px;will-change:transform;image-rendering:pixelated}
.wy-intro-guy .skin,.wy-intro-guy .leg,.wy-intro-guy .arm{fill:#fff}.wy-intro-guy .ball{fill:${BALL}}.wy-intro-guy .tailg,.wy-intro-guy .ballg{transform-box:fill-box}.wy-intro-guy .tailg{transform-origin:100% 100%}.wy-intro-guy .eye{fill:#000}
.wy-intro-guy .eye,.wy-intro-guy .arm,.wy-intro-guy .leg{transform-box:fill-box}
.wy-intro-guy .eye{transform-origin:center}.wy-intro-guy .arm{transform-origin:50% 100%}
.wy-intro-ctl{display:flex;gap:10px;align-items:center;opacity:0;transition:opacity .25s}.wy-intro-ctl.on{opacity:1}
.wy-intro-ctl button{font:inherit;font-size:14px;font-weight:600;border-radius:999px;height:38px;padding:0 18px;cursor:pointer}
.wy-intro-skip{background:#000;color:#fff;border:1px solid #555}.wy-intro-next{background:#fff;color:#000;border:0}
.wy-intro-dots{display:flex;gap:6px;margin-right:6px}.wy-intro-dots i{width:7px;height:7px;background:#444}.wy-intro-dots i.on{background:#fff}
`;


let open = false;
export function showIntro(userId, comp = getCompanion()) {
  const STEPS = comp === "milyy" ? MILYY_STEPS : WRENBY_STEPS;
  if (open) return; open = true;
  if (!document.getElementById("wy-intro-css")) { const s = document.createElement("style"); s.id = "wy-intro-css"; s.textContent = CSS; document.head.appendChild(s); }
  const ov = document.createElement("div"); ov.className = "wy-intro-ov"; ov.setAttribute("role", "dialog"); ov.setAttribute("aria-modal", "true"); ov.setAttribute("aria-label", "Welcome to WrenbyAI");
  ov.innerHTML = `<div class="wy-intro-stage"><div class="wy-intro-bub" aria-live="polite"><span class="t"></span><span class="wy-intro-caret"></span></div>
    <div class="wy-intro-row">${svgFor(comp, "wy-intro-guy")}</div>
    <div class="wy-intro-ctl"><div class="wy-intro-dots">${STEPS.map(() => "<i></i>").join("")}</div><button class="wy-intro-skip">Skip</button><button class="wy-intro-next">Next</button></div></div>`;
  document.body.appendChild(ov); document.documentElement.classList.add("wy-intro");
  const $ = s => ov.querySelector(s);
  const guy = $(".wy-intro-guy"), body = guy.querySelector(".g-body");
  const l1 = guy.querySelector(".l1"), l2 = guy.querySelector(".l2"), eyes = guy.querySelectorAll(".eye"), arm = guy.querySelector(".arm"), ballg = guy.querySelector(".ballg"), tailg = guy.querySelector(".tailg");
  const bub = $(".wy-intro-bub"), txt = $(".t"), ctl = $(".wy-intro-ctl"), next = $(".wy-intro-next"), dots = ov.querySelectorAll(".wy-intro-dots i");
  const row = $(".wy-intro-row");
  let step = -1, typing = null, idle = 0, alive = true;
  const target = () => (row.clientWidth - 128) / 2;
  const place = (x, y = 0, sx = 1, sy = 1) => { guy.style.transform = `translate3d(${Math.round(x)}px,${y.toFixed(2)}px,0) scale(${sx},${sy})`; guy.style.transformOrigin = "50% 100%"; };
  const legs = (a, b) => { l1.setAttribute("y", 11 - a); l2.setAttribute("y", 11 - b); };
  const blink = () => new Promise(r => { eyes.forEach(e => e.style.transform = "scaleY(.12)"); setTimeout(() => { eyes.forEach(e => e.style.transform = ""); r(); }, 120); });
  const wave = () => new Promise(r => {
    if (!arm || comp === "milyy") { const t0 = performance.now(); (function f(now) { const k = (now - t0) / 1100; if (k >= 1 || !alive) { if (ballg) ballg.style.transform = ""; if (tailg) tailg.style.transform = ""; return r(); }
      if (ballg) ballg.style.transform = `translateY(${-Math.round(Math.abs(Math.sin(k * Math.PI * 3)) * 4)}px)`; if (tailg) tailg.style.transform = `rotate(${Math.round(Math.sin(k * Math.PI * 4) * 14)}deg)`; requestAnimationFrame(f); })(t0); return; }
    arm.style.display = ""; arm.style.opacity = 1; const t0 = performance.now();
    (function f(now) { const k = (now - t0) / 900; if (k >= 1 || !alive) { arm.style.transform = ""; arm.style.opacity = 0; return r(); }
      arm.style.transform = `rotate(${Math.sin(k * Math.PI * 4) * 28}deg)`; requestAnimationFrame(f); })(t0);
  });
  // Walk in from the left edge: alternating legs, small bob, ease-out deceleration, then a squash-and-settle.
  const walkIn = () => new Promise(r => {
    const x0 = -row.getBoundingClientRect().left - 140, x1 = target(), D = 2200, t0 = performance.now();
    (function f(now) {
      if (!alive) return r();
      const k = Math.min(1, (now - t0) / D), e = 1 - Math.pow(1 - k, 3);   // easeOutCubic
      const speed = 3 * Math.pow(1 - k, 2);                                 // derivative, 0..3
      const ph = (now - t0) / 1000 * (2 + 4 * speed);                       // step rate slows with speed
      const s = Math.sin(ph * Math.PI * 2), amp = Math.min(1, speed);
      legs(s > 0 ? Math.round(amp * 1.6) : 0, s < 0 ? Math.round(amp * 1.6) : 0);
      place(x0 + (x1 - x0) * e, -Math.abs(s) * 5 * amp);
      if (k < 1) return requestAnimationFrame(f);
      legs(0, 0); const t1 = performance.now();
      (function settle(n) { const q = (n - t1) / 380; if (q >= 1) { place(x1); return r(); }
        const d = Math.sin(q * Math.PI * 2) * Math.exp(-q * 4); place(x1, 0, 1 + d * 0.12, 1 - d * 0.12); requestAnimationFrame(settle); })(t1);
    })(t0);
  });
  const fadeIn = () => new Promise(r => { place(target()); guy.style.opacity = 0; guy.style.transition = "opacity .5s"; requestAnimationFrame(() => guy.style.opacity = 1); setTimeout(r, 500); });
  // Gentle idle bob + occasional blink while talking.
  function idleLoop(now) { if (!alive) return; idle = requestAnimationFrame(idleLoop); if (RM.matches) return;
    body.style.transform = `translateY(${(Math.sin(now / 420) > 0.6 ? -0.5 : 0)}px)`; if (Math.random() < 0.004) blink(); }
  function say(i) {
    step = i; dots.forEach((d, j) => d.classList.toggle("on", j === i));
    next.textContent = i === STEPS.length - 1 ? "Let's go" : "Next";
    const full = STEPS[i]; clearInterval(typing); bub.classList.add("on");
    if (RM.matches) { txt.textContent = full; typing = null; return; }
    let n = 0; txt.textContent = "";
    typing = setInterval(() => { n += 1; txt.textContent = full.slice(0, n); if (n >= full.length) { clearInterval(typing); typing = null; } }, 24);
  }
  function advance() {
    if (step < 0) return;
    if (typing) { clearInterval(typing); typing = null; txt.textContent = STEPS[step]; return; }
    if (step < STEPS.length - 1) say(step + 1); else close();
  }
  function close() {
    alive = false; cancelAnimationFrame(idle); clearInterval(typing);
    try { localStorage.setItem(FLAG(userId), "1"); } catch {}
    document.removeEventListener("keydown", onKey, true); ov.remove(); document.documentElement.classList.remove("wy-intro"); open = false;
    const q = document.getElementById("q"); if (q && !q.disabled) q.focus();
  }
  function onKey(e) {
    if (e.key === "Escape") { e.preventDefault(); close(); }
    else if (e.key === "Enter" || e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); advance(); }
  }
  next.onclick = advance; $(".wy-intro-skip").onclick = close;
  document.addEventListener("keydown", onKey, true);
  place(-9999);
  (async () => {
    if (RM.matches) await fadeIn(); else { await walkIn(); await new Promise(r => setTimeout(r, 120)); await blink(); await wave(); }
    if (!alive) return;
    idle = requestAnimationFrame(idleLoop); ctl.classList.add("on"); next.focus(); say(0);
  })();
  addEventListener("resize", () => { if (alive && step >= 0) place(target()); });
  ov._advance = advance; return ov;
}

// Watch sign-in responses for a brand-new account, then show the intro once the sign-in dialog has closed.
export function initIntro() {
  const orig = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const res = await orig(input, init);
    try {
      const url = typeof input === "string" ? input : input.url;
      if (/\/api\/auth\/(verify|google|password)\b/.test(url) && res.ok) {
        res.clone().json().then(j => {
          if (j && j.isNew && j.user && !localStorage.getItem(FLAG(j.user.id))) whenNoDialog(async () => { const c = await showPicker(); await setCompanion(c); showIntro(j.user.id, c); });
        }).catch(() => {});
      }
    } catch {}
    return res;
  };
  const qp = new URLSearchParams(location.search);
  if (qp.get("picker") === "1") whenNoDialog(async () => { const c = await showPicker(); await setCompanion(c, { save: false }); showIntro("replay", c); });
  else if (qp.get("intro") === "1") whenNoDialog(() => showIntro("replay"));
}
function whenNoDialog(fn) {
  const t = setInterval(() => { if (!document.querySelector("dialog[open]")) { clearInterval(t); setTimeout(fn, 250); } }, 200);
}
