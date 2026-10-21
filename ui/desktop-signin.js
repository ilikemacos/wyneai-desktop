// Desktop sign-in through the system browser (Google, passkeys and everything else the website supports).
// Makes a random state, opens the web app with ?desktop_login=<state>, shows a confirmation code, and polls
// the server until the browser hands over a new session token for this app.
const T = window.__TAURI__; const API_BASE = "https://preset-ai-chat.vercel.app";
const LS = "wy.token";
const b64url = a => btoa(String.fromCharCode(...a)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function codeOf(state) { const h = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("code:" + state)));
  return [...h.slice(0, 3)].map(b => b.toString(16).padStart(2, "0")).join("").toUpperCase(); }
let active = null;
export async function desktopSignin() {
  if (active) return; const state = b64url(crypto.getRandomValues(new Uint8Array(32))); const code = await codeOf(state);
  const url = API_BASE + "/?desktop_login=" + state;
  const dlg = document.createElement("dialog"); dlg.className = "wy-dialog";
  dlg.innerHTML = `<div class="wy-dh">Sign in with your browser</div><div class="wy-db"><p>Your browser opened LarkquillAI. Sign in there (Google, passkey, password or email code), then confirm this code:</p><p style="font:600 26px ui-monospace,Menlo,monospace;letter-spacing:.2em;text-align:center;margin:12px 0">${code}</p><p class="ds-st" style="color:var(--muted);font-size:12px">Waiting for the browser…</p><div style="display:flex;gap:8px;justify-content:flex-end"><button class="ds-open">Open browser again</button><button class="ds-x">Cancel</button></div></div>`;
  document.body.appendChild(dlg); dlg.showModal();
  const open = () => T.core.invoke("open_target", { target: url }).catch(() => {}); open();
  let stop = false; active = true; const end = () => { stop = true; active = null; dlg.close(); dlg.remove(); };
  dlg.querySelector(".ds-open").onclick = open; dlg.querySelector(".ds-x").onclick = end; dlg.addEventListener("cancel", end);
  const t0 = Date.now();
  while (!stop && Date.now() - t0 < 5 * 60_000) {
    await new Promise(r => setTimeout(r, 2000)); if (stop) break;
    try { const r = await fetch(API_BASE + "/api/auth/me", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "claim", state }) });
      if (r.status === 200) { const j = await r.json(); if (j.token) { localStorage.setItem(LS, j.token); dlg.querySelector(".ds-st").textContent = "Signed in. Loading…"; setTimeout(() => location.reload(), 400); return; } }
    } catch {}
  }
  if (!stop) { dlg.querySelector(".ds-st").textContent = "Timed out. Close this and try again."; active = null; }
}
if (T?.core) window.__desktopSignin = desktopSignin;
