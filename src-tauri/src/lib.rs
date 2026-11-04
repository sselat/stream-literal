mod audio_capture;
mod process;

use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{Emitter, Manager, State};

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
fn get_pid_from_window(label: String) -> Option<u32> {
    process::get_pid_from_window_label(&label)
}

#[tauri::command]
fn detect_window_app(label: String) -> Option<process::WindowDetectResult> {
    process::find_pid_and_exe_by_title_or_hwnd(&label).map(|(pid, exe_name)| {
        let display_name = exe_name
            .strip_suffix(".exe")
            .or_else(|| exe_name.strip_suffix(".EXE"))
            .unwrap_or(&exe_name)
            .to_string();
        process::WindowDetectResult {
            pid,
            exe_name,
            display_name,
        }
    })
}

#[tauri::command]
fn start_audio_capture(
    state: State<'_, AppState>,
    on_audio_chunk: tauri::ipc::Channel<tauri::ipc::InvokeResponseBody>,
    target_exes: Option<Vec<String>>,
    target_pid: Option<u32>,
    exclude: Option<bool>,
) -> Result<CaptureStartResult, String> {
    let exclude = exclude.unwrap_or(true);
    let mut resolved_pid = target_pid.unwrap_or(0);
    let mut chosen_exe: Option<String> = None;

    if resolved_pid == 0 {
        if let Some(ref exes) = target_exes {
            if let Some((exe, pid)) = process::find_first_active_target(exes) {
                resolved_pid = pid;
                chosen_exe = Some(exe);
            }
        }
    }

    // Se estiver em modo de exclusão e nenhum PID for identificado, o alvo padrão
    // de exclusão passa a ser o próprio Stream Literal (std::process::id()),
    // garantindo proteção absoluta contra loop de eco entre transmissões mútuas.
    if resolved_pid == 0 && exclude {
        resolved_pid = std::process::id();
        chosen_exe = Some("stream-literal.exe".to_string());
    }

    let engine = state.audio_engine.lock().map_err(|e| e.to_string())?;
    let sample_rate = engine
        .start_capture(resolved_pid, exclude, on_audio_chunk)
        .map_err(|e| format!("{:?}", e))?;

    Ok(CaptureStartResult {
        sample_rate,
        channels: 2,
        target_exe: chosen_exe,
        target_pid: resolved_pid,
        is_excluded: exclude,
    })
}

#[tauri::command]
fn stop_audio_capture(state: State<'_, AppState>) -> Result<(), String> {
    let engine = state.audio_engine.lock().map_err(|e| e.to_string())?;
    engine.stop();
    Ok(())
}

#[tauri::command]
fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[tauri::command]
fn restart_app(handle: tauri::AppHandle) {
    handle.restart();
}

use tauri_plugin_updater::UpdaterExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_state = AppState {
        audio_engine: Mutex::new(audio_capture::AudioCaptureEngine::new()),
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }))
        .manage(app_state)
        .plugin(tauri_plugin_log::Builder::default().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                // Aguarda 3 segundos após abrir para verificar atualizações sem travar o início
                tokio::time::sleep(std::time::Duration::from_secs(3)).await;
                if let Ok(updater) = handle.updater() {
                    match updater.check().await {
                        Ok(Some(update)) => {
                            let new_ver = update.version.clone();
                            log::info!("🚀 Nova versão encontrada: {}", new_ver);
                            let _ = handle.emit("updater:status", serde_json::json!({
                                "stage": "downloading",
                                "version": new_ver
                            }));

                            match update.download_and_install(|_chunk, _total| {}, || {}).await {
                                Ok(_) => {
                                    log::info!("✅ Atualização instalada com sucesso! Emitindo aviso e aguardando 6s...");
                                    let _ = handle.emit("updater:status", serde_json::json!({
                                        "stage": "ready",
                                        "version": new_ver
                                    }));
                                    tokio::time::sleep(std::time::Duration::from_secs(6)).await;
                                    handle.restart();
                                }
                                Err(e) => {
                                    log::error!("Erro ao baixar ou instalar atualização: {}", e);
                                    let _ = handle.emit("updater:status", serde_json::json!({
                                        "stage": "error",
                                        "error": e.to_string()
                                    }));
                                }
                            }
                        }
                        Ok(None) => {
                            log::info!("Stream Literal está na versão mais recente.");
                        }
                        Err(e) => {
                            log::warn!("Verificação de atualização remota: {}", e);
                        }
                    }
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_audio_apps,
            get_pid_from_window,
            detect_window_app,
            start_audio_capture,
            stop_audio_capture,
            get_app_version,
            restart_app,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
