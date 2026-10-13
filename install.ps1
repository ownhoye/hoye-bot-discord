# ==============================================================================
#  LoliCord — Universal Windows PowerShell Installer
#  Usage: irm https://raw.githubusercontent.com/ownhoye/hoye-bot-discord/main/install.ps1 | iex
# ==============================================================================

$ErrorActionPreference = "Stop"
$ProgressPreference    = "SilentlyContinue"

$GiteaUrl     = "https://source.nightcord.st"
$GiteaRepo    = "lolicord/lolicord"
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
    $version = "latest"
    Write-OK "Utilisation de la version : $version"
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
    foreach ($disc in $discordPaths) {
        if (Test-Path $disc) {
            $appDirs = Get-ChildItem -Path $disc -Directory -Filter "app-*" | Sort-Object Name -Descending
            if ($appDirs.Count -gt 0) {
                $target = Join-Path $appDirs[0].FullName "resources\app"
                New-Item -ItemType Directory -Force -Path $target | Out-Null
                Copy-Item -Path "$DistDir\*" -Destination $target -Recurse -Force
                Set-Content -Path (Join-Path $target "package.json") -Value '{"name":"discord","main":"patcher.js"}'
                Write-OK "Injecté dans : $($appDirs[0].Name)"
            }
        }
    }
}

Write-Host ""
Write-Host "  =======================================================" -ForegroundColor Green
Write-Host "     Installation de LoliCord terminée avec succès !    " -ForegroundColor Green
Write-Host "  =======================================================" -ForegroundColor Green
Write-Host ""
Start-Sleep -Seconds 3
