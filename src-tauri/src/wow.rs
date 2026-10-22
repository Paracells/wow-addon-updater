//! World of Warcraft installation detection and TOC parsing.

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use serde_json::Value;

use crate::installer::Manifest;
use crate::models::{InstalledAddon, WoWInstall};

/// Values parsed from an addon's `.toc` file.
#[derive(Clone, Debug, Default)]
pub struct TocInfo {
    pub title: Option<String>,
    pub version: Option<String>,
    pub author: Option<String>,
    pub notes: Option<String>,
    pub interfaces: Vec<u32>,
    pub curse_id: Option<u64>,
    pub website: Option<String>,
}

/// Parse the `## Key: Value` header of a TOC file.
pub fn parse_toc(text: &str) -> TocInfo {
    let text = text.strip_prefix('\u{feff}').unwrap_or(text);
    let mut values: HashMap<String, String> = HashMap::new();

    for line in text.lines() {
        let line = line.trim_start_matches('\u{feff}').trim_end_matches('\r');
        let Some(rest) = line.strip_prefix("##") else {
            continue;
        };
        let Some((key, value)) = rest.split_once(':') else {
            continue;
        };
        let key = key.trim().to_ascii_lowercase();
        let value = clean_toc_value(value);
        if !value.is_empty() {
            values.entry(key).or_insert(value);
        }
    }

    let localized = |base: &str| -> Option<String> {
        // Prefer Russian, then English, then the unlocalised value.
        for key in [
            format!("{base}-ruru"),
            format!("{base}-enus"),
            base.to_string(),
        ] {
            if let Some(value) = values.get(&key) {
                return Some(value.clone());
            }
        }
        None
    };

    let interfaces = values
        .get("interface")
        .map(|value| {
            value
                .split(',')
                .filter_map(|part| part.trim().parse::<u32>().ok())
                .collect()
        })
        .unwrap_or_default();

    let curse_id = values
        .get("x-curse-project-id")
        .and_then(|value| value.split(|c: char| !c.is_ascii_digit()).find(|s| !s.is_empty()))
        .and_then(|value| value.parse::<u64>().ok());

    let website = values.get("x-website").cloned();

    TocInfo {
        title: localized("title"),
        version: values.get("version").cloned(),
        author: localized("author"),
        notes: localized("notes"),
        interfaces,
        curse_id,
        website,
    }
}

fn clean_toc_value(value: &str) -> String {
    strip_wow_markup(value)
        .trim()
        .trim_matches('"')
        .trim()
        .to_string()
}

/// Remove WoW colour codes and texture/atlas escapes from a TOC value.
pub fn strip_wow_markup(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut output = String::with_capacity(input.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'|' && i + 1 < bytes.len() {
            match bytes[i + 1] {
                b'c' if i + 10 <= bytes.len()
                    && bytes[i + 2..i + 10].iter().all(u8::is_ascii_hexdigit) =>
                {
                    i += 10;
                    continue;
                }
                b'r' => {
                    i += 2;
                    continue;
                }
                b'T' | b'A' => {
                    // |Tpath:size|t  /  |Aatlas:size|a
                    let terminator = if bytes[i + 1] == b'T' { b't' } else { b'a' };
                    let mut j = i + 2;
                    while j + 1 < bytes.len() {
                        if bytes[j] == b'|' && bytes[j + 1] == terminator {
                            j += 2;
                            break;
                        }
                        j += 1;
                    }
                    i = j;
                    continue;
                }
                b'H' => {
                    i += 2;
                    continue;
                }
                b'h' => {
                    i += 2;
                    continue;
                }
                _ => {}
            }
        }
        let ch = input[i..].chars().next().unwrap_or('\u{fffd}');
        output.push(ch);
        i += ch.len_utf8();
    }
    output
}

/// Read a TOC file, supporting UTF-8 (with or without BOM) and UTF-16 LE/BE.
pub fn read_toc_text(path: &Path) -> std::io::Result<String> {
    let bytes = fs::read(path)?;
    if bytes.starts_with(&[0xff, 0xfe]) {
        return Ok(decode_utf16(&bytes[2..], true));
    }
    if bytes.starts_with(&[0xfe, 0xff]) {
        return Ok(decode_utf16(&bytes[2..], false));
    }
    Ok(String::from_utf8_lossy(&bytes)
        .trim_start_matches('\u{feff}')
        .to_string())
}

fn decode_utf16(bytes: &[u8], little_endian: bool) -> String {
    let units: Vec<u16> = bytes
        .chunks_exact(2)
        .map(|chunk| {
            if little_endian {
                u16::from_le_bytes([chunk[0], chunk[1]])
            } else {
                u16::from_be_bytes([chunk[0], chunk[1]])
            }
        })
        .collect();
    String::from_utf16_lossy(&units)
}

/// Parse `.build.info` and return `(game_version, build, product)`.
pub fn parse_build_info(text: &str) -> Option<(String, String, Option<String>)> {
    let mut lines = text
        .lines()
        .map(|line| line.trim().trim_start_matches('\u{feff}'))
        .filter(|line| !line.is_empty());
    let header = lines.next()?;
    let values = lines.next()?;

    let headers: Vec<&str> = header.split('|').collect();
    let values: Vec<&str> = values.split('|').collect();
    if headers.len() != values.len() {
        return None;
    }

    let mut version = None;
    let mut product = None;
    for (key, value) in headers.iter().zip(values.iter()) {
        let key = key.trim();
        let key_lower = key.to_ascii_lowercase();
        if (key_lower.starts_with("version") || key_lower.starts_with("versions name"))
            && !key_lower.contains("cdn")
        {
            version = Some(value.trim().to_string());
        }
        if key_lower.starts_with("product") {
            product = Some(value.trim().to_string());
        }
    }

    let full_version = version?;
    if full_version.is_empty() {
        return None;
    }
    // 1.60.1.70532 -> 1.60.1 / 1.60.1.70532
    let mut parts: Vec<&str> = full_version.split('.').collect();
    let game_version = if parts.len() >= 4 {
        parts.truncate(3);
        parts.join(".")
    } else {
        full_version.clone()
    };
    Some((game_version, full_version, product))
}

/// Derive the interface number from a version string:
/// 1.60.1 -> 16001, 11.1.7 -> 110107.
pub fn interface_from_version(version: &str) -> Option<u32> {
    let parts: Vec<u32> = version
        .split('.')
        .filter_map(|part| part.parse::<u32>().ok())
        .collect();
    if parts.len() < 2 {
        return None;
    }
    let major = parts[0];
    let minor = parts[1];
    let patch = parts.get(2).copied().unwrap_or(0);
    Some(major * 10_000 + minor * 100 + patch)
}

pub fn detect_installs(configured: Option<&str>) -> Vec<WoWInstall> {
    let mut roots: Vec<PathBuf> = Vec::new();

    if let Some(path) = configured {
        let path = PathBuf::from(path);
        if path.exists() {
            roots.push(path);
        }
    }

    for root in battlenet_roots() {
        roots.push(root);
    }

    for letter in b'c'..=b'z' {
        let drive = format!("{}:\\", (letter as char).to_ascii_uppercase());
        for suffix in [
            "World of Warcraft",
            "Games\\World of Warcraft",
            "Program Files\\World of Warcraft",
            "Program Files (x86)\\World of Warcraft",
        ] {
            let candidate = Path::new(&drive).join(suffix);
            if candidate.is_dir() {
                roots.push(candidate);
            }
        }
    }

    let mut installs = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for root in roots {
        for install in discover_at(&root) {
            let identity = install
                .flavor_dir
                .canonicalize()
                .unwrap_or_else(|_| install.flavor_dir.clone());
            if seen.insert(identity.to_string_lossy().to_ascii_lowercase()) {
                installs.push(install);
            }
        }
    }

    installs.sort_by(|a, b| {
        a.flavor_label()
            .to_ascii_lowercase()
            .cmp(&b.flavor_label().to_ascii_lowercase())
            .then_with(|| a.flavor_dir.cmp(&b.flavor_dir))
    });
    installs
}

fn battlenet_roots() -> Vec<PathBuf> {
    let Some(appdata) = std::env::var_os("APPDATA") else {
        return Vec::new();
    };
    let path = PathBuf::from(appdata).join("Battle.net").join("Battle.net.config");
    let Ok(contents) = fs::read_to_string(path) else {
        return Vec::new();
    };
    let Ok(json) = serde_json::from_str::<Value>(&contents) else {
        return Vec::new();
    };

    let mut roots = Vec::new();
    if let Some(default_path) = json
        .get("Client")
        .and_then(|client| client.get("Install"))
        .and_then(|install| install.get("DefaultInstallPath"))
        .and_then(Value::as_str)
    {
        let base = PathBuf::from(default_path);
        let candidate = base.join("World of Warcraft");
        if candidate.is_dir() {
            roots.push(candidate);
        }
        if base.join("_retail_").is_dir() || base.join("Interface").is_dir() {
            roots.push(base);
        }
    }

    collect_wow_paths(&json, &mut roots);
    roots
}

fn collect_wow_paths(value: &Value, roots: &mut Vec<PathBuf>) {
    match value {
        Value::String(text)
            if text.to_ascii_lowercase().contains("world of warcraft")
                && !text.contains('%') =>
        {
            let path = PathBuf::from(text);
            if path.is_dir() && !roots.iter().any(|existing| existing == &path) {
                roots.push(path);
            }
        }
        Value::Array(values) => {
            for value in values {
                collect_wow_paths(value, roots);
            }
        }
        Value::Object(map) => {
            for value in map.values() {
                collect_wow_paths(value, roots);
            }
        }
        _ => {}
    }
}

/// Inspect a path chosen by the user (or a known location) and return every
/// flavour that looks like a valid WoW installation.
pub fn discover_at(path: &Path) -> Vec<WoWInstall> {
    let mut path = path.to_path_buf();
    if jsonish_ends_with(&path, "Interface\\AddOns") || jsonish_ends_with(&path, "Interface/AddOns") {
        if let Some(parent) = path.parent() {
            if let Some(parent) = parent.parent() {
                path = parent.to_path_buf();
            }
        }
    }

    let mut flavors: Vec<PathBuf> = Vec::new();
    if path.join("Interface").join("AddOns").is_dir() {
        flavors.push(path.clone());
    } else if let Ok(entries) = fs::read_dir(&path) {
        for entry in entries.flatten() {
            let candidate = entry.path();
            if candidate.is_dir()
                && candidate
                    .file_name()
                    .map(|name| name.to_string_lossy().starts_with('_'))
                    .unwrap_or(false)
                && candidate.join("Interface").join("AddOns").is_dir()
            {
                flavors.push(candidate);
            }
        }
    }

    let mut installs: Vec<WoWInstall> = Vec::new();
    for flavor_dir in flavors {
        if let Some(install) = build_install(&flavor_dir) {
            installs.push(install);
        }
    }
    installs
}

fn jsonish_ends_with(path: &Path, suffix: &str) -> bool {
    let normalized = path.to_string_lossy().replace('/', "\\");
    normalized
        .to_ascii_lowercase()
        .ends_with(&suffix.replace('/', "\\").to_ascii_lowercase())
}

fn build_install(flavor_dir: &Path) -> Option<WoWInstall> {
    let addons_dir = flavor_dir.join("Interface").join("AddOns");
    if !addons_dir.is_dir() {
        return None;
    }

    let root = if flavor_dir
        .file_name()
        .map(|name| name.to_string_lossy().starts_with('_'))
        .unwrap_or(false)
    {
        flavor_dir.parent()?.to_path_buf()
    } else {
        flavor_dir.to_path_buf()
    };

    let flavor = if flavor_dir == root {
        String::new()
    } else {
        flavor_dir
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_default()
    };

    let build_info = fs::read_to_string(root.join(".build.info"))
        .or_else(|_| fs::read_to_string(flavor_dir.join(".build.info")))
        .ok();
    let (version, build, mut product) = build_info
        .as_deref()
        .and_then(parse_build_info)
        .unwrap_or_default();

    let flavor_info = fs::read_to_string(flavor_dir.join(".flavor.info")).ok();
    if product.as_deref().unwrap_or("").is_empty() {
        if let Some(info) = flavor_info {
            product = info
                .lines()
                .map(str::trim)
                .filter(|line| {
                    !line.is_empty() && !line.to_ascii_lowercase().starts_with("product flavor")
                })
                .last()
                .map(str::to_string);
        }
    }

    let interface = interface_from_version(&version);

    Some(WoWInstall {
        root,
        flavor_dir: flavor_dir.to_path_buf(),
        addons_dir,
        flavor,
        product: product.unwrap_or_default(),
        version,
        build,
        interface,
    })
}

/// Scan the AddOns directory and merge multi-folder addons into single rows.
pub fn scan_installed(install: &WoWInstall, manifest: &Manifest) -> Vec<InstalledAddon> {
    let raw = scan_raw(install);
    if raw.is_empty() {
        return Vec::new();
    }
    group_raw(raw, install, manifest)
}

#[derive(Clone, Debug)]
struct RawAddon {
    folder: String,
    toc: TocInfo,
}

fn scan_raw(install: &WoWInstall) -> Vec<RawAddon> {
    let Ok(entries) = fs::read_dir(&install.addons_dir) else {
        return Vec::new();
    };

    let mut addons = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let folder = entry.file_name().to_string_lossy().to_string();
        let lower = folder.to_ascii_lowercase();
        if lower.starts_with('.') || lower.starts_with("!!") || lower == "__macosx" {
            continue;
        }
        let Some(toc_path) = find_toc(&path, &folder, install.interface) else {
            continue;
        };
        let toc = read_toc_text(&toc_path)
            .map(|text| parse_toc(&text))
            .unwrap_or_default();
        addons.push(RawAddon { folder, toc });
    }

    addons.sort_by(|a, b| a.folder.to_ascii_lowercase().cmp(&b.folder.to_ascii_lowercase()));
    addons
}

fn find_toc(dir: &Path, folder: &str, interface: Option<u32>) -> Option<PathBuf> {
    let entries = fs::read_dir(dir).ok()?;
    let mut candidates: Vec<PathBuf> = entries
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| {
            path.is_file()
                && path
                    .extension()
                    .map(|ext| ext.eq_ignore_ascii_case("toc"))
                    .unwrap_or(false)
        })
        .collect();
    candidates.sort_by(|a, b| a.file_name().cmp(&b.file_name()));

    if candidates.len() <= 1 {
        return candidates.into_iter().next();
    }

    // Prefer <Folder>.toc, then a TOC whose Interface list matches the game.
    if let Some(exact) = candidates.iter().find(|path| {
        path.file_stem()
            .map(|stem| stem.to_string_lossy().eq_ignore_ascii_case(folder))
            .unwrap_or(false)
    }) {
        return Some(exact.clone());
    }

    if let Some(interface) = interface {
        for candidate in &candidates {
            if let Ok(text) = read_toc_text(candidate) {
                if parse_toc(&text).interfaces.contains(&interface) {
                    return Some(candidate.clone());
                }
            }
        }
    }

    candidates.into_iter().next()
}

fn group_raw(raw: Vec<RawAddon>, install: &WoWInstall, manifest: &Manifest) -> Vec<InstalledAddon> {
    let mut dsu = Dsu::new(raw.len());

    // 1. Same CurseForge project id.
    let mut by_curse: HashMap<u64, usize> = HashMap::new();
    for (index, addon) in raw.iter().enumerate() {
        if let Some(id) = addon.toc.curse_id {
            if let Some(existing) = by_curse.get(&id) {
                dsu.union(*existing, index);
            } else {
                by_curse.insert(id, index);
            }
        }
    }

    // 2. Folder lists recorded by the installer.
    for entry in manifest.addons.values() {
        let mut indices = Vec::new();
        for folder in &entry.folders {
            if let Some(index) = raw
                .iter()
                .position(|addon| addon.folder.eq_ignore_ascii_case(folder))
            {
                indices.push(index);
            }
        }
        for pair in indices.windows(2) {
            dsu.union(pair[0], pair[1]);
        }
    }

    // 3. Module folders such as Details_Compare2 belonging to Details.
    for (index, addon) in raw.iter().enumerate() {
        let Some((base, _)) = addon.folder.split_once('_') else {
            continue;
        };
        if base.len() < 3 || base.eq_ignore_ascii_case(&addon.folder) {
            continue;
        }
        let Some(base_index) = raw
            .iter()
            .position(|candidate| candidate.folder.eq_ignore_ascii_case(base))
        else {
            continue;
        };
        let conflict = match (raw[index].toc.curse_id, raw[base_index].toc.curse_id) {
            (Some(a), Some(b)) => a != b,
            _ => false,
        };
        if !conflict {
            dsu.union(base_index, index);
        }
    }

    // Collect groups.
    let mut groups: HashMap<usize, Vec<usize>> = HashMap::new();
    for index in 0..raw.len() {
        groups.entry(dsu.find(index)).or_default().push(index);
    }

    let mut manifest_by_folder: HashMap<String, &crate::installer::ManifestEntry> = HashMap::new();
    for entry in manifest.addons.values() {
        for folder in &entry.folders {
            manifest_by_folder.insert(folder.to_ascii_lowercase(), entry);
        }
    }

    let mut result = Vec::new();
    for indices in groups.into_values() {
        let mut folders: Vec<String> = indices
            .iter()
            .map(|index| raw[*index].folder.clone())
            .collect();
        folders.sort_by_key(|folder| folder.to_ascii_lowercase());

        // Find the manifest entry covering most of this group's folders.
        let manifest_entry = {
            let mut counts: HashMap<usize, (usize, &crate::installer::ManifestEntry)> = HashMap::new();
            for folder in &folders {
                if let Some(entry) = manifest_by_folder.get(&folder.to_ascii_lowercase()) {
                    let key = entry as *const _ as usize;
                    counts
                        .entry(key)
                        .and_modify(|(count, _)| *count += 1)
                        .or_insert((1, *entry));
                }
            }
            counts
                .into_values()
                .max_by_key(|(count, _)| *count)
                .map(|(_, entry)| entry)
        };

        let primary_index = choose_primary(&raw, &indices, manifest_entry);
        let primary = &raw[primary_index];

        let version = indices
            .iter()
            .find_map(|index| raw[*index].toc.version.clone())
            .unwrap_or_default();
        let author = primary
            .toc
            .author
            .clone()
            .or_else(|| indices.iter().find_map(|index| raw[*index].toc.author.clone()))
            .unwrap_or_default();
        let notes = primary
            .toc
            .notes
            .clone()
            .or_else(|| indices.iter().find_map(|index| raw[*index].toc.notes.clone()))
            .unwrap_or_default();
        let curse_id = indices.iter().find_map(|index| raw[*index].toc.curse_id);
        let website = primary
            .toc
            .website
            .clone()
            .or_else(|| indices.iter().find_map(|index| raw[*index].toc.website.clone()));
        let interface = install
            .interface
            .filter(|interface| primary.toc.interfaces.contains(interface))
            .or_else(|| primary.toc.interfaces.first().copied());

        let title = primary
            .toc
            .title
            .clone()
            .filter(|title| !title.trim().is_empty())
            .unwrap_or_else(|| primary.folder.clone());

        result.push(InstalledAddon {
            key: primary.folder.to_ascii_lowercase(),
            title,
            version,
            author,
            notes,
            primary_folder: primary.folder.clone(),
            folders,
            curse_id,
            website,
            interface,
            installed_file_id: manifest_entry.map(|entry| entry.file_id),
        });
    }

    result.sort_by(|a, b| {
        a.title
            .to_ascii_lowercase()
            .cmp(&b.title.to_ascii_lowercase())
    });
    result
}

fn choose_primary(
    raw: &[RawAddon],
    indices: &[usize],
    manifest_entry: Option<&crate::installer::ManifestEntry>,
) -> usize {
    if let Some(entry) = manifest_entry {
        if let Some(index) = indices.iter().copied().find(|index| {
            raw[*index]
                .folder
                .eq_ignore_ascii_case(&entry.primary_folder)
        }) {
            return index;
        }
        for folder in &entry.folders {
            if let Some(index) = indices
                .iter()
                .copied()
                .find(|index| raw[*index].folder.eq_ignore_ascii_case(folder))
            {
                return index;
            }
        }
    }

    indices
        .iter()
        .copied()
        .min_by_key(|index| (raw[*index].folder.len(), raw[*index].folder.to_ascii_lowercase()))
        .unwrap_or(indices[0])
}

struct Dsu {
    parent: Vec<usize>,
}

impl Dsu {
    fn new(size: usize) -> Self {
        Self {
            parent: (0..size).collect(),
        }
    }

    fn find(&mut self, index: usize) -> usize {
        if self.parent[index] != index {
            self.parent[index] = self.find(self.parent[index]);
        }
        self.parent[index]
    }

    fn union(&mut self, a: usize, b: usize) {
        let a = self.find(a);
        let b = self.find(b);
        if a != b {
            self.parent[b] = a;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_build_info() {
        let text = "Branch!STRING:0|Active!DEC:1|Version!STRING:0|Product!STRING:0\n\
                    eu|1|1.60.1.70532|wowf\n";
        let (version, build, product) = parse_build_info(text).unwrap();
        assert_eq!(version, "1.60.1");
        assert_eq!(build, "1.60.1.70532");
        assert_eq!(product.as_deref(), Some("wowf"));
        assert_eq!(interface_from_version(&version), Some(16001));
        assert_eq!(interface_from_version("11.1.7"), Some(110107));
    }

    #[test]
    fn parses_toc() {
        let toc = "\u{feff}## Interface: 120100, 16001\n\
                   ## Title: |cff00ff00Auctionator|r\n\
                   ## Version: 341\n\
                   ## Author: plusmouse\n\
                   ## Notes-ruRU: Простой аукцион\n\
                   ## X-Curse-Project-ID: 12345\n\
                   ## X-Website: https://www.curseforge.com/wow/addons/auctionator\n";
        let info = parse_toc(toc);
        assert_eq!(info.title.as_deref(), Some("Auctionator"));
        assert_eq!(info.version.as_deref(), Some("341"));
        assert_eq!(info.notes.as_deref(), Some("Простой аукцион"));
        assert_eq!(info.interfaces, vec![120100, 16001]);
        assert_eq!(info.curse_id, Some(12345));
    }

    #[test]
    fn strips_texture_markup() {
        assert_eq!(
            strip_wow_markup("|TInterface\\Icons\\x:16|t Hello |cffff0000World|r"),
            " Hello World"
        );
    }
}
