# WrenbyAI Desktop

WrenbyAI as a desktop agent for Windows 11 and macOS. It can chat, search the web, build FrameFX presets, and work on your computer: run shell commands, read, write and delete files, open apps and URLs, keep a persistent memory, and plan multi-step tasks (up to 20 steps).

Trained on a 2021 ROG Zephyrus G14.

## Safety
- Every shell command, file write, delete and app launch shows an Allow/Deny dialog. You can allow one kind of action for the rest of the session.
- File tools are sandboxed to the working folder (default `~/WrenbyAI Workspace`). You can change this in Settings.
- Every tool call shows in the step log, and **Stop** ends the task.
- Memory is stored locally in `memory.json` in the app data folder (`%APPDATA%\WrenbyAI` on Windows, `~/Library/Application Support/WrenbyAI` on macOS).

## Install
Download the installers from the latest [build run](../../actions/workflows/build.yml) artifacts.
- **Windows:** run the `WrenbyAI_x.y.z_x64-setup.exe` file. The installer is unsigned, so on the SmartScreen warning click *More info*, then *Run anyway*.
- **macOS:** open the `.dmg` and drag WrenbyAI to Applications. The app is unsigned, so the first time, right-click it, choose *Open*, then confirm. On newer macOS versions you may need System Settings, then Privacy & Security, then *Open Anyway*.

## Build
Install Node 20+, Rust and the [Tauri prerequisites](https://tauri.app/start/prerequisites/), then run:
```
npm install && npx tauri icon app-icon.png && npx tauri build
```
