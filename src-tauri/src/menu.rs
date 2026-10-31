//! Menu nativo: todo atalho vive aqui (`build_menu`) e dispara o evento `menu`; o frontend mapeia em
//! `actions`. Itens de marcar e o Salvar são sincronizados pelo frontend (`sync_*_menu`).

use tauri::{
    AppHandle, Emitter, Manager, State, Wry,
    menu::{CheckMenuItem, CheckMenuItemBuilder, MenuBuilder, MenuItemBuilder, SubmenuBuilder},
};

use crate::{AppState, i18n};

/// Marca, no grupo do item (`style-*`, `width-*` ou `font-*`), só o item com esse id.
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

/// Frontend informa o estilo, a largura e a fonte persistidos para o menu refletir.
#[tauri::command]
pub fn sync_view_menu(state: State<AppState>, style: String, width: String, font: String) {
    check_view_item(&state, &format!("style-{style}"));
    check_view_item(&state, &format!("width-{width}"));
    check_view_item(&state, &format!("font-{font}"));
}

/// Frontend informa se "Carregar imagens remotas" está ligado (no início e a cada troca).
#[tauri::command]
pub fn sync_remote_menu(state: State<AppState>, on: bool) {
    if let Some(item) = state.remote_check.lock().unwrap().as_ref() {
        let _ = item.set_checked(on);
    }
}

/// Frontend informa se "Mostrar conteúdo oculto" está ligado (no início e a cada troca).
#[tauri::command]
pub fn sync_hidden_menu(state: State<AppState>, on: bool) {
    if let Some(item) = state.hidden_check.lock().unwrap().as_ref() {
        let _ = item.set_checked(on);
    }
}

/// Frontend informa se o documento ativo é o colado (só ele tem o que salvar).
#[tauri::command]
pub fn sync_save_menu(state: State<AppState>, on: bool) {
    if let Some(item) = state.save_item.lock().unwrap().as_ref() {
        let _ = item.set_enabled(on);
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
    let print = item("print", s.print, Some("CmdOrCtrl+Shift+P"))?;
    let export_html = item("export-html", s.export_html, None)?;
    let copy_html = item("copy-html", s.copy_html, None)?;
    let copy_rich = item("copy-rich", s.copy_rich, Some("CmdOrCtrl+Shift+C"))?;
    let annotate = item("annotate", s.annotate, Some("CmdOrCtrl+Shift+A"))?;
    let copy_review = item("copy-review", s.copy_review, Some("CmdOrCtrl+Alt+C"))?;
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
        .item(&annotate)
        .item(&copy_review)
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
    // GitHub é nome próprio do visual (e da base, src/markdown.css): o mesmo nos dois idiomas.
    let st_github = radio("style-github", "GitHub", true)?;
    let st_editor = radio("style-editor", s.style_editor, false)?;
    let st_terminal = radio("style-terminal", s.style_terminal, false)?;
    let st_livro = radio("style-livro", s.style_livro, false)?;
    let w_narrow = radio("width-narrow", s.width_narrow, false)?;
    let w_normal = radio("width-normal", s.width_normal, true)?;
    let w_wide = radio("width-wide", s.width_wide, false)?;
    let f_auto = radio("font-auto", s.font_auto, true)?;
    let f_sans = radio("font-sans", "Sans", false)?;
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
