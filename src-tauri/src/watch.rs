//! Vigia do arquivo aberto: observa a pasta e emite `file-changed`, com espera pelo tamanho do
//! arquivo. O frontend recarrega por `reloadCurrent`.

use std::{
    path::{Path, PathBuf},
    time::{Duration, SystemTime},
};

use notify_debouncer_mini::{DebouncedEvent, new_debouncer, notify::RecursiveMode};
use tauri::{AppHandle, Emitter, State};

use crate::{
    AppState,
    grants::{granted, os_path},
    i18n,
};

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

/// Identidade do arquivo no disco além de mtime e tamanho. Unix: (inode, ctime s, ctime ns). O ctime
/// não é restaurado por `cp -p`/`rsync -t` (mexem só no mtime) e o inode muda quando um editor troca o
/// arquivo por rename; ler não muda nenhum dos dois. Fora do Unix não há valor equivalente barato.
#[cfg(unix)]
type FileId = (u64, i64, i64);
#[cfg(not(unix))]
type FileId = ();

/// Impressão digital do arquivo: (mtime, tamanho, identidade). `None` = o arquivo não está lá.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct Stamp {
    mtime: SystemTime,
    len: u64,
    id: FileId,
}
type Fingerprint = Option<Stamp>;

/// No Linux o `notify` assina `OPEN` e entrega `Access(Open)`, e o `notify-debouncer-mini` joga fora o
/// tipo do evento: ler o arquivo (a própria recarga) parecia mudança e virava um laço de recarga a cada
/// ~200 ms (#107). Só o Linux filtra porque só nele o bug existe: no macOS e no Windows não há evento
/// de abertura, e filtrar lá só acrescentaria o risco de perder um salvamento.
const FILTER_READS: bool = cfg!(target_os = "linux");

fn fingerprint(path: &Path) -> Fingerprint {
    let m = std::fs::metadata(path).ok()?;
    #[cfg(unix)]
    let id = {
        use std::os::unix::fs::MetadataExt;
        (m.ino(), m.ctime(), m.ctime_nsec())
    };
    #[cfg(not(unix))]
    let id = ();
    Some(Stamp {
        mtime: m.modified().unwrap_or(SystemTime::UNIX_EPOCH),
        len: m.len(),
        id,
    })
}

/// Decide, a cada evento do alvo, se vira `file-changed`. Com o filtro ligado só avisa se a impressão
/// digital mudou desde a observação anterior, e SEMPRE guarda a nova: sem isso, o `OPEN` da recarga
/// que o próprio salvamento provoca pareceria outra mudança (o laço voltaria depois do primeiro
/// salvamento). Rename atômico não expõe `None`: quem avisa é a impressão (inode, ctime, mtime);
/// arquivo que some e volta também conta como mudança.
struct ChangeFilter {
    enabled: bool,
    last: Fingerprint,
}

impl ChangeFilter {
    fn new(enabled: bool, initial: Fingerprint) -> Self {
        Self {
            enabled,
            last: initial,
        }
    }

    fn observe(&mut self, now: Fingerprint) -> bool {
        let changed = self.last != now;
        // MUTACAO TEMPORARIA: sem guardar o estado visto
        !self.enabled || changed
    }
}

/// Observa a pasta do arquivo (não o arquivo: editores salvam via rename) e emite
/// `file-changed` quando o alvo muda. A espera depende do tamanho do arquivo no momento
/// (`debounce_for`); como cada recarga chama `watch_file` de novo, ela acompanha o arquivo
/// crescendo, e `watch_decision` evita recriar o vigia à toa.
#[tauri::command]
pub fn watch_file(app: AppHandle, state: State<AppState>, path: String) -> Result<(), String> {
    let target = granted(&state, &path)?;
    // O `notify` chama o Win32 direto: caminho longo só abre na forma com `\\?\`.
    let os_target = os_path(&target)?;
    let dir = os_target
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
    let t2 = os_target;
    let app2 = app.clone();
    // A impressão inicial é a do momento em que o vigia nasce.
    let mut filter = ChangeFilter::new(FILTER_READS, fingerprint(&t2));
    let mut debouncer = new_debouncer(
        debounce,
        move |res: Result<Vec<DebouncedEvent>, notify::Error>| {
            if let Ok(events) = res
                && events.iter().any(|e| e.path == t2)
                && filter.observe(fingerprint(&t2))
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

#[cfg(test)]
mod tests {
    use super::*;

    fn at(secs: u64) -> SystemTime {
        SystemTime::UNIX_EPOCH + Duration::from_secs(secs)
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

    fn stamp(mtime: u64, len: u64) -> Fingerprint {
        Some(Stamp {
            mtime: at(mtime),
            len,
            id: Default::default(),
        })
    }

    #[test]
    fn leitura_sem_mudanca_nao_avisa_no_linux() {
        let mut f = ChangeFilter::new(true, stamp(10, 100));
        assert!(!f.observe(stamp(10, 100)), "OPEN da própria recarga");
        let mut ausente = ChangeFilter::new(true, None);
        assert!(!ausente.observe(None), "ainda ausente");
    }

    #[test]
    fn mudanca_de_tamanho_ou_de_mtime_avisa() {
        let mut f = ChangeFilter::new(true, stamp(10, 100));
        assert!(f.observe(stamp(10, 101)), "tamanho");
        assert!(f.observe(stamp(11, 101)), "mtime com tamanho igual");
        assert!(!f.observe(stamp(11, 101)));
    }

    #[test]
    fn sequencia_salvar_e_recarregar_nao_vira_laco() {
        // A: estado inicial. Leitura de A não avisa; mudança para B avisa; a leitura de B (o OPEN da
        // recarga que o salvamento provocou) NÃO avisa; a volta para A avisa.
        let (a, b) = (stamp(10, 100), stamp(20, 120));
        let mut f = ChangeFilter::new(true, a);
        assert!(!f.observe(a), "leitura de A");
        assert!(f.observe(b), "mudança para B");
        assert!(
            !f.observe(b),
            "leitura de B pela recarga: o estado novo foi guardado"
        );
        assert!(f.observe(a), "volta para A");
        assert!(!f.observe(a));
    }

    #[test]
    fn arquivo_que_some_e_que_volta_avisa() {
        let a = stamp(10, 100);
        let mut f = ChangeFilter::new(true, a);
        assert!(f.observe(None), "sumiu");
        assert!(f.observe(a), "voltou igual ao que era");
        assert!(!f.observe(a));
    }

    #[test]
    fn identidade_diferente_avisa_com_mtime_e_tamanho_iguais() {
        let a = stamp(10, 100);
        #[cfg(unix)]
        let outro = Stamp {
            id: (7, 1, 2),
            ..a.unwrap()
        };
        #[cfg(not(unix))]
        let outro = a.unwrap();
        let mut f = ChangeFilter::new(true, a);
        assert_eq!(
            f.observe(Some(outro)),
            cfg!(unix),
            "rename de arquivo igual"
        );
    }

    #[test]
    fn fora_do_linux_todo_evento_avisa() {
        let a = stamp(10, 100);
        let mut f = ChangeFilter::new(false, a);
        assert!(f.observe(a));
        assert!(f.observe(a));
        assert!(f.observe(None));
        assert!(f.observe(None));
    }

    fn pasta(nome: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("leve-watch-{nome}-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn impressao_digital_le_o_disco() {
        let dir = pasta("le");
        let p = dir.join("a.md");
        assert_eq!(fingerprint(&p), None);
        std::fs::write(&p, "um").unwrap();
        let um = fingerprint(&p);
        assert_eq!(um.map(|s| s.len), Some(2));
        std::fs::write(&p, "três").unwrap();
        assert_ne!(fingerprint(&p), um, "tamanho novo");
        std::fs::remove_file(&p).unwrap();
        assert_eq!(fingerprint(&p), None);
        std::fs::remove_dir(&dir).unwrap();
    }

    #[test]
    fn ler_o_arquivo_nao_muda_a_impressao() {
        let dir = pasta("leitura");
        let p = dir.join("a.md");
        std::fs::write(&p, "texto").unwrap();
        let antes = fingerprint(&p);
        let _ = std::fs::read_to_string(&p).unwrap();
        assert_eq!(fingerprint(&p), antes);
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn mesmo_tamanho_com_mtime_restaurado_muda_a_impressao() {
        let dir = pasta("mtime");
        let p = dir.join("a.md");
        std::fs::write(&p, "aaaa").unwrap();
        let antes = fingerprint(&p).unwrap();
        // O ctime avança com o relógio do disco: dá folga para o tick (hipótese medida só aqui).
        std::thread::sleep(Duration::from_millis(50));
        std::fs::write(&p, "bbbb").unwrap();
        std::fs::File::options()
            .write(true)
            .open(&p)
            .unwrap()
            .set_modified(antes.mtime)
            .unwrap();
        let depois = fingerprint(&p).unwrap();
        assert_eq!((depois.mtime, depois.len), (antes.mtime, antes.len));
        assert_ne!(Some(depois), Some(antes), "o ctime não é restaurado");

        // Rename por cima, com mtime preservado e mesmo tamanho: o inode muda.
        let lateral = dir.join("a.md.novo");
        std::fs::write(&lateral, "cccc").unwrap();
        std::fs::File::options()
            .write(true)
            .open(&lateral)
            .unwrap()
            .set_modified(antes.mtime)
            .unwrap();
        std::fs::rename(&lateral, &p).unwrap();
        let renomeado = fingerprint(&p).unwrap();
        assert_eq!((renomeado.mtime, renomeado.len), (antes.mtime, antes.len));
        assert_ne!(renomeado, depois, "rename com mtime preservado");
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
