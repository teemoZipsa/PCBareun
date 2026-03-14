mod commands;
mod utils;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::dashboard::get_system_overview,
            commands::services::get_services,
            commands::services::control_service,
            commands::services::set_service_start_type,
            commands::programs::get_installed_programs,
            commands::programs::uninstall_program,
            commands::privacy::scan_privacy_items,
            commands::privacy::clean_privacy_items,
            commands::hardware::get_hardware_temps,
            commands::disk_health::get_disk_health,
            commands::bsod::get_bsod_events,
            commands::force_delete::check_file_status,
            commands::force_delete::force_delete_path,
            commands::disk_usage::get_drives_list,
            commands::disk_usage::scan_directory,
            commands::duplicates::scan_duplicates,
            commands::duplicates::delete_duplicate_files,
            commands::scheduler::get_scheduled_tasks,
            commands::scheduler::set_task_enabled,
            commands::scheduler::run_task_now,
            commands::shutdown::execute_shutdown,
            commands::dns::check_dns,
            commands::dns::reset_dns_to_auto,
            commands::dns::is_dns_safe,
            commands::deep_uninstaller::scan_leftovers,
            commands::deep_uninstaller::delete_leftovers,
            commands::software_updater::get_updatable_software,
            commands::software_updater::check_winget_available,
            commands::software_updater::winget_upgrade,
            commands::software_updater::winget_list_upgrades,
            commands::context_menu::get_context_menu_items,
            commands::context_menu::disable_context_menu_item,
            commands::context_menu::enable_context_menu_item,
            commands::context_menu::delete_context_menu_item,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
