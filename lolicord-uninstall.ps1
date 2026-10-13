# ==============================================================================
#  LoliCord — Désinstalleur & Réparateur Discord (PowerShell)
#  Supprime proprement l'injection LoliCord et restaure Discord
# ==============================================================================

$ErrorActionPreference = "SilentlyContinue"

Clear-Host
Write-Host ""
Write-Host "  =======================================================" -ForegroundColor Cyan
Write-Host "            LOLICORD - DESINSTALLATION & REPARATION     " -ForegroundColor White
Write-Host "  =======================================================" -ForegroundColor Cyan
Write-Host ""

# Fermer les processus Discord en cours
Get-Process -Name "Discord", "DiscordCanary", "DiscordPTB", "DiscordDevelopment" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Milliseconds 500

$discordPaths = @(
    "$env:LOCALAPPDATA\Discord",
    "$env:LOCALAPPDATA\DiscordCanary",
    "$env:LOCALAPPDATA\DiscordPTB",
    "$env:LOCALAPPDATA\DiscordDevelopment"
)

$restoredCount = 0

foreach ($disc in $discordPaths) {
    if (Test-Path $disc) {
        $appDirs = Get-ChildItem -Path $disc -Directory -Filter "app-*"
        foreach ($appDir in $appDirs) {
            $resourcesDir = Join-Path $appDir.FullName "resources"
            if (Test-Path $resourcesDir) {
                # 1. Supprimer le dossier injecté "app"
                $appFolder = Join-Path $resourcesDir "app"
                if (Test-Path $appFolder) {
                    Remove-Item $appFolder -Recurse -Force
                    Write-Host "  [✓] Dossier d'injection supprime dans $($appDir.Name)" -ForegroundColor Yellow
                }

                # 2. Restaurer app.asar depuis discord_app.asar ou _app.asar si nécessaire
                $appAsar = Join-Path $resourcesDir "app.asar"
                $backupPrimary = Join-Path $resourcesDir "discord_app.asar"
                $backupSecondary = Join-Path $resourcesDir "_app.asar"

                if (Test-Path $backupPrimary) {
                    Copy-Item $backupPrimary $appAsar -Force
                    Write-Host "  [✓] Archive originale Discord restauree dans $($appDir.Name)" -ForegroundColor Green
                    $restoredCount++
                } elseif (Test-Path $backupSecondary) {
                    Copy-Item $backupSecondary $appAsar -Force
                    Write-Host "  [✓] Archive originale Discord restauree dans $($appDir.Name)" -ForegroundColor Green
                    $restoredCount++
                }
            }
        }
    }
}

Write-Host ""
Write-Host "  =======================================================" -ForegroundColor Green
Write-Host "    Discord a ete nettoye et restaure avec succes !      " -ForegroundColor Green
Write-Host "  =======================================================" -ForegroundColor Green
Write-Host ""
Start-Sleep -Seconds 3
