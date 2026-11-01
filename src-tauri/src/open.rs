//! Abertura de arquivo pedida pelo SO: argv (Windows/Linux, 1ª instância), `single-instance`
//! (2ª instância) e `RunEvent::Opened` (macOS). Tudo passa pela fila `pending_open`, e cada arquivo
//! sai dela uma vez só: `launch_open` entrega o que chegou na abertura e `take_open` o que chegou
//! depois, a cada aviso `open-file`.

use std::{
    path::{Path, PathBuf},
    time::{Duration, Instant},
};

use tauri::{AppHandle, Emitter, Manager, State};

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

/// Espera a abertura assentar (ou `max`) e devolve os arquivos pedidos pelo SO, em ordem. Dorme
/// até o prazo (fim da folga ou teto) e só acorda antes por `notify_all` de `mark_ready` ou
/// `queue_open`: sem o aviso, um arquivo tardio esperaria a folga inteira.
fn wait_launch(state: &AppState, grace: Duration, max: Duration) -> Vec<String> {
    let start = Instant::now();
    let mut ready = state.ready_at.lock().unwrap();
    loop {
        let now = Instant::now();
        let has_file = !state.pending_open.lock().unwrap().is_empty();
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
    take_pending(state)
}

fn take_pending(state: &AppState) -> Vec<String> {
    std::mem::take(&mut *state.pending_open.lock().unwrap())
}

/// Concede o arquivo pedido pelo SO, põe na fila e acorda quem espera a abertura (`wait_launch`).
/// Única entrada da fila: nada chega ao frontend sem concessão. `false` se a concessão recusar.
pub fn queue_open(state: &AppState, path: &Path) -> bool {
    let Ok(c) = grant(state, path) else {
        return false;
    };
    state
        .pending_open
        .lock()
        .unwrap()
        .push(c.to_string_lossy().into_owned());
    state.launch_cv.notify_all();
    true
}

pub fn mark_ready(state: &AppState) {
    state
        .ready_at
        .lock()
        .unwrap()
        .get_or_insert_with(Instant::now);
    state.launch_cv.notify_all();
}

/// Arquivos que o SO pediu na abertura (argv, duplo-clique), depois de a abertura assentar.
/// Vazio quer dizer abertura direta (ícone, Dock, menu Iniciar) ou recarga da página: o
/// frontend decide entre abas salvas, documento de exemplo e estado vazio. Arquivo que chegar
/// depois disto sai por `take_open`. Espera fora da thread principal, que entrega os eventos
/// do SO.
#[tauri::command]
pub async fn launch_open(app: AppHandle) -> Vec<String> {
    tauri::async_runtime::spawn_blocking(move || {
        wait_launch(&app.state::<AppState>(), LAUNCH_GRACE, LAUNCH_WAIT_MAX)
    })
    .await
    .unwrap_or_default()
}

/// Arquivos que chegaram desde a última entrega, em ordem. O frontend chama ao receber o aviso
/// `open-file`, que não leva caminho: quem entrega é a fila.
#[tauri::command]
pub fn take_open(state: State<AppState>) -> Vec<String> {
    take_pending(&state)
}

/// Abertura vinda do SO (duplo-clique, segunda instância): concede e avisa o frontend.
pub fn request_open(app: &AppHandle, path: PathBuf) {
    let Some(state) = app.try_state::<AppState>() else {
        return;
    };
    if !queue_open(&state, &path) {
        return;
    }
    let _ = app.emit("open-file", ());
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.set_focus();
    }
}

/// Argumentos que são `.md` existente, na ordem. Relativo vale a partir de `cwd`, a pasta de quem
/// chamou (`leve README.md` no terminal): na 1ª instância é a do próprio processo; na 2ª vem do
/// plugin single-instance, porque a instância que já está aberta tem outra pasta atual (`/`
/// quando aberta pelo Finder).
pub fn markdown_args(argv: &[String], cwd: &Path) -> Vec<PathBuf> {
    argv.iter()
        .skip(1)
        .map(|a| cwd.join(a))
        .filter(|p| is_markdown(p) && p.exists())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::grants::{canonical, granted};
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
        let t = TempDir::new("tarde");
        let doc = t.file("tarde.md", "# oi");
        let esperado = canonical(&doc.to_string_lossy()).unwrap();
        let state = std::sync::Arc::new(AppState::default());
        mark_ready(&state);
        let s2 = state.clone();
        let late = std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(80));
            assert!(queue_open(&s2, &doc));
        });
        let t0 = Instant::now();
        let got = wait_launch(&state, Duration::from_secs(5), Duration::from_secs(10));
        let waited = t0.elapsed();
        late.join().unwrap();
        assert_eq!(got, [esperado.to_string_lossy()]);
        assert!(
            waited < Duration::from_secs(1),
            "acordou pelo aviso, não pelo prazo: {waited:?}"
        );
        assert!(take_pending(&state).is_empty(), "entregue uma vez só");
    }

    #[test]
    fn varios_arquivos_na_abertura_chegam_todos_e_na_ordem() {
        // `open -a Leve a.md b.md`: cada `RunEvent::Opened` chega antes de o frontend perguntar.
        let t = TempDir::new("fila");
        let docs: Vec<_> = ["a.md", "b.md", "c.md"]
            .map(|n| t.file(n, "# oi"))
            .into_iter()
            .collect();
        let state = AppState::default();
        for d in &docs {
            assert!(queue_open(&state, d));
        }
        mark_ready(&state);
        let esperado: Vec<_> = docs
            .iter()
            .map(|d| {
                canonical(&d.to_string_lossy())
                    .unwrap()
                    .to_string_lossy()
                    .into_owned()
            })
            .collect();
        assert_eq!(wait_launch(&state, GRACE, Duration::from_secs(2)), esperado);
        // Recarga da página pergunta de novo: nada volta.
        assert!(wait_launch(&state, Duration::ZERO, Duration::from_secs(2)).is_empty());
    }

    #[test]
    fn arquivo_depois_da_abertura_sai_uma_vez_e_nao_volta_na_recarga() {
        let t = TempDir::new("depois");
        let a = t.file("a.md", "# oi");
        let b = t.file("b.md", "# oi");
        let state = AppState::default();
        assert!(queue_open(&state, &a));
        assert!(queue_open(&state, &b));
        assert_eq!(take_pending(&state).len(), 2);
        assert!(take_pending(&state).is_empty());
        mark_ready(&state);
        assert!(wait_launch(&state, Duration::ZERO, Duration::from_secs(2)).is_empty());
    }

    #[test]
    fn so_entra_na_fila_o_que_foi_concedido() {
        let t = TempDir::new("concessao");
        let doc = t.file("doc.md", "# oi");
        let state = AppState::default();
        assert!(!queue_open(&state, &t.0.join("nao-existe.md")));
        assert!(take_pending(&state).is_empty());
        assert!(queue_open(&state, &doc));
        for p in take_pending(&state) {
            assert!(granted(&state, &p).is_ok());
        }
    }

    #[test]
    fn sem_arquivo_devolve_nada_apos_a_folga_e_o_teto_vale_sem_ready() {
        let state = AppState::default();
        mark_ready(&state);
        let t = Instant::now();
        assert!(wait_launch(&state, Duration::from_millis(60), Duration::from_secs(2)).is_empty());
        assert!(t.elapsed() >= Duration::from_millis(60));
        let sem_ready = AppState::default();
        let t = Instant::now();
        assert!(wait_launch(&sem_ready, GRACE, Duration::from_millis(80)).is_empty());
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
    fn markdown_args_pula_binario_e_exige_arquivo_existente() {
        let t = TempDir::new("argv");
        let real = t.file("doc.md", "# oi");
        let argv = |xs: &[&str]| xs.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        let real_s = real.to_string_lossy().into_owned();
        let elsewhere = Path::new("/");
        assert_eq!(
            markdown_args(&argv(&["leve", &real_s]), elsewhere),
            std::slice::from_ref(&real)
        );
        assert_eq!(
            markdown_args(&argv(&["leve", "--flag", &real_s]), elsewhere),
            std::slice::from_ref(&real)
        );
        assert!(
            markdown_args(&argv(&[&real_s]), elsewhere).is_empty(),
            "argv[0] é o binário"
        );
        assert!(markdown_args(&argv(&["leve", "/nao/existe.md"]), elsewhere).is_empty());
        let txt = t.file("x.txt", "");
        assert!(markdown_args(&argv(&["leve", &txt.to_string_lossy()]), elsewhere).is_empty());
    }

    #[test]
    fn markdown_args_pega_todos_na_ordem() {
        // `.desktop` com `%F` e `leve a.md b.md` mandam tudo num argv só.
        let t = TempDir::new("argv-varios");
        let a = t.file("a.md", "# a");
        let b = t.file("b.md", "# b");
        let txt = t.file("x.txt", "");
        let argv: Vec<String> = ["leve".as_ref(), b.as_path(), txt.as_path(), a.as_path()]
            .iter()
            .map(|p: &&Path| p.to_string_lossy().into_owned())
            .collect();
        assert_eq!(markdown_args(&argv, Path::new("/")), [b, a]);
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
        let got = markdown_args(&argv(&["leve", "doc.md"]), &proj).remove(0);
        assert_eq!(
            fs::canonicalize(got).unwrap(),
            fs::canonicalize(&doc).unwrap()
        );
        let up = markdown_args(&argv(&["leve", "../outra/x.md"]), &proj).remove(0);
        assert!(up.ends_with("proj/../outra/x.md") && up.is_file());
        assert!(
            markdown_args(&argv(&["leve", "doc.md"]), &t.0).is_empty(),
            "na pasta errada, não acha"
        );
        // O caminho resolvido é concedido como qualquer abertura vinda do SO.
        let state = AppState::default();
        let c = grant(&state, &markdown_args(&argv(&["leve", "doc.md"]), &proj)[0]).unwrap();
        assert!(granted(&state, &doc.to_string_lossy()).is_ok());
        assert_eq!(c, crate::grants::canonical(&doc.to_string_lossy()).unwrap());
    }
}
