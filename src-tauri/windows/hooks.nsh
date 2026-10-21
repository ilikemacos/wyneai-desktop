; LarkquillAI installer hooks (Tauri NSIS).
; The app used to be called WrenbyAI, which Windows tracks as a separate program. After LarkquillAI is installed,
; quietly remove the old WrenbyAI program files and shortcuts so there is only one app in the Start menu.
; A silent uninstall never deletes app data (that needs the "Delete app data" checkbox), so chats, settings,
; memory.json (%APPDATA%\WrenbyAI) and the sign-in kept by the webview (same bundle id) all stay.
!macro NSIS_HOOK_POSTINSTALL
  ReadRegStr $R8 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\WrenbyAI" "UninstallString"
  ${If} $R8 != ""
  ${AndIf} "$INSTDIR" != "$LOCALAPPDATA\WrenbyAI"
    DetailPrint "Removing the old WrenbyAI version (your data is kept)"
    ExecWait '$R8 /S'
  ${EndIf}
!macroend
