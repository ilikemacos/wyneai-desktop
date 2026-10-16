// Wrenby edge visits: while a response is generating, the little guy sometimes pops in from a
// random window edge, idles (blink, bob, wave, look around) and slides back out.
// Hook: dispatch "wrenby:gen-start" / "wrenby:gen-end" on window. Debug: ?wrenby=always.
const Q = new URLSearchParams(location.search);
const ALWAYS = Q.get("wrenby") === "always";
const CFG = { chance: 0.38, cooldown: 25000, delay: [1500, 7000], hold: [1800, 4200], peekChance: 0.35, size: 64 };
const RM = matchMedia("(prefers-reduced-motion: reduce)");
const R = (a, b) => a + Math.random() * (b - a);
const pick = a => a[(Math.random() * a.length) | 0];
const ease = { out: t => 1 - Math.pow(1 - t, 3), in: t => t * t * t, back: t => { const c = 1.6; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); } };

const CSS = `
.wy-visits{position:fixed;inset:0;overflow:hidden;pointer-events:none;z-index:60;contain:strict}
.wy-visits *{pointer-events:none!important;user-select:none}
html.wy-inv .wy-visits{filter:invert(1) hue-rotate(180deg)}
.wy-visit{position:absolute;width:${CFG.size}px;height:${CFG.size}px;will-change:transform,opacity}
.wy-visit svg{display:block;width:100%;height:100%;image-rendering:pixelated;shape-rendering:crispEdges}
.wy-visit .skin,.wy-visit .leg,.wy-visit .arm{fill:#fff}.wy-visit .eye{fill:#000}
`;
const GUY = `<svg viewBox="0 0 16 16" aria-hidden="true"><g class="g-body"><rect class="skin" x="3" y="2" width="10" height="9"/><rect class="eye e1" x="8" y="4" width="2" height="2"/><rect class="eye e2" x="11" y="4" width="1" height="2"/><rect class="arm" x="13" y="5" width="2" height="3" style="display:none"/></g><rect class="leg l1" x="4" y="11" width="3" height="3"/><rect class="leg l2" x="9" y="11" width="3" height="3"/></svg>`;

let active = false, lastVisit = -1e9, ov = null, visiting = false, pending = null, raf = 0;
const frames = new Set();             // per-frame callbacks; one rAF loop drives everything
function loop(now) {
  raf = 0; const dt = Math.min(50, now - (loop.t || now)); loop.t = now;
  for (const f of [...frames]) f(dt);
  if (frames.size) raf = requestAnimationFrame(loop); else loop.t = 0;
}
function onFrame(f) { frames.add(f); if (!raf) raf = requestAnimationFrame(loop); return () => frames.delete(f); }
// Wait/tween on frame time, so everything pauses while the tab is hidden (rAF stops).
const wait = (ms, token) => new Promise(r => { let e = 0; const off = onFrame(dt => { e += dt; if (e >= ms || (token && token.cancel)) { off(); r(); } }); });
const tween = (ms, fn, ez = ease.out) => new Promise(r => { let e = 0; const off = onFrame(dt => { e += dt; const k = Math.min(1, e / ms); fn(ez(k)); if (k >= 1) { off(); r(); } }); });

function overlay() {
  if (!document.getElementById("wy-visits-css")) { const s = document.createElement("style"); s.id = "wy-visits-css"; s.textContent = CSS; document.head.appendChild(s); }
  if (!ov) { ov = document.createElement("div"); ov.className = "wy-visits"; ov.setAttribute("aria-hidden", "true"); document.body.appendChild(ov); }
  return ov;
}
function teardown() { if (ov && !visiting) { ov.remove(); ov = null; } }

export async function visit(opts = {}) {
  if (visiting || document.querySelector(".wy-intro-ov")) return;
  visiting = true; lastVisit = performance.now();
  const S = CFG.size, W = innerWidth, H = innerHeight;
  const edge = opts.edge || pick(["left", "right", "top", "bottom"]);
  const peek = opts.peek ?? Math.random() < CFG.peekChance;
  const el = document.createElement("div"); el.className = "wy-visit"; el.dataset.edge = edge; el.innerHTML = GUY; overlay().appendChild(el);
  const svg = el.querySelector("svg"), body = svg.querySelector(".g-body"), arm = svg.querySelector(".arm");
  const eyes = [...svg.querySelectorAll(".eye")], l1 = svg.querySelector(".l1"), l2 = svg.querySelector(".l2");
  // Anchor along the edge (integer px), facing inward. Top: hangs upside down. Right: mirrored.
  const along = Math.round(edge === "left" || edge === "right" ? R(0.15, 0.8) * (H - S) : R(0.12, 0.85) * (W - S));
  let base, flip;
  if (edge === "left") { el.style.left = "0px"; el.style.top = along + "px"; base = o => `translate3d(${-o}px,0,0)`; flip = ""; }
  if (edge === "right") { el.style.right = "0px"; el.style.top = along + "px"; base = o => `translate3d(${o}px,0,0)`; flip = " scaleX(-1)"; }
  if (edge === "top") { el.style.top = "0px"; el.style.left = along + "px"; base = o => `translate3d(0,${-o}px,0)`; flip = " rotate(180deg)"; }
  if (edge === "bottom") { el.style.bottom = "0px"; el.style.left = along + "px"; base = o => `translate3d(0,${o}px,0)`; flip = ""; }
  let bobY = 0;
  const set = o => { el.style.transform = base(Math.round(o)) + flip + (bobY ? ` translate3d(0,${bobY}px,0)` : ""); };
  const blink = async () => { eyes.forEach(e => e.setAttribute("height", "0.3")); await wait(110); eyes.forEach(e => e.setAttribute("height", "2")); };
  const look = async () => { for (const dx of [-3, 0]) { eyes[0].setAttribute("x", 8 + dx); eyes[1].setAttribute("x", 11 + dx); await wait(R(380, 650)); } };
  const wave = async () => { arm.style.display = ""; for (let i = 0; i < 4; i++) { arm.setAttribute("y", i % 2 ? 5 : 3); await wait(150); } arm.style.display = "none"; };
  const bob = async () => { for (let i = 0; i < 4; i++) { bobY = i % 2 ? 0 : -2; l1.setAttribute("y", i % 2 ? 11 : 10); l2.setAttribute("y", i % 2 ? 10 : 11); set(0); await wait(170); } bobY = 0; l1.setAttribute("y", 11); l2.setAttribute("y", 11); set(0); };
  const out = S + 8, hold = R(...CFG.hold);
  try {
    if (RM.matches) {
      set(0); el.style.opacity = 0; await tween(400, k => el.style.opacity = k); await wait(hold); await tween(400, k => el.style.opacity = 1 - k);
    } else {
      set(out);
      if (peek) {                                   // peek: show just the eyes, duck, then pop in
        const p = Math.round(S * 0.45);
        await tween(R(450, 700), k => set(out - (out - p) * k));
        await wait(R(500, 900)); await blink(); await wait(R(200, 400));
        await tween(220, k => set(p + (out - 10 - p) * k), ease.in); await wait(R(300, 700));
        await tween(R(450, 650), k => set((out - 10) * (1 - k)), ease.back);
      } else await tween(R(600, 900), k => set(out * (1 - k)), ease.back);
      const acts = [blink, look, wave, bob].sort(() => Math.random() - 0.5);
      let t = 0; for (const a of acts) { if (t > hold) break; const s = performance.now(); await a(); await wait(R(180, 420)); t += performance.now() - s; }
      await tween(R(450, 650), k => set(out * k), ease.in);
    }
  } finally { el.remove(); visiting = false; if (!active) teardown(); }
}

function schedule() {
  if (!active || pending || visiting) return;
  const now = performance.now();
  if (!ALWAYS && (now - lastVisit < CFG.cooldown || Math.random() >= CFG.chance)) return;
  const token = { cancel: false }; pending = token;
  wait(ALWAYS ? R(300, 800) : R(...CFG.delay), token).then(() => { if (pending === token) pending = null; if (!token.cancel && active) visit(); });
}
export function genStart() { active = true; schedule(); }
export function genEnd() { active = false; if (pending) { pending.cancel = true; pending = null; } if (!visiting) teardown(); }
export function initVisits() {
  addEventListener("wrenby:gen-start", genStart); addEventListener("wrenby:gen-end", genEnd);
  window.__wrenbyVisits = { visit, genStart, genEnd, cfg: CFG, state: () => ({ active, visiting, pending: !!pending, frames: frames.size, raf: !!raf, dom: !!document.querySelector(".wy-visits") }) };
}
