//! CurseForge API client and addon resolution.
//!
//! By default the keyless `api.curse.tools` proxy is used. Users can opt into
//! the official API with their own key in settings.

use std::path::Path;
use std::time::Duration;

use anyhow::{Context as _, Result, bail};
use serde::Deserialize;
use serde::de::DeserializeOwned;
use tokio::io::AsyncWriteExt as _;

use crate::html::html_to_text;
use crate::models::{
    AddonDetails, AddonStatus, CheckResult, InstalledAddon, RemoteAddon, RemoteFile, Screenshot,
    SearchPage, SearchSort,
};

const PROXY_BASE: &str = "https://api.curse.tools/v1/cf";
const OFFICIAL_BASE: &str = "https://api.curseforge.com/v1";

#[derive(Clone, Debug)]
pub struct ApiSettings {
    pub use_official_api: bool,
    pub api_key: Option<String>,
    pub game_version: String,
}

#[derive(Clone)]
pub struct CurseForge {
    http: reqwest::Client,
    base: String,
    api_key: Option<String>,
    game_version: String,
}

impl CurseForge {
    pub fn new(http: reqwest::Client, settings: ApiSettings) -> Self {
        let base = if settings.use_official_api {
            OFFICIAL_BASE
        } else {
            PROXY_BASE
        };
        Self {
            http,
            base: base.to_string(),
            api_key: settings.api_key,
            game_version: settings.game_version,
        }
    }

    async fn get_json<T: DeserializeOwned>(
        &self,
        path: &str,
        params: &[(&str, String)],
    ) -> Result<T> {
        Ok(self.get_envelope::<T>(path, params).await?.0)
    }

    async fn get_envelope<T: DeserializeOwned>(
        &self,
        path: &str,
        params: &[(&str, String)],
    ) -> Result<(T, Option<Pagination>)> {
        if self.base == OFFICIAL_BASE && self.api_key.as_deref().unwrap_or("").is_empty() {
            bail!(
                "для официального API нужен ключ CurseForge. Укажите его в настройках \
                 или переключитесь на прокси без ключа."
            );
        }

        let url = format!("{}{}", self.base, path);
        let mut request = self
            .http
            .get(&url)
            .header(reqwest::header::ACCEPT, "application/json")
            .timeout(Duration::from_secs(30))
            .query(params);

        if self.base == OFFICIAL_BASE {
            if let Some(key) = self.api_key.as_deref().filter(|key| !key.is_empty()) {
                request = request.header("x-api-key", key);
            }
        }

        let response = request
            .send()
            .await
            .with_context(|| format!("не удалось подключиться к CurseForge ({url})"))?;
        let status = response.status();
        let text = response.text().await.unwrap_or_default();

        if !status.is_success() {
            let snippet: String = text.chars().take(400).collect();
            bail!(
                "CurseForge вернул ошибку {}{}",
                status.as_u16(),
                if snippet.trim().is_empty() {
                    String::new()
                } else {
                    format!(": {}", snippet.trim())
                }
            );
        }

        let envelope: Envelope<T> = serde_json::from_str(&text)
            .with_context(|| format!("не удалось разобрать ответ CurseForge ({url})"))?;
        Ok((envelope.data, envelope.pagination))
    }

    pub async fn search(
        &self,
        query: &str,
        sort: SearchSort,
        index: usize,
        page_size: usize,
    ) -> Result<SearchPage> {
        let mut params = vec![
            ("gameId", "1".to_string()),
            ("index", index.to_string()),
            ("pageSize", page_size.to_string()),
            ("sortField", sort.field().to_string()),
            ("sortOrder", sort.order().to_string()),
        ];
        if !query.trim().is_empty() {
            params.push(("searchFilter", query.trim().to_string()));
        }
        if !self.game_version.trim().is_empty() {
            params.push(("gameVersion", self.game_version.clone()));
        }

        let (mods, pagination): (Vec<CfMod>, _) = self
            .get_envelope("/mods/search", &params)
            .await?;
        let total = pagination.as_ref().map(|page| page.total_count);
        let mut results: Vec<RemoteAddon> = mods
            .into_iter()
            .map(|cf_mod| remote_from_cf(cf_mod, self.game_version.as_str()))
            .filter(|remote| {
                self.game_version.trim().is_empty() || remote.latest_file.is_some()
            })
            .collect();

        // Some proxies ignore the gameVersion filter. Ensure the UI only shows
        // projects that can actually be installed for the local client.
        if self.game_version.trim().is_empty() {
            results.retain(|_| true);
        }

        let has_more = match total {
            Some(total) => (index + results.len()) < total as usize,
            None => results.len() >= page_size,
        };
        Ok(SearchPage { results, has_more })
    }

    pub async fn get_mod(&self, mod_id: u64) -> Result<CfMod> {
        self.get_json(&format!("/mods/{mod_id}"), &[]).await
    }

    pub async fn get_description(&self, mod_id: u64) -> Result<String> {
        self.get_json(&format!("/mods/{mod_id}/description"), &[]).await
    }

    pub async fn get_files(&self, mod_id: u64) -> Result<Vec<CfFile>> {
        let mut params = vec![("pageSize", "50".to_string())];
        if !self.game_version.trim().is_empty() {
            params.push(("gameVersion", self.game_version.clone()));
        }
        self.get_json(&format!("/mods/{mod_id}/files"), &params)
            .await
    }

    /// Fetch the project name and the newest file compatible with the
    /// selected game version. Used by install and update commands.
    pub async fn latest_file(&self, mod_id: u64) -> Result<(String, RemoteFile)> {
        let (mod_result, files_result) =
            tokio::join!(self.get_mod(mod_id), self.get_files(mod_id));
        let cf_mod = mod_result?;
        let files: Vec<RemoteFile> = match files_result {
            Ok(files) if !files.is_empty() => {
                files.iter().map(remote_file_from_cf).collect()
            }
            _ => cf_mod.latest_files.iter().map(remote_file_from_cf).collect(),
        };
        let latest = pick_latest_file(&files, &self.game_version).ok_or_else(|| {
            anyhow::anyhow!(
                "у проекта нет файла для версии игры {}",
                if self.game_version.trim().is_empty() {
                    "(неизвестна)"
                } else {
                    self.game_version.as_str()
                }
            )
        })?;
        Ok((cf_mod.name, latest))
    }

    /// Search without the local game-version filter (used for linking an
    /// installed folder to a project, even if it has no compatible file).
    async fn search_raw(
        &self,
        filter: Option<&str>,
        slug: Option<&str>,
        page_size: usize,
    ) -> Result<Vec<CfMod>> {
        let mut params = vec![
            ("gameId", "1".to_string()),
            ("index", "0".to_string()),
            ("pageSize", page_size.to_string()),
            ("sortField", "6".to_string()),
            ("sortOrder", "desc".to_string()),
        ];
        if let Some(filter) = filter.filter(|value| !value.trim().is_empty()) {
            params.push(("searchFilter", filter.trim().to_string()));
        }
        if let Some(slug) = slug.filter(|value| !value.trim().is_empty()) {
            params.push(("slug", slug.trim().to_string()));
        }
        let (mods, _): (Vec<CfMod>, _) = self
            .get_envelope("/mods/search", &params)
            .await?;
        Ok(mods)
    }

    /// Try to map an installed folder to a CurseForge project. Only exact
    /// matches are accepted to avoid installing the wrong addon.
    pub async fn resolve_addon(&self, addon: &InstalledAddon) -> Result<Option<u64>> {
        if let Some(id) = addon.curse_id {
            return Ok(Some(id));
        }

        if let Some(slug) = addon.website.as_deref().and_then(curseforge_slug) {
            let mods = self.search_raw(None, Some(&slug), 10).await?;
            if let Some(found) = mods
                .iter()
                .find(|cf_mod| cf_mod.slug.eq_ignore_ascii_case(&slug))
            {
                return Ok(Some(found.id));
            }
        }

        let wanted_names = [
            addon.title.clone(),
            addon.primary_folder.clone(),
            addon.folders.first().cloned().unwrap_or_default(),
        ];
        let wanted_slugs: Vec<String> = wanted_names.iter().map(|name| slugify(name)).collect();

        for query in [&addon.title, &addon.primary_folder] {
            if query.trim().is_empty() {
                continue;
            }
            let mods = self.search_raw(Some(query), None, 10).await?;
            let found = mods.iter().find(|cf_mod| {
                let name_matches = wanted_names
                    .iter()
                    .any(|wanted| cf_mod.name.eq_ignore_ascii_case(wanted.trim()));
                let slug_matches = wanted_slugs
                    .iter()
                    .any(|wanted| !wanted.is_empty() && cf_mod.slug.eq_ignore_ascii_case(wanted));
                name_matches || slug_matches
            });
            if let Some(found) = found {
                return Ok(Some(found.id));
            }
        }

        Ok(None)
    }

    /// Fetch a mod, its description and its files.
    pub async fn get_details(&self, mod_id: u64) -> Result<AddonDetails> {
        let (mod_result, description_result) =
            tokio::join!(self.get_mod(mod_id), self.get_description(mod_id));
        let cf_mod = mod_result?;
        let description = description_result.unwrap_or_default();
        let files = match self.get_files(mod_id).await {
            Ok(files) if !files.is_empty() => files,
            _ => cf_mod.latest_files.clone(),
        };

        let remote_files: Vec<RemoteFile> = files.iter().map(remote_file_from_cf).collect();
        let latest = pick_latest_file(&remote_files, &self.game_version);
        let mut remote = remote_from_cf(cf_mod, &self.game_version);
        remote.latest_file = latest.clone();

        Ok(AddonDetails {
            remote,
            description: html_to_text(&description),
            latest,
            files: remote_files.into_iter().take(20).collect(),
        })
    }

    /// Check one installed addon for an update.
    pub async fn check_addon(&self, addon: &InstalledAddon) -> CheckResult {
        let mod_id = match self.resolve_addon(addon).await {
            Ok(Some(id)) => id,
            Ok(None) => {
                return CheckResult {
                    addon_key: addon.key.clone(),
                    mod_id: None,
                    mod_name: None,
                    latest: None,
                    status: AddonStatus::Unresolved,
                    error: None,
                };
            }
            Err(error) => {
                return CheckResult {
                    addon_key: addon.key.clone(),
                    mod_id: None,
                    mod_name: None,
                    latest: None,
                    status: AddonStatus::Error(error.to_string()),
                    error: Some(error.to_string()),
                };
            }
        };

        let (mod_result, files_result) = tokio::join!(self.get_mod(mod_id), self.get_files(mod_id));
        let cf_mod = match mod_result {
            Ok(cf_mod) => cf_mod,
            Err(error) => {
                return CheckResult {
                    addon_key: addon.key.clone(),
                    mod_id: Some(mod_id),
                    mod_name: None,
                    latest: None,
                    status: AddonStatus::Error(error.to_string()),
                    error: Some(error.to_string()),
                };
            }
        };

        let files = match files_result {
            Ok(files) if !files.is_empty() => files,
            _ => cf_mod.latest_files.clone(),
        };
        let remote_files: Vec<RemoteFile> = files.iter().map(remote_file_from_cf).collect();
        let latest = pick_latest_file(&remote_files, &self.game_version);

        let Some(latest) = latest else {
            return CheckResult {
                addon_key: addon.key.clone(),
                mod_id: Some(mod_id),
                mod_name: Some(cf_mod.name),
                latest: None,
                status: AddonStatus::NoCompatible,
                error: None,
            };
        };

        let up_to_date = addon.installed_file_id == Some(latest.id)
            || (addon.installed_file_id.is_none()
                && versions_equivalent(&addon.version, &latest.version_label()));

        CheckResult {
            addon_key: addon.key.clone(),
            mod_id: Some(mod_id),
            mod_name: Some(cf_mod.name),
            status: if up_to_date {
                AddonStatus::UpToDate
            } else {
                AddonStatus::UpdateAvailable
            },
            latest: Some(latest),
            error: None,
        }
    }

    /// Download a file to `destination`, following CurseForge's CDN layout as
    /// a fallback when the API omits the direct download URL.
    pub async fn download_file(
        &self,
        file: &RemoteFile,
        mod_id: u64,
        destination: &Path,
        mut on_progress: impl FnMut(u64, u64),
    ) -> Result<u64> {
        let mut urls: Vec<String> = Vec::new();
        if let Some(url) = file.download_url.as_ref().filter(|url| !url.is_empty()) {
            urls.push(url.clone());
        }
        for fallback in cdn_download_urls(file.id, &file.file_name) {
            if !urls.contains(&fallback) {
                urls.push(fallback);
            }
        }
        let official = format!(
            "https://www.curseforge.com/api/v1/mods/{mod_id}/files/{}/download",
            file.id
        );
        if !urls.contains(&official) {
            urls.push(official);
        }

        if let Some(parent) = destination.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }

        let mut last_error = None;
        for url in urls {
            match self
                .download_from_url(&url, destination, &mut on_progress)
                .await
            {
                Ok(bytes) => return Ok(bytes),
                Err(error) => {
                    log::warn!("download failed from {url}: {error:#}");
                    last_error = Some(error);
                }
            }
        }

        Err(last_error.unwrap_or_else(|| anyhow::anyhow!("не удалось скачать файл")))
    }

    async fn download_from_url(
        &self,
        url: &str,
        destination: &Path,
        on_progress: &mut impl FnMut(u64, u64),
    ) -> Result<u64> {
        let response = self
            .http
            .get(url)
            .timeout(Duration::from_secs(180))
            .send()
            .await
            .with_context(|| format!("не удалось начать загрузку: {url}"))?;
        let status = response.status();
        if !status.is_success() {
            bail!("сервер вернул HTTP {}", status.as_u16());
        }
        let total = response.content_length().unwrap_or(0);
        let part = destination.with_extension("part");
        let _ = tokio::fs::remove_file(&part).await;
        let mut file = tokio::fs::File::create(&part).await?;
        let mut downloaded = 0u64;
        let mut response = response;

        while let Some(chunk) = response.chunk().await? {
            file.write_all(&chunk).await?;
            downloaded += chunk.len() as u64;
            on_progress(downloaded, total);
        }
        file.flush().await?;
        drop(file);
        tokio::fs::rename(&part, destination).await?;
        Ok(downloaded)
    }
}

#[derive(Deserialize)]
struct Envelope<T> {
    data: T,
    #[serde(default)]
    pagination: Option<Pagination>,
}

#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
struct Pagination {
    #[serde(default)]
    total_count: u64,
}

#[derive(Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct CfMod {
    pub id: u64,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub slug: String,
    #[serde(default)]
    pub summary: String,
    #[serde(default)]
    pub authors: Vec<CfAuthor>,
    #[serde(default)]
    pub download_count: u64,
    #[serde(default)]
    pub categories: Vec<CfCategory>,
    #[serde(default)]
    pub logo: Option<CfAsset>,
    #[serde(default)]
    pub screenshots: Vec<CfScreenshot>,
    #[serde(default)]
    pub latest_files: Vec<CfFile>,
    #[serde(default)]
    pub latest_files_indexes: Vec<CfFileIndex>,
    #[serde(default)]
    pub date_modified: Option<String>,
    #[serde(default)]
    pub links: Option<CfLinks>,
}

#[derive(Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct CfFile {
    #[serde(default)]
    pub id: u64,
    #[serde(default)]
    pub display_name: String,
    #[serde(default)]
    pub file_name: String,
    #[serde(default)]
    pub file_date: String,
    #[serde(default)]
    pub file_length: u64,
    #[serde(default)]
    pub download_url: Option<String>,
    #[serde(default)]
    pub game_versions: Vec<String>,
    #[serde(default = "default_release_type")]
    pub release_type: u64,
}

fn default_release_type() -> u64 {
    1
}

#[derive(Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CfFileIndex {
    #[serde(default)]
    game_version: String,
    #[serde(default)]
    file_id: u64,
    #[serde(default)]
    filename: String,
    #[serde(default = "default_release_type")]
    release_type: u64,
}

#[derive(Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CfAuthor {
    #[serde(default)]
    name: String,
}

#[derive(Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CfCategory {
    #[serde(default)]
    name: String,
}

#[derive(Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CfAsset {
    #[serde(default)]
    thumbnail_url: Option<String>,
    #[serde(default)]
    url: Option<String>,
}

#[derive(Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CfScreenshot {
    #[serde(default)]
    title: String,
    #[serde(default)]
    thumbnail_url: String,
    #[serde(default)]
    url: String,
}

#[derive(Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CfLinks {
    #[serde(default)]
    website_url: Option<String>,
}

fn remote_file_from_cf(file: &CfFile) -> RemoteFile {
    RemoteFile {
        id: file.id,
        display_name: if file.display_name.is_empty() {
            file.file_name.clone()
        } else {
            file.display_name.clone()
        },
        file_name: file.file_name.clone(),
        file_date: file.file_date.clone(),
        file_length: file.file_length,
        download_url: file.download_url.clone(),
        game_versions: file.game_versions.clone(),
        release_type: file.release_type,
    }
}

fn remote_from_cf(cf_mod: CfMod, game_version: &str) -> RemoteAddon {
    let mut files: Vec<RemoteFile> = cf_mod.latest_files.iter().map(remote_file_from_cf).collect();
    if files.is_empty() {
        for index in &cf_mod.latest_files_indexes {
            if !game_version.trim().is_empty()
                && !index.game_version.eq_ignore_ascii_case(game_version.trim())
            {
                continue;
            }
            files.push(RemoteFile {
                id: index.file_id,
                display_name: index.filename.clone(),
                file_name: index.filename.clone(),
                file_date: String::new(),
                file_length: 0,
                download_url: None,
                game_versions: vec![index.game_version.clone()],
                release_type: index.release_type,
            });
        }
    }
    let latest = pick_latest_file(&files, game_version);

    let logo = cf_mod.logo.as_ref().and_then(|logo| {
        logo.thumbnail_url
            .clone()
            .or_else(|| logo.url.clone())
            .filter(|url| !url.is_empty())
    });
    let screenshots = cf_mod
        .screenshots
        .iter()
        .filter(|shot| !shot.url.is_empty() || !shot.thumbnail_url.is_empty())
        .map(|shot| Screenshot {
            title: shot.title.clone(),
            thumb: if shot.thumbnail_url.is_empty() {
                shot.url.clone()
            } else {
                shot.thumbnail_url.clone()
            },
            url: if shot.url.is_empty() {
                shot.thumbnail_url.clone()
            } else {
                shot.url.clone()
            },
        })
        .collect();
    let website_url = cf_mod
        .links
        .as_ref()
        .and_then(|links| links.website_url.clone())
        .or_else(|| {
            if cf_mod.slug.is_empty() {
                None
            } else {
                Some(format!(
                    "https://www.curseforge.com/wow/addons/{}",
                    cf_mod.slug
                ))
            }
        });

    RemoteAddon {
        id: cf_mod.id,
        name: cf_mod.name,
        slug: cf_mod.slug,
        summary: html_to_text(&cf_mod.summary),
        authors: cf_mod
            .authors
            .into_iter()
            .map(|author| author.name)
            .filter(|name| !name.is_empty())
            .collect(),
        download_count: cf_mod.download_count,
        categories: cf_mod
            .categories
            .into_iter()
            .map(|category| category.name)
            .filter(|name| !name.is_empty())
            .collect(),
        logo,
        screenshots,
        date_modified: cf_mod.date_modified.unwrap_or_default(),
        website_url,
        latest_file: latest,
    }
}

/// Pick the newest release file compatible with `game_version`.
///
/// Exact version matches win. If the server only publishes a neighbouring
/// patch in the same major/minor series, that is used as a fallback (helpful
/// for small custom realms). Beta/alpha files are only selected when there is
/// no stable release for the version.
pub fn pick_latest_file(files: &[RemoteFile], game_version: &str) -> Option<RemoteFile> {
    let version = game_version.trim();
    let mut compatible: Vec<&RemoteFile> = if version.is_empty() {
        files.iter().collect()
    } else {
        let exact: Vec<&RemoteFile> = files
            .iter()
            .filter(|file| {
                file.game_versions
                    .iter()
                    .any(|candidate| candidate.trim().eq_ignore_ascii_case(version))
            })
            .collect();
        if !exact.is_empty() {
            exact
        } else {
            let series = major_minor(version);
            files
                .iter()
                .filter(|file| {
                    file.game_versions.iter().any(|candidate| {
                        major_minor(candidate.trim()).is_some()
                            && major_minor(candidate.trim()) == series
                    })
                })
                .collect()
        }
    };

    if compatible.is_empty() {
        return None;
    }

    let releases: Vec<&RemoteFile> = compatible
        .iter()
        .copied()
        .filter(|file| file.release_type == 1)
        .collect();
    if !releases.is_empty() {
        compatible = releases;
    }

    compatible
        .into_iter()
        .max_by(|a, b| {
            a.file_date
                .cmp(&b.file_date)
                .then_with(|| a.id.cmp(&b.id))
        })
        .cloned()
}

fn major_minor(version: &str) -> Option<(u64, u64)> {
    let mut parts = version.split('.');
    let major = parts.next()?.trim().parse::<u64>().ok()?;
    let minor = parts.next()?.trim().parse::<u64>().ok()?;
    Some((major, minor))
}

/// Compare TOC versions with file display names, e.g. `341` vs `v341`.
pub fn versions_equivalent(left: &str, right: &str) -> bool {
    let left_numbers = version_numbers(left);
    let right_numbers = version_numbers(right);
    if !left_numbers.is_empty() && !right_numbers.is_empty() {
        let mut left_numbers = left_numbers;
        let mut right_numbers = right_numbers;
        while left_numbers.len() > 1 && left_numbers.last() == Some(&0) {
            left_numbers.pop();
        }
        while right_numbers.len() > 1 && right_numbers.last() == Some(&0) {
            right_numbers.pop();
        }
        return left_numbers == right_numbers;
    }

    normalise_version_text(left) == normalise_version_text(right)
}

fn version_numbers(value: &str) -> Vec<u64> {
    let mut numbers = Vec::new();
    let mut current = String::new();
    for ch in value.chars() {
        if ch.is_ascii_digit() {
            current.push(ch);
        } else if !current.is_empty() {
            if let Ok(number) = current.parse::<u64>() {
                numbers.push(number);
            }
            current.clear();
        }
    }
    if !current.is_empty() {
        if let Ok(number) = current.parse::<u64>() {
            numbers.push(number);
        }
    }
    numbers
}

fn normalise_version_text(value: &str) -> String {
    value
        .trim()
        .trim_start_matches(['v', 'V'])
        .trim_end_matches(|ch: char| ch.is_whitespace() || ch == '.' || ch == '-')
        .to_ascii_lowercase()
}

pub fn curseforge_slug(url: &str) -> Option<String> {
    let lower = url.to_ascii_lowercase();
    let index = lower.find("curseforge.com/wow/addons/")?;
    let rest = &url[index + "curseforge.com/wow/addons/".len()..];
    let slug = rest
        .split(['/', '?', '#'])
        .next()
        .unwrap_or("")
        .trim();
    if slug.is_empty() {
        None
    } else {
        Some(slug.to_string())
    }
}

pub fn slugify(value: &str) -> String {
    let mut output = String::with_capacity(value.len());
    let mut last_dash = false;
    for ch in value.chars() {
        if ch.is_ascii_alphanumeric() {
            output.push(ch.to_ascii_lowercase());
            last_dash = false;
        } else if !last_dash {
            output.push('-');
            last_dash = true;
        }
    }
    output.trim_matches('-').to_string()
}

/// Build CurseForge CDN URLs from a file id:
/// `9162359` -> `.../files/9162/359/<name>`.
pub fn cdn_download_urls(file_id: u64, file_name: &str) -> Vec<String> {
    let id = file_id.to_string();
    if id.len() < 4 || file_name.trim().is_empty() {
        return Vec::new();
    }
    let split = id.len() - 3;
    let (a, b) = id.split_at(split);
    let mut urls = Vec::new();
    for host in [
        "https://edge.forgecdn.net/files",
        "https://mediafilez.forgecdn.net/files",
    ] {
        let base = format!("{host}/{a}/{b}/");
        let url = url::Url::parse(&base)
            .ok()
            .and_then(|base| base.join(file_name).ok())
            .map(|url| url.to_string());
        if let Some(url) = url {
            urls.push(url);
        }
    }
    urls
}

#[cfg(test)]
mod tests {
    use super::*;

    fn file(id: u64, version: &str, date: &str, release: u64) -> RemoteFile {
        RemoteFile {
            id,
            display_name: format!("v{id}"),
            file_name: format!("{id}.zip"),
            file_date: date.to_string(),
            file_length: 1,
            download_url: None,
            game_versions: vec![version.to_string()],
            release_type: release,
        }
    }

    #[test]
    fn picks_exact_version_release() {
        let files = vec![
            file(1, "1.60.0", "2026-01-01", 1),
            file(2, "1.60.1", "2026-02-01", 2),
            file(3, "1.60.1", "2026-01-15", 1),
            file(4, "1.60.2", "2026-03-01", 1),
        ];
        let picked = pick_latest_file(&files, "1.60.1").unwrap();
        assert_eq!(picked.id, 3);
    }

    #[test]
    fn falls_back_to_same_series() {
        let files = vec![file(1, "1.60.0", "2026-01-01", 1)];
        assert_eq!(pick_latest_file(&files, "1.60.1").unwrap().id, 1);
        assert!(pick_latest_file(&files, "2.0.0").is_none());
    }

    #[test]
    fn compares_versions() {
        assert!(versions_equivalent("341", "v341"));
        assert!(versions_equivalent("1.2.3", "1.2.3-release"));
        assert!(versions_equivalent("1.2", "1.2.0"));
        assert!(!versions_equivalent("1.2.3", "1.2.4"));
        assert!(!versions_equivalent("", "1.0"));
    }

    #[test]
    fn extracts_slug() {
        assert_eq!(
            curseforge_slug("https://www.curseforge.com/wow/addons/auctionator/"),
            Some("auctionator".to_string())
        );
        assert_eq!(curseforge_slug("https://example.com/addon"), None);
    }

    #[test]
    fn builds_cdn_url() {
        let urls = cdn_download_urls(9162359, "Auctionator-341.zip");
        assert_eq!(
            urls[0],
            "https://edge.forgecdn.net/files/9162/359/Auctionator-341.zip"
        );
    }
}
