//! Linux: atalho do menu com Shift sobre pontuação (Ctrl+Shift+] e Ctrl+Shift+[, `next-tab` e
//! `prev-tab`). O `muda` registra no menu o keyval do nível 0 da tecla (`bracketright`), mas o GTK
//! compara o keyval já traduzido pelo Shift (`braceright`) e nunca casa: o menu mostra o atalho e a tecla
//! não faz nada (#106). Este grupo de aceleradores, preso à janela, registra o keyval do Shift e manda o
//! mesmo `on_menu` do menu nativo; o item de menu segue com o rótulo `Ctrl+Shift+]`. A lista vem de
//! `ACCELERATORS` (`menu::gtk_shifted`), então não há tecla própria nem `keydown` no frontend. Por quê:
//! docs/decisoes.md, "Atalhos só no menu nativo".

use gtk::{gdk, prelude::*};
use tauri::{AppHandle, Manager};

use crate::menu;

/// Liga o grupo na janela principal. Uma vez só, no `setup` (a janela e a lista não mudam com o idioma),
/// na thread principal, que é onde o GTK entrega a tecla.
pub fn install(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let Ok(gtk_window) = window.gtk_window() else {
        return;
    };
    let group = gtk::AccelGroup::new();
    for (id, name) in menu::gtk_shifted() {
        let key = gdk::keys::Key::from_name(name);
        if key == gdk::keys::constants::VoidSymbol {
            eprintln!("atalhos: tecla {name} desconhecida no GDK ({id})");
            continue;
        }
        let handle = app.clone();
        group.connect_accel_group(
            *key,
            gdk::ModifierType::CONTROL_MASK | gdk::ModifierType::SHIFT_MASK,
            gtk::AccelFlags::empty(),
            move |_, _, _, _| {
                menu::on_menu(&handle, id.to_string());
                true
            },
        );
    }
    gtk_window.add_accel_group(&group);
}
