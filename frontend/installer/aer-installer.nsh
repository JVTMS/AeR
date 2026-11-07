; ─────────────────────────────────────────────────────────────────────────────
; AeR — NSIS Custom Installer Script (incluído pelo electron-builder)
; Personaliza a aparência e o fluxo do instalador gerado automaticamente.
;
; Referência de hooks do electron-builder NSIS:
;   !macro customWelcomePage  — substitui / customiza a página de Boas-Vindas
;   !macro customInstall      — código extra a rodar durante a instalação
;   !macro customUnInstall    — código extra a rodar durante a desinstalação
; ─────────────────────────────────────────────────────────────────────────────

; ── Boas-Vindas personalizada ────────────────────────────────────────────────
!macro customWelcomePage
  ; Substituímos o texto padrão da página de boas-vindas pelo branding do AeR.
  ; O electron-builder usa o plugin MUI2, então editamos os strings MUI aqui.
  !define MUI_WELCOMEPAGE_TITLE     "Instalando AeR"
  !define MUI_WELCOMEPAGE_TEXT      "Bem-vindo ao instalador do AeR — Advanced Engine Reborn.$\r$\n$\r$\nEste assistente vai instalar o AeR ${VERSION} no seu computador.$\r$\n$\r$\nClique em Avançar para continuar."
  !insertmacro MUI_PAGE_WELCOME
!macroend

; ── Ações extras durante a instalação ────────────────────────────────────────
!macro customInstall
  ; Registrar a aplicação no "Abrir com" do Windows para extensões futuras
  ; (opcional — sem tela adicional)
  WriteRegStr HKCU "Software\AeR" "InstallPath" "$INSTDIR"
  WriteRegStr HKCU "Software\AeR" "Version"     "${VERSION}"
!macroend

; ── Ações extras durante a desinstalação ─────────────────────────────────────
!macro customUnInstall
  ; Remover entradas de registro criadas pelo customInstall
  DeleteRegKey HKCU "Software\AeR"
!macroend
