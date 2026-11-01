//! Exportar HTML: imagens como data URI (`export_images`) e gravação só no caminho escolhido no
//! diálogo de salvar, aberto aqui (`save_html`). `write_picked` também grava o documento colado
//! (`save_markdown`). Decisão em `docs/decisoes.md`.

use std::{
    collections::HashMap,
    path::{Path, PathBuf},
};

use base64::{Engine, engine::general_purpose::STANDARD as BASE64};
use serde::Serialize;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;

use crate::{
    AppState, ext_lower, fill,
    grants::{asset_candidate, dir_in_grants, file_in_grants},
    i18n,
};

/// Exportar HTML: imagem local acima disso não entra no arquivo; o frontend mantém o caminho
/// relativo e avisa. Mesmo valor de `EXPORT_IMAGE_MAX_BYTES` em `src/export.ts`.
const EXPORT_IMAGE_MAX_BYTES: u64 = 5 * 1024 * 1024;

/// Imagem lida para o HTML exportado: data URI, ou nada (`too_big` diz se foi pelo tamanho).
#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ExportImage {
    data: Option<String>,
    too_big: bool,
}

fn image_mime(p: &Path) -> &'static str {
    match ext_lower(p).as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "svg" => "image/svg+xml",
        "webp" => "image/webp",
        "avif" => "image/avif",
        "bmp" => "image/bmp",
        "ico" => "image/x-icon",
        _ => "application/octet-stream",
    }
}

/// Mesma regra de `allow_assets` (relativo à pasta, existe, extensão de imagem): só lê o que o
/// documento já mostra. Acima de `max` nem lê o conteúdo. Herdado de `asset_candidate`: `..` vale
/// (o alvo canônico pode estar fora da pasta, como no asset protocol) e symlink é seguido, mas
/// quem decide é o alvo canônico: tem de ser arquivo com extensão de imagem.
fn export_image(dir: &Path, rel: &str, max: u64) -> ExportImage {
    let none = ExportImage {
        data: None,
        too_big: false,
    };
    let Some(p) = asset_candidate(dir, rel) else {
        return none;
    };
    let too_big = ExportImage {
        data: None,
        too_big: true,
    };
    match std::fs::metadata(&p) {
        Ok(m) if m.len() > max => return too_big,
        Ok(_) => {}
        Err(_) => return none,
    }
    match std::fs::read(&p) {
        Ok(bytes) if bytes.len() as u64 > max => too_big,
        Ok(bytes) => ExportImage {
            data: Some(format!(
                "data:{};base64,{}",
                image_mime(&p),
                BASE64.encode(bytes)
            )),
            too_big: false,
        },
        Err(_) => none,
    }
}

/// Exportar HTML: imagens locais de um documento concedido como data URI, para o arquivo sair
/// com elas dentro. Só a pasta de um documento concedido (`granted_dir`) e só imagem relativa.
#[tauri::command]
pub async fn export_images(
    state: State<'_, AppState>,
    dir: String,
    rels: Vec<String>,
) -> Result<HashMap<String, ExportImage>, String> {
    let grants = state.granted.lock().unwrap().clone();
    tauri::async_runtime::spawn_blocking(move || {
        export_images_in(&grants, &dir, rels, EXPORT_IMAGE_MAX_BYTES)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Miolo de `export_images`, sem `State`: recusa pasta que não é de documento concedido.
fn export_images_in(
    grants: &[PathBuf],
    dir: &str,
    rels: Vec<String>,
    max: u64,
) -> Result<HashMap<String, ExportImage>, String> {
    let d = dir_in_grants(grants, dir)?;
    Ok(rels
        .into_iter()
        .map(|rel| {
            let img = export_image(&d, &rel, max);
            (rel, img)
        })
        .collect())
}

/// Pasta e nome sugeridos (`<nome>.html`) para exportar `doc`, que tem de estar concedido.
fn export_source(grants: &[PathBuf], doc: &str) -> Result<(Option<PathBuf>, String), String> {
    let src = file_in_grants(grants, doc)?;
    let stem = src
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| "documento".into());
    Ok((src.parent().map(Path::to_path_buf), format!("{stem}.html")))
}

/// Grava o HTML no caminho escolhido no diálogo (`write_picked` com `.html`/`.htm`): o `.md` de
/// origem nunca é sobrescrito e nada é sobrescrito sem confirmação.
fn write_export(picked: PathBuf, html: &str) -> Result<PathBuf, String> {
    write_picked(picked, html, &["html", "htm"], i18n::s().export_exists)
}

/// Grava `text` no caminho escolhido num diálogo de salvar. Com uma das `exts`, é o caminho que o
/// diálogo confirmou (inclusive a sobrescrita): escrita normal. Com outra extensão (ou nenhuma),
/// grava em `<caminho>.<exts[0]>`, que o diálogo NÃO confirmou: só se ainda não existir
/// (`create_new`, que também recusa symlink nesse lugar); senão, recusa com `exists` (`{path}`) e
/// não toca no que está lá.
pub fn write_picked(
    picked: PathBuf,
    text: &str,
    exts: &[&str],
    exists: &str,
) -> Result<PathBuf, String> {
    use std::io::Write;
    let failed = |p: &Path, e: std::io::Error| {
        fill(
            i18n::s().write_failed,
            &[
                ("path", &p.display().to_string()),
                ("error", &e.to_string()),
            ],
        )
    };
    if exts.contains(&ext_lower(&picked).as_str()) {
        std::fs::write(&picked, text).map_err(|e| failed(&picked, e))?;
        return Ok(picked);
    }
    let mut s = picked.into_os_string();
    s.push(".");
    s.push(exts[0]);
    let target = PathBuf::from(s);
    let mut f = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&target)
        .map_err(|e| {
            if e.kind() == std::io::ErrorKind::AlreadyExists {
                fill(exists, &[("path", &target.display().to_string())])
            } else {
                failed(&target, e)
            }
        })?;
    f.write_all(text.as_bytes())
        .map_err(|e| failed(&target, e))?;
    Ok(target)
}

/// Exportar HTML: diálogo nativo de salvar aberto AQUI, sugerindo `<nome>.html` na pasta do
/// documento, e escrita só no caminho escolhido nele. O frontend manda o documento de origem
/// (precisa estar concedido) e o conteúdo; nunca o destino. `None` = cancelado.
#[tauri::command]
pub async fn save_html(
    app: AppHandle,
    doc: String,
    html: String,
) -> Result<Option<String>, String> {
    let (dir, name) = export_source(&app.state::<AppState>().granted.lock().unwrap(), &doc)?;
    let mut dialog = app
        .dialog()
        .file()
        .add_filter("HTML", &["html", "htm"])
        .set_file_name(name);
    if let Some(dir) = dir {
        dialog = dialog.set_directory(dir);
    }
    tauri::async_runtime::spawn_blocking(move || {
        let Some(picked) = dialog.blocking_save_file() else {
            return Ok(None);
        };
        let path = write_export(picked.into_path().map_err(|e| e.to_string())?, &html)?;
        Ok(Some(path.to_string_lossy().into_owned()))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::MD_EXTS;

    fn temp(tag: &str) -> PathBuf {
        let p = std::env::temp_dir().join(format!("leve-scope-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&p);
        std::fs::create_dir_all(&p).unwrap();
        p
    }

    fn fs_canon(p: &Path) -> PathBuf {
        crate::grants::canonical(&p.to_string_lossy()).unwrap()
    }

    #[test]
    fn exportar_embute_so_imagem_relativa_e_respeita_o_limite() {
        let t = temp("export-img");
        std::fs::create_dir_all(t.join("img")).unwrap();
        std::fs::write(t.join("img/a.png"), [0x89, b'P', b'N', b'G']).unwrap();
        std::fs::write(t.join("img/b.svg"), "<svg/>").unwrap();
        std::fs::write(t.join("segredo.txt"), "x").unwrap();
        let a = export_image(&t, "img/a.png", 1024);
        assert_eq!(a.data.as_deref(), Some("data:image/png;base64,iVBORw=="));
        assert!(!a.too_big);
        assert_eq!(
            export_image(&t, "img/b.svg", 1024).data.as_deref(),
            Some("data:image/svg+xml;base64,PHN2Zy8+")
        );
        // Acima do limite: não lê, avisa pelo tamanho.
        assert_eq!(
            export_image(&t, "img/a.png", 3),
            ExportImage {
                data: None,
                too_big: true
            }
        );
        // Mesma regra do asset protocol: só imagem, só relativo, só o que existe.
        let none = ExportImage {
            data: None,
            too_big: false,
        };
        assert_eq!(export_image(&t, "segredo.txt", 1024), none);
        let abs = t.join("img/a.png").to_string_lossy().into_owned();
        assert_eq!(export_image(&t, &abs, 1024), none);
        assert_eq!(export_image(&t, "nao-existe.png", 1024), none);
        let _ = std::fs::remove_dir_all(&t);
    }

    #[test]
    fn exportar_grava_so_o_que_o_dialogo_confirmou() {
        let t = temp("export-write");
        // `.html` do diálogo: sobrescrita confirmada.
        std::fs::write(t.join("a.html"), "velho").unwrap();
        assert_eq!(
            write_export(t.join("a.html"), "novo").unwrap(),
            t.join("a.html")
        );
        assert_eq!(std::fs::read_to_string(t.join("a.html")).unwrap(), "novo");
        // Outra extensão: cria `<nome>.html` se não existir; o `.md` não é tocado.
        std::fs::write(t.join("doc.md"), "fonte").unwrap();
        assert_eq!(
            write_export(t.join("doc.md"), "x").unwrap(),
            t.join("doc.md.html")
        );
        assert_eq!(std::fs::read_to_string(t.join("doc.md")).unwrap(), "fonte");
        assert_eq!(
            write_export(t.join("sem-ext"), "y").unwrap(),
            t.join("sem-ext.html")
        );
        // ...e recusa se já existir, sem alterar o arquivo.
        std::fs::write(t.join("b.md.html"), "existente").unwrap();
        let err = write_export(t.join("b.md"), "z").unwrap_err();
        assert!(err.contains("b.md.html"), "{err}");
        assert_eq!(
            std::fs::read_to_string(t.join("b.md.html")).unwrap(),
            "existente"
        );
        let _ = std::fs::remove_dir_all(&t);
    }

    #[test]
    fn salvar_md_grava_so_o_que_o_dialogo_confirmou() {
        let t = temp("salvar-md");
        let save = |p: PathBuf, text: &str| write_picked(p, text, MD_EXTS, "existe {path}");
        // Nome com extensão Markdown veio do diálogo, que confirmou sobrescrever.
        std::fs::write(t.join("a.md"), "velho").unwrap();
        assert_eq!(save(t.join("a.md"), "novo").unwrap(), t.join("a.md"));
        assert_eq!(std::fs::read_to_string(t.join("a.md")).unwrap(), "novo");
        assert_eq!(
            save(t.join("b.MARKDOWN"), "x").unwrap(),
            t.join("b.MARKDOWN")
        );
        // Sem extensão (ou outra): ganha `.md` e é criado.
        assert_eq!(save(t.join("nota"), "oi").unwrap(), t.join("nota.md"));
        assert_eq!(std::fs::read_to_string(t.join("nota.md")).unwrap(), "oi");
        assert_eq!(save(t.join("n.txt"), "oi").unwrap(), t.join("n.txt.md"));
        // O `.md` acrescentado já existe: recusa e não toca.
        std::fs::write(t.join("outra.md"), "intacto").unwrap();
        let err = save(t.join("outra"), "x").unwrap_err();
        assert_eq!(err, format!("existe {}", t.join("outra.md").display()));
        assert_eq!(
            std::fs::read_to_string(t.join("outra.md")).unwrap(),
            "intacto"
        );
        #[cfg(unix)]
        {
            std::fs::write(t.join("alvo.txt"), "alvo").unwrap();
            std::os::unix::fs::symlink(t.join("alvo.txt"), t.join("link.md")).unwrap();
            assert!(save(t.join("link"), "x").is_err());
            assert_eq!(std::fs::read_to_string(t.join("alvo.txt")).unwrap(), "alvo");
        }
        let _ = std::fs::remove_dir_all(&t);
    }

    #[cfg(unix)]
    #[test]
    fn exportar_nao_segue_symlink_no_nome_acrescentado() {
        let t = temp("export-symlink");
        std::fs::write(t.join("alvo.txt"), "intocado").unwrap();
        std::os::unix::fs::symlink(t.join("alvo.txt"), t.join("c.html")).unwrap();
        assert!(write_export(t.join("c"), "z").is_err());
        assert_eq!(
            std::fs::read_to_string(t.join("alvo.txt")).unwrap(),
            "intocado"
        );
        let _ = std::fs::remove_dir_all(&t);
    }

    #[test]
    fn exportar_so_a_partir_de_documento_concedido() {
        let t = temp("export-grant");
        std::fs::create_dir_all(t.join("docs")).unwrap();
        std::fs::create_dir_all(t.join("outra")).unwrap();
        std::fs::write(t.join("docs/nota.md"), "# x").unwrap();
        std::fs::write(t.join("outra/solta.md"), "# y").unwrap();
        std::fs::write(t.join("outra/a.png"), "png").unwrap();
        let grants = vec![fs_canon(&t.join("docs/nota.md"))];
        let docs = t.join("docs").to_string_lossy().into_owned();
        let outra = t.join("outra").to_string_lossy().into_owned();
        // Origem do diálogo de salvar: só documento concedido.
        let (dir, name) =
            export_source(&grants, &t.join("docs/nota.md").to_string_lossy()).unwrap();
        assert_eq!(dir, Some(fs_canon(&t.join("docs"))));
        assert_eq!(name, "nota.html");
        assert!(export_source(&grants, &t.join("outra/solta.md").to_string_lossy()).is_err());
        // Imagens: só da pasta de documento concedido.
        assert!(export_images_in(&grants, &outra, vec!["a.png".into()], 1024).is_err());
        let ok = export_images_in(&grants, &docs, vec!["../outra/a.png".into()], 1024).unwrap();
        // `..` vale como no asset protocol (herdado de `asset_candidate`).
        assert!(ok["../outra/a.png"].data.is_some());
        let _ = std::fs::remove_dir_all(&t);
    }

    #[cfg(unix)]
    #[test]
    fn exportar_imagem_por_symlink_decide_pelo_alvo() {
        let t = temp("export-img-link");
        std::fs::create_dir_all(t.join("docs")).unwrap();
        std::fs::write(t.join("foto.png"), "png").unwrap();
        std::fs::write(t.join("segredo.txt"), "s").unwrap();
        std::os::unix::fs::symlink(t.join("foto.png"), t.join("docs/link.png")).unwrap();
        std::os::unix::fs::symlink(t.join("segredo.txt"), t.join("docs/disfarce.png")).unwrap();
        let d = t.join("docs");
        // Segue o link, mas o alvo canônico precisa ser imagem: `.txt` com nome `.png` não entra.
        assert!(export_image(&d, "link.png", 1024).data.is_some());
        assert_eq!(export_image(&d, "disfarce.png", 1024).data, None);
        let _ = std::fs::remove_dir_all(&t);
    }
}
