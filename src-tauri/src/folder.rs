//! Arquivo › Abrir pasta: lista os Markdown de uma pasta concedida, com limites, sem sair da raiz.
//! A concessão em si (lista, `grants.json`, esquecer) fica em `grants.rs`; aqui só o disco.
//! Decisão em `docs/decisoes.md` ("Abrir pasta: concessão da raiz, só Markdown").

use std::{
    collections::VecDeque,
    path::{Path, PathBuf},
};

use serde::Serialize;

use crate::is_markdown;

/// Níveis abaixo da raiz que a listagem visita (a raiz é o nível 0).
pub const DEPTH_MAX: usize = 12;
/// Arquivos Markdown na lista; acima disso, `truncated`.
pub const FILES_MAX: usize = 5_000;
/// Entradas de diretório lidas (arquivos e pastas, de qualquer tipo) antes de desistir: uma pasta
/// enorme sem Markdown (fotos, build) não pode prender a listagem.
pub const ENTRIES_MAX: usize = 50_000;

/// Pasta ou arquivo que a listagem e a busca de wikilink pulam: ocultos (`.git`, `.obsidian`) e
/// `node_modules`. É ruído e custo, não segurança: um link relativo de um documento ainda abre.
pub fn skipped(name: &str) -> bool {
    name.starts_with('.') || name == "node_modules"
}

/// Markdown de uma pasta, em largura: toda pasta rasa antes de qualquer funda, e em cada pasta as
/// entradas em ordem de nome. Caminhos relativos à raiz, com `/` em todo sistema.
#[derive(Debug, Serialize)]
pub struct Listing {
    #[serde(skip)]
    pub root: PathBuf,
    pub files: Vec<String>,
    /// Algum limite (`DEPTH_MAX`, `FILES_MAX`, `ENTRIES_MAX`) cortou a lista.
    pub truncated: bool,
}

/// Lista os Markdown sob `root` (forma canônica). Link simbólico: vale pelo alvo canônico, que tem
/// de estar dentro da raiz e ser Markdown; pasta por link simbólico não é visitada (evita ciclo e
/// duplicata, e o que ela aponta dentro da raiz já aparece pelo caminho de verdade).
pub fn list_markdown(root: &Path) -> Result<Listing, String> {
    let root = std::fs::canonicalize(root).map_err(|e| format!("{}: {e}", root.display()))?;
    let mut files = Vec::new();
    let mut truncated = false;
    let mut seen = 0usize;
    let mut queue = VecDeque::from([(root.clone(), 0usize)]);
    'walk: while let Some((dir, depth)) = queue.pop_front() {
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        let mut entries: Vec<_> = entries.flatten().collect();
        entries.sort_by_key(|e| e.file_name());
        for entry in entries {
            seen += 1;
            if seen > ENTRIES_MAX {
                truncated = true;
                break 'walk;
            }
            let name = entry.file_name();
            if skipped(&name.to_string_lossy()) {
                continue;
            }
            let path = entry.path();
            let Ok(kind) = entry.file_type() else {
                continue;
            };
            let listed = if kind.is_dir() {
                if depth < DEPTH_MAX {
                    queue.push_back((path.clone(), depth + 1));
                } else {
                    truncated = true;
                }
                false
            } else if kind.is_symlink() {
                is_markdown(&path) && inside(&root, &path).is_some()
            } else {
                kind.is_file() && is_markdown(&path)
            };
            if listed {
                if files.len() == FILES_MAX {
                    truncated = true;
                    break 'walk;
                }
                files.push(rel_slash(&root, &path));
            }
        }
    }
    Ok(Listing {
        root,
        files,
        truncated,
    })
}

/// Alvo canônico de `path` se for arquivo Markdown dentro de `root` (canônica); `None` se não
/// existe, sai da raiz (inclusive por link simbólico ou `..`) ou não é Markdown.
pub fn inside(root: &Path, path: &Path) -> Option<PathBuf> {
    let c = std::fs::canonicalize(path).ok()?;
    (c.starts_with(root) && c.is_file() && is_markdown(&c)).then_some(c)
}

fn rel_slash(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .components()
        .map(|c| c.as_os_str().to_string_lossy())
        .collect::<Vec<_>>()
        .join("/")
}

/// Primeiro arquivo da listagem com esse nome (sem distinguir maiúsculas): o mais raso, como o
/// "caminho mais curto" do Obsidian. Forma canônica.
pub fn find_by_name(listing: &Listing, name: &str) -> Option<PathBuf> {
    listing
        .files
        .iter()
        .find(|rel| {
            rel.rsplit('/')
                .next()
                .is_some_and(|f| f.to_lowercase() == name)
        })
        .and_then(|rel| inside(&listing.root, &listing.root.join(rel)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    struct TempDir(PathBuf);
    impl TempDir {
        fn new(tag: &str) -> Self {
            let p = std::env::temp_dir().join(format!("leve-pasta-{tag}-{}", std::process::id()));
            let _ = fs::remove_dir_all(&p);
            fs::create_dir_all(&p).unwrap();
            Self(p)
        }
        fn file(&self, rel: &str) -> PathBuf {
            let p = self.0.join(rel);
            fs::create_dir_all(p.parent().unwrap()).unwrap();
            fs::write(&p, "# x").unwrap();
            p
        }
    }
    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn lista_so_markdown_em_largura_pulando_ocultos() {
        let t = TempDir::new("lista");
        t.file("b.md");
        t.file("A.markdown");
        t.file("img.png");
        t.file("notas.txt");
        t.file("sub/c.md");
        t.file("sub/fundo/d.mdown");
        t.file(".git/e.md");
        t.file(".oculto.md");
        t.file("node_modules/pkg/f.md");
        let l = list_markdown(&t.0).unwrap();
        assert_eq!(
            l.files,
            vec!["A.markdown", "b.md", "sub/c.md", "sub/fundo/d.mdown"]
        );
        assert!(!l.truncated);
        assert_eq!(l.root, fs::canonicalize(&t.0).unwrap());
    }

    #[cfg(unix)]
    #[test]
    fn link_simbolico_para_fora_da_raiz_e_recusado() {
        use std::os::unix::fs::symlink;
        let t = TempDir::new("symlink");
        let fora = t.file("fora/segredo.md");
        t.file("fora/outro.md");
        t.file("raiz/dentro.md");
        let raiz = t.0.join("raiz");
        symlink(&fora, raiz.join("atalho.md")).unwrap();
        symlink(t.0.join("fora"), raiz.join("pasta-fora")).unwrap();
        symlink(raiz.join("dentro.md"), raiz.join("alias.md")).unwrap();
        symlink(&raiz, raiz.join("ciclo")).unwrap();
        let l = list_markdown(&raiz).unwrap();
        assert_eq!(
            l.files,
            vec!["alias.md", "dentro.md"],
            "link para fora (arquivo ou pasta) fica de fora; link para dentro vale; sem ciclo"
        );
        let root = fs::canonicalize(&raiz).unwrap();
        assert_eq!(inside(&root, &raiz.join("atalho.md")), None);
        assert_eq!(inside(&root, &raiz.join("pasta-fora/outro.md")), None);
        assert_eq!(
            inside(&root, &raiz.join("alias.md")),
            Some(fs::canonicalize(raiz.join("dentro.md")).unwrap())
        );
    }

    #[test]
    fn inside_recusa_ponto_ponto_para_fora_e_nao_markdown() {
        let t = TempDir::new("pontoponto");
        t.file("vizinho.md");
        t.file("raiz/a.md");
        t.file("raiz/sub/b.md");
        t.file("raiz/c.txt");
        let root = fs::canonicalize(t.0.join("raiz")).unwrap();
        assert!(inside(&root, &root.join("../vizinho.md")).is_none());
        assert!(
            inside(&root, &root.join("sub/../a.md")).is_some(),
            "`..` que fica dentro vale"
        );
        assert!(inside(&root, &root.join("c.txt")).is_none());
        assert!(
            inside(&root, &root.join("sub")).is_none(),
            "pasta não é arquivo"
        );
        assert!(inside(&root, &root.join("nada.md")).is_none());
    }

    #[test]
    fn limites_de_profundidade_e_de_arquivos_cortam_e_avisam() {
        let t = TempDir::new("limites");
        let mut fundo = String::new();
        for i in 0..=DEPTH_MAX {
            fundo.push_str(&format!("n{i}/"));
        }
        t.file(&format!("{fundo}longe.md"));
        t.file("perto.md");
        let l = list_markdown(&t.0).unwrap();
        assert_eq!(l.files, vec!["perto.md"]);
        assert!(l.truncated, "pasta além de DEPTH_MAX corta e avisa");

        let t = TempDir::new("muitos");
        for i in 0..=FILES_MAX {
            fs::write(t.0.join(format!("{i:05}.md")), "").unwrap();
        }
        let l = list_markdown(&t.0).unwrap();
        assert_eq!(l.files.len(), FILES_MAX);
        assert!(l.truncated);
    }

    #[test]
    fn find_by_name_prefere_pasta_rasa_e_ignora_ocultos() {
        let t = TempDir::new("rasa");
        let raso = t.file("b/x.md");
        t.file("a/fundo/x.md");
        t.file(".obsidian/Nota.md");
        let l = list_markdown(&t.0).unwrap();
        assert_eq!(
            find_by_name(&l, "x.md"),
            Some(fs::canonicalize(raso).unwrap())
        );
        assert_eq!(find_by_name(&l, "nota.md"), None);
    }
}
