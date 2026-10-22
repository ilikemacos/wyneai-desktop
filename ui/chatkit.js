// Stored model preferences may hold an old ID or name (larkquill-chirp-1.1, Chirp 1.1, quill-wren): map them to mode keys.
const wyMode = v => { const s = String(v || "").toLowerCase(); if (!s) return v; if (["spark", "turbo", "forge", "zenith"].includes(s)) return s; const n = s.replace(/^(larkquill|wrenby|quill)(ai)?[\s/-]+/, "").replace(/[\s-]*[\d.]+$/, ""); return ({ chirp: "spark", wren: "spark", trill: "turbo", scribe: "turbo", aria: "forge", sage: "forge", chorus: "zenith", sovereign: "zenith" })[n] || v; };
// LarkquillAI chat kit: shared composer + message UI for the Vercel app and the GitHub Pages copy.
//  - image attachments (button, paste, drag and drop) with client-side downscale (max side 1568px) + WebP/JPEG compression
//  - model pill (Quill Wren/Quill Scribe/Quill Sage/Quill Sovereign), persisted per user
//  - Stop button while streaming, Retry buttons, message actions (copy / regenerate / edit and resend)
//  - code blocks: language label + copy button + highlight.js (vendored in ./md/) with a light sky palette
// Styles live in sky.css (it is kept as the last stylesheet, so they win over older themes).
export const MODELS = [
  { id: "spark",  name: "Quill Wren 1.2",      hint: "Fastest · Hobby" },
  { id: "turbo",  name: "Quill Scribe 1.1",    hint: "Balanced · Hobby · default" },
  { id: "forge",  name: "Quill Sage 1.5",      hint: "Smarter · Pro" },
  { id: "zenith", name: "Quill Sovereign 0.5", hint: "Most capable · Max" },
];
export const QUOTA_TIERS = new Set([]);
// Plans (enforced server-side; this only paints locks): Hobby = Quill Wren + Quill Scribe, Pro adds Quill Sage, Max = every model.
export const MODE_PLAN = { spark: "hobby", turbo: "hobby", forge: "pro", zenith: "max" };
const PLAN_RANK = { hobby: 0, pro: 1, max: 2 }, PLAN_NAME = { hobby: "Hobby", pro: "Pro", max: "Max" };
export const UPGRADE_PAGE = "https://ilikemacos.github.io/larkquillai/plans.html";
export const planAllows = (plan, id) => !plan || (PLAN_RANK[MODE_PLAN[id] || "max"] ?? 2) <= (PLAN_RANK[plan] ?? 0);
export function openUpgrade(want, url) {
  const T = window.__TAURI__, base = url || (T?.core || !/^https?:$/.test(location.protocol) ? UPGRADE_PAGE : new URL("plans.html", location.href).href);
  const u = base + (want ? (base.includes("?") ? "&" : "?") + "want=" + want : "");
  if (T?.core) { (T.opener?.openUrl ? T.opener.openUrl(u) : T.core.invoke("plugin:opener|open_url", { url: u })).catch(() => window.open(u, "_blank", "noopener")); return; }
  window.open(u, "_blank", "noopener");
}
const PLAN_CSS = `.wy-pitem.wy-locked{opacity:.92}.wy-pitem.wy-locked .wy-pl b,.wy-pitem.wy-locked .wy-pl small{opacity:.55}
.wy-plock{display:inline-flex;align-items:center;gap:6px;flex:none}.wy-plock svg{opacity:.6}
.wy-pup{all:unset;cursor:pointer;font-size:11.5px;font-weight:600;padding:3px 10px;border-radius:999px;background:#1b1a24;color:#fff}.wy-pup:hover{opacity:.85}
.wy-pplan{font-size:11px;color:#6b6f80;padding:6px 12px 2px;display:flex;justify-content:space-between;gap:8px}.wy-pplan a{color:inherit}`;
export const modelName = id => (MODELS.find(m => m.id === id) || {}).name || id;
const MAX_IMAGES = 4, MAX_SIDE = 1568, TOTAL_CHARS = 3_900_000, PER_IMAGE_CHARS = 950_000;
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const svg = d => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICON = {
  clip: svg('<path d="M21.4 11.1l-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5"/>'),
  copy: svg('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>'),
  check: svg('<path d="M5 12l5 5L20 7"/>'),
  redo: svg('<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>'),
  edit: svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
  chev: svg('<path d="M6 9l6 6 6-6"/>'),
  lock: svg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
};

// ---------- images ----------
function loadImg(file) { return new Promise((res, rej) => { const u = URL.createObjectURL(file), i = new Image(); i.onload = () => { URL.revokeObjectURL(u); res(i); }; i.onerror = () => { URL.revokeObjectURL(u); rej(new Error("Couldn't read that image")); }; i.src = u; }); }
// Downscales to MAX_SIDE and compresses (WebP, else JPEG), stepping quality/size down until it fits the budget.
export async function shrinkImage(file, budget = PER_IMAGE_CHARS) {
  const img = await loadImg(file); let scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight)), url = "", w = 0, h = 0;
  for (let step = 0; step < 6; step++) {
    w = Math.max(1, Math.round(img.naturalWidth * scale)); h = Math.max(1, Math.round(img.naturalHeight * scale));
    const c = document.createElement("canvas"); c.width = w; c.height = h; const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, w, h); g.drawImage(img, 0, 0, w, h);
    const q = [0.85, 0.78, 0.7, 0.62, 0.55, 0.5][step];
    url = c.toDataURL("image/webp", q); if (!url.startsWith("data:image/webp")) url = c.toDataURL("image/jpeg", q);
    if (url.length <= budget) break; scale *= 0.82; }
  return { url, w, h, name: file.name || "image", chars: url.length };
}
export function renderImages(bub, images) {
  if (!images?.length) return; const g = el("div", "wy-imgs"); for (const im of images) { const a = el("a"); a.href = im.url; a.target = "_blank"; a.rel = "noopener"; a.title = im.name || "image";
    a.onclick = e => { e.preventDefault(); const w = window.open(); if (w) { w.document.title = im.name || "image"; const i = w.document.createElement("img"); i.src = im.url; i.style.maxWidth = "100%"; w.document.body.style.margin = "0"; w.document.body.append(i); } };
    const i = el("img"); i.src = im.url; i.alt = im.name || "attached image"; i.loading = "lazy"; a.append(i); g.append(a); }
  bub.prepend(g);
}
// OpenAI content parts for a user turn.
export const contentFor = (text, images) => images?.length ? [{ type: "text", text: String(text || "") }, ...images.map(i => ({ type: "image_url", image_url: { url: i.url } }))] : String(text || "");

// ---------- code blocks ----------
const LANGS = { js: "JavaScript", javascript: "JavaScript", ts: "TypeScript", typescript: "TypeScript", py: "Python", python: "Python", sh: "Bash", bash: "Bash", shell: "Shell", json: "JSON", html: "HTML", xml: "HTML", css: "CSS", md: "Markdown", markdown: "Markdown", yaml: "YAML", yml: "YAML", sql: "SQL", rust: "Rust", go: "Go", java: "Java", c: "C", cpp: "C++", csharp: "C#", cs: "C#", ruby: "Ruby", php: "PHP", jsx: "JSX", tsx: "TSX", kotlin: "Kotlin", swift: "Swift", plaintext: "Text", text: "Text" };
export function enhanceCode(root) {
  root.querySelectorAll("pre > code").forEach(code => { const pre = code.parentElement; if (pre.dataset.ck) return; pre.dataset.ck = "1"; if (pre.closest(".fcard, .fpreview, #vcode")) return;
    let lang = (code.className.match(/language-([\w+#-]+)/) || [])[1];
    if (window.hljs && !code.classList.contains("hljs")) { try { if (lang && hljs.getLanguage(lang)) hljs.highlightElement(code); else { const r = hljs.highlightAuto(code.textContent); code.innerHTML = r.value; code.classList.add("hljs"); lang ||= r.language; } } catch {} }
    else if (!lang) lang = (code.className.match(/language-([\w+#-]+)/) || [])[1];
    const head = el("div", "wy-cbhead"); head.append(el("span", "wy-lang", LANGS[(lang || "").toLowerCase()] || (lang ? lang : "Code")));
    pre.querySelectorAll(":scope > .codecopy").forEach(b => b.remove());
    const cp = el("button", "wy-codecopy"); cp.type = "button"; cp.innerHTML = ICON.copy + "<span>Copy</span>";
    cp.onclick = async () => { try { await navigator.clipboard.writeText(code.textContent); cp.innerHTML = ICON.check + "<span>Copied</span>"; } catch { cp.lastChild.textContent = "Failed"; } setTimeout(() => cp.innerHTML = ICON.copy + "<span>Copy</span>", 1400); };
    head.append(cp); pre.classList.add("wy-code"); pre.prepend(head); });
}

// ---------- the kit ----------
export function initChatKit(o) {
  const form = o.form, q = o.input, send = o.send, sel = o.tierSelect, log = o.log;
  const st = { images: [], busy: false, abort: null, user: null, quota: null, signedIn: false, plan: null, tier: sel?.value || "forge" };
  if (!document.getElementById("wy-plan-css")) { const c = el("style"); c.id = "wy-plan-css"; c.textContent = PLAN_CSS; document.head.append(c); }
  // --- model pill ---
  for (const m of MODELS) if (sel && !sel.querySelector(`option[value="${m.id}"]`)) { const op = el("option", "", m.name); op.value = m.id; sel.append(op); }
  const pill = el("button", "wy-pill"); pill.type = "button"; pill.setAttribute("aria-haspopup", "listbox"); pill.title = "Choose a model";
  const menu = el("div", "wy-pillmenu"); menu.hidden = true; menu.setAttribute("role", "listbox");
  const leftText = id => { const s = st.quota?.[id]; if (!st.signedIn) return "Sign in to use"; if (!s) return ""; if (s.available === false) return "Unavailable"; return s.left > 0 ? `${s.left} left today` : "Resets tomorrow"; };
  const paintPill = () => { pill.innerHTML = ""; pill.append(el("span", "wy-pname", modelName(st.tier))); if (QUOTA_TIERS.has(st.tier) && st.signedIn && st.quota?.[st.tier]) pill.append(el("span", "wy-pleft", leftText(st.tier))); pill.insertAdjacentHTML("beforeend", ICON.chev); };
  const paintMenu = () => { menu.innerHTML = ""; for (const m of MODELS) { const lk = !planAllows(st.plan, m.id); const it = el("button", "wy-pitem" + (m.id === st.tier ? " on" : "") + (lk ? " wy-locked" : "")); it.type = "button"; it.setAttribute("role", "option"); it.setAttribute("aria-selected", m.id === st.tier); it.dataset.id = m.id;
      const l = el("span", "wy-pl"); l.append(el("b", "", m.name), el("small", "", m.hint)); it.append(l); if (m.quota) it.append(el("span", "wy-pq" + (st.quota?.[m.id]?.left === 0 ? " out" : ""), leftText(m.id)));
      if (lk) { const need = MODE_PLAN[m.id]; it.title = `${m.name} needs LarkquillAI ${PLAN_NAME[need]}`; it.setAttribute("aria-disabled", "true");
        const w = el("span", "wy-plock"); w.innerHTML = ICON.lock; const up = el("span", "wy-pup", "Upgrade"); up.setAttribute("role", "button"); up.title = `Upgrade to ${PLAN_NAME[need]}`; w.append(up); it.append(w); }
      it.onclick = () => { if (lk) { closeMenu(); openUpgrade(MODE_PLAN[m.id], o.upgradeUrl); return; } setTier(m.id, true); closeMenu(); q?.focus(); }; menu.append(it); }
    if (st.plan) { const f = el("div", "wy-pplan"); f.append(el("span", "", "Plan: " + PLAN_NAME[st.plan]));
      if (st.plan !== "max") { const a = el("a", "", "See plans"); a.href = "#"; a.onclick = e => { e.preventDefault(); closeMenu(); openUpgrade(null, o.upgradeUrl); }; f.append(a); } menu.append(f); } };
  const closeMenu = () => { menu.hidden = true; pill.setAttribute("aria-expanded", "false"); };
  pill.onclick = e => { e.stopPropagation(); if (menu.hidden) { paintMenu(); menu.hidden = false; pill.setAttribute("aria-expanded", "true"); refreshQuota(); refreshPlan(); } else closeMenu(); };
  document.addEventListener("click", e => { if (!menu.hidden && !menu.contains(e.target)) closeMenu(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !menu.hidden) closeMenu(); });
  const prefKey = () => "wy.model" + (st.user ? ":" + st.user : "");
  const bestAllowed = () => [...MODELS].reverse().find(m => planAllows(st.plan, m.id) && m.id !== "zenith")?.id || "spark";
  function setTier(id, persist) { if (!MODELS.some(m => m.id === id)) return; if (!planAllows(st.plan, id)) { if (persist) return openUpgrade(MODE_PLAN[id], o.upgradeUrl); id = bestAllowed(); } st.tier = id; if (sel) { sel.value = id; sel.dispatchEvent(new Event("change")); } if (persist) { localStorage.setItem(prefKey(), id); localStorage.setItem("wy.model", id); } paintPill(); paintTray(); }
  const wrap = el("div", "wy-pillwrap"); wrap.append(pill, menu);
  // --- attachments ---
  const tray = el("div", "wy-tray"); tray.hidden = true;
  const file = el("input"); file.type = "file"; file.accept = "image/png,image/jpeg,image/webp,image/*"; file.multiple = true; file.hidden = true;
  const clip = el("button", "wy-attach"); clip.type = "button"; clip.title = "Attach images (or paste / drop them)"; clip.setAttribute("aria-label", "Attach images"); clip.innerHTML = ICON.clip;
  clip.onclick = () => file.click(); file.onchange = () => { addFiles([...file.files]); file.value = ""; };
  const note = (t, bad) => { let n = tray.querySelector(".wy-traynote"); if (!n) { n = el("div", "wy-traynote"); tray.append(n); } n.textContent = t || ""; n.classList.toggle("bad", !!bad); n.hidden = !t; };
  function paintTray() {
    tray.querySelectorAll(".wy-chip").forEach(c => c.remove()); tray.hidden = !st.images.length;
    st.images.forEach((im, i) => { const c = el("div", "wy-chip"); const img = el("img"); img.src = im.url; img.alt = im.name; const x = el("button", "wy-chipx", "×"); x.type = "button"; x.title = "Remove " + im.name; x.setAttribute("aria-label", "Remove image");
      x.onclick = () => { st.images.splice(i, 1); paintTray(); }; c.append(img, x); tray.insertBefore(c, tray.querySelector(".wy-traynote")); });
    if (!st.images.length) return note("");
    note("Images are read by the vision model.");
  }
  async function addFiles(files) {
    const imgs = files.filter(f => /^image\//.test(f.type)); if (!imgs.length) return;
    for (const f of imgs) { if (st.images.length >= MAX_IMAGES) { note(`Up to ${MAX_IMAGES} images per message.`, true); break; }
      try { const used = st.images.reduce((s, i) => s + i.chars, 0); const im = await shrinkImage(f, Math.min(PER_IMAGE_CHARS, TOTAL_CHARS - used));
        if (used + im.chars > TOTAL_CHARS) { note("That's too much image data for one message (about 4 MB). Remove one first.", true); break; }
        st.images.push(im); paintTray(); } catch (e) { note(e.message || "Couldn't read that image.", true); } }
  }
  q?.addEventListener("paste", e => { const fs = [...(e.clipboardData?.files || [])].filter(f => /^image\//.test(f.type)); if (fs.length) { e.preventDefault(); addFiles(fs); } });
  const dropZone = o.dropZone || form; let dragN = 0;
  dropZone.addEventListener("dragenter", e => { if ([...(e.dataTransfer?.types || [])].includes("Files")) { dragN++; form.classList.add("wy-drop"); } });
  dropZone.addEventListener("dragleave", () => { if (--dragN <= 0) { dragN = 0; form.classList.remove("wy-drop"); } });
  dropZone.addEventListener("dragover", e => { if ([...(e.dataTransfer?.types || [])].includes("Files")) e.preventDefault(); });
  dropZone.addEventListener("drop", e => { if (!e.dataTransfer?.files?.length) return; e.preventDefault(); dragN = 0; form.classList.remove("wy-drop"); addFiles([...e.dataTransfer.files]); });
  // --- stop ---
  const stop = el("button", "wy-stop"); stop.type = "button"; stop.id = "stop"; stop.title = "Stop"; stop.setAttribute("aria-label", "Stop generating"); stop.textContent = "Stop"; stop.hidden = true;
  stop.onclick = () => { try { st.abort?.(); } catch {} };
  // mount: tray on its own row above, then [clip][input][pill][...][send/stop]
  form.classList.add("wy-ck"); form.prepend(tray); q.before(clip); form.append(file);
  if (sel) { sel.classList.add("wy-hidden-select"); (sel.parentElement === form ? sel : q).after(wrap); } else q.after(wrap);
  send.after(stop);
  // --- message actions ---
  const textOfMsg = m => m._raw ?? (m.querySelector(".bub .md:last-child") || m.querySelector(".bub"))?.innerText?.trim() ?? "";
  function addActions(m) {
    if (m._acts || !m.classList.contains("msg") || m.classList.contains("wy-noacts")) return; m._acts = true;
    const a = el("div", "wy-acts"); const isU = m.classList.contains("u");
    const mk = (icon, label, fn) => { const b = el("button", "wy-act"); b.type = "button"; b.title = label; b.setAttribute("aria-label", label); b.innerHTML = icon; b.onclick = e => { e.stopPropagation(); fn(b); }; a.append(b); return b; };
    mk(ICON.copy, "Copy", async b => { try { await navigator.clipboard.writeText(textOfMsg(m)); b.innerHTML = ICON.check; setTimeout(() => b.innerHTML = ICON.copy, 1200); } catch {} });
    if (isU && o.onEdit) mk(ICON.edit, "Edit and resend", () => startEdit(m));
    if (!isU && o.onRegenerate) mk(ICON.redo, "Regenerate", () => { if (!st.busy) o.onRegenerate(m); }).classList.add("wy-regen");
    m.append(a); m.addEventListener("click", e => { if (e.target.closest("a,button,summary,pre,img")) return; if (matchMedia("(hover: none)").matches) { document.querySelectorAll(".msg.wy-show").forEach(x => x !== m && x.classList.remove("wy-show")); m.classList.toggle("wy-show"); } });
  }
  function startEdit(m) {
    if (st.busy || m.classList.contains("wy-editing")) return; const bub = m.querySelector(".bub"); const old = textOfMsg(m);
    m.classList.add("wy-editing"); const box = el("div", "wy-edit"); const ta = el("textarea"); ta.value = old; ta.rows = Math.min(10, Math.max(2, old.split("\n").length));
    const row = el("div", "wy-editrow"), cancel = el("button", "", "Cancel"), save = el("button", "wy-primary", "Send"); cancel.type = save.type = "button"; row.append(cancel, save); box.append(ta, row);
    bub.hidden = true; m.querySelector(".wy-acts").hidden = true; m.append(box); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
    const done = () => { box.remove(); bub.hidden = false; m.querySelector(".wy-acts").hidden = false; m.classList.remove("wy-editing"); };
    cancel.onclick = done; save.onclick = () => { const t = ta.value.trim(); if (!t) return; done(); o.onEdit(m, t); };
    ta.onkeydown = e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); save.click(); } else if (e.key === "Escape") done(); };
  }
  const markLast = () => { const as = [...log.querySelectorAll(".msg.a")]; as.forEach((m, i) => m.classList.toggle("wy-last", i === as.length - 1)); };
  new MutationObserver(muts => { for (const mu of muts) for (const n of mu.addedNodes) if (n.nodeType === 1 && n.classList.contains("msg")) addActions(n); markLast(); }).observe(log, { childList: true });
  log.querySelectorAll(".msg").forEach(addActions); markLast();
  // --- quota ---
  async function refreshQuota() {
    try { const tok = localStorage.getItem("wy.token"); const r = await fetch(o.apiBase + "/api/chat?_r=models", { headers: tok ? { authorization: "Bearer " + tok } : {}, credentials: "include" });
      if (!r.ok) return; const j = await r.json(); st.quota = j.models; st.signedIn = !!j.signedIn; paintPill(); if (!menu.hidden) paintMenu(); paintTray(); } catch {} }
  // --- plan (Hobby when signed out); a locked current model switches to the best allowed one ---
  async function refreshPlan() {
    try { const tok = localStorage.getItem("wy.token"); const r = await fetch(o.apiBase + "/api/billing?action=plan", { headers: tok ? { authorization: "Bearer " + tok } : {}, credentials: "include" });
      const p = r.status === 401 ? "hobby" : r.ok ? (await r.json()).plan : null; if (!p || !PLAN_RANK.hasOwnProperty(p)) return;
      st.plan = p; if (!planAllows(p, st.tier)) setTier(bestAllowed(), false); paintPill(); if (!menu.hidden) paintMenu(); o.onPlan?.(p); } catch {} }
  const saved = wyMode(localStorage.getItem("wy.model")) || (sel && sel.value) || "forge"; setTier(MODELS.some(m => m.id === saved) ? saved : "forge", false); refreshQuota(); refreshPlan();
  return {
    get tier() { return st.tier; }, get plan() { return st.plan; }, refreshPlan, get images() { return st.images; }, get signedIn() { return st.signedIn; }, isQuotaTier: id => QUOTA_TIERS.has(id ?? st.tier),
    takeImages() { const a = st.images; st.images = []; paintTray(); return a; },
    setUser(id) { st.user = id || null; const v = id && localStorage.getItem(prefKey()); if (v && MODELS.some(m => m.id === v)) setTier(v, false); refreshQuota(); refreshPlan(); },
    setQuota(model, left) { st.quota ||= {}; st.quota[model] = { ...(st.quota[model] || {}), left }; paintPill(); paintTray(); },
    refreshQuota, setTier,
    setBusy(on, abort) { st.busy = on; st.abort = on ? abort : null; send.hidden = on; stop.hidden = !on; form.classList.toggle("wy-busy", on); if (!on) refreshQuota(); },
    retryButton(host, label, fn) { const b = el("button", "wy-retry"); b.type = "button"; b.innerHTML = ICON.redo + "<span>" + (label || "Retry") + "</span>"; b.onclick = () => { if (st.busy) return; b.remove(); fn(); }; host.append(b); return b; },
    renderImages, enhanceCode, contentFor,
  };
}
