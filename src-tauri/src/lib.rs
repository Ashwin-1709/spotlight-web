use serde_json::Value;
use tauri::{Emitter, Manager};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
use urlencoding::encode;

#[tauri::command]
fn open_browser(url: String) -> Result<(), String> {
    open::that(&url).map_err(|e| format!("Failed to open URL: {}", e))
}

#[tauri::command]
fn hide_window(window: tauri::Window) -> Result<(), String> {
    window
        .hide()
        .map_err(|e| format!("Failed to hide window: {}", e))
}

#[tauri::command]
fn log_to_terminal(message: String) {
    println!("[JS]: {}", message);
}

#[tauri::command]
async fn get_suggestions(query: String) -> Result<Value, String> {
    // Step 1: Build the URL with encoded query
    let url = format!(
        "https://suggestqueries.google.com/complete/search?client=firefox&q={}",
        encode(&query)
    );

    // Step 2: Make the HTTP request
    let response = reqwest::get(&url).await.map_err(|e| e.to_string())?;

    // Step 3: Get the raw bytes from the response
    let raw_bytes = response.bytes().await.map_err(|e| e.to_string())?;

    // Step 4: Parse the JSON response
    let parsed_data =
        serde_json::from_str(&String::from_utf8_lossy(&raw_bytes)).map_err(|e| e.to_string())?;

    Ok(parsed_data)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        let alt_space = Shortcut::new(Some(Modifiers::ALT), Code::Space);
                        if shortcut == &alt_space {
                            if let Some(window) = app.get_webview_window("main") {
                                if window.is_visible().unwrap_or(false) {
                                    let _ = window.hide();
                                } else {
                                    let _ = window.show();
                                    let _ = window.set_focus();
                                    let _ = window.emit("focus-input", ());
                                }
                            }
                        }
                    }
                })
                .build(),
        )
        .setup(|app| {
            let alt_space = Shortcut::new(Some(Modifiers::ALT), Code::Space);
            app.global_shortcut().register(alt_space)?;

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            open_browser,
            hide_window,
            log_to_terminal,
            get_suggestions
        ])
        .run(tauri::generate_context!())
        .expect("error while running Spotlight Web");
}
