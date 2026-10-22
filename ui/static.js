// LarkquillAI page helpers (formerly the "digital static" pixel theme, removed 2026-10-21 at Mica's request).
// What stays: the inverted colour mode (wy.inv, background click when the sky theme is off), the sign-in dialog
// touches (mascot in the title, "check your spam" hint, digits-only code box). No canvas, no animation loop.
try { localStorage.removeItem("wy.static"); } catch {}           // old Pixel background / shimmer / chunky prefs
export const isInverted = () => inverted;
export function setInverted(v) { inverted = !!v; localStorage.setItem("wy.inv", inverted ? "1" : "0"); document.documentElement.classList.toggle("wy-inv", inverted); }
// Sky theme (sky.js) is the default look: always the light UI, no background-click inversion.
export const SKY = true;
let inverted = SKY || localStorage.getItem("wy.inv") === "1";

const CSS = `
body>main{position:relative;z-index:1}
html:root,html:root body{background:#000!important}
html.wy-inv:root,html.wy-inv:root body{background:#fff!important}
html.wy-inv body>main,html.wy-inv .wy-dialog,html.wy-inv .wy-settings,html.wy-inv .wy-menu,html.wy-inv #histbar{filter:invert(1) hue-rotate(180deg)}
html.wy-inv body>main img,html.wy-inv .wy-dialog img,html.wy-inv .wy-gbtn{filter:invert(1) hue-rotate(180deg)}
html.wy-auth body>main,html.wy-auth #histbar{visibility:hidden}
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
  if (initStatic.done) return; initStatic.done = true;
  const st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st);
  document.documentElement.classList.add("wy-app");
  document.documentElement.classList.toggle("wy-inv", inverted);
  document.getElementById("wy-static")?.remove();

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
  // Sign-in / verification dialog: mascot in the title, spam hint, digits-only code box. No auth.js changes needed.
  new MutationObserver(() => {
    const d = document.querySelector("dialog.wy-dialog[open]");
    document.documentElement.classList.toggle("wy-auth", !!d);
    if (d && !d.dataset.wyTouch) {
      d.dataset.wyTouch = "1";
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
