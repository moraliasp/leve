# Revisão de lançamento · 0.2.0 (outubro de 2026)

Revisão feita antes do primeiro commit do repositório público `moraliasp/leve`, que começou sem o histórico anterior. Cada item diz o que foi conferido, como, e o que mudou. Decisões estruturais que saíram daqui estão em `docs/decisoes.md`.

## 1. Vazamento

| Conferido | Como | Resultado |
|---|---|---|
| Segredos no código | `gitleaks detect --no-git` na árvore inteira | Nenhum achado. |
| Referências internas (empresa anterior, demandas, cofre, e-mails, caminhos locais, nomes de pessoas) | `grep` por nomes, prefixos de demanda, `/Users/`, e-mails | Nada no código. Nos docs: nomes de pessoa e números de PR do repositório anterior saíram de `docs/decisoes.md` e `docs/assinatura.md`; o registro da licença MPL substituída saiu. |
| Docs que só faziam sentido internamente | leitura de `docs/` | A revisão transversal anterior (citava PRs, máquinas e medições do repositório antigo) foi removida; o que ainda vale está neste arquivo e em `docs/decisoes.md`. `docs/instalacao.md` perdeu a seção sobre migrar do nome antigo. |
| Chave do atualizador | geração com `tauri signer generate` fora do repositório | Só a chave **pública** está versionada (`tauri.conf.json`). Privada e senha ficam no cofre da Moralia e em segredos do environment `release`. |
| Arquivos locais | `.gitignore` | `.claude/`, `target`, `dist`, `node_modules` e `src-tauri/gen/schemas` fora. |

## 2. Código e dependências

| Conferido | Como | Resultado |
|---|---|---|
| Vulnerabilidades npm | `pnpm audit` | 0. |
| Vulnerabilidades Rust | `cargo audit` | 0 vulnerabilidades; 5 avisos "unmaintained/unsound" (`proc-macro-error`, `zbus_names`, `zvariant`, `zvariant_derive`, `glib` 0.18), todos da cadeia Linux do Tauri, sem uso no Mac e no Windows. Dependem do upstream. |
| Dependências mortas | `cargo machete`; uso de cada pacote npm de produção em `src/` | Nenhuma. |
| Código sem uso | exports de `src/` sem consumidor | Nenhuma função morta; os exports sem consumidor externo são usados no próprio módulo. |
| Versões | crates.io e npm | Tauri 2.12.5 (CLI/API 2.12.4), plugins na última 2.x; `tauri-plugin-updater` 2.14.0 e `tauri-plugin-process` 2.4.0 entraram. Atrasados de propósito: TypeScript 7 e KaTeX 0.19 (major/minor com mudanças; ficam para o Dependabot com teste) e `notify-debouncer-mini` 0.7. |
| CSP | `tauri.conf.json` | Mantida: `default-src 'self'`, `script-src 'self'`, `form-action`, `base-uri`, `object-src` e `frame-src` em `'none'`. `img-src https:` continua só para "carregar imagens remotas" a pedido (a barreira é o sanitize; ver decisões). O atualizador roda no Rust e não precisa de `connect-src` novo. |
| Asset protocol | `assetProtocol.scope` | `[]`: nada liberado de início; `allow_assets` libera imagem a imagem de documento concedido. |
| Capabilities | `capabilities/default.json` | `core:default`, `core:window:allow-set-title` e, novos, `updater:default` e `process:allow-restart`. Nenhum plugin de arquivo ou shell exposto ao frontend. |
| Lint | `cargo clippy --all-targets -D warnings` | Três avisos corrigidos (`as_chunks`, `slice::from_ref`, `const assert`); agora roda no CI. |
| Testes | `pnpm test`, `cargo test` | 139 vitest (golden de `docs/exemplo.md` inalterado) e 19 cargo. Teste do documento de 2 MB ganhou prazo de 30 s (passava de 5 s em máquina carregada). |
| Tamanho | `pnpm tauri build --bundles app` | `.app` 4,3 → 5,3 MiB: o atualizador traz `reqwest`/`rustls`. Aceito. |

## 3. Interface em inglês

- Dicionário tipado `src/i18n.ts` (pt-BR e en) e `src-tauri/src/i18n.rs` para menu nativo e mensagens do Rust. ~170 textos; nenhum ficou fixo no HTML ou no TS (conferido por teste: toda chave `data-i18n*` existe no dicionário; os dois idiomas têm as mesmas chaves e parâmetros).
- Idioma: Preferências › Aparência › Idioma (Sistema, Português, English). "Sistema" segue `navigator.languages` e `sys-locale`; qualquer português vira pt-BR, o resto inglês.
- Menu nativo inteiro traduzido, inclusive os itens padrão (Copiar, Serviços, Ocultar, Encerrar), que antes saíam em inglês num menu em português.
- Instalador NSIS com inglês primeiro e português; o `.msi` sai em inglês. Descrições do pacote (`shortDescription`, associação de arquivo) em inglês.
- Prova: modo navegador em `en-US` (barra, alertas, frontmatter, aviso remoto em inglês), troca para Português nas Preferências (recarrega, abas preservadas, tudo em pt-BR); app nativo com o sistema em inglês mostrou `File, Edit, View, Go, Help` e `About Leve, Check for Updates…, Settings…, Services, Hide Leve, Hide Others, Show All, Quit Leve`.

## 4. Instalação e primeira abertura

- README (inglês e português) explica em duas linhas o aviso do Gatekeeper e do SmartScreen, com `xattr -dr com.apple.quarantine /Applications/Leve.app` como alternativa; passo a passo em `docs/instalacao.md`.
- Abertura a frio do `.dmg` baixado, com e sem quarentena: ver seção 6.

## 5. Atualizador

- `latest.json` gerado pelo `release.yml` (`scripts/latest-json.mjs`, com teste) e servido por `releases/latest/download/latest.json`. macOS: um `.app.tar.gz` universal para as duas arquiteturas; Windows: `-setup.exe` (padrão) e `.msi`.
- Checagem só a pedido ou diária com a opção ligada (desligada por padrão); pergunta antes de baixar; reinicia ao terminar.
- Prova no app nativo: "Check for Updates…" disparou a checagem (marca `mdview.updateChecked` gravada). Prova ponta a ponta (0.2.0 instalado enxergando e instalando uma 0.2.1 de teste, inclusive pela release pública): ver seção 6.

## 6. Release e provas de distribuição

| Conferido | Como | Resultado |
|---|---|---|
| CI | `ci.yml` em `ubuntu-latest` no commit inicial | Verde (tsc, vitest, vite build, fmt, clippy, check, test). O clippy no Linux pegou dois avisos que só existem fora do macOS (corrigidos antes do lançamento). |
| Release candidate | tag `v0.2.0-rc.2` no mesmo commit da `v0.2.0` | `.dmg` universal, `-setup.exe`, `.msi`, `.app.tar.gz` e os `.sig`, `latest.json` e `SHA256SUMS.txt`. Um `rc.1` anterior foi apagado: saiu assinado com um par de chaves que foi trocado em seguida. |
| Checksums | `shasum -a 256 -c SHA256SUMS.txt` nos arquivos baixados | Todos conferem (rc.2 e v0.2.0). |
| Assinatura do atualizador | `minisign -V` de cada pacote contra a `pubkey` do `tauri.conf.json`; `signature` do `latest.json` comparada ao `.sig` | Válidas nas três plataformas. Controle negativo: o `.sig` do rc.1 é recusado (id de chave diferente). |
| Attestation | `gh attestation verify <arquivo> --repo moraliasp/leve` na v0.2.0 | Válida; aponta para `.github/workflows/release.yml` na tag `v0.2.0`. |
| Gatekeeper com quarentena | `.app` copiado do `.dmg` marcado como baixado; `spctl -a -vv` e abertura | `rejected (no usable signature)`; o macOS segura o processo e mostra "Move to Trash / Done". É o aviso que o README explica. |
| Abertura a frio sem quarentena | `xattr -dr com.apple.quarantine`, `open` três vezes, janela conferida pela lista do CoreGraphics (o System Events nem sempre enxerga a janela do WebView) | 3/3 com janela visível, menu em inglês (sistema em inglês), app universal (x86_64 e arm64), versão 0.2.0. |
| Atualizador, ponta a ponta (privado) | 0.2.0 compilado do mesmo commit com o endpoint apontando para um servidor local que servia a 0.2.1 de teste gerada pelo CI | "Check for Updates…" leu o `latest.json`, "Install" baixou o pacote, o app conferiu a assinatura, trocou o bundle e reabriu sozinho na 0.2.1. |
| Atualizador, ponta a ponta (público) | `.dmg` real da release v0.2.0 instalado; uma 0.2.1 de teste publicada como latest por cerca de 2 minutos (21:33–21:35 UTC de 2026-10-25) e apagada em seguida | O 0.2.0 real achou a 0.2.1 pelo endpoint público, instalou e reabriu na 0.2.1 com janela. Depois da remoção, o `latest.json` público voltou a anunciar 0.2.0. |
| Windows | instalador gerado no CI e localmente (`cargo-xwin`) | NSIS com inglês e português, `.msi` em inglês, assinaturas do atualizador válidas. **Não executado:** sem máquina Windows nesta revisão. |
| Repositório | configuração do GitHub depois de público | Ruleset na `main` (PR obrigatório, check `check` do CI, sem force-push nem exclusão, só squash), secret scanning, push protection, alertas e PRs de segurança do Dependabot, Private Vulnerability Reporting. Environment `release` só aceita tags `v*` e guarda os segredos do atualizador. |

## Fica para depois

- Assinatura Apple e Authenticode (contas da Moralia); com elas, Homebrew cask e winget.
- Revisão jurídica de `THIRD_PARTY_NOTICES.md` (textos EPL-2.0, MPL-2.0, Apache-2.0 e CDLA-Permissive-2.0 reproduzidos na íntegra; as escolhas são orientação técnica).
- Avisos "unmaintained" da cadeia Linux do Tauri (o alerta do Dependabot sobre `glib` foi dispensado como risco tolerável: não entra nos builds de Mac e Windows).
- Rodar o instalador Windows numa máquina Windows (instalação, associação de `.md`, atualização).
