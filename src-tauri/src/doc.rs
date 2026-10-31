//! Leitura de documento: limites, codificação e o comando `read_markdown`. Só lê caminho concedido
//! (`grants.rs`). Não voltar para `read_to_string`: ver `CLAUDE.md` ("Leitura de documento").

use std::path::Path;

use serde::Serialize;
use tauri::State;

use crate::{AppState, fill, grants::granted, i18n};

#[derive(Serialize)]
pub struct Doc {
    path: String,
    dir: String,
    name: String,
    content: String,
    /// Aviso de leitura para mostrar ao leitor (ex.: bytes inválidos substituídos), sem impedir a abertura.
    warning: Option<String>,
}

/// Acima disso o WebView leva segundos para desenhar e a memória dispara; ninguém lê isso num visualizador.
pub const MAX_DOC_BYTES: u64 = 20 * 1024 * 1024;

/// Bytes do arquivo → texto. BOM UTF-8 sai; UTF-16 (LE/BE com BOM, como salva o Bloco de Notas) é
/// decodificado; UTF-8 inválido abre com U+FFFD e aviso, em vez de recusar o arquivo; byte nulo sem
/// BOM de UTF-16 é binário e é recusado.
fn decode_text(bytes: &[u8]) -> Result<(String, Option<String>), String> {
    let utf16 = |be: bool| {
        let units: Vec<u16> = bytes[2..]
            .as_chunks::<2>()
            .0
            .iter()
            .map(|c| {
                if be {
                    u16::from_be_bytes(*c)
                } else {
                    u16::from_le_bytes(*c)
                }
            })
            .collect();
        String::from_utf16_lossy(&units)
    };
    match bytes {
        [0xEF, 0xBB, 0xBF, rest @ ..] => decode_utf8(rest),
        [0xFF, 0xFE, ..] => Ok((utf16(false), None)),
        [0xFE, 0xFF, ..] => Ok((utf16(true), None)),
        _ if bytes.iter().take(8192).any(|&b| b == 0) => Err(i18n::s().binary.into()),
        _ => decode_utf8(bytes),
    }
}

fn decode_utf8(bytes: &[u8]) -> Result<(String, Option<String>), String> {
    match std::str::from_utf8(bytes) {
        Ok(s) => Ok((s.to_owned(), None)),
        Err(_) => Ok((
            String::from_utf8_lossy(bytes).into_owned(),
            Some(i18n::s().not_utf8.into()),
        )),
    }
}

/// "Grande demais" para `n` bytes, com o limite (`MAX_DOC_BYTES`) em MB.
pub fn too_big(n: u64) -> String {
    fill(
        i18n::s().too_big,
        &[
            ("size", &format!("{:.0}", n as f64 / 1_048_576.0)),
            ("max", &(MAX_DOC_BYTES / 1_048_576).to_string()),
        ],
    )
}

/// Lê no máximo `MAX_DOC_BYTES` + 1 (o arquivo pode crescer entre o `metadata` e a leitura).
fn read_text_file(p: &Path) -> Result<(String, Option<String>), String> {
    use std::io::Read;
    let f = std::fs::File::open(p).map_err(|e| format!("{}: {e}", p.display()))?;
    let len = f.metadata().map(|m| m.len()).unwrap_or(0);
    if len > MAX_DOC_BYTES {
        return Err(too_big(len));
    }
    let mut bytes = Vec::with_capacity(len as usize);
    f.take(MAX_DOC_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| format!("{}: {e}", p.display()))?;
    if bytes.len() as u64 > MAX_DOC_BYTES {
        return Err(too_big(bytes.len() as u64));
    }
    decode_text(&bytes)
}

#[tauri::command]
pub fn read_markdown(state: State<AppState>, path: String) -> Result<Doc, String> {
    let p = granted(&state, &path)?;
    let (content, warning) = read_text_file(&p)?;
    let dir = p.parent().map(Path::to_path_buf).unwrap_or_default();
    Ok(Doc {
        path: p.to_string_lossy().into_owned(),
        dir: dir.to_string_lossy().into_owned(),
        name: p
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default(),
        content,
        warning,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{fs, path::PathBuf};

    /// Pasta temporária única por teste, removida ao sair de escopo.
    struct TempDir(PathBuf);
    impl TempDir {
        fn new(tag: &str) -> Self {
            let p = std::env::temp_dir().join(format!("leve-doc-{tag}-{}", std::process::id()));
            let _ = fs::remove_dir_all(&p);
            fs::create_dir_all(&p).unwrap();
            Self(p)
        }
    }
    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn decode_text_trata_bom_utf16_e_utf8_invalido() {
        assert_eq!(
            decode_text("# oi".as_bytes()).unwrap(),
            ("# oi".into(), None)
        );
        assert_eq!(decode_text(b"\xEF\xBB\xBF# oi").unwrap().0, "# oi");
        let le: Vec<u8> = [0xFF, 0xFE]
            .into_iter()
            .chain("# é".encode_utf16().flat_map(u16::to_le_bytes))
            .collect();
        assert_eq!(decode_text(&le).unwrap(), ("# é".into(), None));
        let be: Vec<u8> = [0xFE, 0xFF]
            .into_iter()
            .chain("# é".encode_utf16().flat_map(u16::to_be_bytes))
            .collect();
        assert_eq!(decode_text(&be).unwrap().0, "# é");
        let (s, w) = decode_text(b"caf\xE9 latin-1").unwrap();
        assert_eq!(s, "caf\u{FFFD} latin-1");
        assert!(w.unwrap().contains("UTF-8"));
        assert!(decode_text(b"PNG\x00\x01\x02").is_err());
    }

    #[test]
    fn read_text_file_recusa_arquivo_grande_demais() {
        let t = TempDir::new("grande");
        let p = t.0.join("g.md");
        let f = fs::File::create(&p).unwrap();
        f.set_len(MAX_DOC_BYTES + 1).unwrap();
        let e = read_text_file(&p).unwrap_err();
        assert!(e.contains("grande demais"), "{e}");
        fs::write(&p, "# ok").unwrap();
        assert_eq!(read_text_file(&p).unwrap().0, "# ok");
    }
}
