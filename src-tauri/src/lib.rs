mod process;

#[tauri::command]
fn get_audio_apps() -> Vec<process::AudioAppInfo> {
    process::list_active_applications()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::default().build())
        .invoke_handler(tauri::generate_handler![get_audio_apps])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
