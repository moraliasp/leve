use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::{Condvar, Mutex, OnceLock},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use base64::{Engine, engine::general_purpose::STANDARD as BASE64};
use notify_debouncer_mini::{
    DebouncedEvent, Debouncer, new_debouncer,
    notify::{RecommendedWatcher, RecursiveMode},
};
use serde::{Deserialize, Serialize};
use tauri::{
    AppHandle, Emitter, Manager, State, Url, Wry,
    menu::{
        CheckMenuItem, CheckMenuItemBuilder, MenuBuilder, MenuItem, MenuItemBuilder, SubmenuBuilder,
    },
};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

#[cfg(target_os = "macos")]
mod cli;
mod editor;
mod i18n;

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

/// Gancho de benchmark (`scripts/bench.mjs`, método em `docs/benchmark.md`). Só existe com
/// `LEVE_BENCH=1` no ambiente: aí `run()` guarda o instante de partida, o plugin `bench` marca a
/// página (`window.__LEVE_BENCH__`) e o frontend chama `bench_report` ao fim do layout e no
/// primeiro quadro de cada documento (`src/bench.ts`). Desligado, o frontend não chama nada e o
/// comando recusa. Só escreve no stdout.
static BENCH: OnceLock<Option<Instant>> = OnceLock::new();

fn bench_started() -> Option<Instant> {
    *BENCH.get_or_init(|| bench_flag(std::env::var_os("LEVE_BENCH").as_deref()).then(Instant::now))
}

/// Só o valor exato `1` arma o gancho: `0`, vazio ou outro valor não.
fn bench_flag(v: Option<&std::ffi::OsStr>) -> bool {
    v.is_some_and(|v| v == "1")
}

#[derive(Deserialize, Serialize)]
struct BenchMeasure {
    name: String,
    ms: f64,
    end: f64,
}

/// Linha do stdout que o `bench.mjs` lê: prefixo fixo e JSON numa linha só.
fn bench_line(
    doc: &str,
    phase: &str,
    run_ms: f64,
    epoch_ms: u128,
    page_ms: f64,
    measures: &[BenchMeasure],
) -> String {
    let json = serde_json::json!({
        "doc": doc,
        "phase": phase,
        "runMs": run_ms,
        "epochMs": epoch_ms as u64,
        "pageMs": page_ms,
        "measures": measures,
    });
    format!("LEVE_BENCH {json}")
}

#[tauri::command]
fn bench_report(
    doc: String,
    phase: String,
    page_ms: f64,
    measures: Vec<BenchMeasure>,
) -> Result<(), String> {
    let started = bench_started().ok_or("LEVE_BENCH desligado")?;
    let epoch_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let run_ms = started.elapsed().as_secs_f64() * 1000.0;
    println!(
        "{}",
        bench_line(&doc, &phase, run_ms, epoch_ms, page_ms, &measures)
    );
    Ok(())
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
    /// Itens de rádio do menu Exibir (largura e fonte); o frontend sincroniza o estado salvo.
    view_checks: Mutex<Vec<CheckMenuItem<Wry>>>,
    /// Exibir › Carregar imagens remotas (liga/desliga); a preferência vive no frontend.
    remote_check: Mutex<Option<CheckMenuItem<Wry>>>,
    /// Exibir › Mostrar conteúdo oculto (liga/desliga); a preferência vive no frontend.
    hidden_check: Mutex<Option<CheckMenuItem<Wry>>>,
    /// Arquivo › Salvar…: habilitado só com o documento colado ativo (`sync_save_menu`).
    save_item: Mutex<Option<MenuItem<Wry>>>,
    /// Arquivos que o app pode ler: só os que chegaram por diálogo, SO, drop ou link de um
    /// documento já aberto. O frontend não concede nada; só pede. Persistido em `grants_file`
    /// para os "Recentes" continuarem abrindo.
    granted: Mutex<Vec<PathBuf>>,
    grants_file: Mutex<Option<PathBuf>>,
    /// `install_cli`: liberação de uso único para o modo administrador, dada só quando uma chamada
    /// sem senha nesta execução devolveu `needs-admin` (o frontend então confirmou com o leitor).
    #[cfg(target_os = "macos")]
    cli_admin_permit: std::sync::atomic::AtomicBool,
}

const GRANTS_MAX: usize = 200;

fn deny(path: &Path) -> String {
    fill(i18n::s().denied, &[("path", &path.display().to_string())])
}

fn persist_grants(file: &Path, granted: &[PathBuf]) {
    if let Some(dir) = file.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    let list: Vec<String> = granted
        .iter()
        .map(|p| p.to_string_lossy().into_owned())
        .collect();
    if let Ok(json) = serde_json::to_string(&list) {
        let _ = std::fs::write(file, json);
    }
}

fn load_grants(file: &Path) -> Vec<PathBuf> {
    let Ok(json) = std::fs::read_to_string(file) else {
        return Vec::new();
    };
    serde_json::from_str::<Vec<String>>(&json)
        .unwrap_or_default()
        .into_iter()
        .map(PathBuf::from)
        .filter(|p| p.is_file())
        .collect()
}

/// Liga a lista em memória ao arquivo em disco: carrega o que estava salvo, mantém o que já
/// foi concedido nesta execução (por último, como mais recente) e grava o resultado.
fn attach_grants_file(state: &AppState, file: PathBuf) {
    let mut g = state.granted.lock().unwrap();
    let mut merged = load_grants(&file);
    merged.retain(|p| !g.contains(p));
    merged.extend(g.drain(..));
    if merged.len() > GRANTS_MAX {
        let excess = merged.len() - GRANTS_MAX;
        merged.drain(..excess);
    }
    *g = merged;
    persist_grants(&file, &g);
    *state.grants_file.lock().unwrap() = Some(file);
}

/// Concede leitura a um arquivo existente (forma canônica) e persiste. Último concedido vai ao fim.
fn grant(state: &AppState, path: &Path) -> Result<PathBuf, String> {
    let c = canonical(&path.to_string_lossy())?;
    let mut g = state.granted.lock().unwrap();
    g.retain(|p| p != &c);
    g.push(c.clone());
    if g.len() > GRANTS_MAX {
        let excess = g.len() - GRANTS_MAX;
        g.drain(..excess);
    }
    if let Some(f) = state.grants_file.lock().unwrap().as_deref() {
        persist_grants(f, &g);
    }
    Ok(c)
}

/// Caminho canônico se já concedido; erro legível se não.
fn granted(state: &AppState, path: &str) -> Result<PathBuf, String> {
    file_in_grants(&state.granted.lock().unwrap(), path)
}

/// Miolo de `granted`, sem `State`: `path` (forma canônica) está na lista?
fn file_in_grants(grants: &[PathBuf], path: &str) -> Result<PathBuf, String> {
    let c = canonical(path)?;
    if grants.contains(&c) {
        Ok(c)
    } else {
        Err(deny(&c))
    }
}

/// Pasta de algum documento concedido: origem legítima para resolver links e imagens relativos.
fn granted_dir(state: &AppState, dir: &str) -> Result<PathBuf, String> {
    dir_in_grants(&state.granted.lock().unwrap(), dir)
}

/// Miolo de `granted_dir`, sem `State`: `dir` é a pasta de algum arquivo da lista?
fn dir_in_grants(grants: &[PathBuf], dir: &str) -> Result<PathBuf, String> {
    let d = canonical(dir)?;
    let ok = grants.iter().any(|p| p.parent() == Some(d.as_path()));
    if ok { Ok(d) } else { Err(deny(&d)) }
}

/// Esvazia a lista de concessões, menos `keep` (as abas abertas agora), e grava. Devolve
/// quantos caminhos saíram.
fn forget_grants_except(state: &AppState, keep: &[PathBuf]) -> usize {
    let mut g = state.granted.lock().unwrap();
    let before = g.len();
    g.retain(|p| keep.contains(p));
    if let Some(f) = state.grants_file.lock().unwrap().as_deref() {
        persist_grants(f, &g);
    }
    before - g.len()
}

/// Preferências › "Esquecer arquivos autorizados": o frontend manda as abas abertas, que
/// continuam concedidas (senão a aba ativa falharia na próxima leitura); todo o resto sai da
/// lista em memória e de `grants.json`. Os Recentes do frontend são apagados por ele.
#[tauri::command]
fn forget_grants(state: State<AppState>, keep: Vec<String>) -> usize {
    let keep: Vec<PathBuf> = keep.iter().filter_map(|p| canonical(p).ok()).collect();
    forget_grants_except(&state, &keep)
}

/// Extensões que `allow_assets` libera no asset protocol (só o que um `<img>` mostra).
const IMAGE_EXT: &[&str] = &[
    "png", "jpg", "jpeg", "gif", "svg", "webp", "avif", "bmp", "ico",
];

fn ext_lower(p: &Path) -> String {
    p.extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .unwrap_or_default()
}

/// Caminho que um documento pede tem de ser relativo à pasta dele. Absoluto (`/etc/x`, `C:\\x`) ou
/// UNC (`\\\\servidor\\pasta`) é recusado: `Path::join` trocaria a pasta inteira pelo pedido, e no
/// Windows só resolver um UNC já abre conexão SMB com o servidor do documento. `..` continua valendo
/// (`../img/a.png` é comum), porque o alvo ainda passa por `canonical` e pela lista de concessões.
fn relative_only(rel: &str) -> Result<&Path, String> {
    let p = Path::new(rel);
    // `C:x` (relativo ao cwd do drive) também troca a base no `join` do Windows; `has_root` não o vê.
    let drive =
        rel.len() >= 2 && rel.as_bytes()[1] == b':' && rel.as_bytes()[0].is_ascii_alphabetic();
    if p.has_root() || drive || rel.starts_with('/') || rel.starts_with('\\') {
        return Err(fill(i18n::s().absolute, &[("path", rel)]));
    }
    Ok(p)
}

/// Imagem relativa a uma pasta concedida: existe, é arquivo e tem extensão de imagem.
fn asset_candidate(dir: &Path, rel: &str) -> Option<PathBuf> {
    let rel = relative_only(rel).ok()?;
    let p = canonical(&dir.join(rel).to_string_lossy()).ok()?;
    (p.is_file() && IMAGE_EXT.contains(&ext_lower(&p).as_str())).then_some(p)
}

/// Marca, no grupo do item (`width-*` ou `font-*`), só o item com esse id.
fn check_view_item(state: &AppState, id: &str) {
    let Some(prefix) = id.split('-').next() else {
        return;
    };
    for item in state.view_checks.lock().unwrap().iter() {
        let item_id = &item.id().0;
        if item_id.starts_with(prefix) {
            let _ = item.set_checked(item_id == id);
        }
    }
}

/// Frontend informa a largura e a fonte persistidas para o menu refletir.
#[tauri::command]
fn sync_view_menu(state: State<AppState>, width: String, font: String) {
    check_view_item(&state, &format!("width-{width}"));
    check_view_item(&state, &format!("font-{font}"));
}

/// Frontend informa se "Carregar imagens remotas" está ligado (no início e a cada troca).
#[tauri::command]
fn sync_remote_menu(state: State<AppState>, on: bool) {
    if let Some(item) = state.remote_check.lock().unwrap().as_ref() {
        let _ = item.set_checked(on);
    }
}

/// Frontend informa se "Mostrar conteúdo oculto" está ligado (no início e a cada troca).
#[tauri::command]
fn sync_hidden_menu(state: State<AppState>, on: bool) {
    if let Some(item) = state.hidden_check.lock().unwrap().as_ref() {
        let _ = item.set_checked(on);
    }
}

/// Frontend informa se o documento ativo é o colado (só ele tem o que salvar).
#[tauri::command]
fn sync_save_menu(state: State<AppState>, on: bool) {
    if let Some(item) = state.save_item.lock().unwrap().as_ref() {
        let _ = item.set_enabled(on);
    }
}

#[derive(Serialize)]
struct Doc {
    path: String,
    dir: String,
    name: String,
    content: String,
    /// Aviso de leitura para mostrar ao leitor (ex.: bytes inválidos substituídos), sem impedir a abertura.
    warning: Option<String>,
}

/// Acima disso o WebView leva segundos para desenhar e a memória dispara; ninguém lê isso num visualizador.
const MAX_DOC_BYTES: u64 = 20 * 1024 * 1024;

/// Bytes do arquivo → texto. BOM UTF-8 sai; UTF-16 (LE/BE com BOM, como salva o Bloco de Notas) é
/// decodificado; UTF-8 inválido abre com U+FFFD e aviso, em vez de recusar o arquivo; byte nulo sem
/// BOM de UTF-16 é binário e é recusado.
fn decode_text(bytes: &[u8]) -> Result<(String, Option<String>), String> {
    let utf16 = |be: bool| {
        let units: Vec<u16> = bytes[2..]
            .as_chunks::<2>()
            .0
            .iter()
            .map(|c| {
                if be {
                    u16::from_be_bytes(*c)
                } else {
                    u16::from_le_bytes(*c)
                }
            })
            .collect();
        String::from_utf16_lossy(&units)
    };
    match bytes {
        [0xEF, 0xBB, 0xBF, rest @ ..] => decode_utf8(rest),
        [0xFF, 0xFE, ..] => Ok((utf16(false), None)),
        [0xFE, 0xFF, ..] => Ok((utf16(true), None)),
        _ if bytes.iter().take(8192).any(|&b| b == 0) => Err(i18n::s().binary.into()),
        _ => decode_utf8(bytes),
    }
}

fn decode_utf8(bytes: &[u8]) -> Result<(String, Option<String>), String> {
    match std::str::from_utf8(bytes) {
        Ok(s) => Ok((s.to_owned(), None)),
        Err(_) => Ok((
            String::from_utf8_lossy(bytes).into_owned(),
            Some(i18n::s().not_utf8.into()),
        )),
    }
}

/// "Grande demais" para `n` bytes, com o limite (`MAX_DOC_BYTES`) em MB.
fn too_big(n: u64) -> String {
    fill(
        i18n::s().too_big,
        &[
            ("size", &format!("{:.0}", n as f64 / 1_048_576.0)),
            ("max", &(MAX_DOC_BYTES / 1_048_576).to_string()),
        ],
    )
}

/// Lê no máximo `MAX_DOC_BYTES` + 1 (o arquivo pode crescer entre o `metadata` e a leitura).
fn read_text_file(p: &Path) -> Result<(String, Option<String>), String> {
    use std::io::Read;
    let f = std::fs::File::open(p).map_err(|e| format!("{}: {e}", p.display()))?;
    let len = f.metadata().map(|m| m.len()).unwrap_or(0);
    if len > MAX_DOC_BYTES {
        return Err(too_big(len));
    }
    let mut bytes = Vec::with_capacity(len as usize);
    f.take(MAX_DOC_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| format!("{}: {e}", p.display()))?;
    if bytes.len() as u64 > MAX_DOC_BYTES {
        return Err(too_big(bytes.len() as u64));
    }
    decode_text(&bytes)
}

fn canonical(path: &str) -> Result<PathBuf, String> {
    std::fs::canonicalize(Path::new(path)).map_err(|e| format!("{path}: {e}"))
}

#[tauri::command]
fn read_markdown(state: State<AppState>, path: String) -> Result<Doc, String> {
    let p = granted(&state, &path)?;
    let (content, warning) = read_text_file(&p)?;
    let dir = p.parent().map(Path::to_path_buf).unwrap_or_default();
    Ok(Doc {
        path: p.to_string_lossy().into_owned(),
        dir: dir.to_string_lossy().into_owned(),
        name: p
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default(),
        content,
        warning,
    })
}

/// Debounce do watcher por tamanho do arquivo (como o `throttle_at_last` do peek.nvim): documento
/// grande re-renderiza inteiro a cada salvamento, e um editor com autosave salvaria mais rápido do
/// que a tela consegue desenhar. Degraus: (teto em bytes, espera). Medido em 2026-10-25: 5 MB levam
/// ~1,5 s de render + 3 s até o layout, então 2 s entre renders ainda deixa a tela acompanhar.
const DEBOUNCE_STEPS: &[(u64, u64)] = &[
    (200 * 1024, 150),
    (1024 * 1024, 500),
    (5 * 1024 * 1024, 1000),
];
const DEBOUNCE_MAX_MS: u64 = 2000;

fn debounce_for(bytes: u64) -> Duration {
    let ms = DEBOUNCE_STEPS
        .iter()
        .find(|(cap, _)| bytes <= *cap)
        .map_or(DEBOUNCE_MAX_MS, |(_, ms)| *ms);
    Duration::from_millis(ms)
}

/// O que `watch_file` faz com o vigia atual. Trocar o debouncer descarta o evento que ele tinha
/// na mão (o `Drop` do notify-debouncer-mini não esvazia a fila), e a recarga chama `watch_file`
/// no fim, depois do render: com espera de 1 a 2 s num arquivo grande, um salvamento feito
/// durante o render se perderia e a tela ficaria velha. Então: mesmo arquivo e mesma espera,
/// mantém; só a espera mudou (o arquivo cruzou um degrau), troca e avisa o frontend uma vez,
/// para a recarga que estiver em curso rodar de novo com o conteúdo mais novo.
#[derive(Debug, PartialEq)]
enum WatchDecision {
    Keep,
    Replace { renotify: bool },
}

fn watch_decision(
    current: Option<&(PathBuf, Duration)>,
    target: &Path,
    debounce: Duration,
) -> WatchDecision {
    match current {
        Some((p, d)) if p == target && *d == debounce => WatchDecision::Keep,
        Some((p, _)) if p == target => WatchDecision::Replace { renotify: true },
        _ => WatchDecision::Replace { renotify: false },
    }
}

/// Observa a pasta do arquivo (não o arquivo: editores salvam via rename) e emite
/// `file-changed` quando o alvo muda. A espera depende do tamanho do arquivo no momento
/// (`debounce_for`); como cada recarga chama `watch_file` de novo, ela acompanha o arquivo
/// crescendo, e `watch_decision` evita recriar o vigia à toa.
#[tauri::command]
fn watch_file(app: AppHandle, state: State<AppState>, path: String) -> Result<(), String> {
    let target = granted(&state, &path)?;
    let dir = target
        .parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| i18n::s().no_parent.to_string())?;
    let size = std::fs::metadata(&target).map(|m| m.len()).unwrap_or(0);
    let debounce = debounce_for(size);
    let decision = watch_decision(state.watched.lock().unwrap().as_ref(), &target, debounce);
    let renotify = match decision {
        WatchDecision::Keep => return Ok(()),
        WatchDecision::Replace { renotify } => renotify,
    };
    let emit_path = target.to_string_lossy().into_owned();
    let t2 = target.clone();
    let app2 = app.clone();
    let mut debouncer = new_debouncer(
        debounce,
        move |res: Result<Vec<DebouncedEvent>, notify::Error>| {
            if let Ok(events) = res
                && events.iter().any(|e| e.path == t2)
            {
                let _ = app2.emit("file-changed", emit_path.clone());
            }
        },
    )
    .map_err(|e| e.to_string())?;
    debouncer
        .watcher()
        .watch(&dir, RecursiveMode::NonRecursive)
        .map_err(|e| e.to_string())?;
    *state.watcher.lock().unwrap() = Some(debouncer);
    *state.watched.lock().unwrap() = Some((target.clone(), debounce));
    if renotify {
        let _ = app.emit("file-changed", target.to_string_lossy().into_owned());
    }
    Ok(())
}

/// Quanto esperar, depois do `RunEvent::Ready`, por um arquivo pedido pelo SO na abertura.
/// No macOS o duplo-clique num `.md` chega como `RunEvent::Opened` (Apple Event `odoc`), que na
/// prática vem antes do `setup`, mas o AppKit não garante a ordem em relação ao fim da abertura:
/// sem esta folga, o frontend poderia concluir "abertura direta" e mostrar o exemplo por cima
/// do arquivo pedido. No Windows e no Linux o arquivo vem por argv, lido no `setup` (antes do
/// `Ready`), então não há o que esperar.
#[cfg(target_os = "macos")]
const LAUNCH_GRACE: Duration = Duration::from_millis(500);
#[cfg(not(target_os = "macos"))]
const LAUNCH_GRACE: Duration = Duration::ZERO;
/// Teto da espera, contado da chamada: se o `Ready` não for visto, o frontend não trava.
const LAUNCH_WAIT_MAX: Duration = Duration::from_secs(2);

/// A abertura assentou: já chegou um arquivo, ou o `Ready` passou há pelo menos `grace`.
fn launch_settled(
    ready_at: Option<Instant>,
    now: Instant,
    has_file: bool,
    grace: Duration,
) -> bool {
    has_file || ready_at.is_some_and(|r| now.saturating_duration_since(r) >= grace)
}

/// Espera a abertura assentar (ou `max`) e devolve o arquivo pedido pelo SO, se houver. Dorme
/// até o prazo (fim da folga ou teto) e só acorda antes por `notify_all` de `mark_ready` ou
/// `queue_open`: sem o aviso, um arquivo tardio esperaria a folga inteira.
fn wait_launch(state: &AppState, grace: Duration, max: Duration) -> Option<String> {
    let start = Instant::now();
    let mut ready = state.ready_at.lock().unwrap();
    loop {
        let now = Instant::now();
        let has_file = state.pending_open.lock().unwrap().is_some();
        let cap = start + max;
        if launch_settled(*ready, now, has_file, grace) || now >= cap {
            break;
        }
        let deadline = ready.map_or(cap, |r| (r + grace).min(cap));
        ready = state
            .launch_cv
            .wait_timeout(ready, deadline.saturating_duration_since(now))
            .unwrap()
            .0;
    }
    drop(ready);
    state.pending_open.lock().unwrap().take()
}

/// Põe o arquivo pedido pelo SO na fila e acorda quem espera a abertura (`wait_launch`).
fn queue_open(state: &AppState, path: String) {
    *state.pending_open.lock().unwrap() = Some(path);
    state.launch_cv.notify_all();
}

fn mark_ready(state: &AppState) {
    state
        .ready_at
        .lock()
        .unwrap()
        .get_or_insert_with(Instant::now);
    state.launch_cv.notify_all();
}

/// Arquivo que o SO pediu na abertura (argv, duplo-clique), depois de a abertura assentar.
/// `None` quer dizer abertura direta (ícone, Dock, menu Iniciar) ou recarga da página: o
/// frontend decide entre abas salvas, documento de exemplo e estado vazio. Arquivo que chegar
/// depois disto vem pelo evento `open-file`. Espera fora da thread principal, que entrega os
/// eventos do SO.
#[tauri::command]
async fn launch_open(app: AppHandle) -> Option<String> {
    tauri::async_runtime::spawn_blocking(move || {
        wait_launch(&app.state::<AppState>(), LAUNCH_GRACE, LAUNCH_WAIT_MAX)
    })
    .await
    .ok()
    .flatten()
}

/// Resolve um link relativo a partir da pasta de um documento aberto e concede o alvo;
/// erro se a pasta não for de documento concedido ou o alvo não existir.
#[tauri::command]
fn resolve_path(state: State<AppState>, dir: String, rel: String) -> Result<String, String> {
    resolve_rel(&state, &dir, &rel).map(|c| c.to_string_lossy().into_owned())
}

/// Miolo de `resolve_path`, testável sem `State`. Erro de caminho absoluto chega ao leitor como
/// veio; alvo inexistente vira "Não encontrado", sem o texto do SO.
fn resolve_rel(state: &AppState, dir: &str, rel: &str) -> Result<PathBuf, String> {
    let d = granted_dir(state, dir)?;
    let r = relative_only(rel)?;
    grant(state, &d.join(r)).map_err(|_| fill(i18n::s().not_found, &[("path", rel)]))
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

/// Quais caminhos ainda existem como arquivo (Recentes: o que sumiu aparece apagado). Só
/// responde sobre caminhos já concedidos (`granted`): fora da lista é `false`, sem tocar o
/// disco, para o comando não virar sonda de existência. Assíncrono porque um recente em volume
/// de rede fora do ar demora no `stat`, e o estado vazio não pode travar a janela por isso.
#[tauri::command]
async fn paths_exist(state: State<'_, AppState>, paths: Vec<String>) -> Result<Vec<bool>, String> {
    let granted: Vec<PathBuf> = state.granted.lock().unwrap().clone();
    let out = tauri::async_runtime::spawn_blocking(move || {
        paths
            .iter()
            .map(|p| {
                let path = Path::new(p);
                granted.iter().any(|g| g == path) && path.is_file()
            })
            .collect()
    })
    .await
    .map_err(|e| e.to_string())?;
    #[cfg(debug_assertions)]
    eprintln!("paths_exist: {out:?}");
    Ok(out)
}

/// Libera no asset protocol, arquivo por arquivo, as imagens que um documento concedido
/// referencia. Nada de pasta inteira: só o que o `<img>` pede e existe.
#[tauri::command]
fn allow_assets(
    app: AppHandle,
    state: State<AppState>,
    dir: String,
    rels: Vec<String>,
) -> Result<HashMap<String, Option<String>>, String> {
    let d = granted_dir(&state, &dir)?;
    let scope = app.asset_protocol_scope();
    Ok(rels
        .into_iter()
        .map(|rel| {
            let abs = asset_candidate(&d, &rel)
                .filter(|p| scope.allow_file(p).is_ok())
                .map(|p| p.to_string_lossy().into_owned());
            #[cfg(debug_assertions)]
            eprintln!("allow_assets: {rel} -> {abs:?}");
            (rel, abs)
        })
        .collect())
}

/// Exportar HTML: imagem local acima disso não entra no arquivo; o frontend mantém o caminho
/// relativo e avisa. Mesmo valor de `EXPORT_IMAGE_MAX_BYTES` em `src/export.ts`.
const EXPORT_IMAGE_MAX_BYTES: u64 = 5 * 1024 * 1024;

/// Imagem lida para o HTML exportado: data URI, ou nada (`too_big` diz se foi pelo tamanho).
#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
struct ExportImage {
    data: Option<String>,
    too_big: bool,
}

fn image_mime(p: &Path) -> &'static str {
    match ext_lower(p).as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "svg" => "image/svg+xml",
        "webp" => "image/webp",
        "avif" => "image/avif",
        "bmp" => "image/bmp",
        "ico" => "image/x-icon",
        _ => "application/octet-stream",
    }
}

/// Mesma regra de `allow_assets` (relativo à pasta, existe, extensão de imagem): só lê o que o
/// documento já mostra. Acima de `max` nem lê o conteúdo. Herdado de `asset_candidate`: `..` vale
/// (o alvo canônico pode estar fora da pasta, como no asset protocol) e symlink é seguido, mas
/// quem decide é o alvo canônico: tem de ser arquivo com extensão de imagem.
fn export_image(dir: &Path, rel: &str, max: u64) -> ExportImage {
    let none = ExportImage {
        data: None,
        too_big: false,
    };
    let Some(p) = asset_candidate(dir, rel) else {
        return none;
    };
    let too_big = ExportImage {
        data: None,
        too_big: true,
    };
    match std::fs::metadata(&p) {
        Ok(m) if m.len() > max => return too_big,
        Ok(_) => {}
        Err(_) => return none,
    }
    match std::fs::read(&p) {
        Ok(bytes) if bytes.len() as u64 > max => too_big,
        Ok(bytes) => ExportImage {
            data: Some(format!(
                "data:{};base64,{}",
                image_mime(&p),
                BASE64.encode(bytes)
            )),
            too_big: false,
        },
        Err(_) => none,
    }
}

/// Exportar HTML: imagens locais de um documento concedido como data URI, para o arquivo sair
/// com elas dentro. Só a pasta de um documento concedido (`granted_dir`) e só imagem relativa.
#[tauri::command]
async fn export_images(
    state: State<'_, AppState>,
    dir: String,
    rels: Vec<String>,
) -> Result<HashMap<String, ExportImage>, String> {
    let grants = state.granted.lock().unwrap().clone();
    tauri::async_runtime::spawn_blocking(move || {
        export_images_in(&grants, &dir, rels, EXPORT_IMAGE_MAX_BYTES)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Miolo de `export_images`, sem `State`: recusa pasta que não é de documento concedido.
fn export_images_in(
    grants: &[PathBuf],
    dir: &str,
    rels: Vec<String>,
    max: u64,
) -> Result<HashMap<String, ExportImage>, String> {
    let d = dir_in_grants(grants, dir)?;
    Ok(rels
        .into_iter()
        .map(|rel| {
            let img = export_image(&d, &rel, max);
            (rel, img)
        })
        .collect())
}

/// Pasta e nome sugeridos (`<nome>.html`) para exportar `doc`, que tem de estar concedido.
fn export_source(grants: &[PathBuf], doc: &str) -> Result<(Option<PathBuf>, String), String> {
    let src = file_in_grants(grants, doc)?;
    let stem = src
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| "documento".into());
    Ok((src.parent().map(Path::to_path_buf), format!("{stem}.html")))
}

/// Grava o HTML no caminho escolhido no diálogo (`write_picked` com `.html`/`.htm`): o `.md` de
/// origem nunca é sobrescrito e nada é sobrescrito sem confirmação.
fn write_export(picked: PathBuf, html: &str) -> Result<PathBuf, String> {
    write_picked(picked, html, &["html", "htm"], i18n::s().export_exists)
}

/// Grava `text` no caminho escolhido num diálogo de salvar. Com uma das `exts`, é o caminho que o
/// diálogo confirmou (inclusive a sobrescrita): escrita normal. Com outra extensão (ou nenhuma),
/// grava em `<caminho>.<exts[0]>`, que o diálogo NÃO confirmou: só se ainda não existir
/// (`create_new`, que também recusa symlink nesse lugar); senão, recusa com `exists` (`{path}`) e
/// não toca no que está lá.
fn write_picked(
    picked: PathBuf,
    text: &str,
    exts: &[&str],
    exists: &str,
) -> Result<PathBuf, String> {
    use std::io::Write;
    let failed = |p: &Path, e: std::io::Error| {
        fill(
            i18n::s().write_failed,
            &[
                ("path", &p.display().to_string()),
                ("error", &e.to_string()),
            ],
        )
    };
    if exts.contains(&ext_lower(&picked).as_str()) {
        std::fs::write(&picked, text).map_err(|e| failed(&picked, e))?;
        return Ok(picked);
    }
    let mut s = picked.into_os_string();
    s.push(".");
    s.push(exts[0]);
    let target = PathBuf::from(s);
    let mut f = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&target)
        .map_err(|e| {
            if e.kind() == std::io::ErrorKind::AlreadyExists {
                fill(exists, &[("path", &target.display().to_string())])
            } else {
                failed(&target, e)
            }
        })?;
    f.write_all(text.as_bytes())
        .map_err(|e| failed(&target, e))?;
    Ok(target)
}

/// Exportar HTML: diálogo nativo de salvar aberto AQUI, sugerindo `<nome>.html` na pasta do
/// documento, e escrita só no caminho escolhido nele. O frontend manda o documento de origem
/// (precisa estar concedido) e o conteúdo; nunca o destino. `None` = cancelado.
#[tauri::command]
async fn save_html(app: AppHandle, doc: String, html: String) -> Result<Option<String>, String> {
    let (dir, name) = export_source(&app.state::<AppState>().granted.lock().unwrap(), &doc)?;
    let mut dialog = app
        .dialog()
        .file()
        .add_filter("HTML", &["html", "htm"])
        .set_file_name(name);
    if let Some(dir) = dir {
        dialog = dialog.set_directory(dir);
    }
    tauri::async_runtime::spawn_blocking(move || {
        let Some(picked) = dialog.blocking_save_file() else {
            return Ok(None);
        };
        let path = write_export(picked.into_path().map_err(|e| e.to_string())?, &html)?;
        Ok(Some(path.to_string_lossy().into_owned()))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Resolve wikilinks `[[nota]]`: tenta `nota.md` na pasta do documento; se não achar e houver
/// pasta raiz aberta, busca recursiva pelo nome do arquivo (como o Obsidian). `None` = não existe.
#[tauri::command]
fn resolve_wikilinks(
    state: State<AppState>,
    dir: String,
    root: Option<String>,
    targets: Vec<String>,
) -> Result<HashMap<String, Option<String>>, String> {
    let dir = granted_dir(&state, &dir)?;
    // A raiz (fase 2) só vale se contiver a pasta do documento concedido.
    let root = root
        .map(|r| canonical(&r))
        .transpose()?
        .filter(|r| dir.starts_with(r));
    Ok(targets
        .into_iter()
        .map(|t| {
            let found = resolve_wikilink(&dir, root.as_deref(), &t)
                .and_then(|f| grant(&state, Path::new(&f)).ok())
                .map(|c| c.to_string_lossy().into_owned());
            (t, found)
        })
        .collect())
}

fn canonical_string(p: &Path) -> Option<String> {
    canonical(&p.to_string_lossy())
        .ok()
        .map(|c| c.to_string_lossy().into_owned())
}

fn resolve_wikilink(dir: &Path, root: Option<&Path>, target: &str) -> Option<String> {
    relative_only(target).ok()?;
    let rel = if is_markdown(Path::new(target)) {
        target.to_string()
    } else {
        format!("{target}.md")
    };
    let direct = dir.join(&rel);
    if direct.is_file() {
        return canonical_string(&direct);
    }
    let name = Path::new(&rel)
        .file_name()?
        .to_string_lossy()
        .to_lowercase();
    find_file_by_name(root?, &name)
}

/// Procura um arquivo pelo nome (sem distinguir maiúsculas) em largura: toda pasta rasa
/// antes de qualquer pasta funda, como o "caminho mais curto" do Obsidian. Ignora pastas
/// ocultas e `node_modules`; para em 16 níveis.
fn find_file_by_name(root: &Path, name: &str) -> Option<String> {
    let mut queue = std::collections::VecDeque::from([(root.to_path_buf(), 0usize)]);
    while let Some((dir, depth)) = queue.pop_front() {
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        let mut subdirs = Vec::new();
        for entry in entries.flatten() {
            let fname = entry.file_name().to_string_lossy().into_owned();
            if fname.starts_with('.') || fname == "node_modules" {
                continue;
            }
            let path = entry.path();
            if path.is_dir() {
                subdirs.push(path);
            } else if fname.to_lowercase() == name {
                return canonical_string(&path);
            }
        }
        if depth < 16 {
            subdirs.sort();
            queue.extend(subdirs.into_iter().map(|d| (d, depth + 1)));
        }
    }
    None
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

/// Abertura vinda do SO (duplo-clique, argv, segunda instância): concede e avisa o frontend.
fn request_open(app: &AppHandle, path: PathBuf) {
    let Some(state) = app.try_state::<AppState>() else {
        return;
    };
    let Ok(c) = grant(&state, &path) else {
        return;
    };
    let s = c.to_string_lossy().into_owned();
    queue_open(&state, s.clone());
    let _ = app.emit("open-file", s);
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.set_focus();
    }
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

/// Primeiro argumento que é `.md` existente. Relativo vale a partir de `cwd`, a pasta de quem
/// chamou (`leve README.md` no terminal): na 1ª instância é a do próprio processo; na 2ª vem do
/// plugin single-instance, porque a instância que já está aberta tem outra pasta atual (`/`
/// quando aberta pelo Finder).
fn first_markdown_arg(argv: &[String], cwd: &Path) -> Option<PathBuf> {
    argv.iter()
        .skip(1)
        .map(|a| cwd.join(a))
        .find(|p| is_markdown(p) && p.exists())
}

/// O que pode ir para um editor: só arquivo Markdown (mesma regra de extensão do argv). Um alvo de
/// link concedido como `./run.command` não passa: com "Aplicativo padrão" o LaunchServices o
/// executaria, contornando `OPENABLE_EXT`. No Windows tira o prefixo `\\?\` do canônico.
fn editor_target(doc: &Path) -> Result<PathBuf, String> {
    let shown = doc.display().to_string();
    if !is_markdown(doc) {
        return Err(fill(i18n::s().editor_not_markdown, &[("path", &shown)]));
    }
    if !doc.is_file() {
        return Err(fill(i18n::s().not_found, &[("path", &shown)]));
    }
    Ok(editor::strip_verbatim(doc))
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

/// Menu nativo no idioma atual (`i18n`). Chamado no `setup` e de novo por `set_locale`; o
/// tratamento dos cliques (`on_menu_event`) é registrado uma vez só, no `setup`.
fn build_menu(app: &AppHandle) -> tauri::Result<()> {
    let s = i18n::s();
    let item = |id: &str, label: &str, accel: Option<&str>| {
        let b = MenuItemBuilder::with_id(id, label);
        match accel {
            Some(a) => b.accelerator(a),
            None => b,
        }
        .build(app)
    };
    let open = item("open", s.open, Some("CmdOrCtrl+O"))?;
    let open_clipboard = item(
        "open-clipboard",
        s.open_clipboard,
        Some("CmdOrCtrl+Shift+V"),
    )?;
    // Desligado até o frontend dizer que o ativo é o documento colado (`sync_save_menu`).
    let save = MenuItemBuilder::with_id("save", s.save)
        .accelerator("CmdOrCtrl+S")
        .enabled(false)
        .build(app)?;
    *app.state::<AppState>().save_item.lock().unwrap() = Some(save.clone());
    let reload = item("reload", s.reload, Some("CmdOrCtrl+R"))?;
    let reveal = item("reveal", s.reveal, Some("CmdOrCtrl+Shift+R"))?;
    let open_in_editor = item("open-in-editor", s.open_in_editor, Some("CmdOrCtrl+E"))?;
    let clear_recent = item("clear-recent", s.clear_recent, None)?;
    let print = item("print", s.print, Some("CmdOrCtrl+P"))?;
    let export_html = item("export-html", s.export_html, None)?;
    let copy_html = item("copy-html", s.copy_html, None)?;
    let copy_rich = item("copy-rich", s.copy_rich, Some("CmdOrCtrl+Shift+C"))?;
    let find = item("find", s.find, Some("CmdOrCtrl+F"))?;
    let toc = item("toggle-toc", s.toc, Some("CmdOrCtrl+B"))?;
    let next_change = item("next-change", s.next_change, Some("CmdOrCtrl+Shift+Down"))?;
    let prev_change = item("prev-change", s.prev_change, Some("CmdOrCtrl+Shift+Up"))?;
    let clear_changes = item("clear-changes", s.clear_changes, None)?;
    let theme = item("cycle-theme", s.theme, Some("CmdOrCtrl+Shift+L"))?;
    let zoom_in = item("zoom-in", s.zoom_in, Some("CmdOrCtrl+="))?;
    let zoom_out = item("zoom-out", s.zoom_out, Some("CmdOrCtrl+-"))?;
    let zoom_reset = item("zoom-reset", s.zoom_reset, Some("CmdOrCtrl+0"))?;
    let back = item("back", s.back, Some("CmdOrCtrl+["))?;
    let forward = item("forward", s.forward, Some("CmdOrCtrl+]"))?;
    let close_tab = item("close-tab", s.close_tab, Some("CmdOrCtrl+W"))?;
    let close_window = item("close-window", s.close_window, Some("CmdOrCtrl+Shift+W"))?;
    let next_tab = item("next-tab", s.next_tab, Some("CmdOrCtrl+Shift+]"))?;
    let prev_tab = item("prev-tab", s.prev_tab, Some("CmdOrCtrl+Shift+["))?;
    let shortcuts = item("shortcuts", s.shortcuts, Some("CmdOrCtrl+/"))?;
    let sample = item("sample", s.sample, None)?;
    // Sobre e Verificar atualizações são telas do app, iguais nos dois sistemas: no macOS ficam no
    // menu do app, como manda a convenção; nos outros, em Ajuda.
    let about = item("about", s.about, None)?;
    let check_updates = item("check-updates", s.check_updates, None)?;
    // Preferências é tela do app (`#prefs` em index.html): no macOS fica no menu do app, acima
    // de Serviços, como manda a convenção; no Windows e no Linux, em Editar.
    let preferences = item("preferences", s.preferences, Some("CmdOrCtrl+,"))?;

    let file = SubmenuBuilder::new(app, s.file)
        .item(&open)
        .item(&open_clipboard)
        .item(&save)
        .separator()
        .item(&reload)
        .item(&reveal)
        .item(&open_in_editor)
        .separator()
        .item(&clear_recent)
        .separator()
        .item(&print)
        .item(&export_html)
        .item(&copy_html)
        .separator()
        .item(&close_tab)
        .item(&close_window)
        .build()?;
    let edit = SubmenuBuilder::new(app, s.edit)
        .copy_with_text(s.copy)
        .item(&copy_rich)
        .select_all_with_text(s.select_all)
        .separator()
        .item(&find);
    #[cfg(not(target_os = "macos"))]
    let edit = edit.separator().item(&preferences);
    let edit = edit.build()?;
    // Marcação vem do frontend (`sync_view_menu`, `sync_remote_menu`, `sync_hidden_menu`) logo depois de montar.
    let mut checks = Vec::new();
    let mut radio = |id: &str, label: &str, on: bool| -> tauri::Result<CheckMenuItem<Wry>> {
        let item = CheckMenuItemBuilder::with_id(id, label)
            .checked(on)
            .build(app)?;
        checks.push(item.clone());
        Ok(item)
    };
    let w_narrow = radio("width-narrow", s.width_narrow, false)?;
    let w_normal = radio("width-normal", s.width_normal, true)?;
    let w_wide = radio("width-wide", s.width_wide, false)?;
    let f_sans = radio("font-sans", "Sans", true)?;
    let f_serif = radio("font-serif", "Serif", false)?;
    let f_mono = radio("font-mono", "Mono", false)?;
    *app.state::<AppState>().view_checks.lock().unwrap() = checks;
    // Desligado por padrão (privacidade); o frontend liga se a preferência salva mandar.
    let remote_auto = CheckMenuItemBuilder::with_id("remote-auto", s.remote)
        .checked(false)
        .build(app)?;
    *app.state::<AppState>().remote_check.lock().unwrap() = Some(remote_auto.clone());
    // Desligado por padrão: o documento só avisa; o frontend liga se a preferência mandar.
    let show_hidden = CheckMenuItemBuilder::with_id("show-hidden", s.show_hidden)
        .checked(false)
        .build(app)?;
    *app.state::<AppState>().hidden_check.lock().unwrap() = Some(show_hidden.clone());
    let width = SubmenuBuilder::new(app, s.width)
        .items(&[&w_narrow, &w_normal, &w_wide])
        .build()?;
    let font = SubmenuBuilder::new(app, s.font)
        .items(&[&f_sans, &f_serif, &f_mono])
        .build()?;

    let view = SubmenuBuilder::new(app, s.view)
        .item(&toc)
        .item(&theme)
        .separator()
        .item(&width)
        .item(&font)
        .separator()
        .item(&remote_auto)
        .item(&show_hidden)
        .separator()
        .item(&next_change)
        .item(&prev_change)
        .item(&clear_changes)
        .separator()
        .item(&zoom_in)
        .item(&zoom_out)
        .item(&zoom_reset)
        .build()?;
    let go = SubmenuBuilder::new(app, s.go)
        .item(&back)
        .item(&forward)
        .separator()
        .item(&next_tab)
        .item(&prev_tab)
        .build()?;

    let help = SubmenuBuilder::new(app, s.help)
        .item(&shortcuts)
        .item(&sample);
    #[cfg(not(target_os = "macos"))]
    let help = help.separator().item(&check_updates).item(&about);
    let help = help.build()?;

    #[cfg(target_os = "macos")]
    let builder = {
        let app_menu = SubmenuBuilder::new(app, "Leve")
            .item(&about)
            .item(&check_updates)
            .separator()
            .item(&preferences)
            .item(&item("install-cli", s.install_cli, None)?)
            .separator()
            .services_with_text(s.services)
            .separator()
            .hide_with_text(s.hide)
            .hide_others_with_text(s.hide_others)
            .show_all_with_text(s.show_all)
            .separator()
            .quit_with_text(s.quit)
            .build()?;
        MenuBuilder::new(app).item(&app_menu)
    };
    #[cfg(not(target_os = "macos"))]
    let builder = MenuBuilder::new(app);
    let menu = builder
        .item(&file)
        .item(&edit)
        .item(&view)
        .item(&go)
        .item(&help)
        .build()?;
    app.set_menu(menu)?;
    Ok(())
}

fn on_menu(app: &AppHandle, id: String) {
    // Fechar janela fica no Rust (sem permissão de janela no frontend); ⌘W é da aba.
    if id == "close-window" {
        if let Some(w) = app.get_webview_window("main") {
            let _ = w.close();
        }
        return;
    }
    if id.starts_with("width-") || id.starts_with("font-") {
        check_view_item(&app.state::<AppState>(), &id);
    }
    let _ = app.emit("menu", id);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();
    if bench_started().is_some() {
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
            read_markdown,
            watch_file,
            launch_open,
            resolve_path,
            pick_markdown,
            read_clipboard,
            save_markdown,
            allow_assets,
            export_images,
            save_html,
            sync_view_menu,
            sync_remote_menu,
            sync_hidden_menu,
            sync_save_menu,
            resolve_wikilinks,
            open_external,
            reveal_in_folder,
            app_info,
            paths_exist,
            forget_grants,
            set_locale,
            list_editors,
            open_in_editor,
            install_cli,
            bench_report
        ])
        .setup(|app| {
            i18n::set(i18n::system());
            build_menu(app.handle())?;
            app.on_menu_event(|app, event| on_menu(app, event.id().0.clone()));
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
mod launch_tests {
    use super::*;

    const GRACE: Duration = Duration::from_millis(500);

    #[test]
    fn assenta_com_arquivo_ou_depois_da_folga() {
        let t0 = Instant::now();
        assert!(!launch_settled(None, t0, false, GRACE), "sem Ready, espera");
        assert!(
            launch_settled(None, t0, true, GRACE),
            "arquivo decide na hora"
        );
        assert!(!launch_settled(
            Some(t0),
            t0 + Duration::from_millis(100),
            false,
            GRACE
        ));
        assert!(launch_settled(Some(t0), t0 + GRACE, false, GRACE));
        assert!(
            launch_settled(Some(t0), t0, false, Duration::ZERO),
            "sem folga fora do macOS"
        );
    }

    #[test]
    fn arquivo_que_chega_durante_a_espera_e_entregue() {
        // Opened depois do Ready (ordem que o AppKit não proíbe): a espera devolve o arquivo.
        // Folga longa (5 s) de propósito: só o `notify_all` de `queue_open` (o caminho de
        // `request_open`) acorda a espera antes dela; sem o aviso, o teste estoura o tempo.
        let state = std::sync::Arc::new(AppState::default());
        mark_ready(&state);
        let s2 = state.clone();
        let late = std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(80));
            queue_open(&s2, "/x/tarde.md".into());
        });
        let t = Instant::now();
        let got = wait_launch(&state, Duration::from_secs(5), Duration::from_secs(10));
        let waited = t.elapsed();
        late.join().unwrap();
        assert_eq!(got.as_deref(), Some("/x/tarde.md"));
        assert!(
            waited < Duration::from_secs(1),
            "acordou pelo aviso, não pelo prazo: {waited:?}"
        );
        assert!(
            state.pending_open.lock().unwrap().is_none(),
            "entregue uma vez só"
        );
    }

    #[test]
    fn sem_arquivo_devolve_nada_apos_a_folga_e_o_teto_vale_sem_ready() {
        let state = AppState::default();
        mark_ready(&state);
        let t = Instant::now();
        assert_eq!(
            wait_launch(&state, Duration::from_millis(60), Duration::from_secs(2)),
            None
        );
        assert!(t.elapsed() >= Duration::from_millis(60));
        let sem_ready = AppState::default();
        let t = Instant::now();
        assert_eq!(
            wait_launch(&sem_ready, GRACE, Duration::from_millis(80)),
            None
        );
        assert!(t.elapsed() < Duration::from_millis(400), "teto respeitado");
    }
}

#[cfg(test)]
mod scope_tests {
    use super::*;

    fn temp(tag: &str) -> PathBuf {
        let p = std::env::temp_dir().join(format!("leve-scope-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&p);
        std::fs::create_dir_all(&p).unwrap();
        p
    }

    #[test]
    fn so_le_o_que_foi_concedido_e_persiste() {
        let t = temp("grant");
        let doc = t.join("doc.md");
        std::fs::write(&doc, "# a").unwrap();
        let state = AppState::default();
        *state.grants_file.lock().unwrap() = Some(t.join("grants.json"));
        let doc_s = doc.to_string_lossy().into_owned();
        assert!(
            granted(&state, &doc_s).is_err(),
            "antes de conceder, recusa"
        );
        let c = grant(&state, &doc).unwrap();
        assert_eq!(granted(&state, &doc_s).unwrap(), c);
        assert!(
            granted(&state, "/etc/hosts")
                .unwrap_err()
                .starts_with("Caminho não autorizado")
        );
        let reloaded = load_grants(&t.join("grants.json"));
        assert_eq!(reloaded, vec![c]);
        let _ = std::fs::remove_dir_all(&t);
    }

    #[test]
    fn concessao_antes_do_setup_sobrevive_e_e_gravada() {
        // macOS: RunEvent::Opened chega antes do setup ligar o arquivo de concessões.
        let t = temp("antes-setup");
        let antigo = t.join("antigo.md");
        let novo = t.join("novo.md");
        std::fs::write(&antigo, "").unwrap();
        std::fs::write(&novo, "").unwrap();
        let file = t.join("grants.json");
        persist_grants(&file, &[fs_canon(&antigo)]);
        let state = AppState::default();
        let c = grant(&state, &novo).unwrap();
        attach_grants_file(&state, file.clone());
        assert!(
            granted(&state, &novo.to_string_lossy()).is_ok(),
            "concessão em memória perdida"
        );
        assert!(
            granted(&state, &antigo.to_string_lossy()).is_ok(),
            "concessão do disco perdida"
        );
        assert_eq!(
            load_grants(&file).last(),
            Some(&c),
            "gravada e como mais recente"
        );
        let _ = std::fs::remove_dir_all(&t);
    }

    #[test]
    fn esquecer_concessoes_mantem_so_as_abas_abertas() {
        let t = temp("esquecer");
        let aberta = t.join("aberta.md");
        let antiga = t.join("antiga.md");
        let outra = t.join("outra.md");
        for p in [&aberta, &antiga, &outra] {
            std::fs::write(p, "# x").unwrap();
        }
        let state = AppState::default();
        let file = t.join("grants.json");
        *state.grants_file.lock().unwrap() = Some(file.clone());
        for p in [&antiga, &aberta, &outra] {
            grant(&state, p).unwrap();
        }
        let aberta_c = fs_canon(&aberta);
        let saiu = forget_grants_except(&state, std::slice::from_ref(&aberta_c));
        assert_eq!(saiu, 2);
        assert!(
            granted(&state, &aberta.to_string_lossy()).is_ok(),
            "aba aberta perdeu a concessão"
        );
        assert!(granted(&state, &antiga.to_string_lossy()).is_err());
        assert!(granted(&state, &outra.to_string_lossy()).is_err());
        assert_eq!(
            load_grants(&file),
            vec![aberta_c],
            "grants.json não acompanhou"
        );
        // Sem aba aberta: lista e arquivo ficam vazios.
        assert_eq!(forget_grants_except(&state, &[]), 1);
        assert!(load_grants(&file).is_empty());
        let _ = std::fs::remove_dir_all(&t);
    }

    fn fs_canon(p: &Path) -> PathBuf {
        std::fs::canonicalize(p).unwrap()
    }

    #[test]
    fn pasta_concedida_e_a_do_documento_e_so_ela() {
        let t = temp("dir");
        std::fs::create_dir_all(t.join("outra")).unwrap();
        let doc = t.join("doc.md");
        std::fs::write(&doc, "").unwrap();
        let state = AppState::default();
        grant(&state, &doc).unwrap();
        assert!(granted_dir(&state, &t.to_string_lossy()).is_ok());
        assert!(granted_dir(&state, &t.join("outra").to_string_lossy()).is_err());
        let _ = std::fs::remove_dir_all(&t);
    }

    #[test]
    fn asset_candidate_exige_arquivo_existente_com_extensao_de_imagem() {
        let t = temp("asset");
        std::fs::create_dir_all(t.join("img")).unwrap();
        std::fs::write(t.join("img/a.PNG"), "").unwrap();
        std::fs::write(t.join("segredo.txt"), "").unwrap();
        assert!(asset_candidate(&t, "img/a.PNG").is_some());
        assert!(asset_candidate(&t, "./img/../img/a.PNG").is_some());
        assert!(asset_candidate(&t, "segredo.txt").is_none());
        assert!(asset_candidate(&t, "img").is_none(), "pasta não é imagem");
        assert!(asset_candidate(&t, "nao-existe.png").is_none());
        let _ = std::fs::remove_dir_all(&t);
    }

    #[test]
    fn exportar_embute_so_imagem_relativa_e_respeita_o_limite() {
        let t = temp("export-img");
        std::fs::create_dir_all(t.join("img")).unwrap();
        std::fs::write(t.join("img/a.png"), [0x89, b'P', b'N', b'G']).unwrap();
        std::fs::write(t.join("img/b.svg"), "<svg/>").unwrap();
        std::fs::write(t.join("segredo.txt"), "x").unwrap();
        let a = export_image(&t, "img/a.png", 1024);
        assert_eq!(a.data.as_deref(), Some("data:image/png;base64,iVBORw=="));
        assert!(!a.too_big);
        assert_eq!(
            export_image(&t, "img/b.svg", 1024).data.as_deref(),
            Some("data:image/svg+xml;base64,PHN2Zy8+")
        );
        // Acima do limite: não lê, avisa pelo tamanho.
        assert_eq!(
            export_image(&t, "img/a.png", 3),
            ExportImage {
                data: None,
                too_big: true
            }
        );
        // Mesma regra do asset protocol: só imagem, só relativo, só o que existe.
        let none = ExportImage {
            data: None,
            too_big: false,
        };
        assert_eq!(export_image(&t, "segredo.txt", 1024), none);
        let abs = t.join("img/a.png").to_string_lossy().into_owned();
        assert_eq!(export_image(&t, &abs, 1024), none);
        assert_eq!(export_image(&t, "nao-existe.png", 1024), none);
        let _ = std::fs::remove_dir_all(&t);
    }

    #[test]
    fn exportar_grava_so_o_que_o_dialogo_confirmou() {
        let t = temp("export-write");
        // `.html` do diálogo: sobrescrita confirmada.
        std::fs::write(t.join("a.html"), "velho").unwrap();
        assert_eq!(
            write_export(t.join("a.html"), "novo").unwrap(),
            t.join("a.html")
        );
        assert_eq!(std::fs::read_to_string(t.join("a.html")).unwrap(), "novo");
        // Outra extensão: cria `<nome>.html` se não existir; o `.md` não é tocado.
        std::fs::write(t.join("doc.md"), "fonte").unwrap();
        assert_eq!(
            write_export(t.join("doc.md"), "x").unwrap(),
            t.join("doc.md.html")
        );
        assert_eq!(std::fs::read_to_string(t.join("doc.md")).unwrap(), "fonte");
        assert_eq!(
            write_export(t.join("sem-ext"), "y").unwrap(),
            t.join("sem-ext.html")
        );
        // ...e recusa se já existir, sem alterar o arquivo.
        std::fs::write(t.join("b.md.html"), "existente").unwrap();
        let err = write_export(t.join("b.md"), "z").unwrap_err();
        assert!(err.contains("b.md.html"), "{err}");
        assert_eq!(
            std::fs::read_to_string(t.join("b.md.html")).unwrap(),
            "existente"
        );
        let _ = std::fs::remove_dir_all(&t);
    }

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
    fn salvar_md_grava_so_o_que_o_dialogo_confirmou() {
        let t = temp("salvar-md");
        let save = |p: PathBuf, text: &str| write_picked(p, text, MD_EXTS, "existe {path}");
        // Nome com extensão Markdown veio do diálogo, que confirmou sobrescrever.
        std::fs::write(t.join("a.md"), "velho").unwrap();
        assert_eq!(save(t.join("a.md"), "novo").unwrap(), t.join("a.md"));
        assert_eq!(std::fs::read_to_string(t.join("a.md")).unwrap(), "novo");
        assert_eq!(
            save(t.join("b.MARKDOWN"), "x").unwrap(),
            t.join("b.MARKDOWN")
        );
        // Sem extensão (ou outra): ganha `.md` e é criado.
        assert_eq!(save(t.join("nota"), "oi").unwrap(), t.join("nota.md"));
        assert_eq!(std::fs::read_to_string(t.join("nota.md")).unwrap(), "oi");
        assert_eq!(save(t.join("n.txt"), "oi").unwrap(), t.join("n.txt.md"));
        // O `.md` acrescentado já existe: recusa e não toca.
        std::fs::write(t.join("outra.md"), "intacto").unwrap();
        let err = save(t.join("outra"), "x").unwrap_err();
        assert_eq!(err, format!("existe {}", t.join("outra.md").display()));
        assert_eq!(
            std::fs::read_to_string(t.join("outra.md")).unwrap(),
            "intacto"
        );
        #[cfg(unix)]
        {
            std::fs::write(t.join("alvo.txt"), "alvo").unwrap();
            std::os::unix::fs::symlink(t.join("alvo.txt"), t.join("link.md")).unwrap();
            assert!(save(t.join("link"), "x").is_err());
            assert_eq!(std::fs::read_to_string(t.join("alvo.txt")).unwrap(), "alvo");
        }
        let _ = std::fs::remove_dir_all(&t);
    }

    #[cfg(unix)]
    #[test]
    fn exportar_nao_segue_symlink_no_nome_acrescentado() {
        let t = temp("export-symlink");
        std::fs::write(t.join("alvo.txt"), "intocado").unwrap();
        std::os::unix::fs::symlink(t.join("alvo.txt"), t.join("c.html")).unwrap();
        assert!(write_export(t.join("c"), "z").is_err());
        assert_eq!(
            std::fs::read_to_string(t.join("alvo.txt")).unwrap(),
            "intocado"
        );
        let _ = std::fs::remove_dir_all(&t);
    }

    #[test]
    fn exportar_so_a_partir_de_documento_concedido() {
        let t = temp("export-grant");
        std::fs::create_dir_all(t.join("docs")).unwrap();
        std::fs::create_dir_all(t.join("outra")).unwrap();
        std::fs::write(t.join("docs/nota.md"), "# x").unwrap();
        std::fs::write(t.join("outra/solta.md"), "# y").unwrap();
        std::fs::write(t.join("outra/a.png"), "png").unwrap();
        let grants = vec![fs_canon(&t.join("docs/nota.md"))];
        let docs = t.join("docs").to_string_lossy().into_owned();
        let outra = t.join("outra").to_string_lossy().into_owned();
        // Origem do diálogo de salvar: só documento concedido.
        let (dir, name) =
            export_source(&grants, &t.join("docs/nota.md").to_string_lossy()).unwrap();
        assert_eq!(dir, Some(fs_canon(&t.join("docs"))));
        assert_eq!(name, "nota.html");
        assert!(export_source(&grants, &t.join("outra/solta.md").to_string_lossy()).is_err());
        // Imagens: só da pasta de documento concedido.
        assert!(export_images_in(&grants, &outra, vec!["a.png".into()], 1024).is_err());
        let ok = export_images_in(&grants, &docs, vec!["../outra/a.png".into()], 1024).unwrap();
        // `..` vale como no asset protocol (herdado de `asset_candidate`).
        assert!(ok["../outra/a.png"].data.is_some());
        let _ = std::fs::remove_dir_all(&t);
    }

    #[cfg(unix)]
    #[test]
    fn exportar_imagem_por_symlink_decide_pelo_alvo() {
        let t = temp("export-img-link");
        std::fs::create_dir_all(t.join("docs")).unwrap();
        std::fs::write(t.join("foto.png"), "png").unwrap();
        std::fs::write(t.join("segredo.txt"), "s").unwrap();
        std::os::unix::fs::symlink(t.join("foto.png"), t.join("docs/link.png")).unwrap();
        std::os::unix::fs::symlink(t.join("segredo.txt"), t.join("docs/disfarce.png")).unwrap();
        let d = t.join("docs");
        // Segue o link, mas o alvo canônico precisa ser imagem: `.txt` com nome `.png` não entra.
        assert!(export_image(&d, "link.png", 1024).data.is_some());
        assert_eq!(export_image(&d, "disfarce.png", 1024).data, None);
        let _ = std::fs::remove_dir_all(&t);
    }

    #[test]
    fn documento_so_pede_caminho_relativo() {
        // Alvos absolutos EXISTEM e têm extensão certa: só a guarda pode recusá-los.
        let t = temp("relativo");
        std::fs::create_dir_all(t.join("sub")).unwrap();
        let doc = t.join("sub/doc.md");
        std::fs::write(&doc, "").unwrap();
        std::fs::write(t.join("irma.md"), "").unwrap();
        std::fs::write(t.join("a.png"), "").unwrap();
        let fora = temp("relativo-fora");
        let fora_md = fora.join("segredo.md");
        let fora_png = fora.join("foto.png");
        std::fs::write(&fora_md, "").unwrap();
        std::fs::write(&fora_png, "").unwrap();
        let state = AppState::default();
        grant(&state, &doc).unwrap();
        let sub = t.join("sub");
        let sub_s = sub.to_string_lossy().into_owned();

        for ok in ["../irma.md", "./a.png", "a.png", "x\\y.png", "~/x.md"] {
            assert!(relative_only(ok).is_ok(), "{ok} é relativo");
        }
        for abs in [
            "/etc/hosts",
            "\\\\attacker\\share\\x.md",
            "\\x",
            "C:\\x",
            "C:x",
            "d:x.png",
            "//servidor/x",
            "\\\\?\\C:\\x",
        ] {
            assert!(relative_only(abs).is_err(), "{abs} tem raiz ou drive");
        }

        // Os três pontos de aplicação recusam um alvo absoluto que existe.
        let md_abs = fora_md.to_string_lossy().into_owned();
        let png_abs = fora_png.to_string_lossy().into_owned();
        let md_sem_ext = md_abs.trim_end_matches(".md").to_string();
        assert!(asset_candidate(&sub, &png_abs).is_none(), "imagem absoluta");
        assert_eq!(
            resolve_wikilink(&sub, None, &md_sem_ext),
            None,
            "wikilink absoluto"
        );
        let e = resolve_rel(&state, &sub_s, &md_abs).unwrap_err();
        assert!(e.contains("absoluto"), "{e}");
        assert!(!state.granted.lock().unwrap().contains(&fs_canon(&fora_md)));

        // E aceitam o relativo, inclusive subindo um nível.
        assert!(asset_candidate(&sub, "../a.png").is_some());
        assert!(resolve_wikilink(&sub, None, "../irma").is_some());
        assert_eq!(
            resolve_rel(&state, &sub_s, "../irma.md").unwrap(),
            fs_canon(&t.join("irma.md"))
        );
        assert_eq!(
            resolve_rel(&state, &sub_s, "nao-existe.md").unwrap_err(),
            "Não encontrado: nao-existe.md"
        );
        let _ = std::fs::remove_dir_all(&t);
        let _ = std::fs::remove_dir_all(&fora);
    }

    #[test]
    fn lista_de_concessoes_tem_teto_e_sem_duplicata() {
        let t = temp("max");
        let state = AppState::default();
        for i in 0..(GRANTS_MAX + 5) {
            let f = t.join(format!("{i}.md"));
            std::fs::write(&f, "").unwrap();
            grant(&state, &f).unwrap();
        }
        let first = t.join("0.md");
        grant(&state, &first).unwrap();
        let g = state.granted.lock().unwrap();
        assert_eq!(g.len(), GRANTS_MAX);
        assert_eq!(g.iter().filter(|p| p.ends_with("0.md")).count(), 1);
        drop(g);
        let _ = std::fs::remove_dir_all(&t);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

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

    #[test]
    fn decode_text_trata_bom_utf16_e_utf8_invalido() {
        assert_eq!(
            decode_text("# oi".as_bytes()).unwrap(),
            ("# oi".into(), None)
        );
        assert_eq!(decode_text(b"\xEF\xBB\xBF# oi").unwrap().0, "# oi");
        let le: Vec<u8> = [0xFF, 0xFE]
            .into_iter()
            .chain("# é".encode_utf16().flat_map(u16::to_le_bytes))
            .collect();
        assert_eq!(decode_text(&le).unwrap(), ("# é".into(), None));
        let be: Vec<u8> = [0xFE, 0xFF]
            .into_iter()
            .chain("# é".encode_utf16().flat_map(u16::to_be_bytes))
            .collect();
        assert_eq!(decode_text(&be).unwrap().0, "# é");
        let (s, w) = decode_text(b"caf\xE9 latin-1").unwrap();
        assert_eq!(s, "caf\u{FFFD} latin-1");
        assert!(w.unwrap().contains("UTF-8"));
        assert!(decode_text(b"PNG\x00\x01\x02").is_err());
    }

    #[test]
    fn read_text_file_recusa_arquivo_grande_demais() {
        let t = TempDir::new("grande");
        let p = t.0.join("g.md");
        let f = fs::File::create(&p).unwrap();
        f.set_len(MAX_DOC_BYTES + 1).unwrap();
        let e = read_text_file(&p).unwrap_err();
        assert!(e.contains("grande demais"), "{e}");
        fs::write(&p, "# ok").unwrap();
        assert_eq!(read_text_file(&p).unwrap().0, "# ok");
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
    fn debounce_cresce_com_o_tamanho_do_arquivo() {
        let ms = |b: u64| debounce_for(b).as_millis();
        assert_eq!(ms(0), 150);
        assert_eq!(ms(200 * 1024), 150, "até 200 KB fica como era");
        assert_eq!(ms(200 * 1024 + 1), 500);
        assert_eq!(ms(1024 * 1024), 500);
        assert_eq!(ms(1024 * 1024 + 1), 1000);
        assert_eq!(ms(5 * 1024 * 1024), 1000);
        assert_eq!(ms(5 * 1024 * 1024 + 1), 2000);
        assert_eq!(ms(20 * 1024 * 1024), 2000);
    }

    #[test]
    fn vigia_so_e_trocado_quando_arquivo_ou_espera_mudam() {
        let a = PathBuf::from("/a.md");
        let b = PathBuf::from("/b.md");
        let ms = Duration::from_millis;
        assert_eq!(
            watch_decision(None, &a, ms(150)),
            WatchDecision::Replace { renotify: false }
        );
        assert_eq!(
            watch_decision(Some(&(a.clone(), ms(150))), &a, ms(150)),
            WatchDecision::Keep,
            "recarga do mesmo arquivo não perde o evento pendente"
        );
        assert_eq!(
            watch_decision(Some(&(a.clone(), ms(150))), &a, ms(500)),
            WatchDecision::Replace { renotify: true },
            "cruzou um degrau: troca e avisa uma vez"
        );
        assert_eq!(
            watch_decision(Some(&(a.clone(), ms(150))), &b, ms(150)),
            WatchDecision::Replace { renotify: false },
            "outro documento: troca sem avisar"
        );
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
    fn first_markdown_arg_pula_binario_e_exige_arquivo_existente() {
        let t = TempDir::new("argv");
        let real = t.file("doc.md", "# oi");
        let argv = |xs: &[&str]| xs.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        let real_s = real.to_string_lossy().into_owned();
        let elsewhere = Path::new("/");
        assert_eq!(
            first_markdown_arg(&argv(&["leve", &real_s]), elsewhere),
            Some(real.clone())
        );
        assert_eq!(
            first_markdown_arg(&argv(&["leve", "--flag", &real_s]), elsewhere),
            Some(real.clone())
        );
        assert_eq!(
            first_markdown_arg(&argv(&[&real_s]), elsewhere),
            None,
            "argv[0] é o binário"
        );
        assert_eq!(
            first_markdown_arg(&argv(&["leve", "/nao/existe.md"]), elsewhere),
            None
        );
        let txt = t.file("x.txt", "");
        assert_eq!(
            first_markdown_arg(&argv(&["leve", &txt.to_string_lossy()]), elsewhere),
            None
        );
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

    #[test]
    fn caminho_relativo_do_terminal_vale_a_partir_da_pasta_de_quem_chamou() {
        // `leve doc.md` e `leve ../outra/doc.md` num terminal: a 2ª instância repassa a pasta
        // dela (single-instance), que não é a do app já aberto.
        let t = TempDir::new("argv-rel");
        let doc = t.file("proj/doc.md", "# oi");
        t.file("outra/x.md", "");
        let argv = |xs: &[&str]| xs.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        let proj = t.0.join("proj");
        let got = first_markdown_arg(&argv(&["leve", "doc.md"]), &proj).unwrap();
        assert_eq!(
            fs::canonicalize(got).unwrap(),
            fs::canonicalize(&doc).unwrap()
        );
        let up = first_markdown_arg(&argv(&["leve", "../outra/x.md"]), &proj).unwrap();
        assert!(up.ends_with("proj/../outra/x.md") && up.is_file());
        assert_eq!(
            first_markdown_arg(&argv(&["leve", "doc.md"]), &t.0),
            None,
            "na pasta errada, não acha"
        );
        // O caminho resolvido é concedido como qualquer abertura vinda do SO.
        let state = AppState::default();
        let c = grant(
            &state,
            &first_markdown_arg(&argv(&["leve", "doc.md"]), &proj).unwrap(),
        )
        .unwrap();
        assert!(granted(&state, &doc.to_string_lossy()).is_ok());
        assert_eq!(c, fs::canonicalize(&doc).unwrap());
    }

    #[test]
    fn resolve_wikilink_na_pasta_do_documento() {
        let t = TempDir::new("wiki-dir");
        let nota = t.file("nota.md", "");
        t.file("sub/outra.markdown", "");
        let dir = &t.0;
        let canon = |p: &Path| fs::canonicalize(p).unwrap().to_string_lossy().into_owned();
        assert_eq!(resolve_wikilink(dir, None, "nota"), Some(canon(&nota)));
        assert_eq!(resolve_wikilink(dir, None, "nota.md"), Some(canon(&nota)));
        assert_eq!(
            resolve_wikilink(dir, None, "sub/outra.markdown"),
            Some(canon(&dir.join("sub/outra.markdown")))
        );
        assert_eq!(resolve_wikilink(dir, None, "inexistente"), None);
        assert_eq!(
            resolve_wikilink(dir, None, "outra"),
            None,
            "sem root não desce em subpastas"
        );
    }

    #[test]
    fn resolve_wikilink_busca_recursiva_na_raiz() {
        let t = TempDir::new("wiki-root");
        let dir = t.0.join("docs");
        fs::create_dir_all(&dir).unwrap();
        let alvo = t.file("vault/pasta/Profunda/Nota Alvo.md", "");
        t.file("vault/.obsidian/Nota Alvo.md", "");
        t.file("vault/node_modules/Nota Alvo.md", "");
        let canon = |p: &Path| fs::canonicalize(p).unwrap().to_string_lossy().into_owned();
        assert_eq!(
            resolve_wikilink(&dir, Some(&t.0.join("vault")), "nota alvo"),
            Some(canon(&alvo)),
            "nome sem distinguir caixa, ignorando .obsidian e node_modules"
        );
        assert_eq!(
            resolve_wikilink(&dir, Some(&t.0.join("vault")), "nada"),
            None
        );
    }

    #[test]
    fn find_file_by_name_prefere_pasta_rasa() {
        let t = TempDir::new("rasa");
        let raso = t.file("b/x.md", "");
        t.file("a/fundo/x.md", "");
        let canon = fs::canonicalize(&raso)
            .unwrap()
            .to_string_lossy()
            .into_owned();
        assert_eq!(find_file_by_name(&t.0, "x.md"), Some(canon));
    }
}

#[cfg(test)]
mod bench_tests {
    use super::*;

    #[test]
    fn linha_do_bench_e_json_numa_linha() {
        let m = vec![BenchMeasure {
            name: "leve:render".into(),
            ms: 12.5,
            end: 40.0,
        }];
        let line = bench_line(
            "/tmp/a\nb.md",
            "paint",
            340.25,
            1_700_000_000_123,
            210.0,
            &m,
        );
        assert!(line.starts_with("LEVE_BENCH {"));
        assert!(
            !line.contains('\n'),
            "quebra de linha no caminho vira escape"
        );
        let v: serde_json::Value = serde_json::from_str(&line["LEVE_BENCH ".len()..]).unwrap();
        assert_eq!(v["doc"], "/tmp/a\nb.md");
        assert_eq!(v["phase"], "paint");
        assert_eq!(v["epochMs"], 1_700_000_000_123u64);
        assert_eq!(v["runMs"], 340.25);
        assert_eq!(v["pageMs"], 210.0);
        assert_eq!(v["measures"][0]["name"], "leve:render");
        assert_eq!(v["measures"][0]["ms"], 12.5);
        assert_eq!(v["measures"][0]["end"], 40.0);
    }

    #[test]
    fn so_o_valor_1_arma() {
        use std::ffi::OsStr;
        assert!(bench_flag(Some(OsStr::new("1"))));
        assert!(!bench_flag(Some(OsStr::new("0"))));
        assert!(!bench_flag(Some(OsStr::new(""))));
        assert!(!bench_flag(Some(OsStr::new("true"))));
        assert!(!bench_flag(None));
    }

    #[test]
    fn sem_variavel_o_comando_recusa() {
        // O teste não define LEVE_BENCH; se o ambiente de quem roda definir, não há o que provar.
        if std::env::var_os("LEVE_BENCH").is_some() {
            return;
        }
        assert!(bench_report("x.md".into(), "layout".into(), 0.0, vec![]).is_err());
    }
}
