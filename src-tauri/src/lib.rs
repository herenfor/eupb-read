#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![read_epub_file])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// 读取本地文件为原始字节（拖拽导入 .epub 用）。
/// 返回 tauri::ipc::Response，前端 invoke 直接拿到 ArrayBuffer，避免大文件 JSON 序列化。
#[tauri::command]
fn read_epub_file(path: String) -> Result<tauri::ipc::Response, String> {
    std::fs::read(&path)
        .map(tauri::ipc::Response::new)
        .map_err(|e| format!("无法读取文件：{e}"))
}
