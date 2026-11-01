use std::{
    path::{Path, PathBuf},
    sync::{Condvar, Mutex},
    time::{Duration, Instant},
};

use notify_debouncer_mini::{Debouncer, notify::RecommendedWatcher};
use serde::Serialize;
use tauri::{
    AppHandle, Manager, State, Url, Wry,
    menu::{CheckMenuItem, MenuItem},
};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

mod bench;
#[cfg(target_os = "macos")]
mod cli;
mod doc;
mod editor;
mod export;
mod folder;
mod grants;
mod i18n;
mod menu;
mod open;
mod watch;
mod wikilinks;

use doc::{MAX_DOC_BYTES, too_big};
use export::write_picked;
use grants::{attach_grants_file, grant, grant_folder, granted, granted_folder};
use menu::build_menu;
use open::{first_markdown_arg, mark_ready, request_open};

const REPO_URL: &str = "https://github.com/moraliasp/leve";

#[derive(Serialize)]
struct AppInfo {
    name: &'static str,
    version: &'static str,
    repo: &'static str,
    /// Instalado pelo Flatpak: quem atualiza é o `flatpak update`, não o atualizador do app.
    flatpak: bool,
}

/// Dados da tela Sobre (versão e repositório): um lugar só, o do Cargo.toml. Os textos do Sobre
/// (privacidade, licença, créditos) ficam no dicionário do frontend (`src/i18n.ts`).
#[tauri::command]
fn app_info() -> AppInfo {
    AppInfo {
        name: "Leve",
        version: env!("CARGO_PKG_VERSION"),
        repo: REPO_URL,
        flatpak: is_flatpak(),
    }
}

/// Dentro do sandbox do Flatpak existe `/.flatpak-info` (criado pelo `flatpak run`). Lá o pacote é
/// do Flatpak: o atualizador do app não registra e a interface esconde a checagem diária.
fn is_flatpak() -> bool {
    flatpak_marker(Path::new("/.flatpak-info"))
}

fn flatpak_marker(info: &Path) -> bool {
    info.is_file()
}

/// Idioma escolhido no frontend (Preferências ou o do sistema): mensagens e menu passam a ele.
/// O frontend chama no início, antes de sincronizar os itens de marcar do menu.
#[tauri::command]
fn set_locale(app: AppHandle, lang: String) -> Result<(), String> {
    let lang = i18n::parse(&lang);
    if lang == i18n::current() && app.menu().is_some() {
        return Ok(());
    }
    i18n::set(lang);
    build_menu(&app).map_err(|e| e.to_string())
}

/// `{nome}` → valor, para as mensagens de `i18n::Strings`.
fn fill(template: &str, vars: &[(&str, &str)]) -> String {
    vars.iter().fold(template.to_owned(), |acc, (k, v)| {
        acc.replace(&format!("{{{k}}}"), v)
    })
}

#[derive(Default)]
struct AppState {
    /// Arquivo pedido pelo SO (duplo-clique / argv) antes do frontend estar pronto.
    pending_open: Mutex<Option<String>>,
    /// Instante do `RunEvent::Ready`; `launch_open` espera a abertura assentar a partir dele.
    ready_at: Mutex<Option<Instant>>,
    /// Acorda `launch_open` quando chega o `Ready` ou um arquivo (`request_open`).
    launch_cv: Condvar,
    watcher: Mutex<Option<Debouncer<RecommendedWatcher>>>,
    /// Arquivo e espera do vigia atual: `watch_file` só o recria quando um dos dois muda.
    watched: Mutex<Option<(PathBuf, Duration)>>,
    /// Itens de marcar do menu Exibir; quem guarda o estado é o frontend (`sync_menu`).
    menu_checks: Mutex<Vec<CheckMenuItem<Wry>>>,
    /// Arquivo › Salvar…: habilitado só com o documento colado ativo (`sync_menu`).
    save_item: Mutex<Option<MenuItem<Wry>>>,
    /// Arquivos que o app pode ler: só os que chegaram por diálogo, SO, drop ou link de um
    /// documento já aberto. O frontend não concede nada; só pede. Persistido em `grants_file`
    /// para os "Recentes" continuarem abrindo.
    granted: Mutex<Vec<PathBuf>>,
    /// Pastas abertas por Arquivo › Abrir pasta… (`pick_folder`): dão direito a listar os Markdown
    /// de dentro e a conceder um deles por vez (`open_in_folder`). Vão no mesmo `grants_file`.
    folders: Mutex<Vec<PathBuf>>,
    grants_file: Mutex<Option<PathBuf>>,
    /// `install_cli`: liberação de uso único para o modo administrador, dada só quando uma chamada
    /// sem senha nesta execução devolveu `needs-admin` (o frontend então confirmou com o leitor).
    #[cfg(target_os = "macos")]
    cli_admin_permit: std::sync::atomic::AtomicBool,
}

fn ext_lower(p: &Path) -> String {
    p.extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .unwrap_or_default()
}

/// Diálogo nativo de abrir: a escolha é concedida aqui, no Rust, e devolvida ao frontend.
#[tauri::command]
async fn pick_markdown(app: AppHandle) -> Result<Option<String>, String> {
    let dialog = app
        .dialog()
        .file()
        .add_filter("Markdown", &["md", "markdown", "mdown", "mkd"]);
    let picked = tauri::async_runtime::spawn_blocking(move || dialog.blocking_pick_file())
        .await
        .map_err(|e| e.to_string())?;
    let Some(p) = picked else {
        return Ok(None);
    };
    let path = p.into_path().map_err(|e| e.to_string())?;
    let c = grant(&app.state::<AppState>(), &path)?;
    Ok(Some(c.to_string_lossy().into_owned()))
}

/// Texto do clipboard → documento colado. Vazio, só espaço e não-texto (o `arboard` devolve erro)
/// viram `None`, o aviso curto do frontend; acima de `MAX_DOC_BYTES` é recusado como arquivo
/// grande demais, o mesmo limite de `read_text_file`.
fn clipboard_text(read: Result<String, String>) -> Result<Option<String>, String> {
    let Ok(text) = read else {
        return Ok(None);
    };
    if text.trim().is_empty() {
        return Ok(None);
    }
    if text.len() as u64 > MAX_DOC_BYTES {
        return Err(too_big(text.len() as u64));
    }
    Ok(Some(text))
}

/// Arquivo › Abrir da área de transferência: o texto é lido aqui (`arboard`, só texto), só quando
/// o leitor pede. Não há plugin de clipboard: o frontend não tem comando nem permissão para ler.
#[tauri::command]
fn read_clipboard() -> Result<Option<String>, String> {
    clipboard_text(
        arboard::Clipboard::new()
            .and_then(|mut c| c.get_text())
            .map_err(|e| e.to_string()),
    )
}

/// Salvar o documento colado: diálogo nativo de salvar aberto AQUI, sugerindo `Sem título.md` em
/// Documentos, escrita só no caminho escolhido nele (`write_picked`, que não sobrescreve o que o
/// diálogo não confirmou) e esse caminho concedido, como o de `pick_markdown`. O frontend manda
/// só o texto, nunca o destino. `None` = cancelado.
#[tauri::command]
async fn save_markdown(app: AppHandle, text: String) -> Result<Option<String>, String> {
    let mut dialog = app
        .dialog()
        .file()
        .add_filter("Markdown", &["md"])
        .set_file_name(i18n::s().untitled_file);
    if let Ok(docs) = app.path().document_dir() {
        dialog = dialog.set_directory(docs);
    }
    let saved = tauri::async_runtime::spawn_blocking(move || {
        let Some(picked) = dialog.blocking_save_file() else {
            return Ok(None);
        };
        let picked = picked.into_path().map_err(|e| e.to_string())?;
        write_picked(picked, &text, MD_EXTS, i18n::s().save_exists).map(Some)
    })
    .await
    .map_err(|e| e.to_string())??;
    let Some(path) = saved else {
        return Ok(None);
    };
    let c = grant(&app.state::<AppState>(), &path)?;
    Ok(Some(c.to_string_lossy().into_owned()))
}

/// Diálogo nativo de pasta (Arquivo › Abrir pasta…): a escolha vira concessão de pasta aqui.
#[tauri::command]
async fn pick_folder(app: AppHandle) -> Result<Option<String>, String> {
    let dialog = app.dialog().file();
    let picked = tauri::async_runtime::spawn_blocking(move || dialog.blocking_pick_folder())
        .await
        .map_err(|e| e.to_string())?;
    let Some(p) = picked else {
        return Ok(None);
    };
    let path = p.into_path().map_err(|e| e.to_string())?;
    let c = grant_folder(&app.state::<AppState>(), &path)?;
    Ok(Some(c.to_string_lossy().into_owned()))
}

#[derive(Serialize)]
struct FolderList {
    root: String,
    name: String,
    #[serde(flatten)]
    listing: folder::Listing,
}

/// Markdown de uma pasta concedida, relativos à raiz (limites em `folder.rs`). Assíncrono: a
/// listagem lê o disco e uma pasta grande ou em rede não pode travar a janela.
#[tauri::command]
async fn list_folder(state: State<'_, AppState>, root: String) -> Result<FolderList, String> {
    let r = granted_folder(&state, &root)?;
    let listing = tauri::async_runtime::spawn_blocking(move || folder::list_markdown(&r))
        .await
        .map_err(|e| e.to_string())??;
    Ok(FolderList {
        root: listing.root.to_string_lossy().into_owned(),
        name: listing
            .root
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| listing.root.to_string_lossy().into_owned()),
        listing,
    })
}

/// Extensões que podem ser abertas no app padrão a partir de um link do documento.
/// Qualquer outra (executáveis, scripts, desconhecidas) só é revelada na pasta.
const OPENABLE_EXT: &[&str] = &[
    "pdf", "png", "jpg", "jpeg", "gif", "svg", "webp", "txt", "csv", "json", "yaml", "yml", "toml",
    "xml", "docx", "xlsx", "pptx", "odt", "ods", "odp", "mp3", "mp4", "mov", "wav",
];

#[tauri::command]
fn open_external(app: AppHandle, state: State<AppState>, target: String) -> Result<(), String> {
    let opener = app.opener();
    if target.starts_with("http://")
        || target.starts_with("https://")
        || target.starts_with("mailto:")
    {
        return opener
            .open_url(target, None::<&str>)
            .map_err(|e| e.to_string());
    }
    let path = granted(&state, &target)?;
    let ext = ext_lower(&path);
    if path.is_file() && OPENABLE_EXT.contains(&ext.as_str()) {
        opener
            .open_path(path.to_string_lossy(), None::<&str>)
            .map_err(|e| e.to_string())
    } else {
        opener.reveal_item_in_dir(&path).map_err(|e| e.to_string())
    }
}

#[tauri::command]
fn reveal_in_folder(app: AppHandle, state: State<AppState>, path: String) -> Result<(), String> {
    let p = granted(&state, &path)?;
    app.opener()
        .reveal_item_in_dir(p)
        .map_err(|e| e.to_string())
}

/// Extensões Markdown aceitas; a primeira é a que Salvar acrescenta.
const MD_EXTS: &[&str] = &["md", "markdown", "mdown", "mkd"];

fn is_markdown(p: &Path) -> bool {
    MD_EXTS.contains(&ext_lower(p).as_str())
}

/// Só a própria página do app pode ser mostrada na janela: um `.md` não navega o WebView para fora
/// (formulário, `<area>`, URL arrastada). Link externo sai pelo navegador via `open_external`.
/// `tauri://localhost` no macOS/Linux, `http://tauri.localhost` no Windows e o Vite em dev.
fn navigation_allowed(url: &Url) -> bool {
    let host = url.host_str();
    match url.scheme() {
        "about" => true,
        "tauri" => host == Some("localhost"),
        "http" if host == Some("tauri.localhost") => url.port().is_none(),
        // Vite em dev: a porta vem de `devUrl`/`TAURI_DEV_HOST`, por isso qualquer porta.
        "http" if cfg!(debug_assertions) && host == Some("localhost") => true,
        _ => false,
    }
}

/// O que pode ir para um editor: só arquivo Markdown (mesma regra de extensão do argv). Um alvo de
/// link concedido como `./run.command` não passa: com "Aplicativo padrão" o LaunchServices o
/// executaria, contornando `OPENABLE_EXT`.
fn editor_target(doc: &Path) -> Result<PathBuf, String> {
    let shown = doc.display().to_string();
    if !is_markdown(doc) {
        return Err(fill(i18n::s().editor_not_markdown, &[("path", &shown)]));
    }
    if !doc.is_file() {
        return Err(fill(i18n::s().not_found, &[("path", &shown)]));
    }
    Ok(doc.to_path_buf())
}

/// Lista de "Abrir no editor" com o que está instalado (Preferências › Editor).
#[tauri::command]
async fn list_editors(app: AppHandle) -> Result<Vec<editor::EditorInfo>, String> {
    let id = app.config().identifier.clone();
    tauri::async_runtime::spawn_blocking(move || editor::list(&id))
        .await
        .map_err(|e| e.to_string())
}

/// Arquivo › Abrir no editor: `editor` é um id da lista fechada (`editor::Editor`) e `path` o
/// documento ativo, que tem de estar concedido. O comando é montado aqui.
#[tauri::command]
async fn open_in_editor(
    app: AppHandle,
    state: State<'_, AppState>,
    editor: String,
    path: String,
) -> Result<(), String> {
    let s = i18n::s();
    let e =
        editor::Editor::parse(&editor).ok_or_else(|| fill(s.editor_unknown, &[("id", &editor)]))?;
    let doc = editor_target(&granted(&state, &path)?)?;
    let self_id = app.config().identifier.clone();
    let found = tauri::async_runtime::spawn_blocking(move || editor::detect(e, &self_id))
        .await
        .map_err(|e| e.to_string())?;
    let Some(found) = found else {
        return Err(if e == editor::Editor::System {
            s.editor_self_default.to_owned()
        } else {
            fill(s.editor_not_found, &[("name", e.name())])
        });
    };
    match editor::launch_for(&found, &doc) {
        editor::Launch::Default(p) => app
            .opener()
            .open_path(p.to_string_lossy(), None::<&str>)
            .map_err(|e| e.to_string()),
        launch => tauri::async_runtime::spawn_blocking(move || editor::run(launch))
            .await
            .map_err(|e| e.to_string())?
            .map_err(|err| fill(s.editor_failed, &[("name", e.name()), ("error", &err)])),
    }
}

/// Leve › Instalar comando 'leve' no terminal… (só macOS; ver `cli.rs`). Sem `admin`, instala onde
/// não precisa de senha ou devolve `needs-admin`; com `admin` (o leitor confirmou), pede a senha
/// pelo diálogo do sistema.
#[tauri::command]
async fn install_cli(app: AppHandle, admin: bool) -> Result<serde_json::Value, String> {
    #[cfg(target_os = "macos")]
    {
        let state = app.state::<AppState>();
        cli::take_admin_permit(&state.cli_admin_permit, admin)?;
        let id = app.config().identifier.clone();
        let out = tauri::async_runtime::spawn_blocking(move || cli::install(admin, &id))
            .await
            .map_err(|e| e.to_string())??;
        cli::grant_admin_permit(&state.cli_admin_permit, &out);
        serde_json::to_value(out).map_err(|e| e.to_string())
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, admin);
        Err(i18n::s().cli_unsupported.to_owned())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();
    if bench::bench_started().is_some() {
        builder = builder.plugin(
            tauri::plugin::Builder::<Wry>::new("bench")
                .js_init_script("window.__LEVE_BENCH__ = true;")
                .build(),
        );
    }
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            if let Some(p) = first_markdown_arg(&argv, Path::new(&cwd)) {
                request_open(app, p);
            } else if let Some(w) = app.get_webview_window("main") {
                let _ = w.set_focus();
            }
        }));
    }
    if !is_flatpak() {
        builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    }
    builder
        .plugin(
            tauri::plugin::Builder::<Wry>::new("navegacao")
                .on_navigation(|_, url| navigation_allowed(url))
                .build(),
        )
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            doc::read_markdown,
            watch::watch_file,
            open::launch_open,
            grants::resolve_path,
            pick_markdown,
            read_clipboard,
            save_markdown,
            pick_folder,
            list_folder,
            grants::open_in_folder,
            grants::allow_assets,
            export::export_images,
            export::save_html,
            menu::sync_menu,
            wikilinks::resolve_wikilinks,
            open_external,
            reveal_in_folder,
            app_info,
            grants::paths_exist,
            grants::forget_grants,
            set_locale,
            list_editors,
            open_in_editor,
            install_cli,
            bench::bench_report
        ])
        .setup(|app| {
            i18n::set(i18n::system());
            build_menu(app.handle())?;
            app.on_menu_event(|app, event| menu::on_menu(app, event.id().0.clone()));
            // Concessões persistidas (Recentes): só arquivos que ainda existem. No macOS o
            // duplo-clique (RunEvent::Opened) pode chegar antes deste setup e já ter concedido
            // o arquivo em memória: juntar, nunca sobrescrever.
            let state = app.state::<AppState>();
            if let Ok(dir) = app.path().app_local_data_dir() {
                attach_grants_file(&state, dir.join("grants.json"));
            }
            // Windows/Linux: arquivo chega por argv na primeira instância.
            let argv: Vec<String> = std::env::args().collect();
            let cwd = std::env::current_dir().unwrap_or_default();
            if let Some(p) = first_markdown_arg(&argv, &cwd)
                && let Ok(c) = grant(&state, &p)
            {
                *state.pending_open.lock().unwrap() = Some(c.to_string_lossy().into_owned());
            }
            // Drop na janela: o SO entrega os caminhos aqui antes do evento chegar ao JS.
            if let Some(w) = app.get_webview_window("main") {
                let h = app.handle().clone();
                w.on_window_event(move |ev| {
                    if let tauri::WindowEvent::DragDrop(tauri::DragDropEvent::Drop {
                        paths, ..
                    }) = ev
                    {
                        for p in paths.iter().filter(|p| is_markdown(p)) {
                            let _ = grant(&h.state::<AppState>(), p);
                        }
                    }
                });
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("erro ao iniciar o Leve")
        .run(|app, event| match event {
            tauri::RunEvent::Ready => mark_ready(&app.state::<AppState>()),
            // macOS: duplo-clique / "Abrir com" chega como evento Opened.
            #[cfg(target_os = "macos")]
            tauri::RunEvent::Opened { urls } => {
                for url in urls {
                    if let Ok(p) = url.to_file_path() {
                        request_open(app, p);
                    }
                }
            }
            _ => {}
        });
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn clipboard_vazio_ou_nao_texto_vira_none() {
        assert_eq!(clipboard_text(Err("sem texto".into())), Ok(None));
        assert_eq!(clipboard_text(Ok(String::new())), Ok(None));
        assert_eq!(clipboard_text(Ok(" \n\t ".into())), Ok(None));
        assert_eq!(
            clipboard_text(Ok("# Oi\n".into())),
            Ok(Some("# Oi\n".into()))
        );
        let big = "a".repeat(MAX_DOC_BYTES as usize + 1);
        assert!(clipboard_text(Ok(big)).unwrap_err().contains("20"));
    }

    #[test]
    fn flatpak_so_com_o_arquivo_do_sandbox() {
        let dir = std::env::temp_dir().join(format!("leve-flatpak-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let info = dir.join(".flatpak-info");
        assert!(!flatpak_marker(&info));
        fs::write(&info, "[Application]\nname=br.com.moralia.leve\n").unwrap();
        assert!(flatpak_marker(&info));
        // Pasta com o mesmo nome não conta.
        assert!(!flatpak_marker(&dir));
        fs::remove_dir_all(&dir).unwrap();
    }

    /// Pasta temporária única por teste, removida ao sair de escopo.
    struct TempDir(PathBuf);
    impl TempDir {
        fn new(tag: &str) -> Self {
            let p = std::env::temp_dir().join(format!("leve-test-{tag}-{}", std::process::id()));
            let _ = fs::remove_dir_all(&p);
            fs::create_dir_all(&p).unwrap();
            Self(p)
        }
        fn file(&self, rel: &str, content: &str) -> PathBuf {
            let p = self.0.join(rel);
            fs::create_dir_all(p.parent().unwrap()).unwrap();
            fs::write(&p, content).unwrap();
            p
        }
    }
    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn navegacao_so_para_a_propria_pagina() {
        let u = |s: &str| Url::parse(s).unwrap();
        assert!(navigation_allowed(&u("tauri://localhost/index.html")));
        assert!(navigation_allowed(&u("http://tauri.localhost/")));
        assert!(navigation_allowed(&u("about:blank")));
        // cargo test compila em debug: o ramo do Vite tem de aceitar qualquer porta de localhost.
        const { assert!(cfg!(debug_assertions)) };
        assert!(navigation_allowed(&u("http://localhost:1420/")));
        assert!(navigation_allowed(&u("http://localhost:5173/x")));
        for fora in [
            "https://example.com/phish",
            "http://example.com/",
            "file:///etc/passwd",
            "http://tauri.localhost.evil.com/",
            "http://tauri.localhost:8080/",
            "http://tauri.localhost@evil.com/",
            "tauri://evil.example/",
            "https://localhost:1420/",
            "javascript:alert(1)",
        ] {
            assert!(!navigation_allowed(&u(fora)), "{fora}");
        }
    }

    #[test]
    fn is_markdown_aceita_extensoes_sem_distinguir_caixa() {
        for ok in [
            "a.md",
            "a.MD",
            "b.markdown",
            "c.mdown",
            "d.mkd",
            "/x/y/z.Md",
        ] {
            assert!(is_markdown(Path::new(ok)), "{ok}");
        }
        for nao in ["a.txt", "a.md.bak", "md", "a", "a.mdx"] {
            assert!(!is_markdown(Path::new(nao)), "{nao}");
        }
    }

    #[test]
    fn abrir_no_editor_so_aceita_markdown() {
        let t = TempDir::new("editor-alvo");
        let md = t.file("doc.md", "# oi");
        let cmd = t.file("run.command", "#!/bin/sh\necho pwned\n");
        let app = t.file("x.app", "");
        assert_eq!(editor_target(&md).unwrap(), md);
        for bad in [&cmd, &app] {
            let err = editor_target(bad).unwrap_err();
            assert!(err.contains(&bad.display().to_string()), "{err}");
        }
        // Pasta com nome de .md também não vai.
        let dir = t.0.join("pasta.md");
        fs::create_dir_all(&dir).unwrap();
        assert!(editor_target(&dir).is_err());
    }
}
