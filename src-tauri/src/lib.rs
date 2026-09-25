mod server;

use std::sync::Mutex;
use tauri::{
    webview::WebviewWindowBuilder,
    AppHandle,
    Manager,
    RunEvent,
    WebviewUrl,
};

struct ServerTask(Mutex<Option<tauri::async_runtime::JoinHandle<()>>>);

fn stop_server(app: &AppHandle) {
    if let Some(state) = app.try_state::<ServerTask>() {
        if let Ok(mut task) = state.0.lock() {
            if let Some(task) = task.take() {
                task.abort();
            }
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let (address, task) = tauri::async_runtime::block_on(server::start())
                .map_err(|error| format!("无法启动 Artemis 本地服务：{error}"))?;
            app.manage(ServerTask(Mutex::new(Some(task))));

            let url = url::Url::parse(&format!("http://{address}"))
                .map_err(|error| format!("无法创建 Artemis 地址：{error}"))?;
            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url))
                .title("Artemis")
                .inner_size(1440.0, 960.0)
                .min_inner_size(960.0, 680.0)
                .build()?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Artemis application")
        .run(|app, event| {
            if matches!(event, RunEvent::ExitRequested { .. } | RunEvent::Exit) {
                stop_server(app);
            }
        });
}
