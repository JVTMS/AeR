# AeR Launcher v1.3 - Compativel com PowerShell 5 (Windows integrado)
# Correcoes: removido operador ?. (PS7 only), corrigido encoding das strings,
#            backend usa "dotnet run" em vez do .exe nao self-contained.

$ErrorActionPreference = 'SilentlyContinue'

$Root        = $PSScriptRoot
$BackendProj = Join-Path $Root "backend\AeR.Api\AeR.Api.csproj"
$BackendExe  = Join-Path $Root "backend\AeR.Api\bin\Debug\net10.0\AeR.Api.exe"
$FrontendDir = Join-Path $Root "frontend"
$LogsDir     = Join-Path $Root "logs"
$LogFile     = Join-Path $LogsDir "launcher.log"
$PipePath    = "\\.\pipe\AeR_IPC"

# -- Resolver dotnet.exe --------------------------------------------------
# Forcamos o PATH para incluir o local padrao do .NET SDK apos instalacao
$env:PATH = [System.Environment]::GetEnvironmentVariable("PATH","Machine") + ";" +
            [System.Environment]::GetEnvironmentVariable("PATH","User") + ";" +
            "C:\Program Files\dotnet"

# PS5-compatible: sem operador ?.
$DotnetCmd = Get-Command dotnet -ErrorAction SilentlyContinue
if ($DotnetCmd) {
    $DotnetExe = $DotnetCmd.Source
} else {
    $DotnetExe = $null
}

if (-not $DotnetExe) {
    # Busca manual nos locais padrao
    $candidates = @(
        "C:\Program Files\dotnet\dotnet.exe",
        "C:\Program Files (x86)\dotnet\dotnet.exe",
        "$env:LOCALAPPDATA\Microsoft\dotnet\dotnet.exe"
    )
    foreach ($c in $candidates) {
        if (Test-Path $c) { $DotnetExe = $c; break }
    }
}

if (-not $DotnetExe) {
    Add-Type -AssemblyName System.Windows.Forms
    $msg = "O .NET 10 Runtime nao foi encontrado.`n`n" +
           "Instale o .NET 10 SDK como Administrador:`n" +
           "D:\Fox\dotnet-sdk-10.0.301-win-x64.exe"
    [System.Windows.Forms.MessageBox]::Show(
        $msg,
        "AeR - .NET nao encontrado",
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Error
    ) | Out-Null
    exit 1
}

# -- Criar pasta de logs --------------------------------------------------
New-Item -ItemType Directory -Path $LogsDir -Force | Out-Null

function Log {
    param([string]$Msg)
    $ts   = Get-Date -Format "HH:mm:ss"
    $line = "[$ts] $Msg"
    Add-Content -Path $LogFile -Value $line -Encoding UTF8
    Write-Host $line
}

# Rotacionar log se muito grande
if (Test-Path $LogFile) {
    $c = (Get-Content $LogFile -ErrorAction SilentlyContinue).Count
    if ($c -gt 200) {
        Get-Content $LogFile | Select-Object -Last 100 | Set-Content $LogFile -Encoding UTF8
    }
}

Log "AeR Iniciando... (dotnet: $DotnetExe)"

# -- Encerrar instancias antigas ------------------------------------------
Get-Process -Name "dotnet"   -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Get-Process -Name "electron" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Get-Process -Name "AeR.Api"  -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 800

# -- Logs do backend ------------------------------------------------------
$backendLog    = Join-Path $LogsDir "backend.log"
$backendErrLog = Join-Path $LogsDir "backend-err.log"
Remove-Item $backendLog    -Force -ErrorAction SilentlyContinue
Remove-Item $backendErrLog -Force -ErrorAction SilentlyContinue

# -- Verificar/compilar ---------------------------------------------------
if (Test-Path $BackendExe) {
    $exeTime  = (Get-Item $BackendExe -ErrorAction SilentlyContinue).LastWriteTime
    $srcFiles = Get-ChildItem -Path (Join-Path $Root "backend") -Recurse -Include "*.cs","*.csproj" -ErrorAction SilentlyContinue
    $newerSrc = $srcFiles | Where-Object { $_.LastWriteTime -gt $exeTime }

    if ($newerSrc) {
        Log "Codigo modificado. Recompilando..."
        & $DotnetExe build $BackendProj --configuration Debug --no-restore 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Log "Compilacao concluida."
        } else {
            Log "Build falhou. Tentando iniciar com codigo anterior."
        }
    } else {
        Log "Executavel atualizado. Iniciando diretamente."
    }
} else {
    Log "Primeira execucao. Compilando (aguarde ~30s)..."
    & $DotnetExe build $BackendProj --configuration Debug 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Log "ERRO FATAL: Build falhou."
        exit 1
    }
    Log "Compilacao concluida."
}

# -- Iniciar backend via dotnet run (nao o .exe, que nao e self-contained) --
Log "Iniciando backend via dotnet run..."
$backend = Start-Process `
    -FilePath $DotnetExe `
    -ArgumentList "run", "--project", $BackendProj, "--no-build", "--configuration", "Debug" `
    -PassThru -WindowStyle Hidden `
    -RedirectStandardOutput $backendLog `
    -RedirectStandardError  $backendErrLog

if ($null -eq $backend) {
    Log "ERRO: Nao foi possivel iniciar o backend."
    exit 1
}

Log "Backend PID $($backend.Id). Aguardando pipe..."

# -- Aguardar Named Pipe (max 30s) ----------------------------------------
# Test-Path nao detecta named pipes confiavelmente no PS5.
# Usamos .NET NamedPipeClientStream com tentativa de conexao rapida.
$timeout = 30
$elapsed = 0
$pipeReady = $false

while ($elapsed -lt $timeout) {
    if ($backend.HasExited) {
        Log "ERRO: Backend encerrou antes de abrir o pipe."
        Log "Verifique: $backendErrLog"
        exit 2
    }
    try {
        $testPipe = New-Object System.IO.Pipes.NamedPipeClientStream(".", "AeR_IPC",
            [System.IO.Pipes.PipeDirection]::InOut)
        $testPipe.Connect(300)   # timeout de 300ms
        $testPipe.Close()
        $testPipe.Dispose()
        $pipeReady = $true
        Log "Pipe disponivel apos $elapsed s."
        break
    } catch {
        # Pipe ainda nao disponivel, aguardar
    }
    Start-Sleep -Seconds 1
    $elapsed++
}

if (-not $pipeReady) {
    Log "AVISO: Pipe nao ficou disponivel em $timeout s. Electron tentara reconectar."
}

# -- Iniciar Electron -----------------------------------------------------
Log "Iniciando Electron..."
$electron = Start-Process `
    -FilePath "cmd.exe" `
    -ArgumentList "/c", "npm.cmd", "start" `
    -WorkingDirectory $FrontendDir `
    -PassThru `
    -WindowStyle Hidden

if ($null -eq $electron) {
    Log "ERRO: Nao foi possivel iniciar o Electron."
    exit 3
}

Log "Electron PID $($electron.Id)."
Log "AeR iniciado com sucesso!"
