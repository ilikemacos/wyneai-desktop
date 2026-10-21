// LarkquillAI "digital static" theme: white 7px squares on an 8px grid, pushed in from both edges.
// One canvas, requestAnimationFrame, paused when hidden. Click the background to invert.
// Configure via window.WRENBY_STATIC = { cell: 8, gap: 1, shimmer: 0.01, period: 15000, min: 0.05, max: 0.40 } before load.
const CFG = Object.assign({ cell: 8, gap: 1, shimmer: 0.01, period: 15000, min: 0.05, max: 0.40, curve: 1.6 }, window.WRENBY_STATIC || {});
// User preferences from Settings (wy.static = { shimmer: bool, chunky: bool }).
const PREF_DEFAULT = { on: true, shimmer: true, chunky: false };
export const staticPrefs = () => { try { return Object.assign({}, PREF_DEFAULT, JSON.parse(localStorage.getItem("wy.static") || "{}")); } catch { return { ...PREF_DEFAULT }; } };
const BASE = { cell: CFG.cell, shimmer: CFG.shimmer };
const applyPrefs = p => { document.documentElement.classList.toggle("wy-static-off", p.on === false); CFG.cell = p.chunky ? BASE.cell * 2 : BASE.cell; CFG.gap = p.chunky ? 2 : 1; CFG.shimmer = p.shimmer ? BASE.shimmer : 0; };
applyPrefs(staticPrefs());
let hooks = null;
export function setStaticPrefs(p) { const n = Object.assign(staticPrefs(), p); localStorage.setItem("wy.static", JSON.stringify(n)); applyPrefs(n); hooks?.resize(); return n; }
export const isInverted = () => inverted;
export function setInverted(v) { inverted = !!v; localStorage.setItem("wy.inv", inverted ? "1" : "0"); document.documentElement.classList.toggle("wy-inv", inverted); }
const RM = matchMedia("(prefers-reduced-motion: reduce)");
// Sky theme (sky.js) is the default look: always the light UI, no background-click inversion.
export const SKY = true;
let inverted = SKY || localStorage.getItem("wy.inv") === "1";

const CSS = `
#wy-static{position:fixed;inset:0;width:100vw;height:100vh;z-index:0;pointer-events:none;image-rendering:pixelated;image-rendering:crisp-edges}
body>main{position:relative;z-index:1}
html.wy-app #wy-static{opacity:.32}
html:root,html:root body{background:#000!important}
html.wy-inv:root,html.wy-inv:root body{background:#fff!important}
html.wy-inv body>main,html.wy-inv .wy-dialog,html.wy-inv .wy-settings,html.wy-inv .wy-menu,html.wy-inv #histbar{filter:invert(1) hue-rotate(180deg)}
html.wy-inv body>main img,html.wy-inv .wy-dialog img,html.wy-inv .wy-gbtn{filter:invert(1) hue-rotate(180deg)}
html.wy-auth body>main,html.wy-auth #histbar{visibility:hidden}
html.wy-auth #wy-static{opacity:1}
html.wy-static-off:not(.wy-auth):not(.wy-intro) #wy-static{display:none}
.wy-dialog::backdrop{background:transparent!important}
.wy-dialog{background:#000!important;border:1px solid #2a2a2a!important;box-shadow:0 0 0 8px #000,0 20px 60px rgba(0,0,0,.8);border-radius:10px!important}
.wy-dialog .wy-spam{display:none;font-size:11px;color:#8f8f8f;margin:-6px 0 12px}
.wy-dialog:has(.wy-code-in:not([hidden])) .wy-spam{display:block}
.wy-dialog .wy-dh{display:flex;align-items:center;gap:10px}
.wy-dialog .wy-dh .wy-mascot{width:22px;height:22px}
.wy-dialog .wy-code-in{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:22px;letter-spacing:.5em;text-align:center;height:52px}
.wy-dialog .wy-code-in::placeholder{letter-spacing:normal;font-size:15px}
.wy-dialog .primary{background:#fff!important;color:#000!important}.wy-dialog .primary:hover{background:#d9d9d9!important}
`;

export function initStatic() {
  if (document.getElementById("wy-static")) return;
  const st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st);
  const cv = document.createElement("canvas"); cv.id = "wy-static"; cv.setAttribute("aria-hidden", "true");
  document.body.prepend(cv);
  const ctx = cv.getContext("2d", { alpha: false });
  let cols = 0, rows = 0, thr = null, dpr = 1, px = 8, sq = 7, raf = 0, t0 = performance.now(), paused = 0;
  document.documentElement.classList.add("wy-app");
  document.documentElement.classList.toggle("wy-inv", inverted);

  function resize() {
    dpr = Math.max(1, Math.round(window.devicePixelRatio || 1));
    const w = innerWidth, h = innerHeight;
    cols = Math.ceil(w / CFG.cell); rows = Math.ceil(h / CFG.cell);
    px = CFG.cell * dpr; sq = Math.max(1, (CFG.cell - CFG.gap) * dpr);
    cv.width = cols * px; cv.height = rows * px;
    cv.style.width = cols * CFG.cell + "px"; cv.style.height = rows * CFG.cell + "px";
    ctx.imageSmoothingEnabled = false;
    thr = new Float32Array(cols * rows); for (let i = 0; i < thr.length; i++) thr[i] = Math.random();
  }
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const reduced = RM.matches, period = reduced ? CFG.period * 3 : CFG.period;
    const ph = ((now - t0) % period) / period;
    const s = 0.5 - 0.5 * Math.cos(ph * 2 * Math.PI);               // 0..1..0 swell
    const H = document.documentElement.classList, full = H.contains("wy-auth") || H.contains("wy-intro");
    if (H.contains("wy-static-off") && !full) return;                // Settings → Pixel background off (paused)
    // App (calm): band 3–18% per side, max ~55% fill, never inside the ~860px reading column.
    const mn = full ? CFG.min : 0.03, mx = full ? CFG.max : 0.18, peak = full ? 0.98 : 0.55, curve = full ? CFG.curve : 2.4;
    let band = mn + (mx - mn) * s;                                   // fraction of width per side
    if (!reduced && CFG.shimmer > 0) { const n = Math.round(thr.length * CFG.shimmer); for (let k = 0; k < n; k++) thr[(Math.random() * thr.length) | 0] = Math.random(); }
    ctx.fillStyle = inverted ? "#fff" : "#000"; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = inverted ? "#000" : "#fff";
    let bandCols = Math.max(1, band * cols);
    if (!full) bandCols = Math.max(2, Math.min(bandCols, (cols - 860 / CFG.cell) / 2));
    const half = cols / 2;
    for (let x = 0; x < cols; x++) {
      const d = Math.min(x + 0.5, cols - x - 0.5);                   // distance from nearest edge, in cells (mirrored)
      if (d > bandCols || d > half) continue;
      const u = d / bandCols;                                        // 0 at edge, 1 at band's inner limit
      const p = peak * (1 - Math.pow(u, curve));                 // curved falloff: drops faster near the middle
      const X = x * px;
      for (let y = 0, i = x; y < rows; y++, i += cols) if (thr[i] < p) ctx.fillRect(X, y * px, sq, sq);
    }
  }
  function start() { if (!raf) { if (paused) t0 += performance.now() - paused, paused = 0; raf = requestAnimationFrame(frame); } }
  function stop() { if (raf) cancelAnimationFrame(raf), raf = 0, paused = performance.now(); }
  let rt; addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(resize, 100); });
  document.addEventListener("visibilitychange", () => document.hidden ? stop() : start());
  resize(); start(); hooks = { resize };

  const invert = () => { if (!SKY) setInverted(!inverted); };
  // Background clicks only: empty page area, or outside the sign-in panel.
  document.addEventListener("click", e => {
    const t = e.target;
    if (getSelection && String(getSelection())) return;
    if (t.classList && t.classList.contains("wy-dialog")) {
      const r = t.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) invert();
      return;
    }
    if (t === document.body || t === document.documentElement || (t.id === "log" && !document.documentElement.classList.contains("wy-auth"))) invert();
  });
  // Sign-in / verification dialog: full-screen static behind a centred panel. No auth.js changes needed.
  new MutationObserver(() => {
    const d = document.querySelector("dialog.wy-dialog[open]");
    document.documentElement.classList.toggle("wy-auth", !!d);
    if (d && !d.dataset.wyStatic) {
      d.dataset.wyStatic = "1";
      const h = d.querySelector(".wy-dh");
      if (h && !h.querySelector(".wy-mascot")) { const m = new Image(); m.src = "favicon.svg"; m.alt = ""; m.className = "wy-mascot"; h.prepend(m); }
      const hint = d.querySelector(".wy-hint");
      if (hint && !d.querySelector(".wy-spam")) { const sp = document.createElement("div"); sp.className = "wy-spam"; sp.textContent = "Check your spam folder too."; hint.after(sp); }
      const ci = d.querySelector(".wy-code-in");
      if (ci) { ci.removeAttribute("maxlength"); ci.addEventListener("input", () => { const v = ci.value.replace(/\D/g, "").slice(0, 6); if (v !== ci.value) ci.value = v; }); }
      // stop the dialog's own backdrop click from closing nothing; keep cancel/escape behaviour intact
    }
  }).observe(document.body, { childList: true, subtree: false, attributes: true, attributeFilter: ["open"] });
}
initStatic.config = CFG;
