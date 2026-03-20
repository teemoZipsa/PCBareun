mod commands;
mod utils;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
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
            commands::programs::open_appwiz_cpl,
            commands::programs::open_url,
            commands::privacy::scan_privacy_items,
            commands::privacy::clean_privacy_items,
            commands::ai_optimizer::scan_ai_models,
            commands::ai_optimizer::delete_ai_model,
            commands::ai_optimizer::scan_ollama_models,
            commands::ai_optimizer::delete_ollama_model,
            commands::ai_optimizer::scan_exposed_secrets,
            commands::hardware::get_hardware_temps,
            commands::hardware::restart_as_admin,
            commands::hardware::get_gpu_usage,
            commands::hardware::kill_vram_zombies,
            commands::disk_health::get_disk_health,
            commands::bsod::get_bsod_events,
            commands::force_delete::check_file_status,
            commands::force_delete::force_delete_path,
            commands::disk_usage::get_drives_list,
            commands::disk_usage::scan_directory,
            commands::duplicates::scan_duplicates,
            commands::duplicates::delete_duplicate_files,
            commands::duplicates::get_user_folders,
            commands::duplicates::open_folder_in_explorer,
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

            commands::registry::scan_registry_issues,
            commands::registry::fix_registry_issues,
            commands::registry::create_restore_point,
            commands::debloat::get_debloat_status,
            commands::debloat::remove_bloatware_apps,
            commands::debloat::toggle_telemetry_setting,
            commands::debloat::get_unused_programs,
            commands::startup::get_startup_items,
            commands::startup::toggle_startup_item,
            commands::temp_cleaner::scan_temp_files,
            commands::temp_cleaner::clean_temp_files,
            commands::protection::get_protected_items,
            commands::protection::save_protected_items,
            commands::protection::is_path_protected,
            commands::protection::backup_registry_keys,
            commands::protection::list_registry_backups,
            commands::memory::get_memory_status,
            commands::memory::optimize_memory,
            commands::network::get_network_status,
            commands::wincontrol::get_wincontrol_status,
            commands::wincontrol::toggle_windows_update,
            commands::wincontrol::activate_ultimate_performance,
            commands::wincontrol::toggle_recall,
            commands::wincontrol::toggle_copilot,
            commands::autostart::get_autostart_status,
            commands::autostart::set_autostart,

            commands::port_monitor::get_port_usage,
            commands::port_monitor::kill_process,
            commands::port_monitor::kill_zombie_nodes,

            commands::env_manager::get_path_entries,
            commands::env_manager::get_dev_tool_versions,
            commands::env_manager::get_ai_cache_info,
            commands::env_manager::relocate_ai_cache,

            commands::vhdx_compactor::scan_vhdx_files,
            commands::vhdx_compactor::compact_vhdx,

            commands::process_booster::get_killable_processes,
            commands::process_booster::kill_processes,

            commands::secure_erase::get_erasable_drives,
            commands::secure_erase::start_secure_erase,
            commands::secure_erase::get_erase_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
