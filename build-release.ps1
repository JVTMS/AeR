# AeR — Build Self-Contained (Fase 14)
# Gera AeR.Api.exe standalone (~80MB) sem precisar do .NET instalado.
# Uso: .\build-release.ps1

$ErrorActionPreference = 'Stop'
$Root       = $PSScriptRoot
$BackendDir = Join-Path $Root "backend\AeR.Api"
$ProjFile   = Join-Path $BackendDir "AeR.Api.csproj"
$PublishDir = Join-Path $Root "release\backend"
$DotnetExe  = "C:\Program Files\dotnet\dotnet.exe"

function Log { param([string]$Msg) Write-Host "  $Msg" -ForegroundColor Cyan }
function Ok  { param([string]$Msg) Write-Host "  [OK] $Msg" -ForegroundColor Green }
function Err { param([string]$Msg) Write-Host "  [ERRO] $Msg" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "================================================" -ForegroundColor Magenta
Write-Host "  AeR — Build Release (Self-Contained)" -ForegroundColor Magenta
Write-Host "================================================" -ForegroundColor Magenta
Write-Host ""

# 1. Verificar dotnet
if (-not (Test-Path $DotnetExe)) { Err "dotnet.exe nao encontrado em $DotnetExe" }
$ver = & $DotnetExe --version 2>&1
Ok "dotnet $ver"

# 2. Publicar backend self-contained
Log "Publicando backend self-contained (win-x64)..."
& $DotnetExe publish $ProjFile `
    --configuration Release `
    --runtime win-x64 `
    --self-contained true `
    -p:PublishSingleFile=true `
    -p:EnableCompressionInSingleFile=true `
    --output $PublishDir `
    2>&1 | Out-Null

if ($LASTEXITCODE -ne 0) { Err "Publish falhou. Verifique os erros acima." }
$exePath = Join-Path $PublishDir "AeR.Api.exe"
if (-not (Test-Path $exePath)) { Err "AeR.Api.exe nao gerado em $PublishDir" }
$sizeMb = [math]::Round((Get-Item $exePath).Length / 1MB, 1)
Ok "AeR.Api.exe gerado! Tamanho: ${sizeMb} MB"

# 3. Criar start-aer-release.ps1 que usa o .exe em vez de dotnet run
$releaseScript = Join-Path $Root "start-aer-release.ps1"
$scriptContent = @"
# AeR Launcher Release v1.0 - Usa AeR.Api.exe self-contained (sem .NET instalado)
`$ErrorActionPreference = 'SilentlyContinue'
`$Root       = `$PSScriptRoot
`$BackendExe = Join-Path `$Root "release\backend\AeR.Api.exe"
`$FrontendDir = Join-Path `$Root "frontend"
`$LogsDir    = Join-Path `$Root "logs"
`$LogFile    = Join-Path `$LogsDir "launcher.log"

New-Item -ItemType Directory -Path `$LogsDir -Force | Out-Null
function Log { param([string]`$Msg) `$ts = Get-Date -Format "HH:mm:ss"; `$line = "[`$ts] `$Msg"; Add-Content -Path `$LogFile -Value `$line -Encoding UTF8; Write-Host `$line }

if (-not (Test-Path `$BackendExe)) {
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show("AeR.Api.exe nao encontrado!``nExecute build-release.ps1 primeiro.", "AeR", [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Error) | Out-Null
    exit 1
}

Log "AeR Release iniciando..."
Get-Process -Name "AeR.Api","electron" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 500

`$backendLog    = Join-Path `$LogsDir "backend.log"
`$backendErrLog = Join-Path `$LogsDir "backend-err.log"
Remove-Item `$backendLog,`$backendErrLog -Force -ErrorAction SilentlyContinue

Log "Iniciando AeR.Api.exe..."
`$backend = Start-Process -FilePath `$BackendExe -PassThru -WindowStyle Hidden -RedirectStandardOutput `$backendLog -RedirectStandardError `$backendErrLog
if (`$null -eq `$backend) { Log "ERRO: Falha ao iniciar backend."; exit 1 }
Log "Backend PID `$(`$backend.Id). Aguardando pipe..."

`$elapsed = 0; `$pipeReady = `$false
while (`$elapsed -lt 15) {
    if (`$backend.HasExited) { Log "ERRO: Backend encerrou."; exit 2 }
    try {
        `$p = New-Object System.IO.Pipes.NamedPipeClientStream(".", "AeR_IPC", [System.IO.Pipes.PipeDirection]::InOut)
        `$p.Connect(300); `$p.Close(); `$p.Dispose()
        `$pipeReady = `$true; Log "Pipe pronto em `${elapsed}s."; break
    } catch {}
    Start-Sleep -Seconds 1; `$elapsed++
}
if (-not `$pipeReady) { Log "AVISO: Pipe nao ficou disponivel. Electron tentara reconectar." }

Log "Iniciando Electron..."
`$electron = Start-Process -FilePath "cmd.exe" -ArgumentList "/c","npm.cmd","start" -WorkingDirectory `$FrontendDir -PassThru -WindowStyle Hidden
Log "Electron PID `$(`$electron.Id). AeR Release iniciado!"
"@

Set-Content -Path $releaseScript -Value $scriptContent -Encoding UTF8
Ok "start-aer-release.ps1 criado!"

Write-Host ""
Write-Host "================================================" -ForegroundColor Green
Write-Host "  BUILD COMPLETO!" -ForegroundColor Green
Write-Host "  Backend: $PublishDir\AeR.Api.exe ($sizeMb MB)" -ForegroundColor Green
Write-Host "  Launcher: $releaseScript" -ForegroundColor Green
Write-Host "  Inicializacao: ~1s (vs ~8s com dotnet run)" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Green
Write-Host ""
