//! Menu nativo: todo atalho vive aqui (`build_menu`) e dispara o evento `menu`; o frontend mapeia em
//! `actions`. As marcas e o Salvar são espelho do frontend (`sync_menu`).

use serde::Deserialize;
use tauri::{
    AppHandle, Emitter, Manager, State, Wry,
    menu::{CheckMenuItem, CheckMenuItemBuilder, MenuBuilder, MenuItemBuilder, SubmenuBuilder},
};

use crate::{AppState, i18n};

/// O que o menu mostra, inteiro a cada chamada: quem guarda é o frontend, o Rust só espelha.
#[derive(Deserialize)]
pub struct MenuState {
    style: String,
    width: String,
    font: String,
    /// Exibir › Carregar imagens remotas.
    remote: bool,
    /// Exibir › Mostrar conteúdo oculto.
    hidden: bool,
    /// Arquivo › Salvar…: só o documento colado tem o que salvar.
    save: bool,
}

/// Se o item de marcar com esse id fica marcado.
fn is_checked(id: &str, menu: &MenuState) -> bool {
    match id {
        "remote-auto" => menu.remote,
        "show-hidden" => menu.hidden,
        _ => match id.split_once('-') {
            Some(("style", v)) => v == menu.style,
            Some(("width", v)) => v == menu.width,
            Some(("font", v)) => v == menu.font,
            _ => false,
        },
    }
}

/// Marca, no grupo do item (`style-*`, `width-*` ou `font-*`), só o item com esse id.
fn check_view_item(state: &AppState, id: &str) {
    let Some(prefix) = id.split('-').next() else {
        return;
    };
    for item in state.menu_checks.lock().unwrap().iter() {
        let item_id = &item.id().0;
        if item_id.starts_with(prefix) {
            let _ = item.set_checked(item_id == id);
        }
    }
}

/// Frontend informa o estado do menu no início e a cada troca.
#[tauri::command]
pub fn sync_menu(state: State<AppState>, menu: MenuState) {
    for item in state.menu_checks.lock().unwrap().iter() {
        let _ = item.set_checked(is_checked(&item.id().0, &menu));
    }
    if let Some(item) = state.save_item.lock().unwrap().as_ref() {
        let _ = item.set_enabled(menu.save);
    }
}

/// Menu nativo no idioma atual (`i18n`). Chamado no `setup` e de novo por `set_locale`; o
/// tratamento dos cliques (`on_menu_event`) é registrado uma vez só, no `setup`.
pub fn build_menu(app: &AppHandle) -> tauri::Result<()> {
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
    let open_folder = item("open-folder", s.open_folder, Some("CmdOrCtrl+Shift+O"))?;
    let close_folder = item("close-folder", s.close_folder, None)?;
    // Mod+P é o abrir rápido, como nos editores; Imprimir foi para Mod+Shift+P (docs/decisoes.md).
    let quick_open = item("quick-open", s.quick_open, Some("CmdOrCtrl+P"))?;
    let open_clipboard = item(
        "open-clipboard",
        s.open_clipboard,
        Some("CmdOrCtrl+Shift+V"),
    )?;
    // Desligado até o frontend dizer que o ativo é o documento colado (`sync_menu`).
    let save = MenuItemBuilder::with_id("save", s.save)
        .accelerator("CmdOrCtrl+S")
        .enabled(false)
        .build(app)?;
    *app.state::<AppState>().save_item.lock().unwrap() = Some(save.clone());
    let reload = item("reload", s.reload, Some("CmdOrCtrl+R"))?;
    let reveal = item("reveal", s.reveal, Some("CmdOrCtrl+Shift+R"))?;
    let open_in_editor = item("open-in-editor", s.open_in_editor, Some("CmdOrCtrl+E"))?;
    let clear_recent = item("clear-recent", s.clear_recent, None)?;
    let print = item("print", s.print, Some("CmdOrCtrl+Shift+P"))?;
    let export_html = item("export-html", s.export_html, None)?;
    let copy_html = item("copy-html", s.copy_html, None)?;
    let copy_rich = item("copy-rich", s.copy_rich, Some("CmdOrCtrl+Shift+C"))?;
    let find = item("find", s.find, Some("CmdOrCtrl+F"))?;
    let toc = item("toggle-toc", s.toc, Some("CmdOrCtrl+B"))?;
    let tree = item("toggle-tree", s.tree, Some("CmdOrCtrl+Shift+E"))?;
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
        .item(&open_folder)
        .item(&quick_open)
        .item(&close_folder)
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
    // Marcação vem do frontend (`sync_menu`) logo depois de montar.
    let mut checks = Vec::new();
    let mut check = |id: &str, label: &str, on: bool| -> tauri::Result<CheckMenuItem<Wry>> {
        let item = CheckMenuItemBuilder::with_id(id, label)
            .checked(on)
            .build(app)?;
        checks.push(item.clone());
        Ok(item)
    };
    // GitHub é nome próprio do visual (e da base, src/markdown.css): o mesmo nos dois idiomas.
    let st_github = check("style-github", "GitHub", true)?;
    let st_editor = check("style-editor", s.style_editor, false)?;
    let st_terminal = check("style-terminal", s.style_terminal, false)?;
    let st_livro = check("style-livro", s.style_livro, false)?;
    let w_narrow = check("width-narrow", s.width_narrow, false)?;
    let w_normal = check("width-normal", s.width_normal, true)?;
    let w_wide = check("width-wide", s.width_wide, false)?;
    let f_auto = check("font-auto", s.font_auto, true)?;
    let f_sans = check("font-sans", "Sans", false)?;
    let f_serif = check("font-serif", "Serif", false)?;
    let f_mono = check("font-mono", "Mono", false)?;
    // Desligado por padrão (privacidade); o frontend liga se a preferência salva mandar.
    let remote_auto = check("remote-auto", s.remote, false)?;
    // Desligado por padrão: o documento só avisa; o frontend liga se a preferência mandar.
    let show_hidden = check("show-hidden", s.show_hidden, false)?;
    *app.state::<AppState>().menu_checks.lock().unwrap() = checks;
    let style = SubmenuBuilder::new(app, s.style)
        .items(&[&st_github, &st_editor, &st_terminal, &st_livro])
        .build()?;
    let width = SubmenuBuilder::new(app, s.width)
        .items(&[&w_narrow, &w_normal, &w_wide])
        .build()?;
    let font = SubmenuBuilder::new(app, s.font)
        .item(&f_auto)
        .separator()
        .items(&[&f_sans, &f_serif, &f_mono])
        .build()?;

    let view = SubmenuBuilder::new(app, s.view)
        .item(&tree)
        .item(&toc)
        .item(&theme)
        .separator()
        .item(&style)
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

pub fn on_menu(app: &AppHandle, id: String) {
    // Fechar janela fica no Rust (sem permissão de janela no frontend); ⌘W é da aba.
    if id == "close-window" {
        if let Some(w) = app.get_webview_window("main") {
            let _ = w.close();
        }
        return;
    }
    if id.starts_with("style-") || id.starts_with("width-") || id.starts_with("font-") {
        check_view_item(&app.state::<AppState>(), &id);
    }
    let _ = app.emit("menu", id);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn state() -> MenuState {
        MenuState {
            style: "livro".into(),
            width: "wide".into(),
            font: "auto".into(),
            remote: true,
            hidden: false,
            save: false,
        }
    }

    /// A forma que `syncMenu` (src/main.ts) manda; campo que falte falha aqui.
    #[test]
    fn le_o_estado_que_o_frontend_manda() {
        let m: MenuState = serde_json::from_str(
            r#"{"style":"terminal","width":"narrow","font":"mono","remote":false,"hidden":true,"save":true}"#,
        )
        .unwrap();
        assert!(is_checked("style-terminal", &m));
        assert!(is_checked("width-narrow", &m));
        assert!(is_checked("font-mono", &m));
        assert!(is_checked("show-hidden", &m));
        assert!(!is_checked("remote-auto", &m));
        assert!(m.save);
    }

    #[test]
    fn marca_o_item_de_cada_grupo() {
        let m = state();
        assert!(is_checked("style-livro", &m));
        assert!(!is_checked("style-github", &m));
        assert!(is_checked("width-wide", &m));
        assert!(!is_checked("width-normal", &m));
        assert!(is_checked("font-auto", &m));
        assert!(!is_checked("font-mono", &m));
    }

    #[test]
    fn liga_desliga_seguem_o_proprio_campo() {
        let m = state();
        assert!(is_checked("remote-auto", &m));
        assert!(!is_checked("show-hidden", &m));
    }

    #[test]
    fn valor_ou_id_desconhecido_nao_marca() {
        let mut m = state();
        m.style = "sumiu".into();
        assert!(!is_checked("style-github", &m));
        assert!(!is_checked("outro", &m));
        assert!(!is_checked("outro-livro", &m));
    }
}
