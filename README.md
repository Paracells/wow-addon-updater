# Addon Forge

A desktop World of Warcraft addon manager for Windows, built with **Rust + Tauri 2**.
It discovers your WoW installation, reads the addons already in `Interface/AddOns`,
checks them against CurseForge, and installs updates or new addons with one click.

The interface is in Russian and uses a dark WoW-inspired theme. The frontend is
plain HTML/CSS/JavaScript and is embedded in the Tauri binary — no Node runtime is
required to use the app.

## Features

- **Install detection** — scans the Battle.net configuration, common drive paths
  and a manually selected folder. Supports Retail, Classic, Classic Era and Forever
  (`_retail_`, `_classic_`, `_classic_era_`, `_forever_`, …).
- **Installed addon list** — reads TOC metadata, groups multi-folder addons
  (`Questie` + `QuestieDB`, Details modules, …) and resolves CurseForge project IDs
  from `X-Curse-Project-ID`, CurseForge URLs, titles, folder names and slugs.
- **Update checking** — picks the newest stable file for the local interface version,
  with a same-major/minor fallback when the exact patch is not published.
- **Catalog search** — popular, recently updated and alphabetical sorting, paging,
  installed badges, descriptions and screenshot galleries.
- **Safe install** — validates ZIP paths, rejects traversal entries, downloads to a
  local staging area, creates a backup of replaced folders, and only then swaps files
  into `Interface/AddOns`.
- **Manifest** — remembers the CurseForge project and file ID for each installed
  addon so future checks do not depend on fragile title matching.
- **Settings** — choose the game flavor, switch between the keyless CurseForge proxy
  and the official API with a personal key, toggle auto-checks and backups, and open
  local storage folders.

## Requirements

- Windows 10/11
- [Rust](https://rustup.rs/) toolchain (stable)
- [Tauri CLI](https://v2.tauri.app/start/prerequisites/) 2.x
  (`cargo install tauri-cli --version "^2"`)
- WebView2 runtime (included with current Windows builds)
- Optional: Node.js only if you want to use `package.json` scripts

## Run

```powershell
cargo tauri dev
```

Or with the helper scripts:

```powershell
npm run dev
```

## Build

```powershell
cargo tauri build
```

The executable and installers are written under
`src-tauri/target/release/bundle/`.

## Tests

The reusable backend modules keep the original test suite:

```powershell
cargo test --manifest-path src-tauri/Cargo.toml
```

## Project layout

```
ui/                     static frontend (HTML, CSS, JS)
  index.html
  styles.css
  app.js
src-tauri/
  src/
    main.rs             Tauri entry point
    commands.rs         Tauri commands, DTOs and progress events
    config.rs           persisted settings and local paths
    curseforge.rs       CurseForge client, resolution, file selection
    wow.rs              install detection and TOC parsing
    installer.rs        ZIP validation, backups, manifest, atomic install
    models.rs           shared data types
    html.rs             HTML/Markdown description normalization
  capabilities/         Tauri permissions
  icons/                app and bundle icons
  tauri.conf.json
  Cargo.toml
```

## CurseForge API

By default Addon Forge uses the public keyless proxy:

```
https://api.curse.tools/v1/cf
```

In **Настройки → CurseForge API** you can switch to the official API:

```
https://api.curseforge.com/v1
```

The official API requires a personal key from the
[CurseForge Console](https://console.curseforge.com/). The key is stored only in the
local configuration file.

## Local storage

The Tauri app uses the same paths as the original GPUI build, so existing settings
and manifests continue to work:

- Config: `%APPDATA%\WowAddonUpdater\config.json`
- Manifest: `%LOCALAPPDATA%\WowAddonUpdater\manifest.json`
- Backups: `%LOCALAPPDATA%\WowAddonUpdater\backups`
- Downloads: `%LOCALAPPDATA%\WowAddonUpdater\downloads`

All folders are available from **Настройки → Локальное хранилище**.

## Branches

- `main` — the original GPUI implementation.
- `tauri-2` — this Tauri 2 rewrite.

## License

MIT
