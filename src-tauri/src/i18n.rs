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
    pub open_in_editor: &'static str,
    /// Menu do app (macOS): instala o script `leve` (`cli.rs`).
    #[cfg_attr(not(target_os = "macos"), allow(dead_code))]
    pub install_cli: &'static str,
    pub clear_recent: &'static str,
    pub print: &'static str,
    pub export_html: &'static str,
    pub copy_html: &'static str,
    pub copy_rich: &'static str,
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
    pub sample: &'static str,
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
    /// Abrir no editor: nome da opção "aplicativo padrão" e do editor de texto do sistema.
    pub editor_system: &'static str,
    pub editor_text: &'static str,
    /// `{id}`: id fora da lista fechada.
    pub editor_unknown: &'static str,
    /// `{name}`: editor escolhido não está instalado.
    pub editor_not_found: &'static str,
    /// `{name}` e `{error}`: o editor não abriu.
    pub editor_failed: &'static str,
    pub editor_self_default: &'static str,
    /// `{path}`: Abrir no editor só aceita Markdown.
    pub editor_not_markdown: &'static str,
    /// Modo administrador sem a confirmação que o precede.
    #[cfg_attr(not(target_os = "macos"), allow(dead_code))]
    pub cli_admin_unconfirmed: &'static str,
    /// `{path}`: o arquivo gravado como administrador não confere com o script.
    #[cfg_attr(not(target_os = "macos"), allow(dead_code))]
    pub cli_verify_failed: &'static str,
    /// `{path}`: já existe um `leve` que não é o script do app.
    #[cfg_attr(not(target_os = "macos"), allow(dead_code))]
    pub cli_exists: &'static str,
    #[cfg_attr(target_os = "macos", allow(dead_code))]
    pub cli_unsupported: &'static str,
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
    open_in_editor: "Abrir no editor",
    install_cli: "Instalar comando 'leve' no terminal…",
    clear_recent: "Limpar recentes…",
    print: "Imprimir / Exportar PDF…",
    export_html: "Exportar HTML…",
    copy_html: "Copiar como HTML…",
    copy_rich: "Copiar como texto formatado",
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
    sample: "Documento de exemplo",
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
    editor_system: "Aplicativo padrão para .md",
    editor_text: if cfg!(target_os = "macos") {
        "TextEdit"
    } else if cfg!(windows) {
        "Bloco de Notas"
    } else {
        "Editor de texto"
    },
    editor_unknown: "Editor desconhecido: {id}",
    editor_not_found: "Editor não encontrado: {name}. Escolha outro em Preferências › Editor.",
    editor_failed: "Não foi possível abrir no {name}: {error}",
    editor_self_default: "O aplicativo padrão para .md é o próprio Leve. Escolha um editor em Preferências › Editor.",
    cli_exists: "Já existe {path} e não foi instalado pelo Leve; nada foi alterado.",
    editor_not_markdown: "Abrir no editor só abre arquivos Markdown: {path}",
    cli_admin_unconfirmed: "Instalação como administrador precisa ser pedida pelo menu.",
    cli_verify_failed: "{path} foi gravado, mas o conteúdo não confere; confira ou apague o arquivo.",
    cli_unsupported: "O comando 'leve' só é instalado pelo app no macOS. Veja docs/instalacao.md.",
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
    open_in_editor: "Open in Editor",
    install_cli: "Install 'leve' Command in Terminal…",
    clear_recent: "Clear Recent…",
    print: "Print / Export PDF…",
    export_html: "Export HTML…",
    copy_html: "Copy as HTML…",
    copy_rich: "Copy as Formatted Text",
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
    sample: "Sample Document",
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
    editor_system: "Default app for .md",
    editor_text: if cfg!(target_os = "macos") {
        "TextEdit"
    } else if cfg!(windows) {
        "Notepad"
    } else {
        "Text editor"
    },
    editor_unknown: "Unknown editor: {id}",
    editor_not_found: "Editor not found: {name}. Choose another one in Settings › Editor.",
    editor_failed: "Couldn't open in {name}: {error}",
    editor_self_default: "The default app for .md is Leve itself. Choose an editor in Settings › Editor.",
    cli_exists: "{path} already exists and wasn't installed by Leve; nothing was changed.",
    editor_not_markdown: "Open in Editor only opens Markdown files: {path}",
    cli_admin_unconfirmed: "Installing as administrator has to be requested from the menu.",
    cli_verify_failed: "{path} was written but its content doesn't match; check or delete the file.",
    cli_unsupported: "The app installs the 'leve' command only on macOS. See docs/instalacao.md.",
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
            for msg in [
                s.denied,
                s.absolute,
                s.not_found,
                s.export_exists,
                s.cli_exists,
                s.editor_not_markdown,
                s.cli_verify_failed,
            ] {
                assert!(msg.contains("{path}"), "{msg}");
            }
            assert!(s.too_big.contains("{size}") && s.too_big.contains("{max}"));
            assert!(s.write_failed.contains("{path}") && s.write_failed.contains("{error}"));
            assert!(s.editor_not_found.contains("{name}") && s.editor_unknown.contains("{id}"));
            assert!(s.editor_failed.contains("{name}") && s.editor_failed.contains("{error}"));
        }
    }
}
