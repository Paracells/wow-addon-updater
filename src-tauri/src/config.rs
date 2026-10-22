//! Persistent application settings.
//!
//! Regular builds keep settings in `%APPDATA%\WowAddonUpdater\config.json` and
//! downloaded archives, staging folders and backups in `%LOCALAPPDATA%`.
//! Portable builds keep all of them in a `data` folder next to the executable.

use std::fs;
use std::path::{Path, PathBuf};

use anyhow::{Context as _, Result};
use serde::{Deserialize, Serialize};

pub const APP_NAME: &str = "WowAddonUpdater";

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default)]
pub struct Config {
    /// Path to the flavour directory (`...\_forever_`) or to the product root.
    pub wow_path: Option<String>,
    pub api_key: String,
    /// Use `api.curseforge.com` instead of the keyless `api.curse.tools` proxy.
    pub use_official_api: bool,
    pub auto_check_updates: bool,
    pub keep_backups: bool,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            wow_path: None,
            api_key: String::new(),
            use_official_api: false,
            auto_check_updates: true,
            keep_backups: true,
        }
    }
}

impl Config {
    pub fn effective_api_key(&self) -> Option<String> {
        let key = self.api_key.trim();
        if !key.is_empty() {
            return Some(key.to_string());
        }
        std::env::var("CURSEFORGE_API_KEY")
            .ok()
            .map(|key| key.trim().to_string())
            .filter(|key| !key.is_empty())
    }
}

fn portable_data_dir() -> Option<PathBuf> {
    if !cfg!(feature = "portable") {
        return None;
    }
    std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(|dir| dir.join("data")))
}

pub fn config_dir() -> PathBuf {
    if let Some(dir) = portable_data_dir() {
        return dir;
    }
    if let Some(appdata) = std::env::var_os("APPDATA") {
        PathBuf::from(appdata).join(APP_NAME)
    } else {
        PathBuf::from(".").join(APP_NAME)
    }
}

pub fn config_path() -> PathBuf {
    config_dir().join("config.json")
}

pub fn data_dir() -> PathBuf {
    if let Some(dir) = portable_data_dir() {
        return dir;
    }
    if let Some(local) = std::env::var_os("LOCALAPPDATA") {
        PathBuf::from(local).join(APP_NAME)
    } else {
        config_dir()
    }
}

pub fn backups_dir() -> PathBuf {
    data_dir().join("backups")
}

pub fn downloads_dir() -> PathBuf {
    data_dir().join("downloads")
}

pub fn staging_dir() -> PathBuf {
    data_dir().join("staging")
}

pub fn manifest_path() -> PathBuf {
    data_dir().join("manifest.json")
}

pub fn load() -> Config {
    let path = config_path();
    match fs::read_to_string(&path) {
        Ok(contents) => match serde_json::from_str(&contents) {
            Ok(config) => config,
            Err(error) => {
                log::warn!("failed to parse {}: {error}", path.display());
                Config::default()
            }
        },
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Config::default(),
        Err(error) => {
            log::warn!("failed to read {}: {error}", path.display());
            Config::default()
        }
    }
}

pub fn save(config: &Config) -> Result<()> {
    let dir = config_dir();
    fs::create_dir_all(&dir)
        .with_context(|| format!("не удалось создать {}", dir.display()))?;
    let path = config_path();
    let temp = path.with_extension("json.tmp");
    let contents = serde_json::to_string_pretty(config)?;
    fs::write(&temp, contents)
        .with_context(|| format!("не удалось записать {}", temp.display()))?;
    fs::rename(&temp, &path)
        .with_context(|| format!("не удалось сохранить {}", path.display()))?;
    Ok(())
}

pub fn ensure_data_dirs() -> Result<()> {
    for dir in [data_dir(), backups_dir(), downloads_dir(), staging_dir()] {
        fs::create_dir_all(&dir)
            .with_context(|| format!("не удалось создать {}", dir.display()))?;
    }
    Ok(())
}

/// Open a directory in the system file manager.
pub fn reveal_path(path: &Path) {
    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("explorer").arg(path).spawn();
    }
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open").arg(path).spawn();
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let _ = std::process::Command::new("xdg-open").arg(path).spawn();
    }
}
