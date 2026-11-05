use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use windows::core::Interface;
use windows::Win32::Foundation::*;
use windows::Win32::Media::Audio::*;
use windows::Win32::System::Com::*;
use windows::Win32::System::Diagnostics::ToolHelp::*;

#[allow(unused_imports)]
use windows::Win32::Media::Audio::{
    ActivateAudioInterfaceAsync, IActivateAudioInterfaceAsyncOperation,
    IActivateAudioInterfaceCompletionHandler, AUDIOCLIENT_ACTIVATION_PARAMS,
    AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK,
    PROCESS_LOOPBACK_MODE_EXCLUDE_TARGET_PROCESS_TREE,
    PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE,
};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AudioAppInfo {
    pub pid: u32,
    pub name: String,
    pub exe_name: String,
    pub window_title: String,
    pub icon_hint: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct WindowDetectResult {
    pub pid: u32,
    pub exe_name: String,
    pub display_name: String,
}

pub fn get_exe_name_for_pid(target_pid: u32) -> Option<String> {
    unsafe {
        let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0).ok()?;
        let mut entry = PROCESSENTRY32W {
            dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32,
            ..Default::default()
        };

        if Process32FirstW(snapshot, &mut entry).is_ok() {
            loop {
                if entry.th32ProcessID == target_pid {
                    let null_pos = entry
                        .szExeFile
                        .iter()
                        .position(|&c| c == 0)
                        .unwrap_or(entry.szExeFile.len());
                    let exe_name = String::from_utf16_lossy(&entry.szExeFile[..null_pos]);
                    let _ = CloseHandle(snapshot);
                    return Some(exe_name);
                }

                if Process32NextW(snapshot, &mut entry).is_err() {
                    break;
                }
            }
        }
        let _ = CloseHandle(snapshot);
    }
    None
}

struct WindowMatchState<'a> {
    target_label: &'a str,
    found: Option<(u32, String)>,
}

unsafe extern "system" fn enum_window_callback(hwnd: HWND, lparam: LPARAM) -> windows::core::BOOL {
    use windows::Win32::UI::WindowsAndMessaging::{GetWindowTextW, GetWindowThreadProcessId, IsWindowVisible};
    let state = &mut *(lparam.0 as *mut WindowMatchState);
    if !IsWindowVisible(hwnd).as_bool() {
        return windows::core::BOOL(1);
    }

    let mut buf = [0u16; 512];
    let len = GetWindowTextW(hwnd, &mut buf);
    if len > 0 {
        let title = String::from_utf16_lossy(&buf[..len as usize]);
        let lower_title = title.to_lowercase();
        let target = state.target_label.to_lowercase();

        if lower_title.contains(&target) || target.contains(&lower_title) {
            let mut pid = 0u32;
            GetWindowThreadProcessId(hwnd, Some(&mut pid));
            if pid > 0 {
                if let Some(exe) = get_exe_name_for_pid(pid) {
                    let low_exe = exe.to_lowercase();
                    if low_exe != "stream-literal.exe" && low_exe != "msedgewebview2.exe" {
                        state.found = Some((pid, exe));
                        return windows::core::BOOL(0);
                    }
                }
            }
        }
    }
    windows::core::BOOL(1)
}

pub fn find_pid_and_exe_by_title_or_hwnd(label: &str) -> Option<(u32, String)> {
    let trimmed = label.trim();

    // 1. Tenta padrão Chromium com HWND ("window:12345:0")
    if let Some(rest) = trimmed.strip_prefix("window:") {
        let parts: Vec<&str> = rest.split(':').collect();
        let raw_val = parts[0].trim();
        let hwnd_val: Option<isize> = if raw_val.starts_with("0x") || raw_val.starts_with("0X") {
            isize::from_str_radix(&raw_val[2..], 16).ok()
        } else {
            raw_val
                .parse::<isize>()
                .ok()
                .or_else(|| raw_val.parse::<usize>().ok().map(|u| u as isize))
        };

        if let Some(val) = hwnd_val {
            use windows::Win32::UI::WindowsAndMessaging::GetWindowThreadProcessId;
            let hwnd = HWND(val as *mut std::ffi::c_void);
            let mut pid = 0u32;
            unsafe {
                GetWindowThreadProcessId(hwnd, Some(&mut pid));
            }
            if pid > 0 {
                let exe = get_exe_name_for_pid(pid).unwrap_or_else(|| "app.exe".to_string());
                return Some((pid, exe));
            }
        }
    }

    // 2. Se label for um título de janela, enumera janelas ativas do Windows
    if !trimmed.is_empty() {
        use windows::Win32::UI::WindowsAndMessaging::EnumWindows;
        let mut match_state = WindowMatchState {
            target_label: trimmed,
            found: None,
        };
        unsafe {
            let _ = EnumWindows(
                Some(enum_window_callback),
                LPARAM(&mut match_state as *mut _ as isize),
            );
        }
        if let Some(found) = match_state.found {
            return Some(found);
        }

        // 3. Fallback: pesquisa na lista de aplicativos ativos conhecidos
        let lower_label = trimmed.to_lowercase();
        let apps = list_active_applications();
        for app in &apps {
            let lower_name = app.name.to_lowercase();
            let lower_exe = app.exe_name.to_lowercase();
            if lower_label.contains(&lower_name)
                || lower_name.contains(&lower_label)
                || lower_label.contains(&lower_exe)
            {
                if app.pid > 0 {
                    return Some((app.pid, app.exe_name.clone()));
                }
            }
        }
    }

    None
}

pub fn get_pid_from_window_label(label: &str) -> Option<u32> {
    find_pid_and_exe_by_title_or_hwnd(label).map(|(pid, _)| pid)
}

pub fn find_root_pid_for_exe(exe_name: &str) -> Option<u32> {
    let lower_target = exe_name.to_lowercase();
    let lower_target = lower_target.trim();

    unsafe {
        let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0).ok()?;
        let mut entry = PROCESSENTRY32W {
            dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32,
            ..Default::default()
        };

        let mut matching_processes: Vec<(u32, u32)> = Vec::new(); // (pid, parent_pid)

        if Process32FirstW(snapshot, &mut entry).is_ok() {
            loop {
                let null_pos = entry
                    .szExeFile
                    .iter()
                    .position(|&c| c == 0)
                    .unwrap_or(entry.szExeFile.len());
                let cur_exe = String::from_utf16_lossy(&entry.szExeFile[..null_pos]).to_lowercase();

                if cur_exe == lower_target
                    || (lower_target.ends_with(".exe") && cur_exe == lower_target)
                {
                    matching_processes.push((entry.th32ProcessID, entry.th32ParentProcessID));
                }

                if Process32NextW(snapshot, &mut entry).is_err() {
                    break;
                }
            }
        }
        let _ = CloseHandle(snapshot);

        if matching_processes.is_empty() {
            return None;
        }

        let pids_set: HashSet<u32> = matching_processes.iter().map(|(p, _)| *p).collect();

        // Encontra o processo raiz do executável: aquele cujo pai não é um processo do mesmo executável
        for &(pid, parent_pid) in &matching_processes {
            if !pids_set.contains(&parent_pid) {
                return Some(pid);
            }
        }

        Some(matching_processes[0].0)
    }
}

pub fn find_default_exclusion_target() -> (String, u32) {
    // Alvo prioritário absoluto para exclusão em modo tela inteira: Discord!
    // Se o usuário estiver no Discord em chamada, silencia o Discord inteiro da stream.
    let discord_exes = [
        "discord.exe",
        "discordptb.exe",
        "discordcanary.exe",
        "discorddevelopment.exe",
    ];
    for disc in &discord_exes {
        if let Some(pid) = find_root_pid_for_exe(disc) {
            return (disc.to_string(), pid);
        }
    }
    // Se o Discord não estiver aberto, o alvo padrão é o próprio Stream Literal
    ("stream-literal.exe".to_string(), std::process::id())
}

pub fn find_first_active_target(exes: &[String]) -> Option<(String, u32)> {
    // 1. Prioriza Discord se estiver na lista ou rodando no sistema
    let discord_exes = [
        "discord.exe",
        "discordptb.exe",
        "discordcanary.exe",
        "discorddevelopment.exe",
    ];
    for disc in &discord_exes {
        let is_requested = exes.iter().any(|e| e.to_lowercase() == *disc);
        if is_requested {
            if let Some(pid) = find_root_pid_for_exe(disc) {
                return Some((disc.to_string(), pid));
            }
        }
    }

    // 2. Procura os outros processos requisitados (exceto os do Stream Literal)
    for exe in exes {
        let lower = exe.to_lowercase();
        if lower != "stream-literal.exe" && lower != "msedgewebview2.exe" {
            if let Some(pid) = find_root_pid_for_exe(exe) {
                return Some((exe.clone(), pid));
            }
        }
    }

    // 3. Se nada foi encontrado ou se os únicos eram do Stream Literal, usa o alvo padrão inteligente
    Some(find_default_exclusion_target())
}

pub fn get_audio_session_pids() -> HashSet<u32> {
    let mut pids = HashSet::new();
    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        if let Ok(enumerator) =
            CoCreateInstance::<_, IMMDeviceEnumerator>(&MMDeviceEnumerator, None, CLSCTX_ALL)
        {
            if let Ok(device) = enumerator.GetDefaultAudioEndpoint(eRender, eMultimedia) {
                if let Ok(session_manager) =
                    device.Activate::<IAudioSessionManager2>(CLSCTX_ALL, None)
                {
                    if let Ok(session_enum) = session_manager.GetSessionEnumerator() {
                        let count = session_enum.GetCount().unwrap_or(0);
                        for i in 0..count {
                            if let Ok(control) = session_enum.GetSession(i) {
                                if let Ok(control2) = control.cast::<IAudioSessionControl2>() {
                                    if let Ok(pid) = control2.GetProcessId() {
                                        let is_system = control2.IsSystemSoundsSession() == S_OK;
                                        if pid > 4 && !is_system {
                                            pids.insert(pid);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    pids
}

pub fn list_active_applications() -> Vec<AudioAppInfo> {
    let audio_pids = get_audio_session_pids();
    let mut apps = Vec::new();
    let mut seen_exes = HashSet::new();

    // Aplicativos de voz, mídia e jogos que sempre devem aparecer se estiverem abertos
    let always_show_exes = [
        "discord.exe",
        "spotify.exe",
        "steam.exe",
        "opera.exe",
        "chrome.exe",
        "msedge.exe",
        "firefox.exe",
        "brave.exe",
        "whatsapp.root.exe",
        "leagueclient.exe",
        "leagueclientux.exe",
        "riot client.exe",
        "cs2.exe",
        "valorant.exe",
    ];

    // Processos de sistema e antivírus a ignorar mesmo que toquem notificações do sistema
    let system_ignore = [
        "system",
        "registry",
        "smss.exe",
        "csrss.exe",
        "wininit.exe",
        "services.exe",
        "lsass.exe",
        "svchost.exe",
        "fontdrvhost.exe",
        "dwm.exe",
        "memory compression",
        "spoolsv.exe",
        "taskhostw.exe",
        "shellexperiencehost.exe",
        "searchhost.exe",
        "startmenuexperiencehost.exe",
        "textinputhost.exe",
        "applicationframehost.exe",
        "systemsettings.exe",
        "runtimebroker.exe",
        "sihost.exe",
        "ctfmon.exe",
        "securityhealthservice.exe",
        "smartscreen.exe",
        "audiodg.exe",
        "conhost.exe",
        "dllhost.exe",
        "wudfhost.exe",
        "searchindexer.exe",
        "winlogon.exe",
        "lsaiso.exe",
        "wmiprvse.exe",
        "dashost.exe",
        "unsecapp.exe",
        "aggregatorhost.exe",
        "shellhost.exe",
        "useroobebroker.exe",
        "lockapp.exe",
        "monotificationux.exe",
        "crossdeviceresume.exe",
        "gameinputrawinputproxy.exe",
        "gamebarpresencewriter.exe",
        "vgc.exe",
        "vgtray.exe",
        "sqlwriter.exe",
        "secure system",
        "wsc_proxy.exe",
        "vctip.exe",
        "cmd.exe",
        "powershell.exe",
        "cargo.exe",
        "language_server.exe",
        "model_host.exe",
        "tiworker.exe",
        "trustedinstaller.exe",
        "cleanmgr.exe",
        "dismhost.exe",
        "git.exe",
        "mousocoreworker.exe",
        "nortonui.exe",
        "aswengsrv.exe",
        "aswidsagent.exe",
        "afwserv.exe",
        "scpbradguard.exe",
        "scpbradserv.exe",
        "lghub_agent.exe",
        "lghub_system_tray.exe",
        "nvcontainer.exe",
        "nvdisplay.container.exe",
        "openrgb.exe",
        "turzx.exe",
        "jucheck.exe",
        "jusched.exe",
        "stream-literal.exe",
        "msedgewebview2.exe",
    ];

    unsafe {
        if let Ok(snapshot) = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) {
            let mut entry = PROCESSENTRY32W {
                dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32,
                ..Default::default()
            };

            if Process32FirstW(snapshot, &mut entry).is_ok() {
                loop {
                    let null_pos = entry
                        .szExeFile
                        .iter()
                        .position(|&c| c == 0)
                        .unwrap_or(entry.szExeFile.len());
                    let exe_name = String::from_utf16_lossy(&entry.szExeFile[..null_pos]);
                    let lower_exe = exe_name.to_lowercase();
                    let pid = entry.th32ProcessID;

                    let is_system_ignored = system_ignore.contains(&lower_exe.as_str())
                        || lower_exe.ends_with("svc.exe")
                        || lower_exe.ends_with("service.exe")
                        || lower_exe.ends_with("services.exe")
                        || lower_exe.ends_with("service64.exe")
                        || lower_exe.contains("crashhandler")
                        || lower_exe.contains("crashreporter")
                        || lower_exe.contains("updater")
                        || lower_exe.starts_with("app_lib-");

                    // Critério ouro: o processo possui sessão de áudio ativa no Mixer do Windows
                    // OU é um app conhecido de voz/mídia/jogos em execução
                    let has_audio_session = audio_pids.contains(&pid);
                    let is_known_media_app = always_show_exes.contains(&lower_exe.as_str());

                    if pid > 4 && !is_system_ignored && (has_audio_session || is_known_media_app) {
                        if seen_exes.insert(lower_exe.clone()) {
                            let icon_hint = if lower_exe.contains("discord") {
                                "discord".to_string()
                            } else if lower_exe.contains("spotify") {
                                "spotify".to_string()
                            } else if lower_exe.contains("chrome")
                                || lower_exe.contains("msedge")
                                || lower_exe.contains("firefox")
                                || lower_exe.contains("brave")
                                || lower_exe.contains("opera")
                            {
                                "browser".to_string()
                            } else if lower_exe.contains("steam") {
                                "steam".to_string()
                            } else if lower_exe.contains("league")
                                || lower_exe.contains("riot")
                                || lower_exe.contains("game")
                            {
                                "game".to_string()
                            } else {
                                "app".to_string()
                            };

                            let display_name = if lower_exe.contains("discord") {
                                "Discord".to_string()
                            } else if lower_exe.contains("spotify") {
                                "Spotify".to_string()
                            } else if lower_exe == "chrome.exe" {
                                "Google Chrome".to_string()
                            } else if lower_exe == "msedge.exe" || lower_exe == "msedgewebview2.exe"
                            {
                                "Microsoft Edge".to_string()
                            } else if lower_exe == "firefox.exe" {
                                "Mozilla Firefox".to_string()
                            } else if lower_exe == "opera.exe" {
                                "Opera".to_string()
                            } else if lower_exe == "steam.exe" {
                                "Steam".to_string()
                            } else if lower_exe.contains("leagueclient") {
                                "League of Legends".to_string()
                            } else if lower_exe.contains("riot client") {
                                "Riot Client".to_string()
                            } else if lower_exe.contains("whatsapp") {
                                "WhatsApp".to_string()
                            } else {
                                exe_name
                                    .strip_suffix(".exe")
                                    .unwrap_or(&exe_name)
                                    .to_string()
                            };

                            apps.push(AudioAppInfo {
                                pid,
                                name: display_name,
                                exe_name,
                                window_title: String::new(),
                                icon_hint,
                            });
                        }
                    }

                    if Process32NextW(snapshot, &mut entry).is_err() {
                        break;
                    }
                }
            }
            let _ = CloseHandle(snapshot);
        }
    }

    // Ordenação amigável: Discord e Spotify em destaque no topo, seguidos por ordem alfabética
    apps.sort_by(|a, b| {
        let a_prio = if a.icon_hint == "discord" {
            0
        } else if a.icon_hint == "spotify" {
            1
        } else {
            2
        };
        let b_prio = if b.icon_hint == "discord" {
            0
        } else if b.icon_hint == "spotify" {
            1
        } else {
            2
        };
        a_prio
            .cmp(&b_prio)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    apps
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_list_apps() {
        let audio_pids = get_audio_session_pids();
        println!("\n=== Found {} Audio Session PIDs ===", audio_pids.len());
        for pid in &audio_pids {
            println!("- Audio PID: {}", pid);
        }

        let apps = list_active_applications();
        println!("\n=== Cleaned Active User Apps ({} apps) ===", apps.len());
        for app in &apps {
            println!(
                "- [{}] {} ({}) | PID: {}",
                app.icon_hint, app.name, app.exe_name, app.pid
            );
        }
        println!("==============================================\n");
        assert!(!apps.is_empty(), "Should find active running processes");
    }
}
