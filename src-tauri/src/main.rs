#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use serde::Serialize;
use serde_json::{json, Value};
use std::io::Read;
use std::path::{Component, Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::Duration;
use std::{fs, thread};
use wait_timeout::ChildExt;

fn home() -> PathBuf { dirs::home_dir().unwrap_or_else(|| PathBuf::from(".")) }
fn data_dir() -> PathBuf {
    let d = dirs::data_dir().unwrap_or_else(home).join("WrenbyAI");
    let _ = fs::create_dir_all(&d);
    d
}
fn e2s<E: std::fmt::Display>(e: E) -> String { e.to_string() }

/// Resolve a path against the working folder; with sandbox on, refuse anything outside it (symlinks included).
fn resolve(path: &str, root: &str, sandbox: bool) -> Result<PathBuf, String> {
    let root = PathBuf::from(root);
    fs::create_dir_all(&root).map_err(e2s)?;
    let root = dunce::canonicalize(&root).map_err(e2s)?;
    let p = Path::new(path.trim());
    let full = if p.is_absolute() { p.to_path_buf() } else { root.join(p) };
    let mut out = PathBuf::new();
    for c in full.components() {
        match c {
            Component::ParentDir => { out.pop(); }
            Component::CurDir => {}
            other => out.push(other.as_os_str()),
        }
    }
    let mut anc = out.clone();
    let mut tail = vec![];
    while !anc.exists() {
        match anc.file_name() {
            Some(n) => { tail.push(n.to_owned()); anc.pop(); }
            None => break,
        }
    }
    let mut real = dunce::canonicalize(&anc).unwrap_or(anc);
    for t in tail.iter().rev() { real.push(t); }
    if sandbox && !real.starts_with(&root) {
        return Err(format!("{} is outside the working folder ({}). The user can turn off the sandbox in Settings.", real.display(), root.display()));
    }
    Ok(real)
}

#[tauri::command]
fn default_workspace() -> Result<String, String> {
    let d = home().join("WrenbyAI Workspace");
    fs::create_dir_all(&d).map_err(e2s)?;
    Ok(d.display().to_string())
}

#[derive(Serialize)]
struct ShellOut { code: i32, stdout: String, stderr: String, timed_out: bool }

fn drain<R: Read + Send + 'static>(r: Option<R>) -> thread::JoinHandle<String> {
    thread::spawn(move || {
        let mut buf = Vec::new();
        if let Some(mut r) = r { let _ = r.take(4_000_000).read_to_end(&mut buf); }
        String::from_utf8_lossy(&buf).into_owned()
    })
}

#[tauri::command]
async fn run_shell(command: String, cwd: String, timeout_secs: u64) -> Result<ShellOut, String> {
    tauri::async_runtime::spawn_blocking(move || {
        fs::create_dir_all(&cwd).map_err(e2s)?;
        #[cfg(windows)]
        let mut cmd = {
            use std::os::windows::process::CommandExt;
            let mut c = Command::new("cmd");
            c.arg("/D").arg("/S").arg("/C").raw_arg(format!("\"{}\"", command));
            c.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
            c
        };
        #[cfg(not(windows))]
        let mut cmd = {
            let mut c = Command::new("/bin/sh");
            c.arg("-c").arg(&command);
            c
        };
        let mut child = cmd.current_dir(&cwd).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped()).spawn().map_err(e2s)?;
        let (o, e) = (drain(child.stdout.take()), drain(child.stderr.take()));
        let (code, timed_out) = match child.wait_timeout(Duration::from_secs(timeout_secs.clamp(1, 600))).map_err(e2s)? {
            Some(s) => (s.code().unwrap_or(-1), false),
            None => { let _ = child.kill(); let _ = child.wait(); (-1, true) }
        };
        Ok(ShellOut { code, stdout: o.join().unwrap_or_default(), stderr: e.join().unwrap_or_default(), timed_out })
    }).await.map_err(e2s)?
}

#[tauri::command]
fn read_file(path: String, root: String, sandbox: bool) -> Result<Value, String> {
    let p = resolve(&path, &root, sandbox)?;
    let meta = fs::metadata(&p).map_err(e2s)?;
    if meta.is_dir() { return Err("that's a folder; use list_dir".into()); }
    let mut buf = Vec::new();
    fs::File::open(&p).map_err(e2s)?.take(200_000).read_to_end(&mut buf).map_err(e2s)?;
    Ok(json!({ "path": p.display().to_string(), "size": meta.len(), "truncated": meta.len() > 200_000, "content": String::from_utf8_lossy(&buf) }))
}

#[tauri::command]
fn write_file(path: String, content: String, append: bool, root: String, sandbox: bool) -> Result<Value, String> {
    let p = resolve(&path, &root, sandbox)?;
    if let Some(parent) = p.parent() { fs::create_dir_all(parent).map_err(e2s)?; }
    if append {
        use std::io::Write;
        fs::OpenOptions::new().create(true).append(true).open(&p).map_err(e2s)?.write_all(content.as_bytes()).map_err(e2s)?;
    } else {
        fs::write(&p, content.as_bytes()).map_err(e2s)?;
    }
    Ok(json!({ "path": p.display().to_string(), "bytes": content.len() }))
}

#[tauri::command]
fn list_dir(path: String, root: String, sandbox: bool) -> Result<Value, String> {
    let p = resolve(&path, &root, sandbox)?;
    let mut items = vec![];
    let mut total = 0;
    for ent in fs::read_dir(&p).map_err(e2s)? {
        total += 1;
        if items.len() >= 500 { continue; }
        if let Ok(ent) = ent {
            let md = ent.metadata().ok();
            items.push(json!({ "name": ent.file_name().to_string_lossy(), "dir": md.as_ref().map(|m| m.is_dir()).unwrap_or(false), "size": md.map(|m| m.len()).unwrap_or(0) }));
        }
    }
    Ok(json!({ "path": p.display().to_string(), "total": total, "entries": items }))
}

#[tauri::command]
fn delete_path(path: String, root: String, sandbox: bool) -> Result<Value, String> {
    let p = resolve(&path, &root, sandbox)?;
    let r = dunce::canonicalize(&root).map_err(e2s)?;
    if p == r || p.parent().is_none() || p == home() { return Err("refusing to delete the working folder, a drive root or the home folder".into()); }
    let md = fs::symlink_metadata(&p).map_err(e2s)?;
    if md.is_dir() { fs::remove_dir_all(&p).map_err(e2s)?; } else { fs::remove_file(&p).map_err(e2s)?; }
    Ok(json!({ "deleted": p.display().to_string() }))
}

#[tauri::command]
fn open_target(target: String) -> Result<Value, String> {
    let t = target.trim().to_string();
    if t.is_empty() { return Err("nothing to open".into()); }
    let looks_url = t.contains("://") || t.starts_with("mailto:");
    if looks_url || Path::new(&t).exists() {
        open::that_detached(&t).map_err(e2s)?;
        return Ok(json!({ "opened": t }));
    }
    #[cfg(target_os = "macos")]
    let st = Command::new("open").arg("-a").arg(&t).status().map_err(e2s)?;
    #[cfg(windows)]
    let st = {
        use std::os::windows::process::CommandExt;
        Command::new("cmd").arg("/C").arg("start").arg("").arg(&t).creation_flags(0x0800_0000).status().map_err(e2s)?
    };
    #[cfg(all(not(windows), not(target_os = "macos")))]
    let st = Command::new("sh").arg("-c").arg(format!("nohup {} >/dev/null 2>&1 &", t)).status().map_err(e2s)?;
    if !st.success() { return Err(format!("couldn't find an app called \"{}\"", t)); }
    Ok(json!({ "opened": t }))
}

#[tauri::command]
fn memory_load() -> Value {
    fs::read_to_string(data_dir().join("memory.json")).ok().and_then(|s| serde_json::from_str(&s).ok()).unwrap_or(json!({ "facts": [] }))
}

#[tauri::command]
fn memory_save(data: Value) -> Result<(), String> {
    let p = data_dir().join("memory.json");
    let tmp = p.with_extension("json.tmp");
    fs::write(&tmp, serde_json::to_vec_pretty(&data).map_err(e2s)?).map_err(e2s)?;
    fs::rename(&tmp, &p).map_err(e2s)
}

#[tauri::command]
fn open_data_dir() -> Result<(), String> { open::that_detached(data_dir()).map_err(e2s) }

#[tauri::command]
fn reveal_item(path: String) -> Result<(), String> {
    let p = PathBuf::from(path.trim());
    #[cfg(target_os = "macos")]
    { Command::new("open").arg("-R").arg(&p).spawn().map_err(e2s)?; return Ok(()); }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        Command::new("explorer").raw_arg(format!("/select,\"{}\"", p.display())).creation_flags(0x0800_0000).spawn().map_err(e2s)?;
        return Ok(());
    }
    #[cfg(all(not(windows), not(target_os = "macos")))]
    { let dir = if p.is_dir() { p.clone() } else { p.parent().map(|x| x.to_path_buf()).unwrap_or(p.clone()) }; open::that_detached(dir).map_err(e2s)?; Ok(()) }
}

// Updates are driven from Settings: the UI calls update_install on launch when automatic updates are on.
#[tauri::command]
fn app_version(app: tauri::AppHandle) -> String { app.package_info().version.to_string() }

#[tauri::command]
async fn update_check(app: tauri::AppHandle) -> Result<Value, String> {
    use tauri_plugin_updater::UpdaterExt;
    match app.updater().map_err(e2s)?.check().await.map_err(e2s)? {
        Some(u) => Ok(json!({ "available": true, "version": u.version, "current": u.current_version, "notes": u.body, "date": u.date.map(|d| d.to_string()) })),
        None => Ok(json!({ "available": false, "current": app.package_info().version.to_string() })),
    }
}

#[tauri::command]
async fn update_install(app: tauri::AppHandle) -> Result<Value, String> {
    use tauri_plugin_updater::UpdaterExt;
    if let Some(u) = app.updater().map_err(e2s)?.check().await.map_err(e2s)? {
        u.download_and_install(|_, _| {}, || {}).await.map_err(e2s)?;
        app.restart();
    }
    Ok(json!({ "installed": false }))
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![default_workspace, run_shell, read_file, write_file, list_dir, delete_path, open_target, memory_load, memory_save, open_data_dir, reveal_item, app_version, update_check, update_install])
        .run(tauri::generate_context!())
        .expect("error while running WrenbyAI");
}
