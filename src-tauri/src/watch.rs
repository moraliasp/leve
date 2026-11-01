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

/// Impressão digital do arquivo: (mtime, tamanho). `None` = o arquivo não está lá.
type Fingerprint = Option<(SystemTime, u64)>;

/// No Linux o `notify` assina `OPEN` e entrega `Access(Open)`, e o `notify-debouncer-mini` joga fora o
/// tipo do evento: ler o arquivo (a própria recarga) parecia mudança e virava um laço de recarga a cada
/// ~200 ms (#107). Só o Linux filtra: no macOS e no Windows não há evento de abertura, e num disco de
/// mtime grosso (FAT, 2 s) filtrar poderia perder um salvamento de mesmo tamanho.
const FILTER_READS: bool = cfg!(target_os = "linux");

fn fingerprint(path: &Path) -> Fingerprint {
    let m = std::fs::metadata(path).ok()?;
    Some((m.modified().unwrap_or(SystemTime::UNIX_EPOCH), m.len()))
}

/// Decide se o evento do alvo vira `file-changed`. Com o filtro ligado, só se a impressão digital
/// mudou desde a última vez; arquivo que some (`None`) e que volta contam como mudança, então salvar
/// por rename (o arquivo some e reaparece ou é trocado por outro) continua avisando.
fn should_notify(filter: bool, last: &Fingerprint, now: &Fingerprint) -> bool {
    !filter || last != now
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
    let mut last = fingerprint(&t2);
    let mut debouncer = new_debouncer(
        debounce,
        move |res: Result<Vec<DebouncedEvent>, notify::Error>| {
            if let Ok(events) = res
                && events.iter().any(|e| e.path == t2)
            {
                let now = fingerprint(&t2);
                let notify = should_notify(FILTER_READS, &last, &now);
                last = now;
                if notify {
                    let _ = app2.emit("file-changed", emit_path.clone());
                }
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

    #[test]
    fn leitura_sem_mudanca_nao_avisa_no_linux() {
        let f = Some((at(10), 100));
        assert!(!should_notify(true, &f, &f), "OPEN da própria recarga");
        assert!(!should_notify(true, &None, &None), "ainda ausente");
    }

    #[test]
    fn mudanca_de_tamanho_ou_de_mtime_avisa() {
        let antes = Some((at(10), 100));
        assert!(should_notify(true, &antes, &Some((at(10), 101))), "tamanho");
        assert!(
            should_notify(true, &antes, &Some((at(11), 100))),
            "mtime com tamanho igual"
        );
    }

    #[test]
    fn arquivo_que_some_e_que_volta_avisa() {
        let f = Some((at(10), 100));
        assert!(should_notify(true, &f, &None), "sumiu");
        assert!(should_notify(true, &None, &f), "voltou");
        assert!(
            should_notify(true, &None, &Some((at(10), 100))),
            "voltou igual ao que era"
        );
    }

    #[test]
    fn fora_do_linux_todo_evento_avisa() {
        let f = Some((at(10), 100));
        assert!(should_notify(false, &f, &f));
        assert!(should_notify(false, &None, &None));
    }

    #[test]
    fn impressao_digital_le_o_disco() {
        let dir = std::env::temp_dir().join(format!("leve-watch-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let p = dir.join("a.md");
        assert_eq!(fingerprint(&p), None);
        std::fs::write(&p, "um").unwrap();
        let um = fingerprint(&p);
        assert_eq!(um.map(|(_, n)| n), Some(2));
        std::fs::write(&p, "três").unwrap();
        assert_ne!(fingerprint(&p), um, "tamanho novo");
        std::fs::remove_file(&p).unwrap();
        assert_eq!(fingerprint(&p), None);
        std::fs::remove_dir(&dir).unwrap();
    }
}
