//! Abertura de arquivo pedida pelo SO: argv (Windows/Linux, 1ª instância), `single-instance`
//! (2ª instância) e `RunEvent::Opened` (macOS). Tudo passa por `request_open`/`pending_open`, e o
//! frontend pergunta o que chegou na abertura por `launch_open`.

use std::{
    path::{Path, PathBuf},
    time::{Duration, Instant},
};

use tauri::{AppHandle, Emitter, Manager};

use crate::{AppState, grants::grant, is_markdown};

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

pub fn mark_ready(state: &AppState) {
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
pub async fn launch_open(app: AppHandle) -> Option<String> {
    tauri::async_runtime::spawn_blocking(move || {
        wait_launch(&app.state::<AppState>(), LAUNCH_GRACE, LAUNCH_WAIT_MAX)
    })
    .await
    .ok()
    .flatten()
}

/// Abertura vinda do SO (duplo-clique, argv, segunda instância): concede e avisa o frontend.
pub fn request_open(app: &AppHandle, path: PathBuf) {
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

/// Primeiro argumento que é `.md` existente. Relativo vale a partir de `cwd`, a pasta de quem
/// chamou (`leve README.md` no terminal): na 1ª instância é a do próprio processo; na 2ª vem do
/// plugin single-instance, porque a instância que já está aberta tem outra pasta atual (`/`
/// quando aberta pelo Finder).
pub fn first_markdown_arg(argv: &[String], cwd: &Path) -> Option<PathBuf> {
    argv.iter()
        .skip(1)
        .map(|a| cwd.join(a))
        .find(|p| is_markdown(p) && p.exists())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::grants::granted;
    use std::fs;

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
        assert_eq!(c, crate::grants::canonical(&doc.to_string_lossy()).unwrap());
    }
}
