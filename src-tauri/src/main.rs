#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod config;
mod curseforge;
mod html;
mod installer;
mod models;
mod wow;

use commands::AppState;

fn main() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("warn")).init();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            commands::bootstrap,
            commands::select_install,
            commands::add_install_path,
            commands::refresh_installed,
            commands::save_settings,
            commands::pick_wow_folder,
            commands::open_storage,
            commands::open_external,
            commands::check_updates,
            commands::check_addon,
            commands::search_addons,
            commands::get_details,
            commands::installed_details,
            commands::install_mod,
            commands::update_addon,
            commands::update_addons,
        ])
        .run(tauri::generate_context!())
        .expect("не удалось запустить Addon Forge");
}
