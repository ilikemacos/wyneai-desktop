# LarkquillAI Desktop

LarkquillAI (formerly WrenbyAI) as a desktop agent for Windows 11 and macOS. It can chat, search the web, build FrameFX presets, and work on your computer: run shell commands, read, write and delete files, open apps and URLs, keep a persistent memory, and plan multi-step tasks (up to 20 steps).

Trained on a 2021 ROG Zephyrus G14.

## Safety
- Every shell command, file write, delete and app launch shows an Allow/Deny dialog. You can allow one kind of action for the rest of the session.
- File tools are sandboxed to the working folder (default `~/LarkquillAI Workspace`, or `~/WrenbyAI Workspace` if you already had it). You can change this in Settings.
- Every tool call shows in the step log, and **Stop** ends the task.
- Memory is stored locally in `memory.json` in the app data folder (`%APPDATA%\WrenbyAI` on Windows, `~/Library/Application Support/WrenbyAI` on macOS; the folder keeps its original name so nothing is lost).

## Install
Download from the [desktop page](https://ilikemacos.github.io/larkquillai/desktop.html) or the [latest release](../../releases/latest).
- **Windows:** run `LarkquillAI_x64-setup.exe`. The installer is unsigned, so on the SmartScreen warning click *More info*, then *Run anyway*.
- **macOS:** open the `.dmg` and drag LarkquillAI to Applications. The app is unsigned, so the first time, right-click it, choose *Open*, then confirm. On newer macOS versions you may need System Settings, then Privacy & Security, then *Open Anyway*.

## Build
Install Node 20+, Rust and the [Tauri prerequisites](https://tauri.app/start/prerequisites/), then run:
```
npm install && npx tauri icon app-icon.png && npx tauri build
```

## Updating from WrenbyAI
Version 0.3.0 renamed the app to LarkquillAI. The built-in updater installs it and keeps your chats, settings and memory.
- **Windows:** the installer removes the old WrenbyAI program files and shortcuts.
- **macOS:** the updater replaces the app in place, so it kept the old file name (WrenbyAI.app). From 0.3.1, on launch the app renames itself to LarkquillAI.app (if that name is free in the same folder) and reopens, so Finder, the Dock and Launchpad all say LarkquillAI. If you dragged a fresh LarkquillAI.app next to the old WrenbyAI.app, LarkquillAI moves the old copy to the Trash (only if it is really this app, bundle id `com.framefx.wyneai`, and it isn't running). If macOS doesn't allow the change, nothing happens and the app runs as before. The data folder (`WrenbyAI`), `~/WrenbyAI Workspace` and the bundle id are never changed.
