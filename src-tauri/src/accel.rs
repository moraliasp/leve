//! Windows: atalhos do menu com o foco no documento. O WebView2 roda em outro processo e fica com
//! o teclado, então a tecla não passa pelo laço de mensagens do app, onde `TranslateAcceleratorW`
//! acharia o atalho do menu nativo. O `AcceleratorKeyPressed` entrega a tecla antes do documento e
//! do navegador embutido: o que estiver em `ACCELERATORS` (`menu.rs`) vai para o mesmo `on_menu` e
//! para aí, o resto segue. Por quê: docs/decisoes.md, "Atalhos só no menu nativo".

use tauri::{AppHandle, Manager};
use webview2_com::{
    AcceleratorKeyPressedEventHandler,
    Microsoft::Web::WebView2::Win32::{
        COREWEBVIEW2_KEY_EVENT_KIND, COREWEBVIEW2_KEY_EVENT_KIND_KEY_DOWN,
        COREWEBVIEW2_KEY_EVENT_KIND_SYSTEM_KEY_DOWN, COREWEBVIEW2_PHYSICAL_KEY_STATUS,
    },
};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    GetKeyState, VIRTUAL_KEY, VK_CONTROL, VK_MENU, VK_SHIFT,
};

use crate::menu;

fn held(key: VIRTUAL_KEY) -> bool {
    unsafe { GetKeyState(i32::from(key.0)) < 0 }
}

/// Liga o evento na janela principal. Uma vez só, no `setup`: a lista não muda com o idioma.
pub fn install(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let handle = app.clone();
    let done = window.with_webview(move |webview| {
        let on_key = AcceleratorKeyPressedEventHandler::create(Box::new(move |_, args| {
            let Some(args) = args else {
                return Ok(());
            };
            let mut kind = COREWEBVIEW2_KEY_EVENT_KIND::default();
            let mut vk = 0u32;
            let mut status = COREWEBVIEW2_PHYSICAL_KEY_STATUS::default();
            unsafe {
                args.KeyEventKind(&mut kind)?;
                args.VirtualKey(&mut vk)?;
                args.PhysicalKeyStatus(&mut status)?;
            }
            if kind != COREWEBVIEW2_KEY_EVENT_KIND_KEY_DOWN
                && kind != COREWEBVIEW2_KEY_EVENT_KIND_SYSTEM_KEY_DOWN
            {
                return Ok(());
            }
            let Some(id) = menu::shortcut_for(vk, held(VK_CONTROL), held(VK_SHIFT), held(VK_MENU))
            else {
                return Ok(());
            };
            unsafe { args.SetHandled(true)? };
            // Tecla presa repete só o que é passo, como o acelerador nativo; o resto age uma vez.
            if status.WasKeyDown.as_bool() && !menu::repeats(id) {
                return Ok(());
            }
            menu::on_shortcut(&handle, id);
            Ok(())
        }));
        let mut token = 0;
        if let Err(e) = unsafe {
            webview
                .controller()
                .add_AcceleratorKeyPressed(&on_key, &mut token)
        } {
            eprintln!("atalhos: {e}");
        }
    });
    if let Err(e) = done {
        eprintln!("atalhos: {e}");
    }
}
