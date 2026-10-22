# Addon Forge

A desktop World of Warcraft addon manager for Windows, built with **Rust + Tauri 2**.
It discovers your WoW installation, reads the addons already in `Interface/AddOns`,
checks them against CurseForge, and installs updates or new addons with one click.

The interface is in Russian and uses a dark WoW-inspired theme. It is typeset with
locally bundled **Inter** and **JetBrains Mono** fonts, so the app looks the same
offline and does not depend on installed system fonts. The frontend is plain
HTML/CSS/JavaScript and is embedded in the Tauri binary - no Node runtime is
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
- **Catalog search** - popular, recently updated and alphabetical sorting, paging,
  installed badges, descriptions, a full-screen screenshot carousel and a list of
  supported game versions where your installed version is highlighted in green.
- **Grid and list views** — both the installed addon list and the CurseForge catalog
  can be switched between compact rows and cards; the preference is remembered.
- **Context actions** — right-click an addon to install, reinstall, open details or
  remove it. Double-clicking an installed addon or catalog item opens its details.
  Removal asks for confirmation and keeps a backup when backups are enabled.
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

### Portable build

```powershell
npm run portable
```

This builds the app without an installer and creates:

- `dist/AddonForge-portable/Addon Forge.exe` — run directly, no installation;
- `dist/AddonForge-portable.zip` — the whole folder ready to unpack elsewhere.

The portable build keeps its settings, manifest, downloads and backups in a `data`
folder next to the executable. Move the whole folder when copying the app to another
computer. WebView2 Runtime is still required (it is included with current Windows
versions).

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
  fonts/                bundled Inter / JetBrains Mono + OFL licenses
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

Regular builds use the same paths as the original GPUI build, so existing settings
and manifests continue to work:

- Config: `%APPDATA%\WowAddonUpdater\config.json`
- Manifest: `%LOCALAPPDATA%\WowAddonUpdater\manifest.json`
- Backups: `%LOCALAPPDATA%\WowAddonUpdater\backups`
- Downloads: `%LOCALAPPDATA%\WowAddonUpdater\downloads`

The portable build stores the config, manifest, backups and downloads in `data`
next to its executable. All folders are available from
**Настройки → Локальное хранилище**.

## Branches

- `main` — the original GPUI implementation.
- `tauri-2` — this Tauri 2 rewrite.

## License

MIT
