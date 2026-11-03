use std::collections::HashSet;
use serde::{Deserialize, Serialize};
use windows::core::Interface;
use windows::Win32::Foundation::*;
use windows::Win32::System::Com::*;
use windows::Win32::Media::Audio::*;
use windows::Win32::System::Diagnostics::ToolHelp::*;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AudioAppInfo {
    pub pid: u32,
    pub name: String,
    pub exe_name: String,
    pub window_title: String,
    pub icon_hint: String,
}

pub fn get_audio_session_pids() -> HashSet<u32> {
    let mut pids = HashSet::new();
    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        if let Ok(enumerator) = CoCreateInstance::<_, IMMDeviceEnumerator>(&MMDeviceEnumerator, None, CLSCTX_ALL) {
            if let Ok(device) = enumerator.GetDefaultAudioEndpoint(eRender, eMultimedia) {
                if let Ok(session_manager) = device.Activate::<IAudioSessionManager2>(CLSCTX_ALL, None) {
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
        "discord.exe", "spotify.exe", "steam.exe", "opera.exe", "chrome.exe",
        "msedge.exe", "firefox.exe", "brave.exe", "whatsapp.root.exe", "leagueclient.exe",
        "leagueclientux.exe", "riot client.exe", "cs2.exe", "valorant.exe"
    ];

    // Processos de sistema e antivírus a ignorar mesmo que toquem notificações do sistema
    let system_ignore = [
        "system", "registry", "smss.exe", "csrss.exe", "wininit.exe", "services.exe",
        "lsass.exe", "svchost.exe", "fontdrvhost.exe", "dwm.exe", "memory compression",
        "spoolsv.exe", "taskhostw.exe", "shellexperiencehost.exe",
        "searchhost.exe", "startmenuexperiencehost.exe", "textinputhost.exe",
        "applicationframehost.exe", "systemsettings.exe", "runtimebroker.exe",
        "sihost.exe", "ctfmon.exe", "securityhealthservice.exe", "smartscreen.exe",
        "audiodg.exe", "conhost.exe", "dllhost.exe", "wudfhost.exe", "searchindexer.exe",
        "winlogon.exe", "lsaiso.exe", "wmiprvse.exe", "dashost.exe", "unsecapp.exe",
        "aggregatorhost.exe", "shellhost.exe", "useroobebroker.exe", "lockapp.exe",
        "monotificationux.exe", "crossdeviceresume.exe", "gameinputrawinputproxy.exe",
        "gamebarpresencewriter.exe", "vgc.exe", "vgtray.exe", "sqlwriter.exe",
        "secure system", "wsc_proxy.exe", "vctip.exe", "cmd.exe", "powershell.exe",
        "cargo.exe", "language_server.exe", "model_host.exe", "tiworker.exe",
        "trustedinstaller.exe", "cleanmgr.exe", "dismhost.exe", "git.exe",
        "mousocoreworker.exe", "nortonui.exe", "aswengsrv.exe", "aswidsagent.exe",
        "afwserv.exe", "scpbradguard.exe", "scpbradserv.exe", "lghub_agent.exe",
        "lghub_system_tray.exe", "nvcontainer.exe", "nvdisplay.container.exe",
        "openrgb.exe", "turzx.exe", "jucheck.exe", "jusched.exe"
    ];

    unsafe {
        if let Ok(snapshot) = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) {
            let mut entry = PROCESSENTRY32W {
                dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32,
                ..Default::default()
            };

            if Process32FirstW(snapshot, &mut entry).is_ok() {
                loop {
                    let null_pos = entry.szExeFile.iter().position(|&c| c == 0).unwrap_or(entry.szExeFile.len());
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
                            } else if lower_exe.contains("league") || lower_exe.contains("riot") || lower_exe.contains("game") {
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
                            } else if lower_exe == "msedge.exe" || lower_exe == "msedgewebview2.exe" {
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
                                exe_name.strip_suffix(".exe").unwrap_or(&exe_name).to_string()
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
        let a_prio = if a.icon_hint == "discord" { 0 } else if a.icon_hint == "spotify" { 1 } else { 2 };
        let b_prio = if b.icon_hint == "discord" { 0 } else if b.icon_hint == "spotify" { 1 } else { 2 };
        a_prio.cmp(&b_prio).then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
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
            println!("- [{}] {} ({}) | PID: {}", app.icon_hint, app.name, app.exe_name, app.pid);
        }
        println!("==============================================\n");
        assert!(!apps.is_empty(), "Should find active running processes");
    }
}
