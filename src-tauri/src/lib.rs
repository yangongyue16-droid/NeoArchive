use serde::Serialize;
use std::net::TcpListener;
use std::sync::Mutex;
use tauri::{Manager, State};
use tauri_plugin_shell::{process::CommandChild, ShellExt};

struct BackendProcess(Mutex<Option<CommandChild>>);

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct BackendConnection {
    base_url: String,
    session_token: Option<String>,
}

#[tauri::command]
fn backend_connection(connection: State<'_, BackendConnection>) -> BackendConnection {
    connection.inner().clone()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![backend_connection])
        .setup(|app| {
            let port = if cfg!(debug_assertions) {
                8765
            } else {
                let listener = TcpListener::bind(("127.0.0.1", 0))?;
                let port = listener.local_addr()?.port();
                drop(listener);
                port
            };
            let token = if cfg!(debug_assertions) {
                None
            } else {
                Some(uuid::Uuid::new_v4().to_string())
            };
            app.manage(BackendConnection {
                base_url: format!("http://127.0.0.1:{port}/api/v1"),
                session_token: token.clone(),
            });

            if cfg!(debug_assertions) {
                app.manage(BackendProcess(Mutex::new(None)));
                return Ok(());
            }

            let mut command = app.shell().sidecar("neoarchive-api")?.args([
                "--host",
                "127.0.0.1",
                "--port",
                &port.to_string(),
            ]);
            if let Some(session_token) = token {
                command = command.args(["--session-token", &session_token]);
            }
            let (mut events, child) = command.spawn()?;
            tauri::async_runtime::spawn(async move { while events.recv().await.is_some() {} });
            app.manage(BackendProcess(Mutex::new(Some(child))));
            Ok(())
        })
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::Destroyed) {
                let process = window.state::<BackendProcess>();
                if let Ok(mut child) = process.0.lock() {
                    if let Some(child) = child.take() {
                        let _ = child.kill();
                    }
                };
            }
        })
        .run(tauri::generate_context!())
        .expect("failed to run NeoArchive desktop shell");
}
