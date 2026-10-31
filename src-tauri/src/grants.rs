//! Concessão: o Rust só lê caminhos concedidos, e só concede por origem legítima. Aqui ficam as
//! listas (`AppState.granted`, `AppState.folders`, `grants.json`), as guardas (`granted*`,
//! `relative_only`) e os comandos que respondem a partir delas. Os diálogos que concedem ficam em
//! `lib.rs`. Regra completa em `CLAUDE.md` ("Menor privilégio").

use std::{
    collections::HashMap,
    path::{Path, PathBuf},
};

use tauri::{AppHandle, Manager, State};

use crate::{AppState, ext_lower, fill, folder, i18n};

const GRANTS_MAX: usize = 200;
const FOLDERS_MAX: usize = 20;

fn deny(path: &Path) -> String {
    fill(i18n::s().denied, &[("path", &path.display().to_string())])
}

/// `grants.json` é uma lista só de caminhos: arquivos e, depois, pastas. Quem lê separa pelo disco
/// (`load_grant_lists`); versão antiga, que só aceita arquivo, descarta as pastas e segue lendo.
fn persist_grants(file: &Path, granted: &[PathBuf], folders: &[PathBuf]) {
    if let Some(dir) = file.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    let list: Vec<String> = granted
        .iter()
        .chain(folders)
        .map(|p| p.to_string_lossy().into_owned())
        .collect();
    if let Ok(json) = serde_json::to_string(&list) {
        let _ = std::fs::write(file, json);
    }
}

/// (arquivos, pastas) de `grants.json`, só o que ainda existe como tal.
fn load_grant_lists(file: &Path) -> (Vec<PathBuf>, Vec<PathBuf>) {
    let Ok(json) = std::fs::read_to_string(file) else {
        return (Vec::new(), Vec::new());
    };
    let all: Vec<PathBuf> = serde_json::from_str::<Vec<String>>(&json)
        .unwrap_or_default()
        .into_iter()
        .map(PathBuf::from)
        .collect();
    let files = all.iter().filter(|p| p.is_file()).cloned().collect();
    let folders = all.into_iter().filter(|p| p.is_dir()).collect();
    (files, folders)
}

#[cfg(test)]
fn load_grants(file: &Path) -> Vec<PathBuf> {
    load_grant_lists(file).0
}

/// Gravação depois de mexer numa das listas; o chamador já segura `granted` ou `folders`.
fn save_grants(state: &AppState, granted: &[PathBuf], folders: &[PathBuf]) {
    if let Some(f) = state.grants_file.lock().unwrap().as_deref() {
        persist_grants(f, granted, folders);
    }
}

/// Junta `fresh` (desta execução, mais recente) ao que veio do disco e corta pelo teto.
fn merge_capped(saved: Vec<PathBuf>, fresh: &mut Vec<PathBuf>, max: usize) -> Vec<PathBuf> {
    let mut merged = saved;
    merged.retain(|p| !fresh.contains(p));
    merged.append(fresh);
    if merged.len() > max {
        let excess = merged.len() - max;
        merged.drain(..excess);
    }
    merged
}

/// Liga a lista em memória ao arquivo em disco: carrega o que estava salvo, mantém o que já
/// foi concedido nesta execução (por último, como mais recente) e grava o resultado.
pub fn attach_grants_file(state: &AppState, file: PathBuf) {
    let mut g = state.granted.lock().unwrap();
    let mut d = state.folders.lock().unwrap();
    let (files, folders) = load_grant_lists(&file);
    *g = merge_capped(files, &mut g, GRANTS_MAX);
    *d = merge_capped(folders, &mut d, FOLDERS_MAX);
    persist_grants(&file, &g, &d);
    *state.grants_file.lock().unwrap() = Some(file);
}

/// Concede leitura a um arquivo existente (forma canônica) e persiste. Último concedido vai ao fim.
pub fn grant(state: &AppState, path: &Path) -> Result<PathBuf, String> {
    let c = canonical(&path.to_string_lossy())?;
    let mut g = state.granted.lock().unwrap();
    g.retain(|p| p != &c);
    g.push(c.clone());
    if g.len() > GRANTS_MAX {
        let excess = g.len() - GRANTS_MAX;
        g.drain(..excess);
    }
    save_grants(state, &g, &state.folders.lock().unwrap());
    Ok(c)
}

/// Concede uma pasta inteira para listar (forma canônica, tem de ser pasta) e persiste. Só
/// `pick_folder` chama: o diálogo no Rust é a única origem de concessão de pasta.
pub fn grant_folder(state: &AppState, path: &Path) -> Result<PathBuf, String> {
    let c = canonical(&path.to_string_lossy())?;
    if !c.is_dir() {
        return Err(deny(&c));
    }
    let g = state.granted.lock().unwrap();
    let mut d = state.folders.lock().unwrap();
    d.retain(|p| p != &c);
    d.push(c.clone());
    if d.len() > FOLDERS_MAX {
        let excess = d.len() - FOLDERS_MAX;
        d.drain(..excess);
    }
    save_grants(state, &g, &d);
    Ok(c)
}

/// Raiz canônica se `root` for uma pasta concedida; erro legível se não.
pub fn granted_folder(state: &AppState, root: &str) -> Result<PathBuf, String> {
    let c = canonical(root)?;
    if state.folders.lock().unwrap().contains(&c) {
        Ok(c)
    } else {
        Err(deny(&c))
    }
}

/// Caminho canônico se já concedido; erro legível se não.
pub fn granted(state: &AppState, path: &str) -> Result<PathBuf, String> {
    file_in_grants(&state.granted.lock().unwrap(), path)
}

/// Miolo de `granted`, sem `State`: `path` (forma canônica) está na lista?
pub fn file_in_grants(grants: &[PathBuf], path: &str) -> Result<PathBuf, String> {
    let c = canonical(path)?;
    if grants.contains(&c) {
        Ok(c)
    } else {
        Err(deny(&c))
    }
}

/// Pasta de algum documento concedido: origem legítima para resolver links e imagens relativos.
pub fn granted_dir(state: &AppState, dir: &str) -> Result<PathBuf, String> {
    dir_in_grants(&state.granted.lock().unwrap(), dir)
}

/// Miolo de `granted_dir`, sem `State`: `dir` é a pasta de algum arquivo da lista?
pub fn dir_in_grants(grants: &[PathBuf], dir: &str) -> Result<PathBuf, String> {
    let d = canonical(dir)?;
    let ok = grants.iter().any(|p| p.parent() == Some(d.as_path()));
    if ok { Ok(d) } else { Err(deny(&d)) }
}

/// Esvazia a lista de concessões, menos `keep` (as abas abertas agora), e grava. Devolve
/// quantos caminhos saíram.
fn forget_grants_except(state: &AppState, keep: &[PathBuf]) -> usize {
    let mut g = state.granted.lock().unwrap();
    let mut d = state.folders.lock().unwrap();
    let before = g.len() + d.len();
    g.retain(|p| keep.contains(p));
    d.retain(|p| keep.contains(p));
    save_grants(state, &g, &d);
    before - g.len() - d.len()
}

/// Preferências › "Esquecer arquivos autorizados": o frontend manda as abas abertas e a pasta
/// aberta no painel, que continuam concedidas (senão a aba ativa falharia na próxima leitura);
/// todo o resto, arquivo ou pasta, sai da lista em memória e de `grants.json`. Os Recentes do
/// frontend são apagados por ele.
#[tauri::command]
pub fn forget_grants(state: State<AppState>, keep: Vec<String>) -> usize {
    let keep: Vec<PathBuf> = keep.iter().filter_map(|p| canonical(p).ok()).collect();
    forget_grants_except(&state, &keep)
}

/// Extensões que `allow_assets` libera no asset protocol (só o que um `<img>` mostra).
const IMAGE_EXT: &[&str] = &[
    "png", "jpg", "jpeg", "gif", "svg", "webp", "avif", "bmp", "ico",
];

/// Caminho que um documento pede tem de ser relativo à pasta dele. Absoluto (`/etc/x`, `C:\\x`) ou
/// UNC (`\\\\servidor\\pasta`) é recusado: `Path::join` trocaria a pasta inteira pelo pedido, e no
/// Windows só resolver um UNC já abre conexão SMB com o servidor do documento. `..` continua valendo
/// (`../img/a.png` é comum), porque o alvo ainda passa por `canonical` e pela lista de concessões.
pub fn relative_only(rel: &str) -> Result<&Path, String> {
    let p = Path::new(rel);
    // `C:x` (relativo ao cwd do drive) também troca a base no `join` do Windows; `has_root` não o vê.
    let drive =
        rel.len() >= 2 && rel.as_bytes()[1] == b':' && rel.as_bytes()[0].is_ascii_alphabetic();
    if p.has_root() || drive || rel.starts_with('/') || rel.starts_with('\\') {
        return Err(fill(i18n::s().absolute, &[("path", rel)]));
    }
    Ok(p)
}

/// Imagem relativa a uma pasta concedida: existe, é arquivo e tem extensão de imagem.
pub fn asset_candidate(dir: &Path, rel: &str) -> Option<PathBuf> {
    let rel = relative_only(rel).ok()?;
    let p = canonical(&dir.join(rel).to_string_lossy()).ok()?;
    (p.is_file() && IMAGE_EXT.contains(&ext_lower(&p).as_str())).then_some(p)
}

pub fn canonical(path: &str) -> Result<PathBuf, String> {
    std::fs::canonicalize(Path::new(path)).map_err(|e| format!("{path}: {e}"))
}

/// Resolve um link relativo a partir da pasta de um documento aberto e concede o alvo;
/// erro se a pasta não for de documento concedido ou o alvo não existir.
#[tauri::command]
pub fn resolve_path(state: State<AppState>, dir: String, rel: String) -> Result<String, String> {
    resolve_rel(&state, &dir, &rel).map(|c| c.to_string_lossy().into_owned())
}

/// Miolo de `resolve_path`, testável sem `State`. Erro de caminho absoluto chega ao leitor como
/// veio; alvo inexistente vira "Não encontrado", sem o texto do SO.
fn resolve_rel(state: &AppState, dir: &str, rel: &str) -> Result<PathBuf, String> {
    let d = granted_dir(state, dir)?;
    let r = relative_only(rel)?;
    grant(state, &d.join(r)).map_err(|_| fill(i18n::s().not_found, &[("path", rel)]))
}

/// Concede e devolve (forma canônica) um Markdown de dentro de uma pasta concedida, pedido pela
/// árvore ou pelo abrir rápido com caminho relativo à raiz.
#[tauri::command]
pub fn open_in_folder(state: State<AppState>, root: String, rel: String) -> Result<String, String> {
    folder_rel(&state, &root, &rel).map(|c| c.to_string_lossy().into_owned())
}

/// Miolo de `open_in_folder`, testável sem `State`: relativo (`relative_only`), e o alvo canônico
/// tem de ser Markdown dentro da raiz, mesmo por `..` ou link simbólico.
fn folder_rel(state: &AppState, root: &str, rel: &str) -> Result<PathBuf, String> {
    let r = granted_folder(state, root)?;
    let p = r.join(relative_only(rel)?);
    let c = folder::inside(&r, &p).ok_or_else(|| match canonical(&p.to_string_lossy()) {
        Ok(c) => deny(&c),
        Err(_) => fill(i18n::s().not_found, &[("path", rel)]),
    })?;
    grant(state, &c)
}

/// Quais caminhos ainda existem como arquivo (ou pasta, para pasta concedida) (Recentes: o que
/// sumiu aparece apagado). Só responde sobre caminhos já concedidos (`granted`, `folders`): fora
/// das listas é `false`, sem tocar o disco, para o comando não virar sonda de existência. Assíncrono porque um recente em volume
/// de rede fora do ar demora no `stat`, e o estado vazio não pode travar a janela por isso.
#[tauri::command]
pub async fn paths_exist(
    state: State<'_, AppState>,
    paths: Vec<String>,
) -> Result<Vec<bool>, String> {
    let granted: Vec<PathBuf> = state.granted.lock().unwrap().clone();
    let folders: Vec<PathBuf> = state.folders.lock().unwrap().clone();
    let out = tauri::async_runtime::spawn_blocking(move || {
        paths
            .iter()
            .map(|p| {
                let path = Path::new(p);
                (granted.iter().any(|g| g == path) && path.is_file())
                    || (folders.iter().any(|g| g == path) && path.is_dir())
            })
            .collect()
    })
    .await
    .map_err(|e| e.to_string())?;
    #[cfg(debug_assertions)]
    eprintln!("paths_exist: {out:?}");
    Ok(out)
}

/// Libera no asset protocol, arquivo por arquivo, as imagens que um documento concedido
/// referencia. Nada de pasta inteira: só o que o `<img>` pede e existe.
#[tauri::command]
pub fn allow_assets(
    app: AppHandle,
    state: State<AppState>,
    dir: String,
    rels: Vec<String>,
) -> Result<HashMap<String, Option<String>>, String> {
    let d = granted_dir(&state, &dir)?;
    let scope = app.asset_protocol_scope();
    Ok(rels
        .into_iter()
        .map(|rel| {
            let abs = asset_candidate(&d, &rel)
                .filter(|p| scope.allow_file(p).is_ok())
                .map(|p| p.to_string_lossy().into_owned());
            #[cfg(debug_assertions)]
            eprintln!("allow_assets: {rel} -> {abs:?}");
            (rel, abs)
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::wikilinks::resolve_wikilink;

    fn temp(tag: &str) -> PathBuf {
        let p = std::env::temp_dir().join(format!("leve-scope-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&p);
        std::fs::create_dir_all(&p).unwrap();
        p
    }

    fn fs_canon(p: &Path) -> PathBuf {
        std::fs::canonicalize(p).unwrap()
    }

    #[test]
    fn so_le_o_que_foi_concedido_e_persiste() {
        let t = temp("grant");
        let doc = t.join("doc.md");
        std::fs::write(&doc, "# a").unwrap();
        let state = AppState::default();
        *state.grants_file.lock().unwrap() = Some(t.join("grants.json"));
        let doc_s = doc.to_string_lossy().into_owned();
        assert!(
            granted(&state, &doc_s).is_err(),
            "antes de conceder, recusa"
        );
        let c = grant(&state, &doc).unwrap();
        assert_eq!(granted(&state, &doc_s).unwrap(), c);
        assert!(
            granted(&state, "/etc/hosts")
                .unwrap_err()
                .starts_with("Caminho não autorizado")
        );
        let reloaded = load_grants(&t.join("grants.json"));
        assert_eq!(reloaded, vec![c]);
        let _ = std::fs::remove_dir_all(&t);
    }

    #[test]
    fn concessao_antes_do_setup_sobrevive_e_e_gravada() {
        // macOS: RunEvent::Opened chega antes do setup ligar o arquivo de concessões.
        let t = temp("antes-setup");
        let antigo = t.join("antigo.md");
        let novo = t.join("novo.md");
        std::fs::write(&antigo, "").unwrap();
        std::fs::write(&novo, "").unwrap();
        let file = t.join("grants.json");
        persist_grants(&file, &[fs_canon(&antigo)], &[]);
        let state = AppState::default();
        let c = grant(&state, &novo).unwrap();
        attach_grants_file(&state, file.clone());
        assert!(
            granted(&state, &novo.to_string_lossy()).is_ok(),
            "concessão em memória perdida"
        );
        assert!(
            granted(&state, &antigo.to_string_lossy()).is_ok(),
            "concessão do disco perdida"
        );
        assert_eq!(
            load_grants(&file).last(),
            Some(&c),
            "gravada e como mais recente"
        );
        let _ = std::fs::remove_dir_all(&t);
    }

    #[test]
    fn esquecer_concessoes_mantem_so_as_abas_abertas() {
        let t = temp("esquecer");
        let aberta = t.join("aberta.md");
        let antiga = t.join("antiga.md");
        let outra = t.join("outra.md");
        for p in [&aberta, &antiga, &outra] {
            std::fs::write(p, "# x").unwrap();
        }
        let state = AppState::default();
        let file = t.join("grants.json");
        *state.grants_file.lock().unwrap() = Some(file.clone());
        for p in [&antiga, &aberta, &outra] {
            grant(&state, p).unwrap();
        }
        let aberta_c = fs_canon(&aberta);
        let saiu = forget_grants_except(&state, std::slice::from_ref(&aberta_c));
        assert_eq!(saiu, 2);
        assert!(
            granted(&state, &aberta.to_string_lossy()).is_ok(),
            "aba aberta perdeu a concessão"
        );
        assert!(granted(&state, &antiga.to_string_lossy()).is_err());
        assert!(granted(&state, &outra.to_string_lossy()).is_err());
        assert_eq!(
            load_grants(&file),
            vec![aberta_c],
            "grants.json não acompanhou"
        );
        // Sem aba aberta: lista e arquivo ficam vazios.
        assert_eq!(forget_grants_except(&state, &[]), 1);
        assert!(load_grants(&file).is_empty());
        let _ = std::fs::remove_dir_all(&t);
    }

    #[test]
    fn pasta_concedida_e_a_do_documento_e_so_ela() {
        let t = temp("dir");
        std::fs::create_dir_all(t.join("outra")).unwrap();
        let doc = t.join("doc.md");
        std::fs::write(&doc, "").unwrap();
        let state = AppState::default();
        grant(&state, &doc).unwrap();
        assert!(granted_dir(&state, &t.to_string_lossy()).is_ok());
        assert!(granted_dir(&state, &t.join("outra").to_string_lossy()).is_err());
        let _ = std::fs::remove_dir_all(&t);
    }

    #[test]
    fn pasta_concedida_lista_e_concede_so_markdown_de_dentro() {
        let t = temp("abrir-pasta");
        let raiz = t.join("docs");
        std::fs::create_dir_all(raiz.join("sub")).unwrap();
        for f in ["a.md", "sub/b.md", "img.png"] {
            std::fs::write(raiz.join(f), "# x").unwrap();
        }
        std::fs::write(t.join("vizinho.md"), "# fora").unwrap();
        let state = AppState::default();
        let raiz_s = raiz.to_string_lossy().into_owned();
        assert!(
            folder_rel(&state, &raiz_s, "a.md").is_err(),
            "pasta não concedida"
        );
        assert!(granted_folder(&state, &raiz_s).is_err());
        let r = grant_folder(&state, &raiz).unwrap();
        assert_eq!(r, fs_canon(&raiz));
        assert!(
            grant_folder(&state, &raiz.join("a.md")).is_err(),
            "arquivo não vira pasta concedida"
        );
        let b = folder_rel(&state, &raiz_s, "sub/b.md").unwrap();
        assert!(
            granted(&state, &b.to_string_lossy()).is_ok(),
            "concedido ao abrir"
        );
        assert!(
            folder_rel(&state, &raiz_s, "sub/../a.md").is_ok(),
            "`..` que fica dentro da raiz vale"
        );
        assert!(
            folder_rel(&state, &raiz_s, "../vizinho.md")
                .unwrap_err()
                .starts_with("Caminho não autorizado"),
            "`..` para fora da raiz"
        );
        assert!(granted(&state, &t.join("vizinho.md").to_string_lossy()).is_err());
        assert!(
            folder_rel(&state, &raiz_s, "img.png").is_err(),
            "só Markdown"
        );
        assert!(
            folder_rel(&state, &raiz_s, "/etc/hosts").is_err(),
            "absoluto recusado (relative_only)"
        );
        assert!(folder_rel(&state, &raiz_s, "nada.md").is_err());
        // Subpasta da raiz não é pasta concedida: listar e abrir pedem a raiz exata.
        assert!(granted_folder(&state, &raiz.join("sub").to_string_lossy()).is_err());
        let _ = std::fs::remove_dir_all(&t);
    }

    #[cfg(unix)]
    #[test]
    fn pasta_concedida_recusa_link_simbolico_para_fora() {
        let t = temp("pasta-symlink");
        let raiz = t.join("raiz");
        std::fs::create_dir_all(&raiz).unwrap();
        std::fs::create_dir_all(t.join("fora")).unwrap();
        std::fs::write(t.join("fora/segredo.md"), "# s").unwrap();
        std::os::unix::fs::symlink(t.join("fora/segredo.md"), raiz.join("atalho.md")).unwrap();
        std::os::unix::fs::symlink(t.join("fora"), raiz.join("pasta")).unwrap();
        let state = AppState::default();
        grant_folder(&state, &raiz).unwrap();
        let raiz_s = raiz.to_string_lossy().into_owned();
        for rel in ["atalho.md", "pasta/segredo.md"] {
            assert!(
                folder_rel(&state, &raiz_s, rel)
                    .unwrap_err()
                    .starts_with("Caminho não autorizado"),
                "{rel} sai da raiz pelo link"
            );
        }
        assert!(granted(&state, &t.join("fora/segredo.md").to_string_lossy()).is_err());
        let _ = std::fs::remove_dir_all(&t);
    }

    #[test]
    fn concessao_de_pasta_persiste_le_o_formato_antigo_e_esquecer_apaga() {
        let t = temp("pasta-persiste");
        let doc = t.join("doc.md");
        std::fs::write(&doc, "# a").unwrap();
        let (p1, p2) = (t.join("p1"), t.join("p2"));
        std::fs::create_dir_all(&p1).unwrap();
        std::fs::create_dir_all(&p2).unwrap();
        let file = t.join("grants.json");
        // Formato antigo (só arquivos) continua lido.
        persist_grants(&file, &[fs_canon(&doc)], &[]);
        let state = AppState::default();
        attach_grants_file(&state, file.clone());
        assert!(granted(&state, &doc.to_string_lossy()).is_ok());
        grant_folder(&state, &p1).unwrap();
        grant_folder(&state, &p2).unwrap();
        let json: Vec<String> =
            serde_json::from_str(&std::fs::read_to_string(&file).unwrap()).unwrap();
        assert_eq!(json.len(), 3, "uma lista só: arquivos e depois pastas");
        assert_eq!(
            load_grant_lists(&file),
            (vec![fs_canon(&doc)], vec![fs_canon(&p1), fs_canon(&p2)]),
            "quem lê separa arquivo de pasta pelo disco"
        );
        // Nova execução: a pasta volta concedida.
        let state2 = AppState::default();
        attach_grants_file(&state2, file.clone());
        assert!(granted_folder(&state2, &p1.to_string_lossy()).is_ok());
        assert!(
            granted(&state2, &p1.to_string_lossy()).is_err(),
            "pasta não vira arquivo concedido"
        );
        // Esquecer: fica só o que o frontend mandou manter (aba aberta, pasta aberta).
        let saiu = forget_grants_except(&state2, &[fs_canon(&doc), fs_canon(&p2)]);
        assert_eq!(saiu, 1);
        assert!(granted_folder(&state2, &p1.to_string_lossy()).is_err());
        assert!(granted_folder(&state2, &p2.to_string_lossy()).is_ok());
        assert_eq!(
            load_grant_lists(&file),
            (vec![fs_canon(&doc)], vec![fs_canon(&p2)])
        );
        assert_eq!(forget_grants_except(&state2, &[]), 2);
        assert_eq!(load_grant_lists(&file), (vec![], vec![]));
        let _ = std::fs::remove_dir_all(&t);
    }

    #[test]
    fn pastas_concedidas_tem_teto() {
        let t = temp("pasta-teto");
        let state = AppState::default();
        for i in 0..(FOLDERS_MAX + 3) {
            let p = t.join(format!("p{i}"));
            std::fs::create_dir_all(&p).unwrap();
            grant_folder(&state, &p).unwrap();
        }
        let d = state.folders.lock().unwrap();
        assert_eq!(d.len(), FOLDERS_MAX);
        assert_eq!(
            d.last(),
            Some(&fs_canon(&t.join(format!("p{}", FOLDERS_MAX + 2))))
        );
        drop(d);
        let _ = std::fs::remove_dir_all(&t);
    }

    #[test]
    fn asset_candidate_exige_arquivo_existente_com_extensao_de_imagem() {
        let t = temp("asset");
        std::fs::create_dir_all(t.join("img")).unwrap();
        std::fs::write(t.join("img/a.PNG"), "").unwrap();
        std::fs::write(t.join("segredo.txt"), "").unwrap();
        assert!(asset_candidate(&t, "img/a.PNG").is_some());
        assert!(asset_candidate(&t, "./img/../img/a.PNG").is_some());
        assert!(asset_candidate(&t, "segredo.txt").is_none());
        assert!(asset_candidate(&t, "img").is_none(), "pasta não é imagem");
        assert!(asset_candidate(&t, "nao-existe.png").is_none());
        let _ = std::fs::remove_dir_all(&t);
    }

    #[test]
    fn documento_so_pede_caminho_relativo() {
        // Alvos absolutos EXISTEM e têm extensão certa: só a guarda pode recusá-los.
        let t = temp("relativo");
        std::fs::create_dir_all(t.join("sub")).unwrap();
        let doc = t.join("sub/doc.md");
        std::fs::write(&doc, "").unwrap();
        std::fs::write(t.join("irma.md"), "").unwrap();
        std::fs::write(t.join("a.png"), "").unwrap();
        let fora = temp("relativo-fora");
        let fora_md = fora.join("segredo.md");
        let fora_png = fora.join("foto.png");
        std::fs::write(&fora_md, "").unwrap();
        std::fs::write(&fora_png, "").unwrap();
        let state = AppState::default();
        grant(&state, &doc).unwrap();
        let sub = t.join("sub");
        let sub_s = sub.to_string_lossy().into_owned();

        for ok in ["../irma.md", "./a.png", "a.png", "x\\y.png", "~/x.md"] {
            assert!(relative_only(ok).is_ok(), "{ok} é relativo");
        }
        for abs in [
            "/etc/hosts",
            "\\\\attacker\\share\\x.md",
            "\\x",
            "C:\\x",
            "C:x",
            "d:x.png",
            "//servidor/x",
            "\\\\?\\C:\\x",
        ] {
            assert!(relative_only(abs).is_err(), "{abs} tem raiz ou drive");
        }

        // Os três pontos de aplicação recusam um alvo absoluto que existe.
        let md_abs = fora_md.to_string_lossy().into_owned();
        let png_abs = fora_png.to_string_lossy().into_owned();
        let md_sem_ext = md_abs.trim_end_matches(".md").to_string();
        assert!(asset_candidate(&sub, &png_abs).is_none(), "imagem absoluta");
        assert_eq!(
            resolve_wikilink(&sub, None, &mut None, &md_sem_ext),
            None,
            "wikilink absoluto"
        );
        let e = resolve_rel(&state, &sub_s, &md_abs).unwrap_err();
        assert!(e.contains("absoluto"), "{e}");
        assert!(!state.granted.lock().unwrap().contains(&fs_canon(&fora_md)));

        // E aceitam o relativo, inclusive subindo um nível.
        assert!(asset_candidate(&sub, "../a.png").is_some());
        assert!(resolve_wikilink(&sub, None, &mut None, "../irma").is_some());
        assert_eq!(
            resolve_rel(&state, &sub_s, "../irma.md").unwrap(),
            fs_canon(&t.join("irma.md"))
        );
        assert_eq!(
            resolve_rel(&state, &sub_s, "nao-existe.md").unwrap_err(),
            "Não encontrado: nao-existe.md"
        );
        let _ = std::fs::remove_dir_all(&t);
        let _ = std::fs::remove_dir_all(&fora);
    }

    #[test]
    fn lista_de_concessoes_tem_teto_e_sem_duplicata() {
        let t = temp("max");
        let state = AppState::default();
        for i in 0..(GRANTS_MAX + 5) {
            let f = t.join(format!("{i}.md"));
            std::fs::write(&f, "").unwrap();
            grant(&state, &f).unwrap();
        }
        let first = t.join("0.md");
        grant(&state, &first).unwrap();
        let g = state.granted.lock().unwrap();
        assert_eq!(g.len(), GRANTS_MAX);
        assert_eq!(g.iter().filter(|p| p.ends_with("0.md")).count(), 1);
        drop(g);
        let _ = std::fs::remove_dir_all(&t);
    }
}
