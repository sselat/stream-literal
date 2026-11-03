use std::collections::HashSet;
use serde::{Deserialize, Serialize};
use windows::Win32::Foundation::*;
use windows::Win32::System::Diagnostics::ToolHelp::*;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AudioAppInfo {
    pub pid: u32,
    pub name: String,
    pub exe_name: String,
    pub window_title: String,
    pub icon_hint: String,
}

pub fn list_active_applications() -> Vec<AudioAppInfo> {
    let mut apps = Vec::new();
    let mut seen_exes = HashSet::new();

    // Processos do sistema, daemons e serviços de segundo plano a ignorar
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
        "cargo.exe", "language_server.exe", "model_host.exe"
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

                    // Filtros para manter a lista limpa e focada em apps de usuário / jogos
                    let is_ignored = system_ignore.contains(&lower_exe.as_str())
                        || lower_exe.ends_with("svc.exe")
                        || lower_exe.ends_with("service.exe")
                        || lower_exe.ends_with("services.exe")
                        || lower_exe.ends_with("service64.exe")
                        || lower_exe.contains("crashhandler")
                        || lower_exe.contains("crashreporter")
                        || lower_exe.contains("updater")
                        || lower_exe.contains("helper") && !lower_exe.contains("steam")
                        || lower_exe.starts_with("app_lib-");

                    if pid > 4 && !is_ignored {
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
        let apps = list_active_applications();
        println!("\n=== Cleaned Active User Apps ({} apps) ===", apps.len());
        for app in &apps {
            println!("- [{}] {} ({}) | PID: {}", app.icon_hint, app.name, app.exe_name, app.pid);
        }
        println!("==============================================\n");
        assert!(!apps.is_empty(), "Should find active running processes");
    }
}
