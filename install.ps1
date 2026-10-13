# ==============================================================================
#  LoliCord — Universal Windows PowerShell Installer
#  Usage: irm https://raw.githubusercontent.com/ownhoye/hoye-bot-discord/main/install.ps1 | iex
# ==============================================================================

$ErrorActionPreference = "Stop"
$ProgressPreference    = "SilentlyContinue"
# Windows PowerShell 5.1 defaults to TLS 1.0, which GitHub rejects
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

$InstallDir   = Join-Path $env:LOCALAPPDATA "LoliCord"
$DistDir      = Join-Path $InstallDir "dist"
$InstallerDir = Join-Path $InstallDir "installer"
$InstallerExe = Join-Path $InstallerDir "LoliCord-Installer.exe"

function Write-Banner {
    Clear-Host
    Write-Host ""
    Write-Host "  =======================================================" -ForegroundColor Cyan
    Write-Host "             LOLICORD - WINDOWS INSTALLER               " -ForegroundColor White
    Write-Host "         Quick & Clean Discord Client Mod Setup          " -ForegroundColor DarkCyan
    Write-Host "  =======================================================" -ForegroundColor Cyan
    Write-Host ""
}

function Write-Step($n, $total, $msg) {
    Write-Host "  [$n/$total] " -NoNewline -ForegroundColor Yellow
    Write-Host $msg
}

function Write-OK($msg) {
    Write-Host "          ✓ " -NoNewline -ForegroundColor Green
    Write-Host $msg
}

function Write-Fail($msg) {
    Write-Host ""
    Write-Host "  [ERREUR] $msg" -ForegroundColor Red
    Write-Host ""
    Write-Host "  Appuyez sur une touche pour quitter..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit 1
}

Write-Banner

# Créer les dossiers
New-Item -ItemType Directory -Force -Path $InstallDir   | Out-Null
New-Item -ItemType Directory -Force -Path $InstallerDir | Out-Null
New-Item -ItemType Directory -Force -Path $DistDir      | Out-Null

# ── [1/3] Récupérer la dernière version depuis Gitea ──────────────────────────
Write-Step 1 3 "Récupération des informations de la dernière version..."

$apiUrl = "https://api.github.com/repos/ownhoye/hoye-bot-discord/releases/latest"
try {
    $release = Invoke-RestMethod -Uri $apiUrl -UseBasicParsing -Headers @{ "User-Agent" = "LoliCord-Installer/2.0" }
    $version = $release.tag_name
    Write-OK "Dernière version trouvée : $version"
} catch {
    Write-Fail "Impossible de contacter GitHub ($apiUrl) : $_"
}

# ── [2/3] Télécharger LoliCord-Installer ou LoliCord-Dist ────────────────────
Write-Step 2 3 "Téléchargement de l'installeur LoliCord..."

$installerAsset = $release.assets | Where-Object { $_.name -eq "LoliCord-Installer.exe" } | Select-Object -First 1
$distAsset      = $release.assets | Where-Object { $_.name -eq "lolicord-dist.zip" } | Select-Object -First 1

if ($installerAsset) {
    try {
        Invoke-WebRequest -Uri $installerAsset.browser_download_url -OutFile $InstallerExe -UseBasicParsing `
            -Headers @{ "User-Agent" = "LoliCord-Installer/2.0" }
        Write-OK "LoliCord-Installer.exe téléchargé avec succès."
    } catch {
        Write-Fail "Impossible de télécharger LoliCord-Installer.exe : $_"
    }
} elseif ($distAsset) {
    try {
        $zipPath = Join-Path $InstallDir "lolicord-dist.zip"
        Invoke-WebRequest -Uri $distAsset.browser_download_url -OutFile $zipPath -UseBasicParsing `
            -Headers @{ "User-Agent" = "LoliCord-Installer/2.0" }
        Expand-Archive -Path $zipPath -DestinationPath $DistDir -Force
        Remove-Item $zipPath -Force
        Write-OK "Bundle LoliCord extrait avec succès."
    } catch {
        Write-Fail "Impossible de télécharger le bundle LoliCord : $_"
    }
} else {
    Write-Fail "Aucun asset d'installation trouvé pour la release $version."
}

# ── [3/3] Lancement de l'installeur ───────────────────────────────────────────
Write-Step 3 3 "Lancement de l'installation..."

if (Test-Path $InstallerExe) {
    Start-Process -FilePath $InstallerExe
} else {
    # Injection directe si l'exe graphique n'est pas dispo
    $discordPaths = @(
        "$env:LOCALAPPDATA\Discord",
        "$env:LOCALAPPDATA\DiscordCanary",
        "$env:LOCALAPPDATA\DiscordPTB",
        "$env:LOCALAPPDATA\DiscordDevelopment"
    )
    $patcher = (Join-Path $DistDir "patcher.js") -replace "\\", "/"
    $injected = $false
    foreach ($disc in $discordPaths) {
        if (-not (Test-Path $disc)) { continue }
        $appDirs = @(Get-ChildItem -Path $disc -Directory -Filter "app-*" |
            Sort-Object { [version]($_.Name -replace "^app-", "") } -Descending)
        if ($appDirs.Count -eq 0) { continue }

        $exeName   = (Split-Path $disc -Leaf) + ".exe"
        $resources = Join-Path $appDirs[0].FullName "resources"
        $appAsar   = Join-Path $resources "app.asar"
        $backup    = Join-Path $resources "_app.asar"
        $target    = Join-Path $resources "app"

        Get-Process -Name ($exeName -replace "\.exe$", "") -ErrorAction SilentlyContinue | Stop-Process -Force
        Start-Sleep -Seconds 2

        # Discord loads app.asar before app\ : move it aside, the patcher loads it as _app.asar
        if ((Test-Path $appAsar) -and -not (Test-Path $backup)) { Move-Item $appAsar $backup }
        New-Item -ItemType Directory -Force -Path $target | Out-Null
        # WriteAllText: no BOM (Windows PowerShell's -Encoding UTF8 adds one, which breaks JSON parsing)
        [IO.File]::WriteAllText((Join-Path $target "package.json"), '{"name":"discord","main":"index.js"}')
        [IO.File]::WriteAllText((Join-Path $target "index.js"), "require($(ConvertTo-Json $patcher));")
        Write-OK "Injecté dans : $($appDirs[0].Name)"
        $injected = $true

        $updateExe = Join-Path $disc "Update.exe"
        if (Test-Path $updateExe) { Start-Process -FilePath $updateExe -ArgumentList "--processStart", $exeName }
    }
    if (-not $injected) { Write-Fail "Discord est introuvable. Installez Discord depuis https://discord.com/download puis relancez." }
}

Write-Host ""
Write-Host "  =======================================================" -ForegroundColor Green
Write-Host "     Installation de LoliCord terminée avec succès !    " -ForegroundColor Green
Write-Host "  =======================================================" -ForegroundColor Green
Write-Host ""
Start-Sleep -Seconds 3
