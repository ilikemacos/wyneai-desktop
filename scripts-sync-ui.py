# Sync the web app (preset-ai-chat-web/public) into the desktop ui/ folder.
# Usage: python3 scripts-sync-ui.py <path to preset-ai-chat-web> <git rev of public at the last sync>
# index.html is 3-way merged (desktop-only lines kept); auth.js gets the desktop patches below.
import sys, os, shutil, subprocess
web, base = sys.argv[1], sys.argv[2]
pub, ui = os.path.join(web, "public"), os.path.join(os.path.dirname(os.path.abspath(__file__)), "ui")
KEEP = {"index.html", "auth.js", "desktop.js", "desktop-signin.js", "desktop-login.js"}
for root, dirs, files in os.walk(pub):
    dirs[:] = [d for d in dirs if d != "pyodide"]
    for f in files:
        rel = os.path.relpath(os.path.join(root, f), pub)
        if rel in KEEP: continue
        dst = os.path.join(ui, rel); os.makedirs(os.path.dirname(dst), exist_ok=True); shutil.copy2(os.path.join(root, f), dst)
def show(rev, path): return subprocess.run(["git", "-C", web, "show", f"{rev}:{path}"], capture_output=True, text=True, check=True).stdout
open("/tmp/ui-base.html", "w").write(show(base, "public/index.html"))
r = subprocess.run(["git", "merge-file", "-p", os.path.join(ui, "index.html"), "/tmp/ui-base.html", os.path.join(pub, "index.html")], capture_output=True, text=True)
s = r.stdout
if "<<<<<<<" in s:  # keep both sides of any conflict (desktop imports + new web imports)
    out = []; 
    for line in s.split("\n"):
        if line.startswith(("<<<<<<< ", "=======", ">>>>>>> ")) and (line.startswith("<<<<<<<") or line == "=======" or line.startswith(">>>>>>>")): continue
        out.append(line)
    s = "\n".join(out)
s = s.replace('import { initDesktopLogin } from "./desktop-login.js"; initDesktopLogin().catch(() => {});', 'import "./desktop-signin.js";')
open(os.path.join(ui, "index.html"), "w").write(s)
a = open(os.path.join(pub, "auth.js")).read()
def rep(old, new):
    global a
    assert old in a, old[:60]; a = a.replace(old, new, 1)
rep('const LS = "wy.token";', 'const LS = "wy.token";\nconst DESKTOP = !!window.__TAURI__?.core; // desktop app: no passkeys in the webview; Google/passkey go through the system browser')
rep('if (window.PublicKeyCredential) { const pk', 'if (!DESKTOP && window.PublicKeyCredential) { const pk')
rep('  mountGoogle(dlg, err);', '''  if (DESKTOP) { dlg.querySelector('[data-m="passkey"]')?.remove(); const gw = dlg.querySelector(".wy-google"); gw.hidden = false;
    gw.querySelector(".wy-gbtn").innerHTML = '<button type="button" class="wy-browser" style="width:100%;height:40px;border-radius:999px">Continue with Google in your browser</button>';
    gw.querySelector(".wy-browser").onclick = () => { dlg.close(); dlg.remove(); window.__desktopSignin?.(); };
  } else mountGoogle(dlg, err);''')
open(os.path.join(ui, "auth.js"), "w").write(a)
print("synced ui from", web, "(base", base + ")")
