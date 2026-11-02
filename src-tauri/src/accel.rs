//! Windows: atalhos do menu com o foco no documento. O WebView2 roda em outro processo e fica com
//! o teclado, então a tecla não passa pelo laço de mensagens do app, onde `TranslateAcceleratorW`
//! acharia o atalho do menu nativo. O `AcceleratorKeyPressed` entrega a tecla antes do documento e
//! do navegador embutido: o que estiver em `ACCELERATORS` (`menu.rs`) vai para o mesmo `on_menu` e
//! para aí, o resto segue. A pontuação casa pelo caractere que o layout do teclado dá à tecla, não
//! pelo VK do US (#111). Por quê: docs/decisoes.md, "Atalhos só no menu nativo".

use tauri::{AppHandle, Manager};
use webview2_com::{
    AcceleratorKeyPressedEventHandler,
    Microsoft::Web::WebView2::Win32::{
        COREWEBVIEW2_KEY_EVENT_KIND, COREWEBVIEW2_KEY_EVENT_KIND_KEY_DOWN,
        COREWEBVIEW2_KEY_EVENT_KIND_SYSTEM_KEY_DOWN, COREWEBVIEW2_PHYSICAL_KEY_STATUS,
    },
};
use windows::Win32::UI::{
    Input::KeyboardAndMouse::{
        GetKeyState, GetKeyboardLayout, HKL, MAPVK_VK_TO_CHAR, MapVirtualKeyExW, VIRTUAL_KEY,
        VK_CONTROL, VK_MENU, VK_SHIFT,
    },
    WindowsAndMessaging::{
        GUITHREADINFO, GetForegroundWindow, GetGUIThreadInfo, GetWindowThreadProcessId,
    },
};

use crate::menu;

fn held(key: VIRTUAL_KEY) -> bool {
    unsafe { GetKeyState(i32::from(key.0)) < 0 }
}

/// Layout de quem traduziu a tecla. O layout é por thread, e o VK que o evento traz foi calculado no
/// thread da janela com o foco, a do WebView2, que é de outro processo: o deste callback (o da janela
/// do app) pode ter outro layout, e `GetKeyboardLayout(0)` daria o dele. A janela em primeiro plano é
/// a do app, então o foco sai do `GetGUIThreadInfo` do thread dela (a fila de entrada é compartilhada
/// com o WebView2). Sem foco, o thread da janela; sem janela, `GetKeyboardLayout(0)`, o deste thread.
fn focus_layout() -> HKL {
    unsafe {
        let fg = GetForegroundWindow();
        let fg_thread = if fg.is_invalid() {
            0
        } else {
            GetWindowThreadProcessId(fg, None)
        };
        let mut info = GUITHREADINFO {
            cbSize: size_of::<GUITHREADINFO>() as u32,
            ..Default::default()
        };
        let thread = if fg_thread != 0
            && GetGUIThreadInfo(fg_thread, &mut info).is_ok()
            && !info.hwndFocus.is_invalid()
        {
            GetWindowThreadProcessId(info.hwndFocus, None)
        } else {
            fg_thread
        };
        GetKeyboardLayout(thread)
    }
}

/// Caractere sem Shift que o layout do foco dá à tecla virtual. Tecla morta (bit alto, `´` no ABNT2)
/// e tecla sem caractere dão `None`, e o atalho casa pelo VK, como antes.
fn layout_char(vk: u32) -> Option<char> {
    let mapped = unsafe { MapVirtualKeyExW(vk, MAPVK_VK_TO_CHAR, Some(focus_layout())) };
    if mapped & 0x8000_0000 != 0 {
        return None;
    }
    char::from_u32(mapped & 0xFFFF).filter(|c| *c != '\0')
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
            let ctrl = held(VK_CONTROL);
            // Todo atalho tem Ctrl (`menu.rs`): sem ele é digitação, e o layout nem é consultado.
            let ch = if ctrl { layout_char(vk) } else { None };
            let Some(id) = menu::shortcut_for_key(vk, ch, ctrl, held(VK_SHIFT), held(VK_MENU))
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
