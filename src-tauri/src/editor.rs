//! Arquivo › Abrir no editor. O frontend escolhe um id de uma lista fechada (`Editor`) e manda o
//! caminho do documento ativo; o Rust confere a concessão, acha o editor por plataforma e monta
//! o comando. Nunca entra executável nem argumento vindo do frontend: o único argumento é o
//! caminho canônico já concedido.
//!
//! Detecção: macOS pelo LaunchServices (bundle id → app registrado, o mesmo que `open -b` usa);
//! Windows por caminhos de instalação conhecidos e pelo `PATH` (`.exe`, nunca `.cmd`, que passaria
//! pelo `cmd.exe` e por suas regras de aspas); Linux pelo `PATH`. "Aplicativo padrão" só vale
//! quando o padrão para `.md` não é o próprio Leve, senão o arquivo voltaria para cá.

use std::{
    ffi::OsString,
    path::{Path, PathBuf},
};

use serde::Serialize;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Editor {
    System,
    VsCode,
    Cursor,
    Zed,
    Sublime,
    Text,
}

impl Editor {
    pub const ALL: [Editor; 6] = [
        Editor::System,
        Editor::VsCode,
        Editor::Cursor,
        Editor::Zed,
        Editor::Sublime,
        Editor::Text,
    ];

    pub fn id(self) -> &'static str {
        match self {
            Editor::System => "system",
            Editor::VsCode => "vscode",
            Editor::Cursor => "cursor",
            Editor::Zed => "zed",
            Editor::Sublime => "sublime",
            Editor::Text => "text",
        }
    }

    /// Só os ids da lista; qualquer outra coisa é recusada.
    pub fn parse(id: &str) -> Option<Editor> {
        Editor::ALL.into_iter().find(|e| e.id() == id)
    }

    /// Nome para a tela e para as mensagens; os dois genéricos vêm de `i18n`.
    pub fn name(self) -> &'static str {
        let s = crate::i18n::s();
        match self {
            Editor::System => s.editor_system,
            Editor::VsCode => "VS Code",
            Editor::Cursor => "Cursor",
            Editor::Zed => "Zed",
            Editor::Sublime => "Sublime Text",
            Editor::Text => s.editor_text,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Os {
    Mac,
    Windows,
    Linux,
}

pub const CURRENT_OS: Os = if cfg!(target_os = "macos") {
    Os::Mac
} else if cfg!(windows) {
    Os::Windows
} else {
    Os::Linux
};

/// Onde procurar um editor. macOS: bundle ids (o primeiro registrado vence). Windows e Linux:
/// executáveis em caminhos conhecidos e nomes procurados no `PATH`.
#[derive(Debug, Default, PartialEq)]
pub struct Candidates {
    pub bundles: Vec<&'static str>,
    pub paths: Vec<PathBuf>,
    pub names: Vec<&'static str>,
}

/// Variáveis de ambiente que os caminhos do Windows usam (`LOCALAPPDATA`, `ProgramFiles`,
/// `SystemRoot`), passadas de fora para o teste não depender da máquina.
pub fn candidates(editor: Editor, os: Os, env: &dyn Fn(&str) -> Option<OsString>) -> Candidates {
    let mut c = Candidates::default();
    match os {
        Os::Mac => {
            c.bundles = match editor {
                Editor::System => vec![],
                Editor::VsCode => vec!["com.microsoft.VSCode", "com.microsoft.VSCodeInsiders"],
                Editor::Cursor => vec!["com.todesktop.230313mzl4w4u92"],
                Editor::Zed => vec!["dev.zed.Zed", "dev.zed.Zed-Preview"],
                Editor::Sublime => vec!["com.sublimetext.4", "com.sublimetext.3"],
                Editor::Text => vec!["com.apple.TextEdit"],
            }
        }
        Os::Windows => {
            let under = |var: &str, rel: &str| env(var).map(|v| PathBuf::from(v).join(rel));
            let paths = match editor {
                Editor::System => vec![],
                Editor::VsCode => vec![
                    under("LOCALAPPDATA", r"Programs\Microsoft VS Code\Code.exe"),
                    under("ProgramFiles", r"Microsoft VS Code\Code.exe"),
                ],
                Editor::Cursor => vec![under("LOCALAPPDATA", r"Programs\cursor\Cursor.exe")],
                Editor::Zed => vec![under("LOCALAPPDATA", r"Programs\Zed\Zed.exe")],
                Editor::Sublime => vec![
                    under("ProgramFiles", r"Sublime Text\sublime_text.exe"),
                    under("ProgramFiles", r"Sublime Text 3\sublime_text.exe"),
                ],
                Editor::Text => vec![under("SystemRoot", r"System32\notepad.exe")],
            };
            c.paths = paths.into_iter().flatten().collect();
            c.names = match editor {
                Editor::Zed => vec!["zed.exe"],
                Editor::Sublime => vec!["subl.exe", "sublime_text.exe"],
                Editor::Text => vec!["notepad.exe"],
                _ => vec![],
            };
        }
        Os::Linux => {
            c.names = match editor {
                Editor::System => vec![],
                Editor::VsCode => vec!["code"],
                Editor::Cursor => vec!["cursor"],
                Editor::Zed => vec!["zed", "zeditor"],
                Editor::Sublime => vec!["subl", "sublime_text"],
                Editor::Text => vec![
                    "gnome-text-editor",
                    "gedit",
                    "kate",
                    "kwrite",
                    "mousepad",
                    "xed",
                    "pluma",
                ],
            }
        }
    }
    c
}

/// Primeiro `nome` que existe como arquivo numa pasta do `PATH` (como `which`/`where`), sem
/// executar nada. Pasta relativa no `PATH` é ignorada: dependeria do diretório atual do app.
pub fn find_in_path(
    names: &[&str],
    path_var: Option<&OsString>,
    is_file: &dyn Fn(&Path) -> bool,
) -> Option<PathBuf> {
    let dirs: Vec<PathBuf> = path_var
        .map(|p| std::env::split_paths(p).collect())
        .unwrap_or_default();
    names.iter().find_map(|n| {
        dirs.iter()
            .filter(|d| d.is_absolute())
            .map(|d| d.join(n))
            .find(|p| is_file(p))
    })
}

/// O que a detecção achou para um editor.
#[derive(Clone, Debug, PartialEq)]
pub enum Found {
    /// Aplicativo padrão do sistema para o arquivo.
    System,
    /// macOS: bundle id registrado no LaunchServices.
    Bundle(&'static str),
    /// Windows/Linux: executável.
    Exe(PathBuf),
}

/// Comando a executar: programa e argumentos. O documento é sempre o último e único argumento
/// variável. `Default` = abrir pelo aplicativo padrão (plugin opener).
#[derive(Debug, PartialEq)]
pub enum Launch {
    Default(PathBuf),
    Program {
        program: PathBuf,
        args: Vec<OsString>,
    },
}

pub fn launch_for(found: &Found, doc: &Path) -> Launch {
    match found {
        Found::System => Launch::Default(doc.to_path_buf()),
        Found::Bundle(id) => Launch::Program {
            program: PathBuf::from("/usr/bin/open"),
            args: vec!["-b".into(), (*id).into(), doc.as_os_str().to_owned()],
        },
        Found::Exe(exe) => Launch::Program {
            program: exe.clone(),
            args: vec![doc.as_os_str().to_owned()],
        },
    }
}

/// Acha o editor nesta máquina. `None` = não instalado (ou, para `System`, o padrão é o Leve).
pub fn detect(editor: Editor, self_id: &str) -> Option<Found> {
    if editor == Editor::System {
        return (!sys::default_is_self(self_id)).then_some(Found::System);
    }
    let c = candidates(editor, CURRENT_OS, &|v| std::env::var_os(v));
    if let Some(id) = c.bundles.into_iter().find(|id| sys::bundle_installed(id)) {
        return Some(Found::Bundle(id));
    }
    if let Some(p) = c.paths.into_iter().find(|p| p.is_file()) {
        return Some(Found::Exe(p));
    }
    find_in_path(&c.names, std::env::var_os("PATH").as_ref(), &|p| {
        p.is_file()
    })
    .map(Found::Exe)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EditorInfo {
    id: &'static str,
    name: &'static str,
    available: bool,
    /// Só para "Aplicativo padrão": o padrão para `.md` é o próprio Leve.
    self_default: bool,
}

pub fn list(self_id: &str) -> Vec<EditorInfo> {
    Editor::ALL
        .into_iter()
        .map(|e| {
            let found = detect(e, self_id);
            EditorInfo {
                id: e.id(),
                name: e.name(),
                available: found.is_some(),
                self_default: e == Editor::System && found.is_none(),
            }
        })
        .collect()
}

/// Roda o comando. `open` (macOS) termina logo e diz se falhou; os editores do Windows e do
/// Linux seguem abertos, então só a falha ao iniciar conta, e uma thread recolhe o processo.
pub fn run(launch: Launch) -> Result<(), String> {
    let Launch::Program { program, args } = launch else {
        return Err("Launch::Default é aberto pelo plugin opener".into());
    };
    let mut cmd = std::process::Command::new(&program);
    cmd.args(&args);
    if program == Path::new("/usr/bin/open") {
        let out = cmd.output().map_err(|e| e.to_string())?;
        if out.status.success() {
            return Ok(());
        }
        return Err(String::from_utf8_lossy(&out.stderr).trim().to_owned());
    }
    let mut child = cmd
        .spawn()
        .map_err(|e| format!("{}: {e}", program.display()))?;
    std::thread::spawn(move || {
        let _ = child.wait();
    });
    Ok(())
}

#[cfg(target_os = "macos")]
mod sys {
    //! LaunchServices pela API C (CoreServices), sem dependência nova: só ponteiros CF.
    use std::ffi::c_void;

    type CFRef = *const c_void;
    type CFIndex = isize;
    const UTF8: u32 = 0x0800_0100;
    const ROLES_ALL: u32 = 0xFFFF_FFFF;

    #[link(name = "CoreFoundation", kind = "framework")]
    unsafe extern "C" {
        fn CFStringCreateWithBytes(
            alloc: CFRef,
            bytes: *const u8,
            len: CFIndex,
            enc: u32,
            external: u8,
        ) -> CFRef;
        fn CFStringGetCString(s: CFRef, buf: *mut u8, size: CFIndex, enc: u32) -> u8;
        fn CFURLCreateFromFileSystemRepresentation(
            alloc: CFRef,
            buf: *const u8,
            len: CFIndex,
            is_dir: u8,
        ) -> CFRef;
        fn CFArrayGetCount(a: CFRef) -> CFIndex;
        fn CFBundleCreate(alloc: CFRef, url: CFRef) -> CFRef;
        fn CFBundleGetIdentifier(b: CFRef) -> CFRef;
        fn CFRelease(cf: CFRef);
    }

    #[link(name = "CoreServices", kind = "framework")]
    unsafe extern "C" {
        fn LSCopyApplicationURLsForBundleIdentifier(id: CFRef, err: *mut CFRef) -> CFRef;
        fn LSCopyDefaultApplicationURLForURL(url: CFRef, roles: u32, err: *mut CFRef) -> CFRef;
    }

    /// Libera no fim do escopo um objeto CF devolvido por função Create/Copy.
    struct Owned(CFRef);
    impl Drop for Owned {
        fn drop(&mut self) {
            if !self.0.is_null() {
                unsafe { CFRelease(self.0) }
            }
        }
    }

    pub fn bundle_installed(id: &str) -> bool {
        unsafe {
            let s = Owned(CFStringCreateWithBytes(
                std::ptr::null(),
                id.as_ptr(),
                id.len() as CFIndex,
                UTF8,
                0,
            ));
            if s.0.is_null() {
                return false;
            }
            let urls = Owned(LSCopyApplicationURLsForBundleIdentifier(
                s.0,
                std::ptr::null_mut(),
            ));
            !urls.0.is_null() && CFArrayGetCount(urls.0) > 0
        }
    }

    /// Bundle id do app que o LaunchServices usa para abrir um `.md`. A consulta exige um arquivo
    /// que exista (com caminho inexistente ela devolve nada), então cria um `.md` vazio na pasta
    /// temporária só para perguntar e o apaga em seguida.
    pub fn default_md_app() -> Option<String> {
        let probe = std::env::temp_dir().join(format!("leve-probe-{}.md", std::process::id()));
        std::fs::write(&probe, b"").ok()?;
        let id = default_app_for(&probe);
        let _ = std::fs::remove_file(&probe);
        id
    }

    fn default_app_for(probe: &std::path::Path) -> Option<String> {
        let bytes = probe.as_os_str().as_encoded_bytes();
        unsafe {
            let url = Owned(CFURLCreateFromFileSystemRepresentation(
                std::ptr::null(),
                bytes.as_ptr(),
                bytes.len() as CFIndex,
                0,
            ));
            if url.0.is_null() {
                return None;
            }
            let app = Owned(LSCopyDefaultApplicationURLForURL(
                url.0,
                ROLES_ALL,
                std::ptr::null_mut(),
            ));
            if app.0.is_null() {
                return None;
            }
            let bundle = Owned(CFBundleCreate(std::ptr::null(), app.0));
            if bundle.0.is_null() {
                return None;
            }
            let id = CFBundleGetIdentifier(bundle.0);
            if id.is_null() {
                return None;
            }
            let mut buf = [0u8; 512];
            if CFStringGetCString(id, buf.as_mut_ptr(), buf.len() as CFIndex, UTF8) == 0 {
                return None;
            }
            let end = buf.iter().position(|&b| b == 0).unwrap_or(buf.len());
            Some(String::from_utf8_lossy(&buf[..end]).into_owned())
        }
    }

    pub fn default_is_self(self_id: &str) -> bool {
        default_md_app().is_some_and(|id| id.eq_ignore_ascii_case(self_id))
    }
}

#[cfg(windows)]
mod sys {
    //! Associação de `.md` pelo shell (`AssocQueryStringW`), comparada com o próprio executável.
    use std::{ffi::OsString, os::windows::ffi::OsStringExt, path::PathBuf};

    const ASSOCF_NOTRUNCATE: u32 = 0x20;
    const ASSOCSTR_EXECUTABLE: i32 = 2;

    #[link(name = "shlwapi")]
    unsafe extern "system" {
        fn AssocQueryStringW(
            flags: u32,
            what: i32,
            assoc: *const u16,
            extra: *const u16,
            out: *mut u16,
            out_len: *mut u32,
        ) -> i32;
    }

    pub fn bundle_installed(_id: &str) -> bool {
        false
    }

    fn default_md_exe() -> Option<PathBuf> {
        let ext: Vec<u16> = ".md\0".encode_utf16().collect();
        let mut buf = vec![0u16; 1024];
        let mut len = buf.len() as u32;
        let hr = unsafe {
            AssocQueryStringW(
                ASSOCF_NOTRUNCATE,
                ASSOCSTR_EXECUTABLE,
                ext.as_ptr(),
                std::ptr::null(),
                buf.as_mut_ptr(),
                &mut len,
            )
        };
        if hr != 0 {
            return None;
        }
        let end = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
        Some(PathBuf::from(OsString::from_wide(&buf[..end])))
    }

    pub fn default_is_self(_self_id: &str) -> bool {
        let (Some(def), Ok(me)) = (default_md_exe(), std::env::current_exe()) else {
            return false;
        };
        let norm = |p: PathBuf| {
            std::fs::canonicalize(&p)
                .unwrap_or(p)
                .to_string_lossy()
                .to_lowercase()
        };
        norm(def) == norm(me)
    }
}

#[cfg(not(any(target_os = "macos", windows)))]
mod sys {
    //! `xdg-mime` diz qual `.desktop` abre `text/markdown`; o do Leve tem o nome do app.

    pub fn bundle_installed(_id: &str) -> bool {
        false
    }

    pub fn default_is_self(_self_id: &str) -> bool {
        std::process::Command::new("xdg-mime")
            .args(["query", "default", "text/markdown"])
            .output()
            .ok()
            .is_some_and(|o| desktop_is_leve(&String::from_utf8_lossy(&o.stdout)))
    }

    pub fn desktop_is_leve(desktop: &str) -> bool {
        desktop.trim().to_ascii_lowercase().starts_with("leve")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn win_env(var: &str) -> Option<OsString> {
        match var {
            "LOCALAPPDATA" => Some(r"C:\Users\x\AppData\Local".into()),
            "ProgramFiles" => Some(r"C:\Program Files".into()),
            "SystemRoot" => Some(r"C:\Windows".into()),
            _ => None,
        }
    }

    #[test]
    fn lista_fechada_de_ids() {
        for e in Editor::ALL {
            assert_eq!(Editor::parse(e.id()), Some(e));
        }
        for bad in [
            "",
            "VSCODE",
            "code",
            "/usr/bin/code",
            "vscode --wait",
            "system;rm",
        ] {
            assert_eq!(Editor::parse(bad), None, "{bad}");
        }
    }

    #[test]
    fn comando_por_editor_so_leva_o_documento() {
        let doc = Path::new("/docs/a b; c.md");
        assert_eq!(
            launch_for(&Found::Bundle("com.microsoft.VSCode"), doc),
            Launch::Program {
                program: "/usr/bin/open".into(),
                args: vec!["-b".into(), "com.microsoft.VSCode".into(), doc.into()],
            }
        );
        assert_eq!(
            launch_for(&Found::Exe("/usr/bin/zed".into()), doc),
            Launch::Program {
                program: "/usr/bin/zed".into(),
                args: vec![doc.into()],
            }
        );
        assert_eq!(launch_for(&Found::System, doc), Launch::Default(doc.into()));
    }

    #[test]
    fn candidatos_por_plataforma() {
        let none = |_: &str| None;
        assert_eq!(
            candidates(Editor::VsCode, Os::Mac, &none).bundles,
            ["com.microsoft.VSCode", "com.microsoft.VSCodeInsiders"]
        );
        assert_eq!(
            candidates(Editor::Text, Os::Mac, &none).bundles,
            ["com.apple.TextEdit"]
        );
        let code = candidates(Editor::VsCode, Os::Windows, &win_env);
        assert_eq!(
            code.paths,
            [
                PathBuf::from(r"C:\Users\x\AppData\Local")
                    .join(r"Programs\Microsoft VS Code\Code.exe"),
                PathBuf::from(r"C:\Program Files").join(r"Microsoft VS Code\Code.exe"),
            ]
        );
        assert!(code.names.iter().all(|n| n.ends_with(".exe")), "nunca .cmd");
        // Sem a variável, o caminho some em vez de virar relativo.
        assert!(
            candidates(Editor::VsCode, Os::Windows, &none)
                .paths
                .is_empty()
        );
        assert_eq!(
            candidates(Editor::Zed, Os::Linux, &none).names,
            ["zed", "zeditor"]
        );
        // "Aplicativo padrão" não procura executável em lugar nenhum.
        for os in [Os::Mac, Os::Windows, Os::Linux] {
            assert_eq!(
                candidates(Editor::System, os, &win_env),
                Candidates::default()
            );
        }
    }

    #[cfg(unix)]
    #[test]
    fn procura_no_path_em_ordem_e_ignora_pasta_relativa() {
        let path = std::env::join_paths(["bin", "/opt/a", "/usr/bin"]).unwrap();
        let exists = |p: &Path| p == Path::new("/usr/bin/zeditor") || p == Path::new("bin/zed");
        assert_eq!(
            find_in_path(&["zed", "zeditor"], Some(&path), &exists),
            Some(PathBuf::from("/usr/bin/zeditor"))
        );
        assert_eq!(find_in_path(&["zed"], None, &exists), None);
    }

    #[cfg(not(any(target_os = "macos", windows)))]
    #[test]
    fn desktop_do_leve() {
        assert!(sys::desktop_is_leve("Leve.desktop\n"));
        assert!(!sys::desktop_is_leve("code.desktop"));
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn textedit_sempre_registrado_e_id_inventado_nao() {
        assert!(sys::bundle_installed("com.apple.TextEdit"));
        assert!(!sys::bundle_installed("br.com.moralia.nao-existe"));
        assert_eq!(
            detect(Editor::Text, "br.com.moralia.leve"),
            Some(Found::Bundle("com.apple.TextEdit"))
        );
        // O padrão para .md existe em toda máquina com algum app que o declare; o que importa é
        // a comparação com o próprio id.
        if let Some(id) = sys::default_md_app() {
            assert!(sys::default_is_self(&id));
            assert!(!sys::default_is_self("br.com.moralia.nao-existe"));
        }
    }

    /// Prova manual, fora do `cargo test` normal porque abre uma janela: o mesmo caminho do
    /// comando (`detect` → `launch_for` → `run`) abre um `.md` no TextEdit.
    /// `cargo test prova_abre_no_textedit -- --ignored`, conferir a janela e fechar o TextEdit.
    #[cfg(target_os = "macos")]
    #[test]
    #[ignore]
    fn prova_abre_no_textedit() {
        let doc = std::env::temp_dir().join("leve-prova-editor.md");
        std::fs::write(&doc, "# prova do Abrir no editor\n").unwrap();
        let found = detect(Editor::Text, "br.com.moralia.leve").expect("TextEdit");
        run(launch_for(&found, &doc)).unwrap();
    }
}
