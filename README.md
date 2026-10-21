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
Version 0.3.0 renames the app to LarkquillAI. The built-in updater installs it; on Windows the installer then removes the old WrenbyAI program files and shortcuts, and keeps your chats, settings and memory. On macOS the app keeps its file name (WrenbyAI.app) after an in-place update but shows as LarkquillAI; a fresh download is named LarkquillAI.app.
