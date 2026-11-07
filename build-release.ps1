# AeR - Build Self-Contained (Fase 14 + Empacotamento Electron)
# Gera AeR.Api.exe standalone (~80MB) e o instalador AeR-Setup-v1.2.0.exe
# Uso: .\build-release.ps1

$ErrorActionPreference = 'Stop'
$Root        = $PSScriptRoot
$BackendDir  = Join-Path $Root "backend\AeR.Api"
$ProjFile    = Join-Path $BackendDir "AeR.Api.csproj"
$PublishDir  = Join-Path $Root "release\backend"
$FrontendDir = Join-Path $Root "frontend"
$DistDir     = Join-Path $Root "dist"

$DotnetCmd = Get-Command dotnet -ErrorAction SilentlyContinue
if ($DotnetCmd) {
    $DotnetExe = $DotnetCmd.Source
} else {
    $DotnetExe = "C:\Program Files\dotnet\dotnet.exe"
}

function Log { param([string]$Msg) Write-Host "  $Msg" -ForegroundColor Cyan }
function Ok  { param([string]$Msg) Write-Host "  [OK] $Msg" -ForegroundColor Green }
function Err { param([string]$Msg) Write-Host "  [ERRO] $Msg" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "================================================" -ForegroundColor Magenta
Write-Host "  AeR - Build Release (Self-Contained)"         -ForegroundColor Magenta
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
    -p:IncludeNativeLibrariesForSelfExtract=true `
    -p:IncludeAllContentForSelfExtract=true `
    -p:EnableCompressionInSingleFile=true `
    --output $PublishDir `
    2>&1 | Out-Null

if ($LASTEXITCODE -ne 0) { Err "Publish falhou. Verifique os erros acima." }
$exePath = Join-Path $PublishDir "AeR.Api.exe"
if (-not (Test-Path $exePath)) { Err "AeR.Api.exe nao gerado em $PublishDir" }
$sizeMb = [math]::Round((Get-Item $exePath).Length / 1MB, 1)
Ok "AeR.Api.exe gerado! Tamanho: $sizeMb MB"

# 3. Empacotar o frontend com electron-builder
Write-Host ""
Write-Host "------------------------------------------------" -ForegroundColor Cyan
Write-Host "  Empacotando frontend (electron-builder)..."    -ForegroundColor Cyan
Write-Host "------------------------------------------------" -ForegroundColor Cyan

# Verificar npm
$npmCmd = Get-Command npm -ErrorAction SilentlyContinue
if (-not $npmCmd) { Err "npm nao encontrado no PATH. Instale Node.js para compilar o frontend." }
Ok "npm encontrado: $($npmCmd.Source)"

# -- Workaround: pre-popular cache do winCodeSign sem symlinks macOS ----------
# O electron-builder usa winCodeSign (contem signtool.exe bundlado).
# O .7z inclui symlinks macOS que o Windows nao consegue criar sem Developer
# Mode ativo. Baixamos e extraimos manualmente ignorando esses symlinks.
$winCodeSignCache  = "$env:LOCALAPPDATA\electron-builder\Cache\winCodeSign"
$winCodeSignTarget = "$winCodeSignCache\winCodeSign-2.6.0"
$winCodeSignUrl    = "https://github.com/electron-userland/electron-builder-binaries/releases/download/winCodeSign-2.6.0/winCodeSign-2.6.0.7z"
$sevenZip          = Join-Path $FrontendDir "node_modules\7zip-bin\win\x64\7za.exe"

if (-not (Test-Path "$winCodeSignTarget\windows-10\x64\signtool.exe")) {
    Log "Preparando cache do winCodeSign (necessario apenas uma vez)..."
    New-Item -ItemType Directory -Path $winCodeSignCache -Force | Out-Null
    $archivePath = "$winCodeSignCache\winCodeSign-2.6.0.7z"
    if (-not (Test-Path $archivePath)) {
        Log "Baixando winCodeSign (~5.6 MB)..."
        & curl.exe -L -s -o $archivePath $winCodeSignUrl
        if ($LASTEXITCODE -ne 0) { Err "Falha ao baixar winCodeSign." }
    }
    Log "Extraindo winCodeSign..."
    & $sevenZip x -snld -y $archivePath "-o$winCodeSignTarget" 2>&1 | Out-Null
    # Criar arquivos dummy para os symlinks macOS que o Windows nao consegue criar
    $symlinkDir = "$winCodeSignTarget\darwin\10.12\lib"
    New-Item -ItemType Directory -Path $symlinkDir -Force | Out-Null
    $null = New-Item -ItemType File -Path "$symlinkDir\libcrypto.dylib" -Force -ErrorAction SilentlyContinue
    $null = New-Item -ItemType File -Path "$symlinkDir\libssl.dylib"    -Force -ErrorAction SilentlyContinue
    Ok "Cache do winCodeSign preparado."
} else {
    Ok "Cache do winCodeSign ja existe - pulando."
}

# Instalar dependencias npm
Log "Instalando dependencias npm..."
Push-Location $FrontendDir
try {
    & cmd /c "npm install" 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { Err "npm install falhou." }
    Ok "Dependencias instaladas."

    # Executar electron-builder (sem auto-deteccao de certificados do store do Windows)
    Log "Gerando instalador (electron-builder)..."
    $env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
    & cmd /c "npx electron-builder --win" 2>&1
    if ($LASTEXITCODE -ne 0) { Err "electron-builder falhou. Verifique os erros acima." }
} finally {
    $env:CSC_IDENTITY_AUTO_DISCOVERY = ""
    Pop-Location
}

# Encontrar o instalador gerado
$setupFile = Get-ChildItem -Path $DistDir -Filter "AeR-Setup-*.exe" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($setupFile) {
    $setupMb = [math]::Round($setupFile.Length / 1MB, 1)
    Ok "Instalador gerado: $($setupFile.FullName) ($setupMb MB)"
} else {
    Log "AVISO: Instalador .exe nao encontrado em $DistDir - verifique a saida do electron-builder acima."
}

Write-Host ""
Write-Host "================================================" -ForegroundColor Green
Write-Host "  BUILD COMPLETO!"                               -ForegroundColor Green
Write-Host "  Backend:    $PublishDir\AeR.Api.exe ($sizeMb MB)" -ForegroundColor Green
if ($setupFile) {
    Write-Host "  Instalador: $($setupFile.FullName) ($setupMb MB)" -ForegroundColor Green
}
Write-Host "================================================" -ForegroundColor Green
Write-Host ""
