#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(ShelfWriteState::default())
        .manage(FontWriteState::default())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            read_epub_file,
            shelf_stage_book_raw,
            shelf_stage_book_path,
            shelf_stage_cover_raw,
            shelf_commit_book,
            shelf_list,
            shelf_read_book,
            shelf_read_cover,
            shelf_set_content_hash,
            shelf_update_entry,
            shelf_mark_opened,
            shelf_set_bookmarks,
            shelf_delete_book,
            fonts_import_raw,
            fonts_list,
            fonts_read,
            fonts_delete
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
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

#[derive(Default)]
struct ShelfWriteState(Mutex<()>);

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ShelfEntry {
    id: String,
    title: String,
    creator: String,
    file_name: String,
    file_size: u64,
    cover_mime: String,
    added_at_ms: u64,
    last_read_at_ms: u64,
    spine_index: usize,
    page: usize,
    progress_pct: u32,
    anchor_index: Option<usize>,
    anchor_ratio: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    content_hash: Option<String>,
    is_new: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    bookmarks: Option<Vec<BookmarkEntry>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BookmarkEntry {
    id: String,
    spine_index: usize,
    page: usize,
    anchor_index: Option<usize>,
    anchor_ratio: Option<f64>,
    text: String,
    created_at_ms: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ShelfSaveResult {
    status: String,
    entry: ShelfEntry,
}

fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 64
        && id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

fn valid_content_hash(hash: &str) -> bool {
    hash.len() == 64 && hash.bytes().all(|b| b.is_ascii_hexdigit())
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

const STAGED_BOOK: &str = "book.epub.importing";
const STAGED_COVER: &str = "cover.importing";

fn request_book_id(request: &tauri::ipc::Request<'_>) -> Result<String, String> {
    let value = request
        .headers()
        .get("x-book-id")
        .ok_or_else(|| "缺少 x-book-id".to_string())?
        .to_str()
        .map_err(|_| "x-book-id 不是有效文本".to_string())?;
    if !valid_id(value) {
        return Err("无效的书本 ID".into());
    }
    Ok(value.to_string())
}

fn staged_path(app: &AppHandle, book_id: &str, name: &str) -> Result<PathBuf, String> {
    let dir = book_dir(app, book_id)?;
    fs::create_dir_all(&dir).map_err(|e| format!("无法创建书籍目录：{e}"))?;
    Ok(dir.join(name))
}

fn remove_if_exists(path: &PathBuf) {
    if path.exists() {
        let _ = fs::remove_file(path);
    }
}

/// HTML 文件选择器使用 raw body，避免 Uint8Array → JSON number[]。
#[tauri::command]
fn shelf_stage_book_raw(app: AppHandle, request: tauri::ipc::Request<'_>) -> Result<(), String> {
    let book_id = request_book_id(&request)?;
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("书籍保存请求必须使用原始二进制".into());
    };
    if bytes.is_empty() {
        return Err("书籍内容为空".into());
    }
    fs::write(staged_path(&app, &book_id, STAGED_BOOK)?, bytes)
        .map_err(|e| format!("无法暂存书籍文件：{e}"))
}

/// 原生拖放已有可信来源路径，直接复制到应用数据目录的暂存文件。
#[tauri::command]
fn shelf_stage_book_path(
    app: AppHandle,
    book_id: String,
    source_path: String,
    expected_size: u64,
) -> Result<(), String> {
    let source = PathBuf::from(source_path);
    if source
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| !ext.eq_ignore_ascii_case("epub"))
        .unwrap_or(true)
    {
        return Err("只能导入 EPUB 文件".into());
    }
    let copied = fs::copy(&source, staged_path(&app, &book_id, STAGED_BOOK)?)
        .map_err(|e| format!("无法暂存书籍文件：{e}"))?;
    if copied != expected_size {
        remove_if_exists(&staged_path(&app, &book_id, STAGED_BOOK)?);
        return Err("源文件在导入过程中发生了变化，请重新导入".into());
    }
    Ok(())
}

#[tauri::command]
fn shelf_stage_cover_raw(app: AppHandle, request: tauri::ipc::Request<'_>) -> Result<(), String> {
    let book_id = request_book_id(&request)?;
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("封面保存请求必须使用原始二进制".into());
    };
    if bytes.is_empty() {
        return Err("封面内容为空".into());
    }
    fs::write(staged_path(&app, &book_id, STAGED_COVER)?, bytes)
        .map_err(|e| format!("无法暂存封面：{e}"))
}

/// 提交暂存文件并只写一次索引；相同内容指纹直接返回 duplicate。
#[tauri::command]
#[allow(clippy::too_many_arguments)]
fn shelf_commit_book(
    app: AppHandle,
    state: State<'_, ShelfWriteState>,
    book_id: String,
    title: String,
    creator: String,
    file_name: String,
    file_size: u64,
    content_hash: String,
    cover_mime: String,
    has_cover: bool,
) -> Result<ShelfSaveResult, String> {
    if !valid_id(&book_id) || !valid_content_hash(&content_hash) || book_id != content_hash {
        return Err("无效的书籍内容指纹".into());
    }
    let _guard = state.0.lock().map_err(|_| "书架写入锁已损坏".to_string())?;
    let mut entries = load_index(&app)?;
    if let Some(existing) = entries
        .iter()
        .find(|entry| entry.content_hash.as_deref() == Some(content_hash.as_str()))
        .cloned()
    {
        let dir = book_dir(&app, &book_id)?;
        remove_if_exists(&dir.join(STAGED_BOOK));
        remove_if_exists(&dir.join(STAGED_COVER));
        return Ok(ShelfSaveResult {
            status: "duplicate".into(),
            entry: existing,
        });
    }
    if entries.iter().any(|entry| entry.id == book_id) {
        return Err("书本 ID 冲突，已拒绝覆盖现有书籍".into());
    }

    let dir = book_dir(&app, &book_id)?;
    let staged_book = dir.join(STAGED_BOOK);
    let final_book = dir.join("book.epub");
    let staged_size = fs::metadata(&staged_book)
        .map_err(|e| format!("找不到暂存书籍：{e}"))?
        .len();
    if staged_size != file_size {
        remove_if_exists(&staged_book);
        remove_if_exists(&dir.join(STAGED_COVER));
        return Err("暂存书籍大小不一致，请重新导入".into());
    }
    if final_book.exists() {
        return Err("目标书籍文件已存在，已拒绝覆盖".into());
    }
    fs::rename(&staged_book, &final_book).map_err(|e| format!("无法提交书籍文件：{e}"))?;

    let staged_cover = dir.join(STAGED_COVER);
    if has_cover {
        if let Err(error) = fs::rename(&staged_cover, dir.join("cover")) {
            let _ = fs::remove_file(&final_book);
            return Err(format!("无法提交封面：{error}"));
        }
    } else {
        remove_if_exists(&staged_cover);
    }

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0);
    let entry = ShelfEntry {
        id: book_id,
        title,
        creator,
        file_name,
        file_size,
        cover_mime: if has_cover { cover_mime } else { String::new() },
        added_at_ms: now,
        last_read_at_ms: now,
        spine_index: 0,
        page: 0,
        progress_pct: 0,
        anchor_index: None,
        anchor_ratio: None,
        content_hash: Some(content_hash),
        is_new: true,
        bookmarks: Some(Vec::new()),
    };
    entries.push(entry.clone());
    if let Err(error) = save_index(&app, &entries) {
        let _ = fs::remove_dir_all(&dir);
        return Err(error);
    }
    Ok(ShelfSaveResult {
        status: "saved".into(),
        entry,
    })
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

/// 无封面时返回空 body，前端按 0 字节判断。
#[tauri::command]
fn shelf_read_cover(app: AppHandle, book_id: String) -> Result<tauri::ipc::Response, String> {
    let bytes = match read_cover_bytes(&app, &book_id) {
        Ok(b) => b,
        Err(_) => Vec::new(),
    };
    Ok(tauri::ipc::Response::new(bytes))
}

/// 兼容 0.1.5：只为旧条目补录内容指纹，不修改任何阅读状态。
#[tauri::command]
fn shelf_set_content_hash(
    app: AppHandle,
    state: State<'_, ShelfWriteState>,
    book_id: String,
    content_hash: String,
) -> Result<ShelfEntry, String> {
    if !valid_content_hash(&content_hash) {
        return Err("无效的书籍内容指纹".into());
    }
    let _guard = state.0.lock().map_err(|_| "书架写入锁已损坏".to_string())?;
    let mut entries = load_index(&app)?;
    let entry = {
        let current = entries
            .iter_mut()
            .find(|entry| entry.id == book_id)
            .ok_or_else(|| "书架中没有这本书".to_string())?;
        current.content_hash = Some(content_hash);
        current.clone()
    };
    save_index(&app, &entries)?;
    Ok(entry)
}

#[tauri::command]
fn shelf_update_entry(
    app: AppHandle,
    state: State<'_, ShelfWriteState>,
    book_id: String,
    last_read_at_ms: u64,
    spine_index: usize,
    page: usize,
    progress_pct: u32,
    anchor_index: Option<usize>,
    anchor_ratio: Option<f64>,
) -> Result<ShelfEntry, String> {
    let _guard = state.0.lock().map_err(|_| "书架写入锁已损坏".to_string())?;
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
fn shelf_mark_opened(
    app: AppHandle,
    state: State<'_, ShelfWriteState>,
    book_id: String,
) -> Result<ShelfEntry, String> {
    let _guard = state.0.lock().map_err(|_| "书架写入锁已损坏".to_string())?;
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

/// 写入整本书的书签列表（随书删除）。
#[tauri::command]
fn shelf_set_bookmarks(
    app: AppHandle,
    state: State<'_, ShelfWriteState>,
    book_id: String,
    bookmarks: Vec<BookmarkEntry>,
) -> Result<ShelfEntry, String> {
    let _guard = state.0.lock().map_err(|_| "书架写入锁已损坏".to_string())?;
    let mut entries = load_index(&app)?;
    let e = entries
        .iter_mut()
        .find(|e| e.id == book_id)
        .ok_or_else(|| "书架中没有这本书".to_string())?;
    e.bookmarks = Some(bookmarks);
    let entry = e.clone();
    save_index(&app, &entries)?;
    Ok(entry)
}

#[tauri::command]
fn shelf_delete_book(
    app: AppHandle,
    state: State<'_, ShelfWriteState>,
    book_id: String,
) -> Result<(), String> {
    let _guard = state.0.lock().map_err(|_| "书架写入锁已损坏".to_string())?;
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

// ---- 用户自定义字体 ----
// 字体文件存应用数据目录：<app_data>/fonts/<id>，索引 <app_data>/fonts.json。

#[derive(Default)]
struct FontWriteState(Mutex<()>);

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FontEntry {
    id: String,
    file_name: String,
    family: String,
    size: u64,
    added_at_ms: u64,
}

fn fonts_root(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(shelf_root(app)?.join("fonts"))
}

fn fonts_index_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(shelf_root(app)?.join("fonts.json"))
}

fn load_fonts(app: &AppHandle) -> Result<Vec<FontEntry>, String> {
    let p = fonts_index_path(app)?;
    match fs::read_to_string(&p) {
        Ok(text) => serde_json::from_str(&text).map_err(|e| format!("字体索引损坏：{e}")),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Vec::new()),
        Err(e) => Err(format!("无法读取字体索引：{e}")),
    }
}

fn save_fonts(app: &AppHandle, entries: &[FontEntry]) -> Result<(), String> {
    let p = fonts_index_path(app)?;
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("无法创建字体目录：{e}"))?;
    }
    let text =
        serde_json::to_string_pretty(entries).map_err(|e| format!("序列化字体索引失败：{e}"))?;
    let tmp = p.with_extension("json.tmp");
    fs::write(&tmp, text).map_err(|e| format!("无法写入字体索引：{e}"))?;
    fs::rename(&tmp, &p).map_err(|e| format!("无法更新字体索引：{e}"))
}

fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let hi = (bytes[i + 1] as char).to_digit(16);
            let lo = (bytes[i + 2] as char).to_digit(16);
            if let (Some(h), Some(l)) = (hi, lo) {
                out.push((h * 16 + l) as u8);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// HTML 文件选择器上传字体：raw body + 头部元数据。
#[tauri::command]
fn fonts_import_raw(
    app: AppHandle,
    state: State<'_, FontWriteState>,
    request: tauri::ipc::Request<'_>,
) -> Result<FontEntry, String> {
    let id = request
        .headers()
        .get("x-font-id")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();
    if !valid_content_hash(&id) {
        return Err("无效的字体指纹".into());
    }
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("字体保存请求必须使用原始二进制".into());
    };
    if bytes.is_empty() {
        return Err("字体内容为空".into());
    }
    let file_name = request
        .headers()
        .get("x-font-name")
        .and_then(|v| v.to_str().ok())
        .map(percent_decode)
        .unwrap_or_else(|| "font.ttf".into());
    let family = request
        .headers()
        .get("x-font-family")
        .and_then(|v| v.to_str().ok())
        .map(percent_decode)
        .unwrap_or_else(|| file_name.clone());
    let dir = fonts_root(&app)?;
    fs::create_dir_all(&dir).map_err(|e| format!("无法创建字体目录：{e}"))?;
    let file_path = dir.join(&id);
    fs::write(&file_path, &bytes).map_err(|e| format!("无法保存字体文件：{e}"))?;

    let _guard = state.0.lock().map_err(|_| "字体写入锁已损坏".to_string())?;
    let mut entries = load_fonts(&app)?;
    entries.retain(|e| e.id != id);
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    let entry = FontEntry {
        id,
        file_name,
        family,
        size: bytes.len() as u64,
        added_at_ms: now,
    };
    entries.push(entry.clone());
    save_fonts(&app, &entries)?;
    Ok(entry)
}

#[tauri::command]
fn fonts_list(app: AppHandle) -> Result<Vec<FontEntry>, String> {
    load_fonts(&app)
}

#[tauri::command]
fn fonts_read(app: AppHandle, font_id: String) -> Result<tauri::ipc::Response, String> {
    if !valid_content_hash(&font_id) {
        return Err("无效的字体指纹".into());
    }
    let p = fonts_root(&app)?.join(&font_id);
    fs::read(&p)
        .map(tauri::ipc::Response::new)
        .map_err(|e| format!("无法读取字体：{e}"))
}

#[tauri::command]
fn fonts_delete(
    app: AppHandle,
    state: State<'_, FontWriteState>,
    font_id: String,
) -> Result<(), String> {
    if !valid_content_hash(&font_id) {
        return Err("无效的字体指纹".into());
    }
    let _guard = state.0.lock().map_err(|_| "字体写入锁已损坏".to_string())?;
    let p = fonts_root(&app)?.join(&font_id);
    if p.exists() {
        fs::remove_file(&p).map_err(|e| format!("无法删除字体文件：{e}"))?;
    }
    let mut entries = load_fonts(&app)?;
    let before = entries.len();
    entries.retain(|e| e.id != font_id);
    if entries.len() == before {
        return Err("字体不存在".into());
    }
    save_fonts(&app, &entries)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn legacy_shelf_entry_without_content_hash_keeps_progress() {
        let json = r#"{
          "id":"a1b2c3d4",
          "title":"旧书",
          "creator":"作者",
          "fileName":"old.epub",
          "fileSize":123,
          "coverMime":"image/jpeg",
          "addedAtMs":10,
          "lastReadAtMs":20,
          "spineIndex":3,
          "page":7,
          "progressPct":42,
          "anchorIndex":99,
          "anchorRatio":0.5,
          "isNew":false
        }"#;
        let entry: ShelfEntry = serde_json::from_str(json).expect("legacy entry should load");
        assert_eq!(entry.content_hash, None);
        assert_eq!(entry.spine_index, 3);
        assert_eq!(entry.page, 7);
        assert_eq!(entry.progress_pct, 42);
        assert_eq!(entry.anchor_index, Some(99));
        assert_eq!(entry.anchor_ratio, Some(0.5));
        assert!(!entry.is_new);
    }

    #[test]
    fn content_hash_requires_full_sha256_hex() {
        assert!(valid_content_hash(&"a".repeat(64)));
        assert!(valid_content_hash(&"A".repeat(64)));
        assert!(!valid_content_hash(&"a".repeat(63)));
        assert!(!valid_content_hash(&"g".repeat(64)));
    }
}
