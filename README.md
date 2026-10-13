<div align="center">

# LoliCord

**A custom Discord client built for people who actually care about how Discord runs.**

[![License](https://img.shields.io/badge/license-GPL%20v3-a855f7)](./LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows-3b82f6.svg?logo=windows\&logoColor=white)](https://github.com/ownhoye/hoye-bot-discord)

---

</div>

LoliCord is a fork of Nightcord, itself a fork of Equicord, which builds on top of Vencord. We stripped out the obfuscation, cleaned things up, added our own improvements, and kept what works. No bloat, no nonsense.

---

## What's in it

* **Faster startup** — no obfuscation means the client loads noticeably quicker and sits lighter on your CPU and RAM.
* **Auto-updates** — checks for updates in the background on launch and applies them silently.
* **Plugin support** — compatible with the existing plugin ecosystem. Install community plugins straight from Git links.
* **Better audio** — hardware-optimized voice modules for cleaner, louder audio out of the box.
* **Custom styling** — smoother UI, custom icons, and various quality-of-life improvements.

---

## Installation (Windows)

1. Download **`lolicord-install.ps1`**
2. Right-click → **Run with PowerShell**
3. Follow the steps, restart Discord, done.

---

## Building from source

### Requirements

* Git
* Node.js (LTS)
* pnpm

```bash
npm install -g pnpm
```

### Clone & Build

```bash
git clone https://github.com/ownhoye/hoye-bot-discord.git
cd lolicord
pnpm install
pnpm build
```

### Inject into Discord

```bash
pnpm inject
```

### Restore stock Discord

```bash
pnpm uninject
```

---

## Publishing a release (installer)

Releases are built by GitHub Actions (`.github/workflows/release.yml`) on Windows:

```bash
git tag v1.29.3
git push origin v1.29.3
```

The workflow attaches `LoliCord-Installer.exe`, `lolicord-dist.zip` and `desktop.asar`
to the GitHub release. The installer, `install.ps1` and the in-app updater all download
from the latest release of this repository.

---

## Badges

LoliCord loads its own badge list from [`badges.json`](./badges.json) at startup
(and every 30 minutes). To give someone a badge, add their Discord user ID with a
tooltip and an image URL, then push to `main` — no new release is needed:

```json
{
    "1403456424461467708": [
        { "tooltip": "LoliCord Owner", "badge": "https://raw.githubusercontent.com/ownhoye/hoye-bot-discord/main/assets/badges/owner.png" }
    ]
}
```

These badges are only visible to LoliCord users, like Vencord or Equicord badges are
only visible to their own users.

---

## Repository

Source code:

https://github.com/ownhoye/hoye-bot-discord

---

## Credits

LoliCord wouldn't exist without Nightcord, [Equicord](https://github.com/Equicord/Equicord) and [Vencord](https://github.com/Vendicated/Vencord). A huge chunk of what makes this work comes directly from their projects. We're fully aware of that and genuinely appreciate everything they've built — we're just taking it in a different direction. Big thanks to everyone who's contributed to both.

---

## Disclaimer

*LoliCord is not affiliated with Discord Inc. in any way.*

Using third-party clients is technically against Discord's Terms of Service. Use at your own risk.
