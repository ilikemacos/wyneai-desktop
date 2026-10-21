//! macOS: finish the WrenbyAI -> LarkquillAI rename for people who updated in place.
//!
//! The Tauri updater swaps the new bundle in at the *old* path, so an app that started life as
//! WrenbyAI.app keeps that file name in Finder, the Dock and Launchpad. On startup:
//!   * running from .../WrenbyAI.app and no LarkquillAI.app next to it: rename the bundle to
//!     LarkquillAI.app (a rename works while the app runs), then relaunch from the new path;
//!   * running from .../LarkquillAI.app and a WrenbyAI.app with our bundle id sits next to it
//!     (a fresh download dropped beside the old app): move the old copy to the Trash.
//! Everything fails silently (no permission, read-only volume, App Translocation, a mounted DMG).
//! App data is never touched: bundle id com.framefx.wyneai, the WrenbyAI data folder and
//! ~/WrenbyAI Workspace stay exactly as they are; only the .app bundle file name changes.
use std::path::{Path, PathBuf};

pub const OLD_APP: &str = "WrenbyAI.app";
pub const NEW_APP: &str = "LarkquillAI.app";
pub const BUNDLE_ID: &str = "com.framefx.wyneai";

#[derive(Debug, PartialEq, Eq)]
pub enum Action {
    None,
    /// Rename the running bundle `from` to `to`, then relaunch from `to`.
    RenameAndRelaunch { from: PathBuf, to: PathBuf },
    /// Move a leftover old bundle to the Trash.
    TrashOld(PathBuf),
}

/// The .app bundle that contains `exe` (…/X.app/Contents/MacOS/binary), if any.
pub fn bundle_of(exe: &Path) -> Option<PathBuf> {
    let b = exe.parent()?.parent()?.parent()?;
    let ok = exe.parent()?.file_name()? == "MacOS"
        && exe.parent()?.parent()?.file_name()? == "Contents"
        && b.extension().map(|e| e == "app").unwrap_or(false);
    if ok { Some(b.to_path_buf()) } else { None }
}

/// Decide what to do. `exists` and `bundle_id` are injected so the logic can be unit tested.
pub fn plan(bundle: &Path, exists: impl Fn(&Path) -> bool, bundle_id: impl Fn(&Path) -> Option<String>) -> Action {
    let s = bundle.to_string_lossy();
    // Translocated (quarantined, read-only) copies and apps run straight from a DMG can't be renamed.
    if s.contains("/AppTranslocation/") || s.starts_with("/Volumes/") { return Action::None; }
    let (Some(name), Some(dir)) = (bundle.file_name().and_then(|n| n.to_str()), bundle.parent()) else { return Action::None };
    if name == OLD_APP {
        let to = dir.join(NEW_APP);
        if !exists(&to) { return Action::RenameAndRelaunch { from: bundle.to_path_buf(), to }; }
    } else if name == NEW_APP {
        let old = dir.join(OLD_APP);
        if exists(&old) && bundle_id(&old).as_deref() == Some(BUNDLE_ID) { return Action::TrashOld(old); }
    }
    Action::None
}

/// CFBundleIdentifier from an XML Info.plist (what the Tauri bundler writes).
pub fn bundle_id_from_plist_xml(xml: &str) -> Option<String> {
    let i = xml.find("<key>CFBundleIdentifier</key>")?;
    let rest = &xml[i + "<key>CFBundleIdentifier</key>".len()..];
    let a = rest.find("<string>")? + "<string>".len();
    let b = rest[a..].find("</string>")? + a;
    // Only accept the <string> that directly follows the key.
    if !rest[..a - "<string>".len()].trim().is_empty() { return None; }
    Some(rest[a..b].trim().to_string())
}

#[cfg(target_os = "macos")]
fn read_bundle_id(app: &Path) -> Option<String> {
    let plist = app.join("Contents/Info.plist");
    // PlistBuddy reads binary plists too; fall back to the XML parser.
    if let Ok(o) = std::process::Command::new("/usr/libexec/PlistBuddy").arg("-c").arg("Print :CFBundleIdentifier").arg(&plist).output() {
        if o.status.success() {
            let s = String::from_utf8_lossy(&o.stdout).trim().to_string();
            if !s.is_empty() { return Some(s); }
        }
    }
    bundle_id_from_plist_xml(&std::fs::read_to_string(&plist).ok()?)
}

#[cfg(target_os = "macos")]
const LSREGISTER: &str = "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister";

/// Run at the very start of main(), before any window exists. May not return (relaunch).
#[cfg(target_os = "macos")]
pub fn run() {
    use std::process::{Command, Stdio};
    let Some(bundle) = std::env::current_exe().ok().and_then(|e| bundle_of(&e)) else { return };
    match plan(&bundle, |p| p.exists(), read_bundle_id) {
        Action::None => {}
        Action::RenameAndRelaunch { from, to } => {
            if std::fs::rename(&from, &to).is_err() { return; } // no permission etc.: keep running as is
            // Tell Launch Services about the new name (Launchpad/Spotlight) and forget the old one.
            let _ = Command::new(LSREGISTER).arg("-f").arg(&to).stdout(Stdio::null()).stderr(Stdio::null()).status();
            let _ = Command::new(LSREGISTER).arg("-u").arg(&from).stdout(Stdio::null()).stderr(Stdio::null()).status();
            // Relaunch from the new path once this process has exited (open -n: same bundle id is still running).
            let pid = std::process::id().to_string();
            let spawned = Command::new("/bin/sh")
                .arg("-c")
                .arg(r#"i=0; while kill -0 "$1" 2>/dev/null && [ $i -lt 100 ]; do sleep 0.1; i=$((i+1)); done; exec /usr/bin/open -n "$2""#)
                .arg("sh").arg(&pid).arg(&to)
                .stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null())
                .spawn();
            if spawned.is_ok() { std::process::exit(0); }
            // Couldn't schedule the relaunch: just keep running (the next launch uses the new name).
        }
        Action::TrashOld(old) => {
            std::thread::spawn(move || {
                // Leave it alone if that old copy is running right now.
                let probe = format!("{}/Contents/MacOS/", old.display());
                if let Ok(o) = Command::new("/bin/ps").arg("-axo").arg("command=").output() {
                    if String::from_utf8_lossy(&o.stdout).lines().any(|l| l.contains(&probe)) { return; }
                }
                // NSFileManager trashItemAtURL via JXA: a real move to the Trash (Put Back works), no Finder automation prompt.
                let js = "ObjC.import('Foundation'); function run(argv) { $.NSFileManager.defaultManager.trashItemAtURLResultingItemURLError($.NSURL.fileURLWithPath(argv[0]), null, null); }";
                let _ = Command::new("/usr/bin/osascript").arg("-l").arg("JavaScript").arg("-e").arg(js).arg(&old)
                    .stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null()).status();
                let _ = Command::new(LSREGISTER).arg("-u").arg(&old).stdout(Stdio::null()).stderr(Stdio::null()).status();
            });
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    fn fs(paths: &[&str]) -> impl Fn(&Path) -> bool { let s: HashSet<PathBuf> = paths.iter().map(PathBuf::from).collect(); move |p| s.contains(p) }
    fn id(v: Option<&'static str>) -> impl Fn(&Path) -> Option<String> { move |_| v.map(String::from) }

    #[test]
    fn bundle_from_exe() {
        assert_eq!(bundle_of(Path::new("/Applications/WrenbyAI.app/Contents/MacOS/wyneai")), Some(PathBuf::from("/Applications/WrenbyAI.app")));
        assert_eq!(bundle_of(Path::new("/usr/local/bin/wyneai")), None);
        assert_eq!(bundle_of(Path::new("/x/target/release/wyneai")), None);
    }

    #[test]
    fn renames_old_bundle_when_new_name_is_free() {
        let a = plan(Path::new("/Applications/WrenbyAI.app"), fs(&["/Applications/WrenbyAI.app"]), id(Some(BUNDLE_ID)));
        assert_eq!(a, Action::RenameAndRelaunch { from: "/Applications/WrenbyAI.app".into(), to: "/Applications/LarkquillAI.app".into() });
        // Works in ~/Applications too (same folder as the running app).
        let a = plan(Path::new("/Users/m/Applications/WrenbyAI.app"), fs(&[]), id(None));
        assert_eq!(a, Action::RenameAndRelaunch { from: "/Users/m/Applications/WrenbyAI.app".into(), to: "/Users/m/Applications/LarkquillAI.app".into() });
    }

    #[test]
    fn no_rename_when_new_name_taken() {
        let a = plan(Path::new("/Applications/WrenbyAI.app"), fs(&["/Applications/WrenbyAI.app", "/Applications/LarkquillAI.app"]), id(Some(BUNDLE_ID)));
        assert_eq!(a, Action::None);
    }

    #[test]
    fn trashes_leftover_old_copy_only_with_our_bundle_id() {
        let both = ["/Applications/WrenbyAI.app", "/Applications/LarkquillAI.app"];
        assert_eq!(plan(Path::new("/Applications/LarkquillAI.app"), fs(&both), id(Some(BUNDLE_ID))), Action::TrashOld("/Applications/WrenbyAI.app".into()));
        assert_eq!(plan(Path::new("/Applications/LarkquillAI.app"), fs(&both), id(Some("com.someone.else"))), Action::None);
        assert_eq!(plan(Path::new("/Applications/LarkquillAI.app"), fs(&both), id(None)), Action::None);
        assert_eq!(plan(Path::new("/Applications/LarkquillAI.app"), fs(&["/Applications/LarkquillAI.app"]), id(Some(BUNDLE_ID))), Action::None);
    }

    #[test]
    fn leaves_translocated_dmg_and_other_names_alone() {
        assert_eq!(plan(Path::new("/private/var/folders/x/T/AppTranslocation/ABC/d/WrenbyAI.app"), fs(&[]), id(Some(BUNDLE_ID))), Action::None);
        assert_eq!(plan(Path::new("/Volumes/LarkquillAI/WrenbyAI.app"), fs(&[]), id(Some(BUNDLE_ID))), Action::None);
        assert_eq!(plan(Path::new("/Applications/WrenbyAI 2.app"), fs(&[]), id(Some(BUNDLE_ID))), Action::None);
        assert_eq!(plan(Path::new("/Applications/LarkquillAI copy.app"), fs(&["/Applications/WrenbyAI.app"]), id(Some(BUNDLE_ID))), Action::None);
    }

    #[test]
    fn parses_tauri_info_plist() {
        let xml = "<dict>\n\t<key>CFBundleExecutable</key>\n\t<string>wyneai</string>\n\t<key>CFBundleIdentifier</key>\n\t<string>com.framefx.wyneai</string>\n</dict>";
        assert_eq!(bundle_id_from_plist_xml(xml).as_deref(), Some("com.framefx.wyneai"));
        assert_eq!(bundle_id_from_plist_xml("<dict><key>CFBundleName</key><string>X</string></dict>"), None);
        assert_eq!(bundle_id_from_plist_xml("<dict><key>CFBundleIdentifier</key><true/><key>Y</key><string>z</string></dict>"), None);
    }
}
