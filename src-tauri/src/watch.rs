//! Vigia do arquivo aberto: observa a pasta e emite `file-changed`, com espera pelo tamanho do
//! arquivo. O frontend recarrega por `reloadCurrent`.

use std::{
    path::{Path, PathBuf},
    time::Duration,
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

#[cfg(test)]
mod tests {
    use super::*;

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
}
