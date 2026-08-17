#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            read_epub_file,
            shelf_save_book,
            shelf_list,
            shelf_read_book,
            shelf_save_cover,
            shelf_read_cover,
            shelf_update_entry,
            shelf_mark_opened,
            shelf_delete_book
        ])
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

// ---- 书架 ----
// 书文件存应用数据目录：<app_data>/books/<bookId>/book.epub，
// 封面缩略图 <app_data>/books/<bookId>/cover，索引 <app_data>/shelf.json。
// 路径全部由后端生成，bookId 只允许 [A-Za-z0-9_-]，防止路径穿越。

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ShelfEntry {
    id: String,
    title: String,
    creator: String,
    file_name: String,
    file_size: u64,
    cover_mime: String,
    added_at_ms: u128,
    last_read_at_ms: u128,
    spine_index: usize,
    page: usize,
    progress_pct: u32,
    anchor_index: Option<usize>,
    anchor_ratio: Option<f64>,
    is_new: bool,
}

fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 64
        && id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

fn shelf_root(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| format!("无法取得应用数据目录：{e}"))
}

fn book_dir(app: &AppHandle, id: &str) -> Result<PathBuf, String> {
    if !valid_id(id) {
        return Err("无效的书本 ID".into());
    }
    Ok(shelf_root(app)?.join("books").join(id))
}

fn index_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(shelf_root(app)?.join("shelf.json"))
}

fn load_index(app: &AppHandle) -> Result<Vec<ShelfEntry>, String> {
    let p = index_path(app)?;
    match fs::read_to_string(&p) {
        Ok(text) => serde_json::from_str(&text).map_err(|e| format!("书架索引损坏：{e}")),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Vec::new()),
        Err(e) => Err(format!("无法读取书架索引：{e}")),
    }
}

fn save_index(app: &AppHandle, entries: &[ShelfEntry]) -> Result<(), String> {
    let p = index_path(app)?;
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("无法创建书架目录：{e}"))?;
    }
    let text =
        serde_json::to_string_pretty(entries).map_err(|e| format!("序列化书架索引失败：{e}"))?;
    let tmp = p.with_extension("json.tmp");
    fs::write(&tmp, text).map_err(|e| format!("无法写入书架索引：{e}"))?;
    fs::rename(&tmp, &p).map_err(|e| format!("无法更新书架索引：{e}"))
}

fn read_book_bytes(app: &AppHandle, id: &str) -> Result<Vec<u8>, String> {
    let p = book_dir(app, id)?.join("book.epub");
    fs::read(&p).map_err(|e| format!("无法读取书籍文件：{e}"))
}

fn read_cover_bytes(app: &AppHandle, id: &str) -> Result<Vec<u8>, String> {
    let p = book_dir(app, id)?.join("cover");
    fs::read(&p).map_err(|e| format!("无法读取封面：{e}"))
}

/// 保存书籍字节并登记/更新索引；已存在同 id 时保留阅读进度。
#[tauri::command]
fn shelf_save_book(
    app: AppHandle,
    book_id: String,
    title: String,
    creator: String,
    file_name: String,
    file_size: u64,
    bytes: Vec<u8>,
) -> Result<ShelfEntry, String> {
    if !valid_id(&book_id) {
        return Err("无效的书本 ID".into());
    }
    if bytes.is_empty() {
        return Err("书籍内容为空".into());
    }
    let dir = book_dir(&app, &book_id)?;
    fs::create_dir_all(&dir).map_err(|e| format!("无法创建书籍目录：{e}"))?;
    fs::write(dir.join("book.epub"), &bytes).map_err(|e| format!("无法保存书籍文件：{e}"))?;

    let mut entries = load_index(&app)?;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    if let Some(i) = entries.iter().position(|e| e.id == book_id) {
        let prev = entries.remove(i);
        entries.push(ShelfEntry {
            id: book_id.clone(),
            title,
            creator,
            file_name,
            file_size,
            cover_mime: prev.cover_mime,
            added_at_ms: prev.added_at_ms,
            last_read_at_ms: prev.last_read_at_ms,
            spine_index: prev.spine_index,
            page: prev.page,
            progress_pct: prev.progress_pct,
            anchor_index: prev.anchor_index,
            anchor_ratio: prev.anchor_ratio,
            is_new: prev.is_new,
        });
    } else {
        entries.push(ShelfEntry {
            id: book_id.clone(),
            title,
            creator,
            file_name,
            file_size,
            cover_mime: String::new(),
            added_at_ms: now,
            last_read_at_ms: now,
            spine_index: 0,
            page: 0,
            progress_pct: 0,
            anchor_index: None,
            anchor_ratio: None,
            is_new: true,
        });
    }
    save_index(&app, &entries)?;
    entries
        .iter()
        .find(|e| e.id == book_id)
        .cloned()
        .ok_or_else(|| "保存后未找到书籍条目".into())
}

#[tauri::command]
fn shelf_list(app: AppHandle) -> Result<Vec<ShelfEntry>, String> {
    load_index(&app)
}

/// 返回 raw bytes（与 read_epub_file 相同方式，前端直接拿 ArrayBuffer）。
#[tauri::command]
fn shelf_read_book(app: AppHandle, book_id: String) -> Result<tauri::ipc::Response, String> {
    read_book_bytes(&app, &book_id).map(tauri::ipc::Response::new)
}

#[tauri::command]
fn shelf_save_cover(
    app: AppHandle,
    book_id: String,
    mime: String,
    bytes: Vec<u8>,
) -> Result<(), String> {
    let dir = book_dir(&app, &book_id)?;
    fs::create_dir_all(&dir).map_err(|e| format!("无法创建书籍目录：{e}"))?;
    fs::write(dir.join("cover"), &bytes).map_err(|e| format!("无法保存封面：{e}"))?;
    let mut entries = load_index(&app)?;
    if let Some(e) = entries.iter_mut().find(|e| e.id == book_id) {
        e.cover_mime = if mime.is_empty() {
            "image/jpeg".into()
        } else {
            mime
        };
        save_index(&app, &entries)?;
    }
    Ok(())
}

/// 无封面时返回空 body，前端按 0 字节判断。
#[tauri::command]
fn shelf_read_cover(app: AppHandle, book_id: String) -> Result<tauri::ipc::Response, String> {
    let bytes = match read_cover_bytes(&app, &book_id) {
        Ok(b) => b,
        Err(_) => Vec::new(),
    };
    Ok(tauri::ipc::Response::new(bytes))
}

#[tauri::command]
fn shelf_update_entry(
    app: AppHandle,
    book_id: String,
    last_read_at_ms: u128,
    spine_index: usize,
    page: usize,
    progress_pct: u32,
    anchor_index: Option<usize>,
    anchor_ratio: Option<f64>,
) -> Result<ShelfEntry, String> {
    let mut entries = load_index(&app)?;
    let e = entries
        .iter_mut()
        .find(|e| e.id == book_id)
        .ok_or_else(|| "书架中没有这本书".to_string())?;
    e.last_read_at_ms = last_read_at_ms;
    e.spine_index = spine_index;
    e.page = page;
    e.progress_pct = progress_pct.min(100);
    e.anchor_index = anchor_index;
    e.anchor_ratio = anchor_ratio;
    let entry = e.clone();
    save_index(&app, &entries)?;
    Ok(entry)
}

/// 第一次从书架打开：清除“新”标记。
#[tauri::command]
fn shelf_mark_opened(app: AppHandle, book_id: String) -> Result<ShelfEntry, String> {
    let mut entries = load_index(&app)?;
    let e = entries
        .iter_mut()
        .find(|e| e.id == book_id)
        .ok_or_else(|| "书架中没有这本书".to_string())?;
    e.is_new = false;
    let entry = e.clone();
    save_index(&app, &entries)?;
    Ok(entry)
}

#[tauri::command]
fn shelf_delete_book(app: AppHandle, book_id: String) -> Result<(), String> {
    let dir = book_dir(&app, &book_id)?;
    if dir.exists() {
        fs::remove_dir_all(&dir).map_err(|e| format!("无法删除书籍文件：{e}"))?;
    }
    let mut entries = load_index(&app)?;
    let before = entries.len();
    entries.retain(|e| e.id != book_id);
    if entries.len() == before {
        return Err("书架中没有这本书".into());
    }
    save_index(&app, &entries)
}
