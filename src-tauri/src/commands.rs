//! Tauri commands and the small amount of state they share.
//!
//! The heavy lifting lives in the existing `wow`, `curseforge` and `installer`
//! modules. Commands translate those Rust types into camelCase DTOs for the
//! static HTML/JS frontend and emit progress events during long operations.

use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_opener::OpenerExt as _;

use crate::config::{self, Config};
use crate::curseforge::{ApiSettings, CurseForge};
use crate::installer::{self, InstallOutcome, Manifest};
use crate::models::{
    friendly_version, AddonDetails, AddonStatus, CheckResult, InstalledAddon, RemoteAddon,
    RemoteFile, SearchSort, WoWInstall,
};
use crate::wow;

const USER_AGENT: &str = "AddonForge/0.1 (+https://github.com/)";
const SEARCH_PAGE_SIZE: usize = 18;

pub struct AppState {
    pub http: reqwest::Client,
    pub config: Mutex<Config>,
    pub installs: Mutex<Vec<WoWInstall>>,
    pub selected: Mutex<Option<usize>>,
    install_lock: tokio::sync::Mutex<()>,
}

impl AppState {
    pub fn new() -> Self {
        let http = reqwest::Client::builder()
            .user_agent(USER_AGENT)
            .timeout(Duration::from_secs(45))
            .connect_timeout(Duration::from_secs(15))
            .build()
            .expect("не удалось создать HTTP-клиент");

        Self {
            http,
            config: Mutex::new(config::load()),
            installs: Mutex::new(Vec::new()),
            selected: Mutex::new(None),
            install_lock: tokio::sync::Mutex::new(()),
        }
    }
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SettingsView {
    pub wow_path: Option<String>,
    pub api_key: String,
    pub use_official_api: bool,
    pub auto_check_updates: bool,
    pub keep_backups: bool,
}

impl From<&Config> for SettingsView {
    fn from(config: &Config) -> Self {
        Self {
            wow_path: config.wow_path.clone(),
            api_key: config.api_key.clone(),
            use_official_api: config.use_official_api,
            auto_check_updates: config.auto_check_updates,
            keep_backups: config.keep_backups,
        }
    }
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct InstallView {
    pub flavor: String,
    pub flavor_label: String,
    pub display_name: String,
    pub root: String,
    pub flavor_dir: String,
    pub addons_dir: String,
    pub product: String,
    pub version: String,
    pub build: String,
    pub interface: Option<u32>,
}

impl From<&WoWInstall> for InstallView {
    fn from(install: &WoWInstall) -> Self {
        Self {
            flavor: install.flavor.clone(),
            flavor_label: install.flavor_label(),
            display_name: install.display_name(),
            root: install.root.display().to_string(),
            flavor_dir: install.flavor_dir.display().to_string(),
            addons_dir: install.addons_dir.display().to_string(),
            product: install.product.clone(),
            version: install.version.clone(),
            build: install.build.clone(),
            interface: install.interface,
        }
    }
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AddonView {
    pub key: String,
    pub title: String,
    pub version: String,
    pub display_version: String,
    pub author: String,
    pub notes: String,
    pub folders: Vec<String>,
    pub primary_folder: String,
    pub curse_id: Option<u64>,
    pub website: Option<String>,
    pub interface: Option<u32>,
    pub installed_file_id: Option<u64>,
}

impl From<&InstalledAddon> for AddonView {
    fn from(addon: &InstalledAddon) -> Self {
        Self {
            key: addon.key.clone(),
            title: addon.title.clone(),
            version: addon.version.clone(),
            display_version: addon.display_version(),
            author: addon.author.clone(),
            notes: addon.notes.clone(),
            folders: addon.folders.clone(),
            primary_folder: addon.primary_folder.clone(),
            curse_id: addon.curse_id,
            website: addon.website.clone(),
            interface: addon.interface,
            installed_file_id: addon.installed_file_id,
        }
    }
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct StorageView {
    pub config_path: String,
    pub data_path: String,
    pub manifest_path: String,
    pub backups_path: String,
    pub downloads_path: String,
}

fn storage_view() -> StorageView {
    StorageView {
        config_path: config::config_path().display().to_string(),
        data_path: config::data_dir().display().to_string(),
        manifest_path: config::manifest_path().display().to_string(),
        backups_path: config::backups_dir().display().to_string(),
        downloads_path: config::downloads_dir().display().to_string(),
    }
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Bootstrap {
    pub settings: SettingsView,
    pub installs: Vec<InstallView>,
    pub selected_install: Option<usize>,
    pub install: Option<InstallView>,
    pub addons: Vec<AddonView>,
    pub storage: StorageView,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SelectionView {
    pub installs: Vec<InstallView>,
    pub selected_install: Option<usize>,
    pub install: Option<InstallView>,
    pub addons: Vec<AddonView>,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SettingsInput {
    pub api_key: String,
    pub use_official_api: bool,
    pub auto_check_updates: bool,
    pub keep_backups: bool,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CheckProgress {
    pub current: usize,
    pub total: usize,
    pub addon_key: String,
    pub title: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CheckView {
    pub addon_key: String,
    pub mod_id: Option<u64>,
    pub mod_name: Option<String>,
    pub latest: Option<RemoteFile>,
    pub status: String,
    pub status_label: String,
    pub tone: String,
    pub error: Option<String>,
    pub update_available: bool,
}

impl CheckView {
    fn from_result(result: &CheckResult) -> Self {
        let (status, tone) = match &result.status {
            AddonStatus::UpToDate => ("upToDate", "success"),
            AddonStatus::UpdateAvailable => ("updateAvailable", "warning"),
            AddonStatus::Unresolved => ("unresolved", "info"),
            AddonStatus::NoCompatible => ("noCompatible", "muted"),
            AddonStatus::Error(_) => ("error", "danger"),
        };
        Self {
            addon_key: result.addon_key.clone(),
            mod_id: result.mod_id,
            mod_name: result.mod_name.clone(),
            latest: result.latest.clone(),
            status: status.to_string(),
            status_label: result.status.label().to_string(),
            tone: tone.to_string(),
            error: result.error.clone(),
            update_available: result.status.is_update(),
        }
    }
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CheckSummary {
    pub checked: usize,
    pub failed: usize,
    pub updates: usize,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SearchView {
    pub results: Vec<RemoteAddon>,
    pub has_more: bool,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DetailsResponse {
    pub mod_id: u64,
    pub details: AddonDetails,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct InstallStart {
    pub key: String,
    pub title: String,
    pub is_update: bool,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct InstallProgress {
    pub key: String,
    pub title: String,
    pub stage: String,
    pub message: String,
    pub downloaded: u64,
    pub total: u64,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct InstallDone {
    pub key: String,
    pub title: String,
    pub version: String,
    pub file_id: u64,
    pub backup_dir: Option<String>,
    pub is_update: bool,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct InstallFailed {
    pub key: String,
    pub title: String,
    pub error: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct InstallResultView {
    pub key: String,
    pub title: String,
    pub version: String,
    pub file_id: u64,
    pub folders: Vec<String>,
    pub backup_dir: Option<String>,
    pub is_update: bool,
    pub addons: Vec<AddonView>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RemoveResult {
    pub title: String,
    pub removed: usize,
    pub backup_dir: Option<String>,
    pub addons: Vec<AddonView>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BatchResult {
    pub total: usize,
    pub succeeded: usize,
    pub failed: usize,
    pub addons: Vec<AddonView>,
    pub errors: Vec<String>,
}

struct InstallTarget {
    key: String,
    mod_id: Option<u64>,
    title: String,
    old_folders: Vec<String>,
    old_primary: Option<String>,
    is_update: bool,
}

struct InstalledInfo {
    outcome: InstallOutcome,
    title: String,
    display_version: String,
    is_update: bool,
}

fn normalize_path(path: &str) -> String {
    path.trim()
        .trim_end_matches(['\\', '/'])
        .replace('/', "\\")
        .to_ascii_lowercase()
}

fn choose_install_index(installs: &[WoWInstall], configured: Option<&str>) -> Option<usize> {
    if installs.is_empty() {
        return None;
    }
    if let Some(configured) = configured.filter(|path| !path.trim().is_empty()) {
        let configured = normalize_path(configured);
        if let Some(index) = installs.iter().position(|install| {
            normalize_path(&install.flavor_dir.display().to_string()) == configured
                || normalize_path(&install.root.display().to_string()) == configured
                || normalize_path(&install.addons_dir.display().to_string()) == configured
        }) {
            return Some(index);
        }
    }
    Some(0)
}

fn api_settings(state: &AppState, game_version: String) -> ApiSettings {
    let config = state.config.lock().unwrap().clone();
    ApiSettings {
        use_official_api: config.use_official_api,
        api_key: config.effective_api_key(),
        game_version,
    }
}

fn api_settings_optional(state: &AppState) -> ApiSettings {
    let game_version = {
        let selected = *state.selected.lock().unwrap();
        let installs = state.installs.lock().unwrap();
        selected
            .and_then(|index| installs.get(index))
            .map(|install| install.version.clone())
            .unwrap_or_default()
    };
    api_settings(state, game_version)
}

fn current_install(state: &AppState) -> Result<WoWInstall, String> {
    let selected = *state.selected.lock().unwrap();
    let installs = state.installs.lock().unwrap();
    selected
        .and_then(|index| installs.get(index).cloned())
        .ok_or_else(|| "Сначала выберите установку World of Warcraft в настройках.".to_string())
}

async fn scan_installed(install: WoWInstall) -> Result<Vec<InstalledAddon>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let manifest = Manifest::load();
        wow::scan_installed(&install, &manifest)
    })
    .await
    .map_err(|error| format!("Не удалось прочитать папку AddOns: {error}"))
}

async fn scan_views(install: WoWInstall) -> Result<Vec<AddonView>, String> {
    Ok(scan_installed(install)
        .await?
        .iter()
        .map(AddonView::from)
        .collect())
}

async fn selection_view(state: &AppState) -> Result<SelectionView, String> {
    let installs = state.installs.lock().unwrap().clone();
    let selected = *state.selected.lock().unwrap();
    let install = selected.and_then(|index| installs.get(index).cloned());
    let addons = match &install {
        Some(install) => scan_views(install.clone()).await?,
        None => Vec::new(),
    };
    Ok(SelectionView {
        installs: installs.iter().map(InstallView::from).collect(),
        selected_install: selected,
        install: install.as_ref().map(InstallView::from),
        addons,
    })
}

fn emit_check_failed(app: &AppHandle, key: &str, title: &str, error: impl ToString) {
    let _ = app.emit(
        "install-failed",
        InstallFailed {
            key: key.to_string(),
            title: title.to_string(),
            error: error.to_string(),
        },
    );
}

#[tauri::command]
pub async fn bootstrap(state: State<'_, AppState>) -> Result<Bootstrap, String> {
    let configured = state.config.lock().unwrap().wow_path.clone();
    let installs =
        tauri::async_runtime::spawn_blocking(move || wow::detect_installs(configured.as_deref()))
            .await
            .map_err(|error| format!("Не удалось просканировать диск: {error}"))?;

    let selected =
        choose_install_index(&installs, state.config.lock().unwrap().wow_path.as_deref());
    {
        *state.installs.lock().unwrap() = installs.clone();
        *state.selected.lock().unwrap() = selected;
    }

    let install = selected.and_then(|index| installs.get(index).cloned());
    let addons = match &install {
        Some(install) => scan_views(install.clone()).await?,
        None => Vec::new(),
    };
    let settings = SettingsView::from(&*state.config.lock().unwrap());

    Ok(Bootstrap {
        settings,
        installs: installs.iter().map(InstallView::from).collect(),
        selected_install: selected,
        install: install.as_ref().map(InstallView::from),
        addons,
        storage: storage_view(),
    })
}

#[tauri::command]
pub async fn select_install(
    state: State<'_, AppState>,
    index: usize,
) -> Result<SelectionView, String> {
    let install = {
        let installs = state.installs.lock().unwrap();
        installs
            .get(index)
            .cloned()
            .ok_or_else(|| "Установка не найдена. Обновите список.".to_string())?
    };

    {
        let mut config = state.config.lock().unwrap();
        config.wow_path = Some(install.flavor_dir.display().to_string());
        config::save(&config).map_err(|error| error.to_string())?;
    }
    *state.selected.lock().unwrap() = Some(index);
    selection_view(state.inner()).await
}

#[tauri::command]
pub async fn add_install_path(
    state: State<'_, AppState>,
    path: String,
) -> Result<SelectionView, String> {
    let path = PathBuf::from(path.trim());
    if !path.exists() {
        return Err("Выбранная папка не существует.".to_string());
    }

    let found = tauri::async_runtime::spawn_blocking(move || wow::discover_at(&path))
        .await
        .map_err(|error| format!("Не удалось проверить папку: {error}"))?;
    if found.is_empty() {
        return Err(
            "В этой папке не найдена World of Warcraft. Выберите папку игры или папку с \
             _retail_ / _classic_ / _forever_."
                .to_string(),
        );
    }
    let first_flavor = normalize_path(&found[0].flavor_dir.display().to_string());

    let mut installs = state.installs.lock().unwrap().clone();
    for install in found {
        let identity = normalize_path(&install.flavor_dir.display().to_string());
        if !installs
            .iter()
            .any(|existing| normalize_path(&existing.flavor_dir.display().to_string()) == identity)
        {
            installs.push(install);
        }
    }
    installs.sort_by(|a, b| {
        a.flavor_label()
            .to_ascii_lowercase()
            .cmp(&b.flavor_label().to_ascii_lowercase())
            .then_with(|| a.flavor_dir.cmp(&b.flavor_dir))
    });

    let selected = installs
        .iter()
        .position(|install| {
            normalize_path(&install.flavor_dir.display().to_string()) == first_flavor
        })
        .unwrap_or(0);
    *state.installs.lock().unwrap() = installs.clone();
    *state.selected.lock().unwrap() = Some(selected);

    {
        let mut config = state.config.lock().unwrap();
        config.wow_path = Some(installs[selected].flavor_dir.display().to_string());
        config::save(&config).map_err(|error| error.to_string())?;
    }

    selection_view(state.inner()).await
}

#[tauri::command]
pub async fn refresh_installed(state: State<'_, AppState>) -> Result<SelectionView, String> {
    selection_view(state.inner()).await
}

#[tauri::command]
pub async fn save_settings(
    state: State<'_, AppState>,
    settings: SettingsInput,
) -> Result<SettingsView, String> {
    let mut config = state.config.lock().unwrap();
    config.api_key = settings.api_key.trim().to_string();
    config.use_official_api = settings.use_official_api;
    config.auto_check_updates = settings.auto_check_updates;
    config.keep_backups = settings.keep_backups;
    config::save(&config).map_err(|error| error.to_string())?;
    Ok(SettingsView::from(&*config))
}

#[tauri::command]
pub async fn pick_wow_folder() -> Result<Option<String>, String> {
    let path = tauri::async_runtime::spawn_blocking(|| {
        rfd::FileDialog::new()
            .set_title("Выберите папку World of Warcraft")
            .pick_folder()
    })
    .await
    .map_err(|error| format!("Не удалось открыть выбор папки: {error}"))?;
    Ok(path.map(|path| path.display().to_string()))
}

#[tauri::command]
pub fn open_storage(kind: String) -> Result<(), String> {
    let path = match kind.as_str() {
        "config" => config::config_dir(),
        "data" => config::data_dir(),
        "manifest" => config::manifest_path()
            .parent()
            .map(PathBuf::from)
            .unwrap_or_else(config::data_dir),
        "backups" => config::backups_dir(),
        "downloads" => config::downloads_dir(),
        _ => return Err("Неизвестный раздел хранилища.".to_string()),
    };
    if path.is_file() {
        config::reveal_path(path.parent().unwrap_or(&path));
    } else {
        let _ = std::fs::create_dir_all(&path);
        config::reveal_path(&path);
    }
    Ok(())
}

#[tauri::command]
pub fn open_external(app: AppHandle, url: String) -> Result<(), String> {
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err("Можно открывать только http/https ссылки.".to_string());
    }
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn check_updates(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<CheckSummary, String> {
    let install = current_install(state.inner())?;
    let addons = scan_installed(install.clone()).await?;
    let cf = CurseForge::new(
        state.http.clone(),
        api_settings(state.inner(), install.version),
    );

    let total = addons.len();
    let mut failed = 0;
    let mut updates = 0;

    for (index, addon) in addons.iter().enumerate() {
        let _ = app.emit(
            "check-progress",
            CheckProgress {
                current: index + 1,
                total,
                addon_key: addon.key.clone(),
                title: addon.title.clone(),
            },
        );
        let result = cf.check_addon(addon).await;
        let view = CheckView::from_result(&result);
        if view.status == "error" {
            failed += 1;
        }
        if view.update_available {
            updates += 1;
        }
        let _ = app.emit("check-result", &view);
    }

    let summary = CheckSummary {
        checked: total,
        failed,
        updates,
    };
    let _ = app.emit("check-finished", &summary);
    Ok(summary)
}

#[tauri::command]
pub async fn check_addon(
    app: AppHandle,
    state: State<'_, AppState>,
    key: String,
) -> Result<CheckView, String> {
    let install = current_install(state.inner())?;
    let addons = scan_installed(install.clone()).await?;
    let addon = addons
        .iter()
        .find(|addon| addon.key.eq_ignore_ascii_case(&key))
        .cloned()
        .ok_or_else(|| "Аддон не найден. Обновите список установленных.".to_string())?;
    let cf = CurseForge::new(
        state.http.clone(),
        api_settings(state.inner(), install.version),
    );
    let result = cf.check_addon(&addon).await;
    let view = CheckView::from_result(&result);
    let _ = app.emit("check-result", &view);
    Ok(view)
}

#[tauri::command]
pub async fn search_addons(
    state: State<'_, AppState>,
    query: String,
    sort: String,
    page: usize,
) -> Result<SearchView, String> {
    let sort = match sort.as_str() {
        "updated" => SearchSort::Updated,
        "name" => SearchSort::Name,
        _ => SearchSort::Popular,
    };
    let cf = CurseForge::new(state.http.clone(), api_settings_optional(state.inner()));
    let results = cf
        .search(
            &query,
            sort,
            page.saturating_mul(SEARCH_PAGE_SIZE),
            SEARCH_PAGE_SIZE,
        )
        .await
        .map_err(|error| error.to_string())?;
    Ok(SearchView {
        results: results.results,
        has_more: results.has_more,
    })
}

#[tauri::command]
pub async fn get_details(
    state: State<'_, AppState>,
    mod_id: u64,
) -> Result<DetailsResponse, String> {
    let cf = CurseForge::new(state.http.clone(), api_settings_optional(state.inner()));
    let details = cf
        .get_details(mod_id)
        .await
        .map_err(|error| error.to_string())?;
    Ok(DetailsResponse { mod_id, details })
}

#[tauri::command]
pub async fn installed_details(
    state: State<'_, AppState>,
    key: String,
    mod_id: Option<u64>,
) -> Result<DetailsResponse, String> {
    let install = current_install(state.inner())?;
    let addons = scan_installed(install.clone()).await?;
    let addon = addons
        .iter()
        .find(|addon| addon.key.eq_ignore_ascii_case(&key))
        .cloned()
        .ok_or_else(|| "Аддон не найден. Обновите список установленных.".to_string())?;

    let cf = CurseForge::new(
        state.http.clone(),
        api_settings(state.inner(), install.version),
    );
    let mod_id = match mod_id {
        Some(mod_id) => mod_id,
        None => cf
            .resolve_addon(&addon)
            .await
            .map_err(|error| error.to_string())?
            .ok_or_else(|| "Этот аддон не найден на CurseForge.".to_string())?,
    };
    let details = cf
        .get_details(mod_id)
        .await
        .map_err(|error| error.to_string())?;
    Ok(DetailsResponse { mod_id, details })
}

fn find_installed_for_mod<'a>(
    addons: &'a [InstalledAddon],
    mod_id: u64,
    title: &str,
) -> Option<&'a InstalledAddon> {
    addons
        .iter()
        .find(|addon| addon.curse_id == Some(mod_id))
        .or_else(|| {
            let title = title.trim();
            if title.is_empty() {
                None
            } else {
                addons
                    .iter()
                    .find(|addon| addon.title.trim().eq_ignore_ascii_case(title))
            }
        })
}

#[tauri::command]
pub async fn install_mod(
    app: AppHandle,
    state: State<'_, AppState>,
    mod_id: u64,
    title: Option<String>,
) -> Result<InstallResultView, String> {
    let install = current_install(state.inner())?;
    let _guard = state
        .install_lock
        .try_lock()
        .map_err(|_| "Установка уже выполняется. Дождитесь её окончания.".to_string())?;

    let installed = scan_installed(install.clone()).await?;
    let lookup_title = title.unwrap_or_default();
    let existing = find_installed_for_mod(&installed, mod_id, &lookup_title);
    let target = InstallTarget {
        key: existing
            .map(|addon| addon.key.clone())
            .unwrap_or_else(|| format!("mod:{mod_id}")),
        mod_id: Some(mod_id),
        title: existing
            .map(|addon| addon.title.clone())
            .unwrap_or(lookup_title),
        old_folders: existing
            .map(|addon| addon.folders.clone())
            .unwrap_or_default(),
        old_primary: existing.map(|addon| addon.primary_folder.clone()),
        is_update: existing.is_some(),
    };

    let info = install_one(&app, state.inner(), &install, target).await?;
    let addons = scan_views(install.clone()).await?;
    Ok(InstallResultView {
        key: info.outcome.key.clone(),
        title: info.title,
        version: info.display_version,
        file_id: info.outcome.file_id,
        folders: info.outcome.folders.clone(),
        backup_dir: info
            .outcome
            .backup_dir
            .as_ref()
            .map(|path| path.display().to_string()),
        is_update: info.is_update,
        addons,
    })
}

#[tauri::command]
pub async fn update_addon(
    app: AppHandle,
    state: State<'_, AppState>,
    key: String,
) -> Result<InstallResultView, String> {
    let install = current_install(state.inner())?;
    let _guard = state
        .install_lock
        .try_lock()
        .map_err(|_| "Установка уже выполняется. Дождитесь её окончания.".to_string())?;

    let installed = scan_installed(install.clone()).await?;
    let addon = installed
        .iter()
        .find(|addon| addon.key.eq_ignore_ascii_case(&key))
        .cloned()
        .ok_or_else(|| "Аддон не найден. Обновите список установленных.".to_string())?;

    let cf = CurseForge::new(
        state.http.clone(),
        api_settings(state.inner(), install.version.clone()),
    );
    let mod_id = match addon.curse_id {
        Some(mod_id) => mod_id,
        None => cf
            .resolve_addon(&addon)
            .await
            .map_err(|error| error.to_string())?
            .ok_or_else(|| "Этот аддон не найден на CurseForge.".to_string())?,
    };

    let target = InstallTarget {
        key: addon.key.clone(),
        mod_id: Some(mod_id),
        title: addon.title.clone(),
        old_folders: addon.folders.clone(),
        old_primary: Some(addon.primary_folder.clone()),
        is_update: true,
    };
    let info = install_one(&app, state.inner(), &install, target).await?;
    let addons = scan_views(install.clone()).await?;
    Ok(InstallResultView {
        key: info.outcome.key.clone(),
        title: info.title,
        version: info.display_version,
        file_id: info.outcome.file_id,
        folders: info.outcome.folders.clone(),
        backup_dir: info
            .outcome
            .backup_dir
            .as_ref()
            .map(|path| path.display().to_string()),
        is_update: true,
        addons,
    })
}

#[tauri::command]
pub async fn remove_addon(state: State<'_, AppState>, key: String) -> Result<RemoveResult, String> {
    let install = current_install(state.inner())?;
    let _guard = state
        .install_lock
        .try_lock()
        .map_err(|_| "Установка уже выполняется. Дождитесь её окончания.".to_string())?;

    let installed = scan_installed(install.clone()).await?;
    let addon = installed
        .iter()
        .find(|addon| addon.key.eq_ignore_ascii_case(&key))
        .cloned()
        .ok_or_else(|| "Аддон не найден. Обновите список установленных.".to_string())?;

    let keep_backups = state.config.lock().unwrap().keep_backups;
    let addons_dir = install.addons_dir.clone();
    let folders = addon.folders.clone();
    let (backup_dir, removed) = tauri::async_runtime::spawn_blocking(move || {
        installer::remove_addon_folders(&addons_dir, &folders, keep_backups)
    })
    .await
    .map_err(|error| format!("Не удалось выполнить удаление: {error}"))?
    .map_err(|error| error.to_string())?;

    let removed_folders: Vec<String> = addon
        .folders
        .iter()
        .map(|folder| folder.to_ascii_lowercase())
        .collect();
    let mut manifest = Manifest::load();
    manifest.addons.retain(|folder_key, entry| {
        !removed_folders.iter().any(|removed| {
            folder_key.eq_ignore_ascii_case(removed)
                || entry.primary_folder.eq_ignore_ascii_case(removed)
                || entry
                    .folders
                    .iter()
                    .any(|folder| folder.eq_ignore_ascii_case(removed))
        })
    });
    if let Err(error) = manifest.save() {
        log::warn!("failed to update manifest after removing addon: {error}");
    }

    let addons = scan_views(install).await?;
    Ok(RemoveResult {
        title: addon.title,
        removed,
        backup_dir: backup_dir.map(|path| path.display().to_string()),
        addons,
    })
}

#[tauri::command]
pub async fn update_addons(
    app: AppHandle,
    state: State<'_, AppState>,
    keys: Vec<String>,
) -> Result<BatchResult, String> {
    let install = current_install(state.inner())?;
    let _guard = state
        .install_lock
        .try_lock()
        .map_err(|_| "Установка уже выполняется. Дождитесь её окончания.".to_string())?;

    let installed = scan_installed(install.clone()).await?;
    let cf = CurseForge::new(
        state.http.clone(),
        api_settings(state.inner(), install.version.clone()),
    );

    let total = keys.len();
    let mut succeeded = 0;
    let mut failed = 0;
    let mut errors = Vec::new();

    for key in keys {
        let Some(addon) = installed
            .iter()
            .find(|addon| addon.key.eq_ignore_ascii_case(&key))
            .cloned()
        else {
            failed += 1;
            let error = "Аддон больше не найден в папке AddOns".to_string();
            errors.push(format!("{key}: {error}"));
            emit_check_failed(&app, &key, &key, &error);
            continue;
        };

        let mod_id = match addon.curse_id {
            Some(mod_id) => Some(mod_id),
            None => match cf.resolve_addon(&addon).await {
                Ok(mod_id) => mod_id,
                Err(error) => {
                    failed += 1;
                    errors.push(format!("{}: {error}", addon.title));
                    emit_check_failed(&app, &addon.key, &addon.title, &error);
                    continue;
                }
            },
        };
        let Some(mod_id) = mod_id else {
            failed += 1;
            let error = "не найден на CurseForge".to_string();
            errors.push(format!("{}: {error}", addon.title));
            emit_check_failed(&app, &addon.key, &addon.title, &error);
            continue;
        };

        let target = InstallTarget {
            key: addon.key.clone(),
            mod_id: Some(mod_id),
            title: addon.title.clone(),
            old_folders: addon.folders.clone(),
            old_primary: Some(addon.primary_folder.clone()),
            is_update: true,
        };
        match install_one(&app, state.inner(), &install, target).await {
            Ok(_) => succeeded += 1,
            Err(error) => {
                failed += 1;
                errors.push(format!("{}: {error}", addon.title));
            }
        }
    }

    let addons = scan_views(install.clone()).await?;
    let summary = BatchResult {
        total,
        succeeded,
        failed,
        addons,
        errors,
    };
    let _ = app.emit("batch-done", &summary);
    Ok(summary)
}

async fn install_one(
    app: &AppHandle,
    state: &AppState,
    install: &WoWInstall,
    target: InstallTarget,
) -> Result<InstalledInfo, String> {
    let start_title = if target.title.trim().is_empty() {
        format!(
            "Проект #{}",
            target.mod_id.map(|id| id.to_string()).unwrap_or_default()
        )
    } else {
        target.title.clone()
    };

    let _ = app.emit(
        "install-start",
        InstallStart {
            key: target.key.clone(),
            title: start_title.clone(),
            is_update: target.is_update,
        },
    );

    let result = install_one_inner(app, state, install, &target, &start_title).await;
    match &result {
        Ok(info) => {
            let _ = app.emit(
                "install-done",
                InstallDone {
                    key: target.key.clone(),
                    title: info.title.clone(),
                    version: info.display_version.clone(),
                    file_id: info.outcome.file_id,
                    backup_dir: info
                        .outcome
                        .backup_dir
                        .as_ref()
                        .map(|path| path.display().to_string()),
                    is_update: info.is_update,
                },
            );
        }
        Err(error) => {
            let _ = app.emit(
                "install-failed",
                InstallFailed {
                    key: target.key.clone(),
                    title: start_title,
                    error: error.clone(),
                },
            );
        }
    }
    result
}

async fn install_one_inner(
    app: &AppHandle,
    state: &AppState,
    install: &WoWInstall,
    target: &InstallTarget,
    start_title: &str,
) -> Result<InstalledInfo, String> {
    let cf = CurseForge::new(
        state.http.clone(),
        api_settings(state, install.version.clone()),
    );
    let mod_id = target
        .mod_id
        .ok_or_else(|| "Не указан проект CurseForge.".to_string())?;

    let _ = app.emit(
        "install-progress",
        InstallProgress {
            key: target.key.clone(),
            title: start_title.to_string(),
            stage: "resolve".to_string(),
            message: "Получение информации о версии...".to_string(),
            downloaded: 0,
            total: 0,
        },
    );

    let (mod_name, file) = cf
        .latest_file(mod_id)
        .await
        .map_err(|error| error.to_string())?;
    let display_version = friendly_version(&mod_name, &file.version_label());
    let file_name = safe_download_name(&file.file_name, &file.display_name, file.id);
    config::ensure_data_dirs().map_err(|error| error.to_string())?;
    let destination = config::downloads_dir().join(format!("{}-{file_name}", file.id));
    let _ = tokio::fs::remove_file(&destination).await;

    let progress_app = app.clone();
    let progress_key = target.key.clone();
    let progress_title = mod_name.clone();
    let mut last_report = Instant::now();
    let mut last_bytes = 0u64;

    let _ = app.emit(
        "install-progress",
        InstallProgress {
            key: target.key.clone(),
            title: mod_name.clone(),
            stage: "download".to_string(),
            message: "Скачивание архива...".to_string(),
            downloaded: 0,
            total: 0,
        },
    );

    cf.download_file(&file, mod_id, &destination, move |downloaded, total| {
        let report = downloaded.saturating_sub(last_bytes) >= 256 * 1024
            || last_report.elapsed() >= Duration::from_millis(250);
        if report {
            last_bytes = downloaded;
            last_report = Instant::now();
            let message = if total > 0 {
                format!("Скачивание... {}%", downloaded * 100 / total)
            } else {
                "Скачивание...".to_string()
            };
            let _ = progress_app.emit(
                "install-progress",
                InstallProgress {
                    key: progress_key.clone(),
                    title: progress_title.clone(),
                    stage: "download".to_string(),
                    message,
                    downloaded,
                    total,
                },
            );
        }
    })
    .await
    .map_err(|error| error.to_string())?;

    let _ = app.emit(
        "install-progress",
        InstallProgress {
            key: target.key.clone(),
            title: mod_name.clone(),
            stage: "install".to_string(),
            message: "Распаковка и установка...".to_string(),
            downloaded: file.file_length,
            total: file.file_length,
        },
    );

    let addons_dir = install.addons_dir.clone();
    let archive = destination.clone();
    let install_title = mod_name.clone();
    let version = file.version_label();
    let file_id = file.id;
    let old_folders = target.old_folders.clone();
    let old_primary = target.old_primary.clone();
    let keep_backups = state.config.lock().unwrap().keep_backups;

    let outcome = tauri::async_runtime::spawn_blocking(move || {
        installer::install_archive(
            &archive,
            &addons_dir,
            mod_id,
            &install_title,
            file_id,
            &version,
            &old_folders,
            old_primary.as_deref(),
            keep_backups,
        )
    })
    .await
    .map_err(|error| format!("Задача установки завершилась с ошибкой: {error}"))?
    .map_err(|error| error.to_string())?;

    Ok(InstalledInfo {
        outcome,
        title: mod_name,
        display_version,
        is_update: target.is_update,
    })
}

fn safe_download_name(file_name: &str, display_name: &str, file_id: u64) -> String {
    let candidate = if file_name.trim().is_empty() {
        display_name
    } else {
        file_name
    };
    let base = std::path::Path::new(candidate)
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_default();
    let sanitized = installer::sanitize_folder(&base);
    sanitized.unwrap_or_else(|| format!("addon-{file_id}.zip"))
}
