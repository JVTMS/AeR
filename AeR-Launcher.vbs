' AeR — Launcher Silencioso v1.0
' Executa start-aer.ps1 sem exibir nenhuma janela de console.
' Este arquivo é referenciado pelo atalho da Área de Trabalho.

Option Explicit

Dim WshShell, fso, scriptDir, ps1Path

Set WshShell = CreateObject("WScript.Shell")
Set fso      = CreateObject("Scripting.FileSystemObject")

' Diretório onde este VBS está localizado (mesmo do projeto)
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
ps1Path   = scriptDir & "\start-aer.ps1"

' Verificar se o script existe
If Not fso.FileExists(ps1Path) Then
    MsgBox "Arquivo não encontrado:" & vbCrLf & ps1Path & vbCrLf & vbCrLf & _
           "Certifique-se de que o AeR está instalado corretamente.", _
           vbCritical, "AeR — Erro de Inicialização"
    WScript.Quit 1
End If

' Executar PowerShell sem janela (WindowStyle = 0)
Dim cmd
cmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & ps1Path & """"

WshShell.Run cmd, 0, False  ' 0 = sem janela | False = não aguardar

Set WshShell = Nothing
Set fso      = Nothing
