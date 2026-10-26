//! Comando de terminal `leve` no macOS (Leve › Instalar comando 'leve' no terminal…).
//!
//! Instala um script de shell, não um link para o binário do bundle: o script chama
//! `open -b <identificador>`, então (1) o app não fica preso ao terminal (Ctrl+C ou fechar a aba
//! não o derrubam, e o log não aparece ali), (2) continua funcionando se o `Leve.app` mudar de
//! pasta, e (3) o arquivo chega pelo mesmo caminho do duplo-clique (`RunEvent::Opened` →
//! `request_open`), com o caminho relativo resolvido pelo `open` contra a pasta atual.
//!
//! Destino sem pedir senha: `/usr/local/bin` se der para gravar nela (Homebrew em Mac Intel), senão
//! `~/.local/bin` ou `~/bin` se estiverem no `PATH` do shell de login. Sem nenhum dos dois, o app
//! pergunta e só então grava em `/usr/local/bin` pelo diálogo de administrador do sistema
//! (`osascript ... with administrator privileges`). Nunca sobrescreve um `leve` que não seja dele.

use std::path::{Path, PathBuf};

use serde::Serialize;

/// Linha que marca o script como nosso: só ele é substituído numa reinstalação.
pub const MARKER: &str = "# leve-cli: instalado pelo app Leve";
pub const ADMIN_DIR: &str = "/usr/local/bin";
const PATH_TAG: &str = "__LEVE_PATH__";

pub fn script(bundle_id: &str) -> String {
    format!(
        r#"#!/bin/sh
{MARKER} ({bundle_id}). Para remover: rm "$0"
# Uso: leve [arquivo.md ...]. Caminho relativo vale a partir da pasta atual.
if [ "$#" -eq 0 ]; then
  exec /usr/bin/open -b {bundle_id}
fi
# Nome que começa com "-" não pode virar opção do open.
for a do
  shift
  case "$a" in -*) a="./$a" ;; esac
  set -- "$@" "$a"
done
exec /usr/bin/open -b {bundle_id} "$@"
"#
    )
}

/// `PATH` impresso pelo shell de login entre marcas (o `.zshrc` pode escrever outras coisas).
pub fn parse_login_path(out: &str) -> Option<String> {
    out.lines()
        .rev()
        .find_map(|l| l.strip_prefix(PATH_TAG))
        .map(str::to_owned)
}

/// Pasta onde instalar sem senha, ou `None` (precisa de administrador).
pub fn choose_dir(
    usr_local_writable: bool,
    login_path: Option<&str>,
    home: &Path,
) -> Option<PathBuf> {
    if usr_local_writable {
        return Some(PathBuf::from(ADMIN_DIR));
    }
    let entries: Vec<PathBuf> = login_path
        .map(|p| {
            p.split(':')
                .map(|e| match e.strip_prefix("~/") {
                    Some(rest) => home.join(rest),
                    None => PathBuf::from(e.trim_end_matches('/')),
                })
                .collect()
        })
        .unwrap_or_default();
    [home.join(".local/bin"), home.join("bin")]
        .into_iter()
        .find(|d| entries.contains(d))
}

/// Já existe um `leve` ali que não é o nosso script?
pub fn foreign(existing: Option<&str>) -> bool {
    existing.is_some_and(|c| !c.contains(MARKER))
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(tag = "status", rename_all = "kebab-case")]
pub enum Outcome {
    Installed { path: String },
    NeedsAdmin { path: String },
    Cancelled,
}

#[cfg(target_os = "macos")]
mod mac {
    use super::*;
    use crate::{fill, i18n};
    use std::{
        os::unix::fs::PermissionsExt,
        process::{Command, Stdio},
        time::{Duration, Instant},
    };

    fn writable(dir: &Path) -> bool {
        use std::ffi::CString;
        let Ok(c) = CString::new(dir.as_os_str().as_encoded_bytes()) else {
            return false;
        };
        dir.is_dir() && unsafe { access(c.as_ptr(), 2) == 0 }
    }

    unsafe extern "C" {
        fn access(path: *const std::ffi::c_char, mode: i32) -> i32;
    }

    /// `PATH` do shell de login do usuário (o do app aberto pelo Finder é o mínimo do sistema).
    /// Até 3 s: `.zshrc` lento não trava a instalação, só leva ao diálogo de administrador.
    fn login_path() -> Option<String> {
        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
        let mut child = Command::new(shell)
            .args(["-ilc", &format!("printf '\\n{PATH_TAG}%s\\n' \"$PATH\"")])
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .ok()?;
        let start = Instant::now();
        loop {
            if child.try_wait().ok()?.is_some() {
                break;
            }
            if start.elapsed() > Duration::from_secs(3) {
                let _ = child.kill();
                let _ = child.wait();
                return None;
            }
            std::thread::sleep(Duration::from_millis(50));
        }
        let out = child.wait_with_output().ok()?;
        parse_login_path(&String::from_utf8_lossy(&out.stdout))
    }

    fn check_free(target: &Path) -> Result<(), String> {
        let existing = std::fs::read_to_string(target).ok();
        if foreign(existing.as_deref()) || (existing.is_none() && target.symlink_metadata().is_ok())
        {
            return Err(fill(
                i18n::s().cli_exists,
                &[("path", &target.display().to_string())],
            ));
        }
        Ok(())
    }

    fn write_script(target: &Path, body: &str) -> Result<(), String> {
        let err = |e: std::io::Error| {
            fill(
                i18n::s().write_failed,
                &[
                    ("path", &target.display().to_string()),
                    ("error", &e.to_string()),
                ],
            )
        };
        let tmp = target.with_extension("leve-tmp");
        std::fs::write(&tmp, body).map_err(err)?;
        std::fs::set_permissions(&tmp, std::fs::Permissions::from_mode(0o755)).map_err(err)?;
        std::fs::rename(&tmp, target).map_err(err)
    }

    pub fn install(admin: bool, bundle_id: &str, scratch: &Path) -> Result<Outcome, String> {
        let body = script(bundle_id);
        if !admin {
            let home = std::env::var_os("HOME")
                .map(PathBuf::from)
                .unwrap_or_default();
            let dir = choose_dir(
                writable(Path::new(ADMIN_DIR)),
                login_path().as_deref(),
                &home,
            );
            let Some(dir) = dir else {
                let target = Path::new(ADMIN_DIR).join("leve");
                check_free(&target)?;
                return Ok(Outcome::NeedsAdmin {
                    path: target.display().to_string(),
                });
            };
            let _ = std::fs::create_dir_all(&dir);
            let target = dir.join("leve");
            check_free(&target)?;
            write_script(&target, &body)?;
            return Ok(Outcome::Installed {
                path: target.display().to_string(),
            });
        }
        let target = Path::new(ADMIN_DIR).join("leve");
        check_free(&target)?;
        std::fs::create_dir_all(scratch).map_err(|e| e.to_string())?;
        let staged = scratch.join("leve-cli");
        write_script(&staged, &body)?;
        // O caminho vai como argumento (`item 1 of argv`) e entra no shell por `quoted form of`:
        // nada do caminho é interpretado como AppleScript nem como shell.
        let out = Command::new("/usr/bin/osascript")
            .args([
                "-e",
                "on run argv",
                "-e",
                "do shell script \"/bin/mkdir -p /usr/local/bin && /bin/cp \" & quoted form of item 1 of argv & \" /usr/local/bin/leve && /bin/chmod 755 /usr/local/bin/leve\" with administrator privileges",
                "-e",
                "end run",
            ])
            .arg(&staged)
            .output()
            .map_err(|e| e.to_string())?;
        let _ = std::fs::remove_file(&staged);
        if out.status.success() {
            return Ok(Outcome::Installed {
                path: target.display().to_string(),
            });
        }
        let err = String::from_utf8_lossy(&out.stderr);
        if err.contains("-128") {
            return Ok(Outcome::Cancelled);
        }
        Err(err.trim().to_owned())
    }
}

#[cfg(target_os = "macos")]
pub use mac::install;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn script_abre_pelo_identificador_e_e_marcado() {
        let s = script("br.com.moralia.leve");
        assert!(s.starts_with("#!/bin/sh\n"));
        assert!(s.contains(MARKER));
        assert!(s.contains("exec /usr/bin/open -b br.com.moralia.leve \"$@\""));
        assert!(!foreign(Some(&s)), "reinstalar substitui o próprio script");
        assert!(foreign(Some("#!/bin/sh\necho outro leve\n")));
        assert!(!foreign(None));
    }

    #[cfg(unix)]
    #[test]
    fn script_roda_no_sh_e_protege_nome_com_hifen() {
        // Troca o `open` por `echo` para ver os argumentos que ele receberia.
        let s = script("x.y").replace("exec /usr/bin/open", "exec echo");
        let out = std::process::Command::new("/bin/sh")
            .args(["-c", &s, "leve", "a b.md", "-n.md", "../c.md"])
            .output()
            .unwrap();
        assert_eq!(
            String::from_utf8_lossy(&out.stdout),
            "-b x.y a b.md ./-n.md ../c.md\n"
        );
        let out = std::process::Command::new("/bin/sh")
            .args(["-c", &s, "leve"])
            .output()
            .unwrap();
        assert_eq!(String::from_utf8_lossy(&out.stdout), "-b x.y\n");
    }

    #[test]
    fn path_do_shell_de_login_entre_marcas() {
        let out = format!("bem-vindo!\n\n{PATH_TAG}/opt/homebrew/bin:/usr/bin\n");
        assert_eq!(
            parse_login_path(&out).as_deref(),
            Some("/opt/homebrew/bin:/usr/bin")
        );
        assert_eq!(parse_login_path("nada aqui"), None);
    }

    #[test]
    fn destino_sem_senha() {
        let home = Path::new("/Users/x");
        assert_eq!(
            choose_dir(true, None, home),
            Some(PathBuf::from("/usr/local/bin"))
        );
        assert_eq!(
            choose_dir(false, Some("/usr/bin:/Users/x/.local/bin/"), home),
            Some(PathBuf::from("/Users/x/.local/bin"))
        );
        assert_eq!(
            choose_dir(false, Some("~/bin:/usr/bin"), home),
            Some(PathBuf::from("/Users/x/bin"))
        );
        assert_eq!(
            choose_dir(false, Some("/opt/homebrew/bin:/usr/bin"), home),
            None
        );
        assert_eq!(choose_dir(false, None, home), None);
    }
}
