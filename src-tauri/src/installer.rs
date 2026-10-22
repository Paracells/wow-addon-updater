//! Download archive handling, backup and installation.
//!
//! Addon archives are extracted into a staging directory, validated, and only
//! then copied into the game's AddOns folder. Existing folders are copied to a
//! backup directory first.

use std::collections::BTreeMap;
use std::fs::{self, File};
use std::io::{self, Write};
use std::path::{Component, Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::{bail, Context as _, Result};
use serde::{Deserialize, Serialize};

use crate::config;

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct ManifestEntry {
    pub mod_id: Option<u64>,
    pub name: String,
    pub primary_folder: String,
    #[serde(default)]
    pub folders: Vec<String>,
    pub file_id: u64,
    pub version: String,
    pub installed_at: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Manifest {
    pub version: u32,
    pub addons: BTreeMap<String, ManifestEntry>,
}

impl Default for Manifest {
    fn default() -> Self {
        Self {
            version: 1,
            addons: BTreeMap::new(),
        }
    }
}

impl Manifest {
    pub fn load() -> Self {
        let path = config::manifest_path();
        match fs::read_to_string(&path) {
            Ok(contents) => serde_json::from_str(&contents).unwrap_or_else(|error| {
                log::warn!("failed to parse {}: {error}", path.display());
                Manifest::default()
            }),
            Err(_) => Manifest::default(),
        }
    }

    pub fn save(&self) -> Result<()> {
        config::ensure_data_dirs()?;
        let path = config::manifest_path();
        let temp = path.with_extension("json.tmp");
        fs::write(&temp, serde_json::to_string_pretty(self)?)
            .with_context(|| format!("не удалось записать {}", temp.display()))?;
        fs::rename(&temp, &path)
            .with_context(|| format!("не удалось сохранить {}", path.display()))?;
        Ok(())
    }

    pub fn remember(
        &mut self,
        mod_id: Option<u64>,
        name: &str,
        primary_folder: &str,
        folders: &[String],
        file_id: u64,
        version: &str,
    ) {
        let key = primary_folder.to_ascii_lowercase();
        // Drop stale entries for the same project under another primary folder.
        if let Some(mod_id) = mod_id {
            self.addons
                .retain(|existing_key, entry| existing_key == &key || entry.mod_id != Some(mod_id));
        }
        self.addons.insert(
            key,
            ManifestEntry {
                mod_id,
                name: name.to_string(),
                primary_folder: primary_folder.to_string(),
                folders: folders.to_vec(),
                file_id,
                version: version.to_string(),
                installed_at: epoch_seconds(),
            },
        );
    }
}

pub fn epoch_seconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0)
}

#[derive(Clone, Debug)]
pub struct InstallOutcome {
    pub key: String,
    pub folders: Vec<String>,
    pub file_id: u64,
    pub backup_dir: Option<PathBuf>,
}

/// Extract `archive` into a fresh staging folder and install every addon
/// directory found inside it.
#[allow(clippy::too_many_arguments)]
pub fn install_archive(
    archive: &Path,
    addons_dir: &Path,
    mod_id: u64,
    mod_name: &str,
    file_id: u64,
    version: &str,
    old_folders: &[String],
    old_primary: Option<&str>,
    keep_backups: bool,
) -> Result<InstallOutcome> {
    config::ensure_data_dirs()?;
    let staging = unique_dir(config::staging_dir(), &format!("install-{file_id}"));
    fs::create_dir_all(&staging)
        .with_context(|| format!("не удалось создать {}", staging.display()))?;

    let result = (|| -> Result<InstallOutcome> {
        extract_zip(archive, &staging)?;
        let mut addon_dirs = find_addon_dirs(&staging, mod_name)?;
        if addon_dirs.is_empty() {
            bail!("в архиве не найдена папка аддона с .toc файлом");
        }

        addon_dirs.sort_by(|a, b| {
            folder_name(a)
                .unwrap_or_default()
                .to_ascii_lowercase()
                .cmp(&folder_name(b).unwrap_or_default().to_ascii_lowercase())
        });

        let primary_dir = choose_primary_dir(&addon_dirs, old_primary, old_folders);
        let primary_folder = folder_name(&primary_dir).unwrap_or_else(|| "addon".to_string());
        let folder_names: Vec<String> = addon_dirs
            .iter()
            .filter_map(|dir| folder_name(dir))
            .collect();

        let new_set: std::collections::HashSet<String> = folder_names
            .iter()
            .map(|f| f.to_ascii_lowercase())
            .collect();
        let stale: Vec<String> = old_folders
            .iter()
            .filter(|folder| !new_set.contains(&folder.to_ascii_lowercase()))
            .cloned()
            .collect();

        let mut backup_dir = None;
        if keep_backups {
            let needs_backup = folder_names
                .iter()
                .any(|folder| addons_dir.join(folder).is_dir())
                || stale.iter().any(|folder| addons_dir.join(folder).is_dir());
            if needs_backup {
                let backup = unique_dir(config::backups_dir(), &format!("backup-{file_id}"));
                fs::create_dir_all(&backup)?;
                for folder in folder_names.iter().chain(stale.iter()) {
                    let source = addons_dir.join(folder);
                    if source.is_dir() {
                        copy_dir_all(&source, &backup.join(folder))?;
                    }
                }
                backup_dir = Some(backup);
            }
        }

        // Install new folders. Keep a copy of removed data in memory-free
        // backups so a failed copy can be restored.
        for dir in &addon_dirs {
            let folder = folder_name(dir).context("некорректное имя папки аддона")?;
            let target = addons_dir.join(&folder);
            if target.is_dir() {
                fs::remove_dir_all(&target)
                    .with_context(|| format!("не удалось удалить {}", target.display()))?;
            }
            if let Err(error) = copy_dir_all(dir, &target) {
                if let Some(backup) = &backup_dir {
                    let restore = backup.join(&folder);
                    if restore.is_dir() {
                        let _ = fs::remove_dir_all(&target);
                        let _ = copy_dir_all(&restore, &target);
                    }
                }
                return Err(error)
                    .with_context(|| format!("не удалось установить {}", target.display()));
            }
        }

        for folder in &stale {
            let target = addons_dir.join(folder);
            if target.is_dir() {
                fs::remove_dir_all(&target).with_context(|| {
                    format!("не удалось удалить устаревшую папку {}", target.display())
                })?;
            }
        }

        let mut manifest = Manifest::load();
        manifest.remember(
            Some(mod_id),
            mod_name,
            &primary_folder,
            &folder_names,
            file_id,
            version,
        );
        manifest.save()?;

        Ok(InstallOutcome {
            key: primary_folder.to_ascii_lowercase(),
            folders: folder_names,
            file_id,
            backup_dir,
        })
    })();

    if result.is_ok() {
        let _ = fs::remove_dir_all(&staging);
        let _ = fs::remove_file(archive);
    } else {
        log::warn!("install failed, staging kept at {}", staging.display());
    }
    result
}

/// Extract a ZIP archive while rejecting paths that escape the destination.
pub fn extract_zip(archive_path: &Path, destination: &Path) -> Result<()> {
    let file = File::open(archive_path)
        .with_context(|| format!("не удалось открыть {}", archive_path.display()))?;
    let mut archive = zip::ZipArchive::new(file)
        .with_context(|| format!("не удалось прочитать архив {}", archive_path.display()))?;

    for index in 0..archive.len() {
        let mut entry = archive
            .by_index(index)
            .with_context(|| format!("не удалось прочитать файл #{index} архива"))?;

        let Some(relative) = entry.enclosed_name() else {
            bail!("архив содержит небезопасный путь: {}", entry.name());
        };
        validate_relative_path(&relative)?;

        let name = relative.to_string_lossy();
        if should_skip_archive_path(&name) {
            continue;
        }

        if let Some(mode) = entry.unix_mode() {
            if mode & 0o170000 == 0o120000 {
                bail!("архив содержит символическую ссылку: {name}");
            }
        }

        let output_path = destination.join(&relative);
        if entry.is_dir() {
            fs::create_dir_all(&output_path)?;
            continue;
        }

        if let Some(parent) = output_path.parent() {
            fs::create_dir_all(parent)?;
        }
        let mut output = File::create(&output_path)
            .with_context(|| format!("не удалось создать {}", output_path.display()))?;
        io::copy(&mut entry, &mut output)
            .with_context(|| format!("не удалось распаковать {name}"))?;
        output.flush()?;
    }
    Ok(())
}

fn should_skip_archive_path(path: &str) -> bool {
    let lower = path.replace('\\', "/").to_ascii_lowercase();
    lower.starts_with("__macosx/")
        || lower == "__macosx"
        || lower.ends_with("/.ds_store")
        || lower == ".ds_store"
        || lower.ends_with("/thumbs.db")
        || lower == "thumbs.db"
        || lower.ends_with("/desktop.ini")
        || lower == "desktop.ini"
}

pub fn validate_relative_path(path: &Path) -> Result<()> {
    if path.as_os_str().is_empty() {
        bail!("пустой путь в архиве");
    }
    for component in path.components() {
        match component {
            Component::Normal(name) => {
                let name = name.to_string_lossy();
                validate_file_name(&name)?;
            }
            _ => bail!("небезопасный путь в архиве: {}", path.display()),
        }
    }
    Ok(())
}

fn validate_file_name(name: &str) -> Result<()> {
    if name.is_empty() || name == "." || name == ".." {
        bail!("некорректное имя файла: {name:?}");
    }
    if name.contains(['/', '\\', ':', '<', '>', '"', '|', '?', '*']) {
        bail!("некорректное имя файла: {name:?}");
    }
    if name.ends_with(' ') || name.ends_with('.') {
        bail!("некорректное имя файла: {name:?}");
    }

    let stem = name.split('.').next().unwrap_or(name).to_ascii_uppercase();
    if matches!(
        stem.as_str(),
        "CON"
            | "PRN"
            | "AUX"
            | "NUL"
            | "COM1"
            | "COM2"
            | "COM3"
            | "COM4"
            | "COM5"
            | "COM6"
            | "COM7"
            | "COM8"
            | "COM9"
            | "LPT1"
            | "LPT2"
            | "LPT3"
            | "LPT4"
            | "LPT5"
            | "LPT6"
            | "LPT7"
            | "LPT8"
            | "LPT9"
    ) {
        bail!("зарезервированное имя файла: {name:?}");
    }
    Ok(())
}

/// Find directories inside the staging folder that are actual addon roots.
fn find_addon_dirs(staging: &Path, mod_name: &str) -> Result<Vec<PathBuf>> {
    let mut dirs = Vec::new();
    collect_toc_dirs(staging, 0, &mut dirs)?;

    if has_toc(staging) {
        // Files were packed without a top-level folder. Wrap the loose files
        // (but not already discovered addon subfolders) in a named folder.
        let folder = sanitize_folder(mod_name).unwrap_or_else(|| "addon".to_string());
        let target = staging.join(&folder);
        if target.exists() {
            bail!("конфликт при распаковке: {}", target.display());
        }
        fs::create_dir_all(&target)?;
        for entry in fs::read_dir(staging)?.flatten() {
            let path = entry.path();
            if path == target || dirs.iter().any(|dir| dir == &path) {
                continue;
            }
            let file_name = entry.file_name();
            fs::rename(&path, target.join(file_name))?;
        }
        dirs.push(target);
    }

    Ok(dirs)
}

fn collect_toc_dirs(dir: &Path, depth: usize, output: &mut Vec<PathBuf>) -> Result<()> {
    if depth > 3 {
        return Ok(());
    }
    let Ok(entries) = fs::read_dir(dir) else {
        return Ok(());
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_ascii_lowercase();
        if name == "__macosx" || name.starts_with('.') {
            continue;
        }
        if has_toc(&path) {
            output.push(path);
        } else {
            collect_toc_dirs(&path, depth + 1, output)?;
        }
    }
    Ok(())
}

fn has_toc(dir: &Path) -> bool {
    let Ok(entries) = fs::read_dir(dir) else {
        return false;
    };
    entries.flatten().any(|entry| {
        entry.path().is_file()
            && entry
                .path()
                .extension()
                .map(|ext| ext.eq_ignore_ascii_case("toc"))
                .unwrap_or(false)
    })
}

fn choose_primary_dir(
    dirs: &[PathBuf],
    old_primary: Option<&str>,
    old_folders: &[String],
) -> PathBuf {
    if let Some(old_primary) = old_primary {
        if let Some(found) = dirs.iter().find(|dir| {
            folder_name(dir)
                .map(|name| name.eq_ignore_ascii_case(old_primary))
                .unwrap_or(false)
        }) {
            return found.clone();
        }
    }
    if let Some(found) = dirs.iter().find(|dir| {
        let folder = folder_name(dir).unwrap_or_default();
        old_folders
            .iter()
            .any(|old| old.eq_ignore_ascii_case(&folder))
    }) {
        return found.clone();
    }
    dirs.iter()
        .min_by_key(|dir| {
            let name = folder_name(dir).unwrap_or_default();
            (name.len(), name.to_ascii_lowercase())
        })
        .cloned()
        .unwrap_or_else(|| dirs[0].clone())
}

fn folder_name(path: &Path) -> Option<String> {
    path.file_name()
        .map(|name| name.to_string_lossy().to_string())
}

pub fn sanitize_folder(name: &str) -> Option<String> {
    let mut output = String::new();
    for ch in name.trim().chars() {
        if ch.is_control() || matches!(ch, '/' | '\\' | ':' | '<' | '>' | '"' | '|' | '?' | '*') {
            output.push('-');
        } else {
            output.push(ch);
        }
    }
    let output = output.trim().trim_matches('.').trim().to_string();
    if output.is_empty() || validate_file_name(&output).is_err() {
        None
    } else {
        Some(output)
    }
}

pub fn copy_dir_all(source: &Path, destination: &Path) -> Result<()> {
    fs::create_dir_all(destination)
        .with_context(|| format!("не удалось создать {}", destination.display()))?;
    for entry in fs::read_dir(source)
        .with_context(|| format!("не удалось прочитать {}", source.display()))?
    {
        let entry = entry?;
        let file_type = entry.file_type()?;
        let target = destination.join(entry.file_name());
        if file_type.is_dir() {
            copy_dir_all(&entry.path(), &target)?;
        } else if file_type.is_file() {
            fs::copy(entry.path(), &target)
                .with_context(|| format!("не удалось скопировать {}", entry.path().display()))?;
        }
    }
    Ok(())
}

/// Return true when `folder` is a plain top-level directory name inside AddOns.
pub fn is_safe_addon_folder(folder: &str) -> bool {
    if folder.trim().is_empty() || folder == "." || folder == ".." {
        return false;
    }
    let path = Path::new(folder);
    let mut components = path.components();
    matches!(components.next(), Some(Component::Normal(_))) && components.next().is_none()
}

/// Remove addon folders, optionally copying them into the backups directory first.
pub fn remove_addon_folders(
    addons_dir: &Path,
    folders: &[String],
    keep_backups: bool,
) -> Result<(Option<PathBuf>, usize)> {
    let mut existing = Vec::new();
    for folder in folders {
        if !is_safe_addon_folder(folder) {
            bail!("Некорректное имя папки аддона: {folder:?}");
        }
        let path = addons_dir.join(folder);
        let Ok(metadata) = fs::symlink_metadata(&path) else {
            continue;
        };
        if metadata.file_type().is_symlink() {
            bail!(
                "Папка аддона является символической ссылкой: {}",
                path.display()
            );
        }
        if metadata.is_dir() {
            existing.push((folder.clone(), path));
        }
    }
    if existing.is_empty() {
        bail!("Папки аддона не найдены в AddOns.");
    }

    let backup_dir = if keep_backups {
        let backup = unique_dir(config::backups_dir(), "removed");
        fs::create_dir_all(&backup)
            .with_context(|| format!("Не удалось создать {}", backup.display()))?;
        for (folder, source) in &existing {
            copy_dir_all(source, &backup.join(folder))?;
        }
        Some(backup)
    } else {
        None
    };

    for (_, path) in &existing {
        fs::remove_dir_all(path)
            .with_context(|| format!("Не удалось удалить {}", path.display()))?;
    }

    Ok((backup_dir, existing.len()))
}

fn unique_dir(parent: PathBuf, prefix: &str) -> PathBuf {
    let _ = fs::create_dir_all(&parent);
    let base = format!("{prefix}-{}", epoch_seconds());
    let mut candidate = parent.join(&base);
    let mut index = 1;
    while candidate.exists() {
        candidate = parent.join(format!("{base}-{index}"));
        index += 1;
    }
    candidate
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_unsafe_paths() {
        assert!(validate_relative_path(Path::new("../evil.txt")).is_err());
        assert!(validate_relative_path(Path::new("C:/Windows/system32")).is_err());
        assert!(validate_relative_path(Path::new("Addon/../evil")).is_err());
        assert!(validate_relative_path(Path::new("Addon/Addon.toc")).is_ok());
    }

    #[test]
    fn finds_addon_dir_in_wrapper() {
        let temp = tempfile::tempdir().unwrap();
        let addon = temp.path().join("Wrapper").join("MyAddon");
        fs::create_dir_all(&addon).unwrap();
        fs::write(addon.join("MyAddon.toc"), "## Title: MyAddon").unwrap();
        let dirs = find_addon_dirs(temp.path(), "MyAddon").unwrap();
        assert_eq!(dirs.len(), 1);
        assert!(dirs[0].ends_with("MyAddon"));
    }

    #[test]
    fn removes_addon_folders_without_backup() {
        let temp = tempfile::tempdir().unwrap();
        let addons = temp.path().join("AddOns");
        let folder = addons.join("MyAddon");
        fs::create_dir_all(&folder).unwrap();
        fs::write(folder.join("MyAddon.toc"), "## Title: MyAddon").unwrap();

        let (backup, removed) =
            remove_addon_folders(&addons, &["MyAddon".to_string()], false).unwrap();
        assert_eq!(removed, 1);
        assert!(backup.is_none());
        assert!(!folder.exists());
    }

    #[test]
    fn accepts_only_plain_addon_folder_names() {
        assert!(is_safe_addon_folder("DBM-Core"));
        assert!(is_safe_addon_folder("Details_Compare2"));
        assert!(!is_safe_addon_folder(""));
        assert!(!is_safe_addon_folder("."));
        assert!(!is_safe_addon_folder(".."));
        assert!(!is_safe_addon_folder("../DBM-Core"));
        assert!(!is_safe_addon_folder("nested/DBM-Core"));
        assert!(!is_safe_addon_folder("C:\\Addons\\DBM-Core"));
    }

    #[test]
    fn finds_loose_root_files() {
        let temp = tempfile::tempdir().unwrap();
        fs::write(temp.path().join("MyAddon.toc"), "## Title: MyAddon").unwrap();
        fs::write(temp.path().join("core.lua"), "").unwrap();
        let dirs = find_addon_dirs(temp.path(), "MyAddon").unwrap();
        assert_eq!(dirs.len(), 1);
        assert!(dirs[0].join("core.lua").is_file());
    }
}
