use std::sync::mpsc::SyncSender;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use windows::core::{implement, Interface, Ref, Result};
use windows::Win32::Media::Audio::*;
use windows::Win32::System::Com::{BLOB, CoTaskMemAlloc, CoTaskMemFree};
use windows::Win32::System::Com::StructuredStorage::*;
use windows::Win32::System::Variant::VT_BLOB;

#[implement(IActivateAudioInterfaceCompletionHandler)]
pub struct AudioActivationHandler {
    pub tx: SyncSender<Result<IAudioClient>>,
}

impl IActivateAudioInterfaceCompletionHandler_Impl for AudioActivationHandler_Impl {
    fn ActivateCompleted(
        &self,
        operation: Ref<'_, IActivateAudioInterfaceAsyncOperation>,
    ) -> Result<()> {
        let op = operation.ok()?;
        unsafe {
            let mut hr = windows::core::HRESULT(0);
            let mut unk = None;
            let res = op.GetActivateResult(&mut hr, &mut unk);
            let client_res = match res {
                Ok(()) => {
                    if hr.is_ok() {
                        match unk {
                            Some(u) => u.cast::<IAudioClient>(),
                            None => Err(windows::core::Error::from(windows::core::HRESULT(-1))),
                        }
                    } else {
                        Err(windows::core::Error::from(hr))
                    }
                }
                Err(e) => Err(e),
            };
            let _ = self.tx.send(client_res);
        }
        Ok(())
    }
}

pub struct AudioCaptureEngine {
    is_running: Arc<Mutex<bool>>,
}

impl AudioCaptureEngine {
    pub fn new() -> Self {
        Self {
            is_running: Arc::new(Mutex::new(false)),
        }
    }

    pub fn stop(&self) {
        if let Ok(mut running) = self.is_running.lock() {
            *running = false;
        }
    }

    pub fn start_capture(
        &self,
        target_pid: u32,
        exclude: bool,
        channel: tauri::ipc::Channel<tauri::ipc::InvokeResponseBody>,
    ) -> Result<u32> {
        self.stop(); // Interrompe qualquer captura anterior ativa
        std::thread::sleep(Duration::from_millis(60));

        let is_running_clone = self.is_running.clone();
        {
            let mut running = self.is_running.lock().unwrap();
            *running = true;
        }

        let (init_tx, init_rx) = std::sync::mpsc::sync_channel::<Result<u32>>(1);

        std::thread::spawn(move || {
            unsafe {
                let _ = windows::Win32::System::Com::CoInitializeEx(
                    None,
                    windows::Win32::System::Com::COINIT_MULTITHREADED,
                );
            }

            if let Err(e) = Self::run_loopback_thread(
                target_pid,
                exclude,
                channel,
                is_running_clone,
                init_tx,
            ) {
                eprintln!("[AudioCaptureEngine] Thread de captura finalizada com erro: {:?}", e);
            }

            unsafe {
                windows::Win32::System::Com::CoUninitialize();
            }
        });

        init_rx
            .recv_timeout(Duration::from_secs(3))
            .map_err(|_| windows::core::Error::from(windows::core::HRESULT(-1)))?
    }

    fn get_audio_client(target_pid: u32, exclude: bool) -> Result<IAudioClient> {
        if target_pid > 0 {
            let size = std::mem::size_of::<AUDIOCLIENT_ACTIVATION_PARAMS>();
            let p_mem = unsafe { CoTaskMemAlloc(size) } as *mut AUDIOCLIENT_ACTIVATION_PARAMS;
            if p_mem.is_null() {
                return Err(windows::core::Error::from(windows::core::HRESULT(-1)));
            }

            unsafe {
                std::ptr::write(
                    p_mem,
                    AUDIOCLIENT_ACTIVATION_PARAMS {
                        ActivationType: AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK,
                        Anonymous: AUDIOCLIENT_ACTIVATION_PARAMS_0 {
                            ProcessLoopbackParams: AUDIOCLIENT_PROCESS_LOOPBACK_PARAMS {
                                TargetProcessId: target_pid,
                                ProcessLoopbackMode: if exclude {
                                    PROCESS_LOOPBACK_MODE_EXCLUDE_TARGET_PROCESS_TREE
                                } else {
                                    PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE
                                },
                            },
                        },
                    },
                );
            }

            let blob = BLOB {
                cbSize: size as u32,
                pBlobData: p_mem as *mut u8,
            };

            let prop = PROPVARIANT {
                Anonymous: PROPVARIANT_0 {
                    Anonymous: std::mem::ManuallyDrop::new(PROPVARIANT_0_0 {
                        vt: VT_BLOB,
                        wReserved1: 0,
                        wReserved2: 0,
                        wReserved3: 0,
                        Anonymous: PROPVARIANT_0_0_0 { blob },
                    }),
                },
            };

            let (tx, rx) = std::sync::mpsc::sync_channel(1);
            let handler: IActivateAudioInterfaceCompletionHandler =
                AudioActivationHandler { tx }.into();

            unsafe {
                let _async_op = ActivateAudioInterfaceAsync(
                    VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK,
                    &IAudioClient::IID,
                    Some(&prop),
                    &handler,
                )?;
            }

            let res = rx
                .recv_timeout(Duration::from_secs(3))
                .map_err(|_| windows::core::Error::from(windows::core::HRESULT(-1)))??;

            // Nota sobre gerenciamento de memória COM:
            // A struct PROPVARIANT implementa Drop no crate `windows`, invocando PropVariantClear(&mut self).
            // Para o tipo VT_BLOB, PropVariantClear executa CoTaskMemFree(blob.pBlobData).
            // Como alocamos p_mem via CoTaskMemAlloc, o ponteiro é liberado de forma limpa e válida na heap COM,
            // prevenindo o erro 0xc0000374 (STATUS_HEAP_CORRUPTION).
            Ok(res)
        } else {
            Self::get_default_audio_client()
        }
    }

    fn get_default_audio_client() -> Result<IAudioClient> {
        unsafe {
            let enumerator: IMMDeviceEnumerator =
                windows::Win32::System::Com::CoCreateInstance(
                    &MMDeviceEnumerator,
                    None,
                    windows::Win32::System::Com::CLSCTX_ALL,
                )?;
            let device = enumerator.GetDefaultAudioEndpoint(eRender, eMultimedia)?;
            device.Activate(windows::Win32::System::Com::CLSCTX_ALL, None)
        }
    }

    unsafe fn read_sample_f32(
        p_data: *const u8,
        frame_idx: usize,
        channel_idx: usize,
        total_channels: usize,
        bits_per_sample: u16,
        is_float: bool,
    ) -> f32 {
        let sample_offset = frame_idx * total_channels + channel_idx;
        if is_float && bits_per_sample == 32 {
            let ptr = p_data as *const f32;
            *ptr.add(sample_offset)
        } else if bits_per_sample == 16 {
            let ptr = p_data as *const i16;
            (*ptr.add(sample_offset) as f32) / 32768.0
        } else if bits_per_sample == 32 && !is_float {
            let ptr = p_data as *const i32;
            (*ptr.add(sample_offset) as f32) / 2147483648.0
        } else if bits_per_sample == 24 {
            let byte_pos = sample_offset * 3;
            let b0 = *p_data.add(byte_pos) as i32;
            let b1 = *p_data.add(byte_pos + 1) as i32;
            let b2 = *p_data.add(byte_pos + 2) as i8 as i32;
            let val = (b2 << 16) | (b1 << 8) | b0;
            (val as f32) / 8388608.0
        } else {
            0.0
        }
    }

    fn run_loopback_thread(
        target_pid: u32,
        exclude: bool,
        channel: tauri::ipc::Channel<tauri::ipc::InvokeResponseBody>,
        is_running: Arc<Mutex<bool>>,
        init_tx: SyncSender<Result<u32>>,
    ) -> Result<()> {
        let audio_client_res = Self::get_audio_client(target_pid, exclude);
        let audio_client = match audio_client_res {
            Ok(c) => c,
            Err(e) => {
                eprintln!("[AudioCaptureEngine] Falha no loopback por PID ({:?}), tentando dispositivo padrão...", e);
                Self::get_default_audio_client()?
            }
        };

        unsafe {
            // Em clientes criados por ActivateAudioInterfaceAsync(VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK),
            // a chamada client.GetMixFormat() retorna E_NOTIMPL (0x80004001).
            // Portanto, consultamos o formato de mixagem do endpoint padrão ativo no Windows.
            let enumerator: IMMDeviceEnumerator =
                windows::Win32::System::Com::CoCreateInstance(
                    &MMDeviceEnumerator,
                    None,
                    windows::Win32::System::Com::CLSCTX_ALL,
                )?;
            let default_device = enumerator.GetDefaultAudioEndpoint(eRender, eMultimedia)?;
            let default_client: IAudioClient = default_device.Activate(windows::Win32::System::Com::CLSCTX_ALL, None)?;
            let pwfx = default_client.GetMixFormat()?;

            let sample_rate = (*pwfx).nSamplesPerSec;
            let channels = (*pwfx).nChannels;
            let bits_per_sample = (*pwfx).wBitsPerSample;
            let format_tag = (*pwfx).wFormatTag;

            let mut is_float = false;
            if format_tag == 3 {
                is_float = true;
            } else if format_tag == 0xFFFE {
                let p_ext = pwfx as *const WAVEFORMATEXTENSIBLE;
                if (*p_ext).SubFormat.data1 == 3 {
                    is_float = true;
                }
            }

            println!(
                "[AudioCaptureEngine] Captura iniciada: {}Hz, {} canais, {} bits (Float: {}, PID: {}, Excluir: {})",
                sample_rate, channels, bits_per_sample, is_float, target_pid, exclude
            );

            let buffer_duration = 500000; // 50ms buffer WASAPI
            audio_client.Initialize(
                AUDCLNT_SHAREMODE_SHARED,
                AUDCLNT_STREAMFLAGS_LOOPBACK,
                buffer_duration,
                0,
                pwfx,
                None,
            )?;

            let capture_client: IAudioCaptureClient = audio_client.GetService()?;
            audio_client.Start()?;

            // Notifica o chamador que o cliente WASAPI inicializou com sucesso
            let _ = init_tx.send(Ok(sample_rate));

            while *is_running.lock().unwrap() {
                let mut packet_size = capture_client.GetNextPacketSize()?;
                while packet_size > 0 {
                    let mut p_data = std::ptr::null_mut();
                    let mut num_frames_read = 0u32;
                    let mut flags = 0u32;

                    capture_client.GetBuffer(
                        &mut p_data,
                        &mut num_frames_read,
                        &mut flags,
                        None,
                        None,
                    )?;

                    if num_frames_read > 0 && !p_data.is_null() {
                        let total_frames = num_frames_read as usize;
                        let is_silent = (flags & (AUDCLNT_BUFFERFLAGS_SILENT.0 as u32)) != 0;

                        let mut stereo_bytes = Vec::with_capacity(total_frames * 2 * 4);

                        if is_silent {
                            stereo_bytes.resize(total_frames * 2 * 4, 0u8);
                        } else {
                            let total_ch = channels as usize;
                            for i in 0..total_frames {
                                let (left, right) = if channels == 1 {
                                    let s = Self::read_sample_f32(p_data, i, 0, total_ch, bits_per_sample, is_float);
                                    (s, s)
                                } else if channels == 2 {
                                    let l = Self::read_sample_f32(p_data, i, 0, 2, bits_per_sample, is_float);
                                    let r = Self::read_sample_f32(p_data, i, 1, 2, bits_per_sample, is_float);
                                    (l, r)
                                } else {
                                    // Downmix multicanal (5.1 / 7.1) para estéreo
                                    let fl = Self::read_sample_f32(p_data, i, 0, total_ch, bits_per_sample, is_float);
                                    let fr = Self::read_sample_f32(p_data, i, 1, total_ch, bits_per_sample, is_float);
                                    let fc = Self::read_sample_f32(p_data, i, 2, total_ch, bits_per_sample, is_float);
                                    let rl = if total_ch > 4 { Self::read_sample_f32(p_data, i, 4, total_ch, bits_per_sample, is_float) } else { 0.0 };
                                    let rr = if total_ch > 5 { Self::read_sample_f32(p_data, i, 5, total_ch, bits_per_sample, is_float) } else { 0.0 };
                                    let sl = if total_ch > 6 { Self::read_sample_f32(p_data, i, 6, total_ch, bits_per_sample, is_float) } else { 0.0 };
                                    let sr = if total_ch > 7 { Self::read_sample_f32(p_data, i, 7, total_ch, bits_per_sample, is_float) } else { 0.0 };

                                    let l = (fl + 0.7071 * fc + 0.7071 * rl + 0.7071 * sl).clamp(-1.0, 1.0);
                                    let r = (fr + 0.7071 * fc + 0.7071 * rr + 0.7071 * sr).clamp(-1.0, 1.0);
                                    (l, r)
                                };

                                stereo_bytes.extend_from_slice(&left.to_le_bytes());
                                stereo_bytes.extend_from_slice(&right.to_le_bytes());
                            }
                        }

                        let _ = channel.send(tauri::ipc::InvokeResponseBody::Raw(stereo_bytes));
                    }

                    capture_client.ReleaseBuffer(num_frames_read)?;
                    packet_size = capture_client.GetNextPacketSize()?;
                }

                std::thread::sleep(Duration::from_millis(15));
            }

            let _ = audio_client.Stop();
            CoTaskMemFree(Some(pwfx as *const _));
            println!("[AudioCaptureEngine] Captura finalizada com sucesso.");
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_process_loopback_activation() {
        unsafe {
            let _ = windows::Win32::System::Com::CoInitializeEx(
                None,
                windows::Win32::System::Com::COINIT_MULTITHREADED,
            );
        }

        if let Some(pid) = crate::process::find_root_pid_for_exe("discord.exe") {
            let client = AudioCaptureEngine::get_audio_client(pid, true);
            assert!(client.is_ok(), "Falha ao ativar loopback para PID do Discord");
        }
    }

    #[test]
    fn test_format_and_initialize() {
        unsafe {
            let _ = windows::Win32::System::Com::CoInitializeEx(
                None,
                windows::Win32::System::Com::COINIT_MULTITHREADED,
            );

            let enumerator: IMMDeviceEnumerator =
                windows::Win32::System::Com::CoCreateInstance(
                    &MMDeviceEnumerator,
                    None,
                    windows::Win32::System::Com::CLSCTX_ALL,
                ).unwrap();
            let default_device = enumerator.GetDefaultAudioEndpoint(eRender, eMultimedia).unwrap();
            let default_client: IAudioClient = default_device.Activate(windows::Win32::System::Com::CLSCTX_ALL, None).unwrap();
            let pwfx = default_client.GetMixFormat().unwrap();

            if let Some(pid) = crate::process::find_root_pid_for_exe("discord.exe") {
                let client = AudioCaptureEngine::get_audio_client(pid, true).unwrap();
                let init_res = client.Initialize(
                    AUDCLNT_SHAREMODE_SHARED,
                    AUDCLNT_STREAMFLAGS_LOOPBACK,
                    500000,
                    0,
                    pwfx,
                    None,
                );
                assert!(init_res.is_ok(), "Falha ao inicializar com MixFormat do endpoint padrão");
            }

            CoTaskMemFree(Some(pwfx as *const _));
        }
    }
}
