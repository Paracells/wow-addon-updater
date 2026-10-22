//! Plain data structures shared between the UI and the background workers.

use std::path::PathBuf;

use serde::Serialize;

/// A World of Warcraft installation (one game flavour, e.g. `_retail_`).
#[derive(Clone, Debug, Default)]
pub struct WoWInstall {
    /// The product root, e.g. `E:\World of Warcraft`.
    pub root: PathBuf,
    /// The flavour directory, e.g. `E:\World of Warcraft\_forever_`.
    pub flavor_dir: PathBuf,
    /// `<flavor>\Interface\AddOns`.
    pub addons_dir: PathBuf,
    /// `_forever_`, `_retail_`, ...
    pub flavor: String,
    /// Product code from `.build.info`, e.g. `wowf`.
    pub product: String,
    /// Version without build number, e.g. `1.60.1`.
    pub version: String,
    /// Full version string, e.g. `1.60.1.70532`.
    pub build: String,
    /// Interface number derived from the version, e.g. `16001`.
    pub interface: Option<u32>,
}

impl WoWInstall {
    pub fn flavor_label(&self) -> String {
        match self.flavor.as_str() {
            "_retail_" => "Retail".to_string(),
            "_classic_" => "Classic".to_string(),
            "_classic_era_" => "Classic Era".to_string(),
            "_forever_" => "Forever".to_string(),
            other => {
                let trimmed = other.trim_matches('_');
                if trimmed.is_empty() {
                    "WoW".to_string()
                } else {
                    let mut chars = trimmed.chars();
                    match chars.next() {
                        Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
                        None => "WoW".to_string(),
                    }
                }
            }
        }
    }

    pub fn display_name(&self) -> String {
        format!("World of Warcraft · {}", self.flavor_label())
    }
}

/// One addon group discovered in the AddOns directory. A group may span
/// several top-level folders (`Details`, `Details_Compare2`, ...).
#[derive(Clone, Debug, Default)]
pub struct InstalledAddon {
    /// Stable key used by the UI (lowercase primary folder name).
    pub key: String,
    pub title: String,
    pub version: String,
    pub author: String,
    pub notes: String,
    pub folders: Vec<String>,
    pub primary_folder: String,
    pub curse_id: Option<u64>,
    pub website: Option<String>,
    pub interface: Option<u32>,
    /// File id of the last version installed by this app, if known.
    pub installed_file_id: Option<u64>,
}

impl InstalledAddon {
    pub fn display_version(&self) -> String {
        if self.version.trim().is_empty() {
            "—".to_string()
        } else {
            self.version.clone()
        }
    }
}

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Screenshot {
    pub title: String,
    pub thumb: String,
    pub url: String,
}

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteFile {
    pub id: u64,
    pub display_name: String,
    pub file_name: String,
    pub file_date: String,
    pub file_length: u64,
    pub download_url: Option<String>,
    pub game_versions: Vec<String>,
    /// 1 = release, 2 = beta, 3 = alpha.
    pub release_type: u64,
}

impl RemoteFile {
    pub fn version_label(&self) -> String {
        if self.display_name.trim().is_empty() {
            self.file_name.clone()
        } else {
            self.display_name.clone()
        }
    }
}

/// A CurseForge addon with everything the UI needs.
#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteAddon {
    pub id: u64,
    pub name: String,
    pub slug: String,
    pub summary: String,
    pub authors: Vec<String>,
    pub download_count: u64,
    pub categories: Vec<String>,
    pub logo: Option<String>,
    pub screenshots: Vec<Screenshot>,
    pub date_modified: String,
    pub website_url: Option<String>,
    pub latest_file: Option<RemoteFile>,
}

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AddonDetails {
    pub remote: RemoteAddon,
    pub description: String,
    pub latest: Option<RemoteFile>,
    pub files: Vec<RemoteFile>,
}

/// Update state of an installed addon.
#[derive(Clone, Debug, PartialEq)]
pub enum AddonStatus {
    UpToDate,
    UpdateAvailable,
    /// Not linked to a project on CurseForge.
    Unresolved,
    /// A project was found, but it has no file for the local game version.
    NoCompatible,
    Error(String),
}

impl AddonStatus {
    pub fn label(&self) -> &str {
        match self {
            AddonStatus::UpToDate => "Актуально",
            AddonStatus::UpdateAvailable => "Есть обновление",
            AddonStatus::Unresolved => "Не найден на CurseForge",
            AddonStatus::NoCompatible => "Нет версии для игры",
            AddonStatus::Error(_) => "Ошибка",
        }
    }

    pub fn is_update(&self) -> bool {
        matches!(self, AddonStatus::UpdateAvailable)
    }
}

/// Result of checking one installed addon.
#[derive(Clone, Debug)]
pub struct CheckResult {
    pub addon_key: String,
    pub mod_id: Option<u64>,
    pub mod_name: Option<String>,
    pub latest: Option<RemoteFile>,
    pub status: AddonStatus,
    pub error: Option<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SearchSort {
    Popular,
    Updated,
    Name,
}

impl SearchSort {
    pub fn field(self) -> &'static str {
        match self {
            SearchSort::Popular => "6",
            SearchSort::Updated => "3",
            SearchSort::Name => "4",
        }
    }

    pub fn order(self) -> &'static str {
        match self {
            SearchSort::Name => "asc",
            _ => "desc",
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchPage {
    pub results: Vec<RemoteAddon>,
    pub has_more: bool,
}

/// Turn an archive label such as `Lueur-1.4.0.zip` into `1.4.0`.
pub fn friendly_version(title: &str, version: &str) -> String {
    let mut value = version.trim();
    if value.to_ascii_lowercase().ends_with(".zip") {
        value = &value[..value.len() - 4];
    }
    let title_lower = title.trim().to_ascii_lowercase();
    if !title_lower.is_empty() {
        let value_lower = value.to_ascii_lowercase();
        if let Some(rest) = value_lower.strip_prefix(&title_lower) {
            if let Some(separator) = rest.chars().next() {
                if matches!(separator, '-' | '_' | ' ') {
                    value = &value[title_lower.len() + separator.len_utf8()..];
                }
            }
        }
    }
    value.trim().to_string()
}

#[cfg(test)]
mod tests {
    use super::friendly_version;

    #[test]
    fn cleans_archive_version_labels() {
        assert_eq!(friendly_version("Lueur", "Lueur-1.4.0.zip"), "1.4.0");
        assert_eq!(
            friendly_version("Questie", "v12.1.0+v1.0.6"),
            "v12.1.0+v1.0.6"
        );
    }
}
