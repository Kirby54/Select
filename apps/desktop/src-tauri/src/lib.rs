//! Select desktop: one frameless window showing the Select interface served on this machine.
//! The interface draws its own title bar (as Whale does) when it sees `window.__TAURI__`.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while starting Select");
}
