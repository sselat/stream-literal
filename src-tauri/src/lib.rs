mod audio_capture;
mod process;

use std::sync::Mutex;
use serde::{Deserialize, Serialize};
use tauri::State;

pub struct AppState {
    pub audio_engine: Mutex<audio_capture::AudioCaptureEngine>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CaptureStartResult {
    pub sample_rate: u32,
    pub channels: u32,
    pub target_exe: Option<String>,
    pub target_pid: u32,
    pub is_excluded: bool,
}

#[tauri::command]
fn get_audio_apps() -> Vec<process::AudioAppInfo> {
    process::list_active_applications()
}

#[tauri::command]
fn start_audio_capture(
    state: State<'_, AppState>,
    on_audio_chunk: tauri::ipc::Channel<tauri::ipc::InvokeResponseBody>,
    target_exes: Option<Vec<String>>,
    exclude: bool,
) -> Result<CaptureStartResult, String> {
    let mut target_pid = 0u32;
    let mut chosen_exe: Option<String> = None;

    if let Some(ref exes) = target_exes {
        if let Some((exe, pid)) = process::find_first_active_target(exes) {
            target_pid = pid;
            chosen_exe = Some(exe);
        }
    }

    let engine = state.audio_engine.lock().map_err(|e| e.to_string())?;
    let sample_rate = engine
        .start_capture(target_pid, exclude, on_audio_chunk)
        .map_err(|e| format!("{:?}", e))?;

    Ok(CaptureStartResult {
        sample_rate,
        channels: 2,
        target_exe: chosen_exe,
        target_pid,
        is_excluded: exclude,
    })
}

#[tauri::command]
fn stop_audio_capture(state: State<'_, AppState>) -> Result<(), String> {
    let engine = state.audio_engine.lock().map_err(|e| e.to_string())?;
    engine.stop();
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_state = AppState {
        audio_engine: Mutex::new(audio_capture::AudioCaptureEngine::new()),
    };

    tauri::Builder::default()
        .manage(app_state)
        .plugin(tauri_plugin_log::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            get_audio_apps,
            start_audio_capture,
            stop_audio_capture,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
