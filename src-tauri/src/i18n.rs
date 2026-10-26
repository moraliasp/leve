//! Textos do lado Rust (menu nativo e mensagens de erro) em português brasileiro e inglês.
//! O idioma começa pelo do sistema (`sys-locale`) e o frontend confirma o escolhido nas
//! Preferências por `set_locale`, que reconstrói o menu. Mesma regra de `src/i18n.ts`: qualquer
//! português vira pt-BR, o resto vira inglês. `Strings` é uma struct, então idioma sem um texto
//! não compila.

use std::sync::atomic::{AtomicU8, Ordering};

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Lang {
    Pt,
    En,
}

static LANG: AtomicU8 = AtomicU8::new(0);

/// "pt-BR", "pt_PT", "en-US"…: só o idioma conta.
pub fn parse(tag: &str) -> Lang {
    if tag.to_ascii_lowercase().starts_with("pt") {
        Lang::Pt
    } else {
        Lang::En
    }
}

pub fn system() -> Lang {
    sys_locale::get_locale().map_or(Lang::En, |l| parse(&l))
}

pub fn set(lang: Lang) {
    LANG.store(lang as u8, Ordering::Relaxed);
}

pub fn current() -> Lang {
    if LANG.load(Ordering::Relaxed) == Lang::En as u8 {
        Lang::En
    } else {
        Lang::Pt
    }
}

pub struct Strings {
    pub file: &'static str,
    pub edit: &'static str,
    pub view: &'static str,
    pub go: &'static str,
    pub help: &'static str,
    pub open: &'static str,
    pub reload: &'static str,
    pub reveal: &'static str,
    pub clear_recent: &'static str,
    pub print: &'static str,
    pub export_html: &'static str,
    pub copy_html: &'static str,
    pub find: &'static str,
    pub toc: &'static str,
    pub theme: &'static str,
    pub zoom_in: &'static str,
    pub zoom_out: &'static str,
    pub zoom_reset: &'static str,
    pub back: &'static str,
    pub forward: &'static str,
    pub close_tab: &'static str,
    pub close_window: &'static str,
    pub next_tab: &'static str,
    pub prev_tab: &'static str,
    pub shortcuts: &'static str,
    pub about: &'static str,
    pub preferences: &'static str,
    pub check_updates: &'static str,
    pub width: &'static str,
    pub width_narrow: &'static str,
    pub width_normal: &'static str,
    pub width_wide: &'static str,
    pub font: &'static str,
    pub remote: &'static str,
    pub copy: &'static str,
    pub select_all: &'static str,
    // Menu do app, só no macOS.
    #[cfg_attr(not(target_os = "macos"), allow(dead_code))]
    pub services: &'static str,
    #[cfg_attr(not(target_os = "macos"), allow(dead_code))]
    pub hide: &'static str,
    #[cfg_attr(not(target_os = "macos"), allow(dead_code))]
    pub hide_others: &'static str,
    #[cfg_attr(not(target_os = "macos"), allow(dead_code))]
    pub show_all: &'static str,
    #[cfg_attr(not(target_os = "macos"), allow(dead_code))]
    pub quit: &'static str,
    /// `{path}`: caminho recusado.
    pub denied: &'static str,
    /// `{path}`: caminho pedido pelo documento.
    pub absolute: &'static str,
    /// `{path}`: link relativo sem alvo.
    pub not_found: &'static str,
    pub binary: &'static str,
    pub not_utf8: &'static str,
    /// `{size}` e `{max}` em MB.
    pub too_big: &'static str,
    pub no_parent: &'static str,
    /// `{path}` e `{error}`: Exportar HTML não conseguiu gravar.
    pub write_failed: &'static str,
    /// `{path}`: Exportar HTML recusou criar `<nome>.html` por cima de um arquivo existente.
    pub export_exists: &'static str,
}

const PT: Strings = Strings {
    file: "Arquivo",
    edit: "Editar",
    view: "Exibir",
    go: "Ir",
    help: "Ajuda",
    open: "Abrir…",
    reload: "Recarregar",
    reveal: "Mostrar no Finder / Explorer",
    clear_recent: "Limpar recentes…",
    print: "Imprimir / Exportar PDF…",
    export_html: "Exportar HTML…",
    copy_html: "Copiar como HTML…",
    find: "Buscar…",
    toc: "Sumário",
    theme: "Alternar tema",
    zoom_in: "Aumentar",
    zoom_out: "Diminuir",
    zoom_reset: "Tamanho padrão",
    back: "Voltar",
    forward: "Avançar",
    close_tab: "Fechar aba",
    close_window: "Fechar janela",
    next_tab: "Próxima aba",
    prev_tab: "Aba anterior",
    shortcuts: "Atalhos",
    about: "Sobre o Leve",
    preferences: "Preferências…",
    check_updates: "Verificar atualizações…",
    width: "Largura",
    width_narrow: "Estreita",
    width_normal: "Padrão",
    width_wide: "Larga",
    font: "Fonte",
    remote: "Carregar imagens remotas",
    copy: "Copiar",
    select_all: "Selecionar tudo",
    services: "Serviços",
    hide: "Ocultar Leve",
    hide_others: "Ocultar outros",
    show_all: "Mostrar tudo",
    quit: "Encerrar Leve",
    denied: "Caminho não autorizado: {path}. Abra pelo diálogo, pelo Finder/Explorer, arrastando para a janela ou por um link de um documento aberto.",
    absolute: "Caminho absoluto não é permitido a partir de um documento: {path}",
    not_found: "Não encontrado: {path}",
    binary: "Não parece um arquivo de texto (tem bytes nulos).",
    not_utf8: "O arquivo não está em UTF-8: caracteres ilegíveis aparecem como �.",
    too_big: "Arquivo grande demais para abrir ({size} MB; o limite é {max} MB).",
    no_parent: "O arquivo não tem pasta.",
    write_failed: "Não foi possível gravar {path}: {error}",
    export_exists: "Já existe {path}. Para substituir, escolha um nome terminado em .html; ou escolha outro nome.",
};

const EN: Strings = Strings {
    file: "File",
    edit: "Edit",
    view: "View",
    go: "Go",
    help: "Help",
    open: "Open…",
    reload: "Reload",
    reveal: "Show in Finder / Explorer",
    clear_recent: "Clear Recent…",
    print: "Print / Export PDF…",
    export_html: "Export HTML…",
    copy_html: "Copy as HTML…",
    find: "Find…",
    toc: "Contents",
    theme: "Toggle Theme",
    zoom_in: "Zoom In",
    zoom_out: "Zoom Out",
    zoom_reset: "Actual Size",
    back: "Back",
    forward: "Forward",
    close_tab: "Close Tab",
    close_window: "Close Window",
    next_tab: "Next Tab",
    prev_tab: "Previous Tab",
    shortcuts: "Keyboard Shortcuts",
    about: "About Leve",
    preferences: "Settings…",
    check_updates: "Check for Updates…",
    width: "Width",
    width_narrow: "Narrow",
    width_normal: "Default",
    width_wide: "Wide",
    font: "Font",
    remote: "Load Remote Images",
    copy: "Copy",
    select_all: "Select All",
    services: "Services",
    hide: "Hide Leve",
    hide_others: "Hide Others",
    show_all: "Show All",
    quit: "Quit Leve",
    denied: "Path not authorized: {path}. Open it from the dialog, from Finder/Explorer, by dragging it onto the window, or through a link in an open document.",
    absolute: "A document can't refer to an absolute path: {path}",
    not_found: "Not found: {path}",
    binary: "This doesn't look like a text file (it has null bytes).",
    not_utf8: "The file isn't UTF-8: unreadable characters show as �.",
    too_big: "File too large to open ({size} MB; the limit is {max} MB).",
    no_parent: "The file has no parent folder.",
    write_failed: "Couldn't save {path}: {error}",
    export_exists: "{path} already exists. To replace it, choose a name ending in .html, or choose a different name.",
};

pub fn strings_for(lang: Lang) -> &'static Strings {
    match lang {
        Lang::Pt => &PT,
        Lang::En => &EN,
    }
}

pub fn s() -> &'static Strings {
    strings_for(current())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn idioma_pela_etiqueta() {
        for pt in ["pt-BR", "pt_PT", "PT", "pt"] {
            assert_eq!(parse(pt), Lang::Pt, "{pt}");
        }
        for en in ["en-US", "en", "de-DE", "es", ""] {
            assert_eq!(parse(en), Lang::En, "{en}");
        }
    }

    #[test]
    fn mensagens_com_parametro_nos_dois_idiomas() {
        for l in [Lang::Pt, Lang::En] {
            let s = strings_for(l);
            for msg in [s.denied, s.absolute, s.not_found, s.export_exists] {
                assert!(msg.contains("{path}"), "{msg}");
            }
            assert!(s.too_big.contains("{size}") && s.too_big.contains("{max}"));
            assert!(s.write_failed.contains("{path}") && s.write_failed.contains("{error}"));
        }
    }
}
