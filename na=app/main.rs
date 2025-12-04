// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;
use std::fs;
use std::path::PathBuf;

// Database initialization command
#[tauri::command]
fn init_database(app_handle: tauri::AppHandle) -> Result<String, String> {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    
    fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?;
    
    let db_path = app_dir.join("nakasem-crm.db");
    Ok(db_path.to_string_lossy().to_string())
}

// Get app data directory
#[tauri::command]
fn get_app_data_dir(app_handle: tauri::AppHandle) -> Result<String, String> {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    
    Ok(app_dir.to_string_lossy().to_string())
}

// Create backup
#[tauri::command]
fn create_backup(app_handle: tauri::AppHandle, data: String) -> Result<String, String> {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    
    let backup_dir = app_dir.join("backups");
    fs::create_dir_all(&backup_dir).map_err(|e| e.to_string())?;
    
    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S");
    let backup_file = backup_dir.join(format!("backup_{}.json", timestamp));
    
    fs::write(&backup_file, data).map_err(|e| e.to_string())?;
    
    Ok(backup_file.to_string_lossy().to_string())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            init_database,
            get_app_data_dir,
            create_backup
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}