//! Wikilinks `[[nota]]`: resolve na pasta do documento e, com pasta aberta, pelo nome nos Markdown
//! dela. Só devolve o que concede (`grants.rs`). O frontend fica em `src/wikilinks.ts`.

use std::{collections::HashMap, path::Path};

use tauri::State;

use crate::{
    AppState, folder,
    grants::{canonical, grant, granted_dir, granted_folder, relative_only},
    is_markdown,
};

/// Resolve wikilinks `[[nota]]`: tenta `nota.md` na pasta do documento; se não achar e houver
/// pasta raiz aberta, busca pelo nome do arquivo nos Markdown dela (como o Obsidian). `None` = não
/// existe.
#[tauri::command]
pub fn resolve_wikilinks(
    state: State<AppState>,
    dir: String,
    root: Option<String>,
    targets: Vec<String>,
) -> Result<HashMap<String, Option<String>>, String> {
    let dir = granted_dir(&state, &dir)?;
    // A raiz só vale se for pasta concedida (Abrir pasta) e contiver a pasta do documento; senão
    // os wikilinks resolvem só na pasta do documento.
    let root = root
        .and_then(|r| granted_folder(&state, &r).ok())
        .filter(|r| dir.starts_with(r));
    // Listada uma vez por chamada, e só se algum alvo não estiver na pasta do documento.
    let mut listing = None;
    Ok(targets
        .into_iter()
        .map(|t| {
            let found = resolve_wikilink(&dir, root.as_deref(), &mut listing, &t)
                .and_then(|f| grant(&state, Path::new(&f)).ok())
                .map(|c| c.to_string_lossy().into_owned());
            (t, found)
        })
        .collect())
}

fn canonical_string(p: &Path) -> Option<String> {
    canonical(&p.to_string_lossy())
        .ok()
        .map(|c| c.to_string_lossy().into_owned())
}

pub fn resolve_wikilink(
    dir: &Path,
    root: Option<&Path>,
    listing: &mut Option<folder::Listing>,
    target: &str,
) -> Option<String> {
    relative_only(target).ok()?;
    let rel = if is_markdown(Path::new(target)) {
        target.to_string()
    } else {
        format!("{target}.md")
    };
    let direct = dir.join(&rel);
    if direct.is_file() {
        return canonical_string(&direct);
    }
    let name = Path::new(&rel)
        .file_name()?
        .to_string_lossy()
        .to_lowercase();
    let root = root?;
    if listing.is_none() {
        *listing = folder::list_markdown(root).ok();
    }
    folder::find_by_name(listing.as_ref()?, &name).map(|c| c.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{fs, path::PathBuf};

    /// Pasta temporária única por teste, removida ao sair de escopo.
    struct TempDir(PathBuf);
    impl TempDir {
        fn new(tag: &str) -> Self {
            let p = std::env::temp_dir().join(format!("leve-wiki-{tag}-{}", std::process::id()));
            let _ = fs::remove_dir_all(&p);
            fs::create_dir_all(&p).unwrap();
            Self(p)
        }
        fn file(&self, rel: &str, content: &str) -> PathBuf {
            let p = self.0.join(rel);
            fs::create_dir_all(p.parent().unwrap()).unwrap();
            fs::write(&p, content).unwrap();
            p
        }
    }
    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn resolve_wikilink_na_pasta_do_documento() {
        let t = TempDir::new("wiki-dir");
        let nota = t.file("nota.md", "");
        t.file("sub/outra.markdown", "");
        let dir = &t.0;
        let canon = |p: &Path| canonical_string(p).unwrap();
        assert_eq!(
            resolve_wikilink(dir, None, &mut None, "nota"),
            Some(canon(&nota))
        );
        assert_eq!(
            resolve_wikilink(dir, None, &mut None, "nota.md"),
            Some(canon(&nota))
        );
        assert_eq!(
            resolve_wikilink(dir, None, &mut None, "sub/outra.markdown"),
            Some(canon(&dir.join("sub/outra.markdown")))
        );
        assert_eq!(resolve_wikilink(dir, None, &mut None, "inexistente"), None);
        assert_eq!(
            resolve_wikilink(dir, None, &mut None, "outra"),
            None,
            "sem root não desce em subpastas"
        );
    }

    #[test]
    fn resolve_wikilink_busca_recursiva_na_raiz() {
        let t = TempDir::new("wiki-root");
        let dir = t.0.join("docs");
        fs::create_dir_all(&dir).unwrap();
        let alvo = t.file("vault/pasta/Profunda/Nota Alvo.md", "");
        t.file("vault/.obsidian/Nota Alvo.md", "");
        t.file("vault/node_modules/Nota Alvo.md", "");
        let canon = |p: &Path| canonical_string(p).unwrap();
        assert_eq!(
            resolve_wikilink(&dir, Some(&t.0.join("vault")), &mut None, "nota alvo"),
            Some(canon(&alvo)),
            "nome sem distinguir caixa, ignorando .obsidian e node_modules"
        );
        assert_eq!(
            resolve_wikilink(&dir, Some(&t.0.join("vault")), &mut None, "nada"),
            None
        );
    }
}
