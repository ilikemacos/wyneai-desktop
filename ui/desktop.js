// WrenbyAI Desktop: local agent tools (shell, files, apps, memory, plan) with confirmations + working-folder sandbox.
import { registerTools } from "./agent.js";
const T = window.__TAURI__; export const isDesktop = !!T?.core;
const invoke = (cmd, args) => T.core.invoke(cmd, args);

// ---------- settings (localStorage) + session approvals ----------
export const settings = { workspace: localStorage.getItem("wy.workspace") || "", sandbox: localStorage.getItem("wy.sandbox") !== "off" };
export function saveSettings() { localStorage.setItem("wy.workspace", settings.workspace); localStorage.setItem("wy.sandbox", settings.sandbox ? "on" : "off"); }
export async function initDesktop() { if (!settings.workspace) { settings.workspace = await invoke("default_workspace"); saveSettings(); } }
const sessionAllow = new Set(); export const resetSessionAllow = () => sessionAllow.clear();

// confirm(kind, title, detail) -> Promise<boolean>. UI supplies the dialog.
let confirmUI = async () => false; export const setConfirmUI = f => { confirmUI = f; };
let planUI = () => {}; export const setPlanUI = f => { planUI = f; };
async function ask(kind, title, detail) { if (sessionAllow.has(kind)) return true;
  const r = await confirmUI({ kind, title, detail }); if (r?.session) sessionAllow.add(kind); return !!r?.ok; }
const ctx = () => ({ root: settings.workspace, sandbox: settings.sandbox });
const safeName = n => (String(n || "file").split(/[\\/]/).pop().replace(/[^\w.\- ]/g, "").trim().slice(0, 80)) || "file";
const denied = { ok: false, error: "The user declined this action. Don't retry it; ask what they'd like instead." };
const wrap = f => async a => { try { return await f(a || {}); } catch (e) { return { ok: false, error: String(e?.message || e) }; } };

// ---------- memory (local JSON in the app data folder) ----------
let mem = null; const memory = async () => (mem ||= await invoke("memory_load").then(v => Array.isArray(v?.facts) ? v : { facts: [] }).catch(() => ({ facts: [] })));
const memSave = () => invoke("memory_save", { data: mem });
export async function memoryPrompt() { const m = await memory(); if (!m.facts.length) return "";
  return "Persistent memory (facts you saved earlier about the user and their setup; use them, keep them current):\n" + m.facts.slice(-60).map(f => `- [${f.id}] ${f.text}`).join("\n"); }
let memCache = ""; export const refreshMemoryPrompt = async () => { memCache = await memoryPrompt(); };

export function desktopPrompt() {
  return `You are running in the WrenbyAI desktop app on the user's ${navigator.userAgent.includes("Windows") ? "Windows" : navigator.userAgent.includes("Mac") ? "macOS" : "computer"}, as an agent that can act on their PC. Working folder: ${settings.workspace} (relative paths resolve there${settings.sandbox ? "; file tools are sandboxed to it" : ""}).
Desktop tools: run_shell (${navigator.userAgent.includes("Windows") ? "Windows cmd.exe; use powershell -Command \"...\" for PowerShell" : "sh"}), read_file, write_file (edit an existing or new file), create_file (save a new file, or several as separate files, into the working folder for the user to open), list_dir, delete_path, open_app (apps, URLs, files), remember / recall / forget (persistent memory), update_plan. When the user asks for a file, script, document or code to keep, use create_file.
How to work: for any task needing more than 2 steps, first call update_plan with short steps, then work through them, calling update_plan again to mark progress. Inspect before changing (list_dir/read_file before write_file). Prefer small, safe, reversible commands; never run destructive commands (format, rm -rf on broad paths, registry edits) unless the user explicitly asked. The user approves every shell command, write, delete and launch in a dialog; if they decline, don't retry, ask instead. Use remember for durable facts about the user (GPU, games, preferences, projects), not for one-off details. Summarize what you did at the end, briefly.
${memCache}`; }

// ---------- tool definitions ----------
const S = { type: "string" };
const DEFS = [
  { name: "run_shell", description: "Run a shell command on the user's computer in the working folder and get stdout/stderr/exit code. Needs user approval.", props: { command: S, timeout_seconds: { type: "number", description: "default 60, max 600" } }, required: ["command"] },
  { name: "read_file", description: "Read a text file (relative to the working folder or absolute). Returns up to 200 KB.", props: { path: S } },
  { name: "write_file", description: "Create or overwrite a text file (or append). Needs user approval.", props: { path: S, content: S, append: { type: "boolean" } }, required: ["path", "content"] },
  { name: "list_dir", description: "List a folder's entries (name, dir/file, size). Defaults to the working folder.", props: { path: S }, required: [] },
  { name: "delete_path", description: "Delete a file or folder (folders recursively). Needs user approval.", props: { path: S } },
  { name: "open_app", description: "Open an app by name (e.g. 'Notepad', 'Safari', 'FrameFX'), a URL, or a file/folder with its default app. Needs user approval.", props: { target: S } },
  { name: "remember", description: "Save a durable fact to persistent memory (kept across chats and restarts).", props: { fact: S } },
  { name: "recall", description: "Search persistent memory; empty query lists everything.", props: { query: S }, required: [] },
  { name: "forget", description: "Delete a memory fact by its id.", props: { id: S } },
  { name: "update_plan", description: "Show/update your step-by-step plan for the current task. status per step: todo, doing, done.", props: { steps: { type: "array", items: { type: "object", properties: { step: S, status: { type: "string", enum: ["todo", "doing", "done"] } }, required: ["step"] } } } },
];
const clip = (s, n) => (s = String(s ?? ""), s.length > n ? s.slice(0, n) + `\n…(${s.length - n} more chars)` : s);
export function desktopTools() { return {
  run_shell: wrap(async a => { const cmd = String(a.command || ""); if (!cmd.trim()) return { ok: false, error: "empty command" };
    if (!await ask("shell", "Run this command?", `In: ${settings.workspace}\n\n${cmd}`)) return denied;
    const r = await invoke("run_shell", { command: cmd, cwd: settings.workspace, timeoutSecs: Math.min(600, Math.max(1, Number(a.timeout_seconds) || 60)) });
    return { ok: r.code === 0 && !r.timed_out, exit_code: r.code, timed_out: r.timed_out, stdout: clip(r.stdout, 12000), stderr: clip(r.stderr, 4000) }; }),
  read_file: wrap(async a => ({ ok: true, ...(await invoke("read_file", { path: String(a.path || ""), ...ctx() })) })),
  write_file: wrap(async a => { const c = String(a.content ?? "");
    if (!await ask("write", (a.append ? "Append to" : "Write") + " this file?", `${a.path}\n(${c.length} chars)\n\n${clip(c, 1500)}`)) return denied;
    return { ok: true, ...(await invoke("write_file", { path: String(a.path || ""), content: c, append: !!a.append, ...ctx() })) }; }),
  list_dir: wrap(async a => ({ ok: true, ...(await invoke("list_dir", { path: String(a.path || "."), ...ctx() })) })),
  delete_path: wrap(async a => { if (!await ask("delete", "Delete this?", String(a.path || "") + "\n\nFolders are deleted with everything inside. This can't be undone.")) return denied;
    return { ok: true, ...(await invoke("delete_path", { path: String(a.path || ""), ...ctx() })) }; }),
  open_app: wrap(async a => { if (!await ask("open", "Open this?", String(a.target || ""))) return denied;
    return { ok: true, ...(await invoke("open_target", { target: String(a.target || "") })) }; }),
  remember: wrap(async a => { const m = await memory(); const f = { id: Math.random().toString(36).slice(2, 8), text: clip(String(a.fact || "").trim(), 500), at: new Date().toISOString() };
    if (!f.text) return { ok: false, error: "empty fact" }; m.facts.push(f); if (m.facts.length > 500) m.facts.shift(); await memSave(); await refreshMemoryPrompt(); return { ok: true, saved: f }; }),
  recall: wrap(async a => { const m = await memory(); const q = String(a.query || "").toLowerCase().split(/\W+/).filter(Boolean);
    const hits = q.length ? m.facts.filter(f => q.some(w => f.text.toLowerCase().includes(w))) : m.facts; return { ok: true, facts: hits.slice(-100) }; }),
  forget: wrap(async a => { const m = await memory(); const n = m.facts.length; m.facts = m.facts.filter(f => f.id !== String(a.id)); if (m.facts.length === n) return { ok: false, error: "no fact with that id" };
    await memSave(); await refreshMemoryPrompt(); return { ok: true }; }),
  update_plan: wrap(async a => { const steps = (Array.isArray(a.steps) ? a.steps : []).slice(0, 30).map(s => ({ step: String(s?.step ?? s), status: s?.status || "todo" })); planUI(steps); return { ok: true, steps: steps.length }; }),
  create_file: wrap(async a => {
    let items = Array.isArray(a.files) && a.files.length ? a.files : [{ filename: a.filename, content: a.content }];
    items = items.filter(f => f && (f.filename != null || f.content != null)).map(f => ({ name: safeName(f.filename), content: String(f.content ?? "") }));
    if (!items.length) return { ok: false, error: "no files given" };
    const total = items.reduce((s, f) => s + new TextEncoder().encode(f.content).length, 0);
    if (total > 2 * 1024 * 1024) return { ok: false, error: "files exceed the 2 MB limit" };
    const list = items.map(f => "- " + f.name + " (" + f.content.length + " chars)").join("\n");
    if (!await ask("write", "Create " + (items.length > 1 ? items.length + " files?" : "this file?"), settings.workspace + "\n\n" + list)) return denied;
    const written = [];
    for (const f of items) { const r = await invoke("write_file", { path: f.name, content: f.content, append: false, ...ctx() }); written.push({ name: f.name, size: new TextEncoder().encode(f.content).length, path: r.path }); }
    if (written.length === 1) return { ok: true, file: { name: written[0].name, size: written[0].size, kind: "disk", path: written[0].path, single: true }, _content: items[0].content, _items: [{ name: written[0].name, content: items[0].content }] };
    return { ok: true, file: { name: items.length + " files", size: total, kind: "disk", path: settings.workspace, entries: written.map(w => ({ name: w.name, size: w.size })) }, _items: items.map(f => ({ name: f.name, content: f.content })) };
  }),
}; }
export const revealItem = path => invoke("reveal_item", { path: String(path || "") }).catch(() => {});
export const openItem = path => invoke("open_target", { target: String(path || "") }).catch(() => {});
export function installDesktop(agent) { registerTools(DEFS); Object.assign(agent.tools, desktopTools()); agent.max = 20; agent.extraPrompt = desktopPrompt; }
export const writeExport = async (json, exe) => { const name = (exe || "preset").replace(/\.exe$/i, "") + ".framefx.json";
  if (!await ask("write", "Save the preset file?", `${settings.workspace}/${name}`)) return false; await invoke("write_file", { path: name, content: json, append: false, root: settings.workspace, sandbox: true }); return true; };
