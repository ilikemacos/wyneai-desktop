// Sky backdrop: a soft three-stop gradient that follows the local time of day (dawn, day, golden hour, dusk,
// night), blended smoothly between keyframes and refreshed every few minutes. Also sets --sky-ink so text that
// sits straight on the sky (header, footer) stays readable after dark.
const K = [ // hour, top, middle, bottom (dusty blue overhead, warm haze at the horizon)
  [0,    "#141a33", "#262c55", "#43416c"],
  [5,    "#1f2a4d", "#4c4f7e", "#8a6f8f"],
  [6.5,  "#7c8fc4", "#c9a9bd", "#f1c3a0"],
  [8.5,  "#86a2d3", "#b8c5e6", "#eee2da"],
  [15.5, "#82a0d0", "#bcc4e2", "#f0dccb"],
  [18,   "#7d8bbd", "#c9a3a8", "#eeb38b"],
  [19.5, "#4e5f96", "#9180a6", "#e3a283"],
  [21,   "#22305a", "#3b4377", "#6b5a82"],
  [24,   "#141a33", "#262c55", "#43416c"],
];
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => { const x = hex(a), y = hex(b); return "rgb(" + x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(",") + ")"; };
const lum = c => { const [r, g, b] = c.match(/\d+/g).map(Number); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };
export function skyAt(date = new Date()) {
  const h = date.getHours() + date.getMinutes() / 60;
  let i = 0; while (i < K.length - 2 && h >= K[i + 1][0]) i++;
  const [h0, ...a] = K[i], [h1, ...b] = K[i + 1], t = Math.min(1, Math.max(0, (h - h0) / (h1 - h0)));
  return a.map((c, j) => mix(c, b[j], t));
}
function paint() {
  const [t, m, b] = skyAt(), r = document.documentElement.style;
  r.setProperty("--sky1", t); r.setProperty("--sky2", m); r.setProperty("--sky3", b);
  const dark = (lum(t) + lum(m)) / 2 < 0.45;
  r.setProperty("--sky-ink", dark ? "rgba(255,255,255,.92)" : "#1b1a24");
  r.setProperty("--sky-ink-soft", dark ? "rgba(255,255,255,.62)" : "rgba(27,26,36,.55)");
  document.documentElement.classList.toggle("wy-sky-night", dark);
}
let started = false;
export function startSky() {
  if (started) return; started = true;
  document.documentElement.classList.add("wy-sky", "wy-inv");
  paint(); setInterval(paint, 5 * 60 * 1000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) paint(); });
}
