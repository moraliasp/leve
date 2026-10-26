# Decisões do Leve

Por que o app é como é. Cada registro diz o contexto, o que foi decidido e o que isso obriga daqui em diante.
Antes de mudar algo listado aqui, leia o registro. Se a decisão mudar, atualize o registro no mesmo PR.
Decisão estrutural nova entra aqui, no fim, no mesmo formato.

## Sem framework de UI

- **Contexto:** o app tem uma tela, um documento e meia dúzia de controles. O peso de um framework seria maior que o próprio app.
- **Decisão:** TypeScript puro em `src/`, DOM direto, estado em variáveis de módulo (`main.ts`).
- **Consequência:** nada de React, Vue ou Svelte. Componente novo é função que cria elementos. Estado novo fica em `main.ts` ou num módulo próprio.

## HTML cru permitido, sempre sanitizado

- **Contexto:** Markdown do mundo real usa `<details>`, `<img width>`, `<kbd>`, tabelas alinhadas. Bloquear HTML quebraria documentos comuns.
- **Decisão:** markdown-it com `html: true` e tudo passa pelo DOMPurify em `render()`. `script`, `style`, `iframe`, `object` e `embed` são proibidos.
- **Consequência:** nenhum HTML chega ao DOM sem passar por `render()`. Pós-processamento (código, matemática, wikilinks) roda depois do sanitize e cria elementos por API, sem `innerHTML` com texto do documento. A exceção é o SVG do Mermaid, que entra por `innerHTML` e por isso é gerado com `securityLevel: "strict"`. Não afrouxar.

## Atalhos só no menu nativo

- **Contexto:** atalho duplicado em `keydown` e no menu dispara duas vezes, e o menu é onde o usuário de Mac procura o atalho.
- **Decisão:** todo atalho é item de menu em `build_menu` (`lib.rs`), que emite o evento `menu`. O frontend mapeia o id em `actions` (`main.ts`).
- **Consequência:** atalho novo = item de menu + entrada em `actions`. `keydown` só para teclas locais a um controle (Enter na busca, setas nas abas) e para o modo navegador, que não tem menu.

## Leitura por concessão, arquivo a arquivo

- **Contexto:** um visualizador que lê qualquer caminho vira porta para o disco inteiro se um documento ou o frontend for comprometido.
- **Decisão:** o Rust só lê caminhos concedidos (`grant`, `granted`). A concessão só nasce de origem legítima: diálogo no Rust, abertura pelo sistema, arrastar para a janela, link de um documento já concedido. Imagens entram no asset protocol uma a uma por `allow_assets`, nunca a pasta. A lista é salva em `grants.json`, limitada a `GRANTS_MAX`.
- **Consequência:** comando novo que lê disco passa por `granted`. Vale até para perguntar se um arquivo existe: `paths_exist` (Recentes apagados) responde `false` para qualquer caminho fora da lista, sem tocar o disco, para não virar sonda. Confirmações (limpar recentes) são `<dialog>` do próprio app, como o Sobre: o diálogo de mensagem do plugin, chamado de um comando Rust no macOS, devolveu verdadeiro para Cancelar e para Esc no app de dev e, preso à janela, encerrou o processo; o `<dialog>` é igual nos dois modos e dá para provar no navegador. Não liberar diretório no asset protocol. No macOS, `RunEvent::Opened` chega antes do `setup`, então concessões em memória e em disco são mescladas (`attach_grants_file`).

## Mermaid e KaTeX sob demanda

- **Contexto:** os dois somam vários MB e a maioria dos documentos não usa nenhum. Carregar na abertura atrasaria todo documento.
- **Decisão:** o render só marca os blocos. `renderMermaid` e `renderMath` fazem `import()` dinâmico quando há o que desenhar, inclusive o CSS do KaTeX.
- **Consequência:** biblioteca pesada nova segue o mesmo padrão. O aviso de tamanho de chunk no `pnpm build` é esperado. A rolagem é reaplicada depois que eles terminam (`applyPending`).

## Mermaid sem o layout ELK

- **Contexto:** o Mermaid 12 registra o layout ELK com `import()` do elkjs, e o Vite emite esse chunk mesmo sem nenhum diagrama pedir: `dist/assets/elk-*.js` tinha 1.462 KB (456 KB gzip), o maior asset. O Leve já força `layout: "dagre"` em `renderMermaid`, e o ELK só servia a quem pede `layout: elk` ou `flowchart-elk`. Era também o único componente EPL-2.0 distribuído.
- **Decisão:** o plugin `mermaidSemElk` (`vite.config.ts`, mesmo padrão do `katexWoff2Only`) tira o `...elkLayoutLoaders()` de `registerDefaultLayoutLoaders` no arquivo do Mermaid, no build e no pré-empacotamento do dev server (`optimizeDeps.rolldownOptions.plugins`). Sem o registro, `getRegisteredLayoutAlgorithm` do Mermaid devolve dagre (com `log.warn`), e todos os renderizadores passam por ela. Se o padrão não aparecer exatamente uma vez no arquivo que define `elkLayoutLoaders`, o build falha. `dist` antes: 120 arquivos, 5.902.406 bytes, maior chunk o `elk` (1.462 KB); depois: 118 arquivos, 4.438.557 bytes (-1,46 MB, -25%), maior chunk 629 KB (`chunk-NGNAAXSQ`, do Mermaid).
- **Consequência:** diagramas `flowchart-elk` e com `layout: elk` renderizam com dagre, sem erro. O elkjs continua instalado (dependência do `mermaid`), mas não é distribuído: `scripts/third-party.mjs` o lista em `foraDoBundle` e o NOTICES não traz mais a EPL-2.0. Upgrade do Mermaid que mude o registro derruba o build; reabrir o ELK é decisão nova, aqui, e volta o aviso EPL.

## Links locais só abrem tipos conhecidos

- **Contexto:** um link num `.md` pode apontar para um executável ou script. Abrir no app padrão seria executar código com um clique.
- **Decisão:** `open_external` abre `http`, `https` e `mailto` no navegador. Arquivo local só abre no app padrão se a extensão estiver em `OPENABLE_EXT`. Qualquer outro é revelado na pasta.
- **Consequência:** ampliar `OPENABLE_EXT` exige justificar que o tipo não executa nada. Executáveis, scripts e extensões desconhecidas nunca entram.

## CI barato em Linux, release nas duas plataformas

- **Contexto:** o app é Mac e Windows, mas o que o CI precisa provar a cada PR (tipos, testes, build do frontend, formatação, lint e compilação do Rust) não depende do sistema. Runner macOS custa dez vezes o minuto do Linux.
- **Decisão:** `ci.yml` roda em `ubuntu-latest`, com as bibliotecas do WebKitGTK instaladas pelo `apt`: `tsc`, `vitest`, `vite build`, `cargo fmt --check`, `cargo clippy -D warnings`, `cargo check` e `cargo test`. Mac e Windows só compilam no `release.yml`, por tag. Rust pelo `rustup` do runner e cache com `actions/cache` (só no CI; o release compila sem cache, ver "Release sem cache e chave atrás de aprovação"); só actions do próprio GitHub e uma allowlist de terceiros no repositório (`pnpm/action-setup`, `azure/login`, `ossf/scorecard-action`), todas fixadas por SHA (o repositório exige), com `permissions: {}` no topo e o mínimo por job. Cada action de terceiro é mais uma dependência com acesso ao token: não entra sem ganho claro, e entrar exige incluir na allowlist.
- **Consequência:** o que só quebra em Mac ou Windows aparece no release candidate (`vX.Y.Z-rc.N`), que existe para isso. Vulnerabilidade de dependência chega pelos alertas e PRs do Dependabot (npm, cargo e actions, agrupados por ecossistema); não há workflow de auditoria próprio.

## Ícones Lucide, só com licença de reuso

- **Contexto:** ícone de interface copiado de outro produto não tem licença de reuso conhecida.
- **Decisão:** Lucide (`lucide-static`, ISC), só via `src/icons.ts`, com traço 1,75. Aviso de licença em `THIRD_PARTY_NOTICES.md` e no Sobre.
- **Consequência:** ícone novo é importado em `icons.ts`. SVG solto no HTML ou ícone de outra fonte não entram.

## Abas releem o arquivo

- **Contexto:** um documento em segundo plano pode mudar no disco, e manter o HTML antigo mostraria conteúdo velho.
- **Decisão:** cada aba guarda caminho, histórico e âncora de rolagem, não o conteúdo. Ativar a aba relê o arquivo, e o Rust confere a concessão de novo.
- **Consequência:** abrir muitas abas custa pouco memória. Abas restauradas só são lidas quando ativadas.

## Rolagem guardada como âncora

- **Contexto:** Mermaid, KaTeX e imagens mudam a altura depois do render. Pixel salvo cai no lugar errado.
- **Decisão:** a posição é o filho de `#content` no topo mais o deslocamento, conferido pelo título acima (`src/scroll.ts`). É reaplicada até o leitor rolar.
- **Consequência:** elementos fora de `#content`, como avisos e barras, não entram nos índices da âncora.

## Erro de render visível ao leitor

- **Contexto:** diagrama ou imagem quebrada que só loga no console parece documento vazio.
- **Decisão:** erro vira bloco visível (`renderErrorBlock`) ou aviso com alt e caminho (`.img-missing`).
- **Consequência:** recurso novo que pode falhar mostra o erro no documento. Nada fica só no console.

## Conteúdo remoto bloqueado até o leitor pedir

- **Contexto:** imagem remota num `.md` carrega sozinha ao abrir e serve de pixel de rastreio. Isso desmentia a frase de privacidade.
- **Decisão:** um hook do DOMPurify (`src/remote.ts`) tira do HTML todo recurso remoto antes de chegar à página e guarda o original em `data-remote-*`. "Remoto" é decidido por allowlist: `new URL` sobre uma base http fictícia, que normaliza como o navegador, e só esquemas locais passam. Cada imagem bloqueada vira um botão "Imagem remota bloqueada · carregar" que libera só ela; o aviso no topo oferece "Carregar imagens remotas neste documento" (vale até fechar o app); e Exibir › "Carregar imagens remotas" é a preferência global, desligada por padrão e salva em `mdview.remote` (`src/remote-ui.ts`), que faz o render liberar tudo de uma vez.
- **Consequência:** não trocar o filtro por regex, porque variantes como `\\host` e tab no esquema passam. Atributo novo que busca recurso entra em `FETCH_ATTRS`. A CSP continua com `https:` em `img-src` porque o carregar a pedido e a preferência global precisam dele; a barreira é o sanitize, que tira o atributo antes de o DOM existir, e por isso não faz sentido uma CSP dinâmica. Ligar a preferência reaplica o render ao documento aberto (`reloadCurrent`); a fonte Mermaid continua limpa (`scrubMermaidSource`) em qualquer caso, porque ali o bloqueio é antes do desenho e não há o que devolver. O Mermaid desenha antes de devolver o SVG, então a política vale também antes do render: `secure` tira `themeCSS` das diretivas, `scrubMermaidSource` esvazia o nó-imagem remoto e `stripRemoteTree` filtra o SVG final. Biblioteca nova que desenhe por conta própria segue o mesmo trio.

## Teclado completo também no WebKit do macOS

- **Contexto:** no macOS, o Tab só passa por campos de texto se o usuário não ligou "Navegação por teclado" no sistema. Botões e links do app ficavam inacessíveis pelo teclado.
- **Decisão:** `keepTabbable` (`src/a11y.ts`) põe `tabindex="0"` em todo botão, link e `summary`, inclusive os criados depois. Quem gerencia o próprio foco, como as abas, define o seu. O anel é um `:focus-visible` único na cor de destaque.
- **Consequência:** controle novo não precisa de nada, mas foco roving precisa de `tabindex` explícito. Prova de teclado se faz no app de dev, lendo `AXFocusedUIElement` pelo System Events, porque o Chrome já tabula botões e esconde o problema.

## Realce de código fora do caminho crítico

- **Contexto:** num documento de 1 MB com mil blocos de código, o highlight.js dentro do markdown-it era a maior parte do render, e ainda pesava no chunk de abertura.
- **Decisão:** o render só marca a linguagem. `src/highlight.ts` importa o highlight.js sob demanda e realça em fatias de 8 ms, começando pelos blocos mais perto da rolagem. A fila usa `setTimeout`, porque o IntersectionObserver não dispara com a janela oculta. A busca recalcula os resultados com `refresh`, no máximo a cada 300 ms.
- **Consequência:** o render caiu de 762 para 369 ms e o chunk de abertura de 500 para 346 KB. Duas alternativas foram medidas e descartadas: o `RETURN_DOM_FRAGMENT` do DOMPurify, mais lento que string com `innerHTML`, e o `content-visibility`, que leva 5 a 7 s até pintar e deixa as âncoras imprecisas. Para medir, use `performance.measure` em `loadDoc` e um Chrome headless, porque o painel do navegador em segundo plano distorce os tempos.

## Orçamento de tamanho no CI

- **Contexto:** o chunk de abertura já caiu de 500 para 346 KB tirando Mermaid, KaTeX e highlight.js do caminho crítico, mas nada impedia um import estático novo de trazer tudo de volta, nem uma dependência de inchar o `dist/` (o aviso de chunk do Vite é esperado e ninguém lê).
- **Decisão:** `scripts/tamanho.mjs` (`pnpm size`, passo do CI logo depois do `pnpm build`) mede o `dist/`: total bruto e gzip, chunk de abertura (o `<script type="module">` e o CSS linkados em `dist/index.html`) bruto e gzip, e o maior arquivo. Os limites ficam num objeto só, `ORCAMENTO`, com ~10% de folga sobre o medido em 2026-10-25 (`dist` 5,90 MB / 1,89 MB gzip; abertura 391,7 kB / 124,4 kB gzip; maior arquivo o `elk-*.js` do Mermaid, 1,46 MB). Estourar sai com erro dizendo o que e por quanto.
- **Consequência:** subir um limite é decisão no mesmo PR, com o motivo. Quando o tamanho cai de verdade (o ELK sair do Mermaid, por exemplo), o limite desce junto, senão a folga vira espaço para regressão. O gzip é por arquivo, nível 9, só como referência de transferência: o app lê do disco.

## Leitura tolerante, com limite

- **Contexto:** `read_to_string` recusava UTF-16, que é o padrão do Bloco de Notas, e qualquer byte fora de UTF-8, com erro em inglês. Também lia arquivos de qualquer tamanho, o que pode travar o WebView.
- **Decisão:** `read_text_file` recusa arquivos acima de 20 MB e binários, detectados por byte nulo, com mensagem clara. Tira o BOM UTF-8 e decodifica UTF-16 com BOM. UTF-8 inválido abre com U+FFFD e um aviso que vai no `Doc`.
- **Consequência:** abrir é a regra e recusar é a exceção explicada. Exceção no render vira bloco de erro no lugar do documento, nunca tela vazia.

## A janela só mostra a própria página

- **Contexto:** `<form action>` e `<area href>` passam pelo DOMPurify e, no clique, o WebView navegava para o site externo dentro da janela do app, sem barra de endereço: phishing com cara do app.
- **Decisão:** um plugin `navegacao` (`on_navigation` em `lib.rs`) só aceita `tauri://`, `http://tauri.localhost`, `about:` e, em debug, o Vite. `form` é proibido no sanitize; `<area>` é tratado como link no clique. Link externo sai pelo navegador via `open_external`.
- **Consequência:** nada que o documento faça navega a janela. Recurso novo que precise de outra origem (ex.: página remota) não entra; se um dia entrar, é janela separada com capability própria.

## Documento só pede caminho relativo

- **Contexto:** `Path::join` troca a pasta inteira quando o pedido é absoluto. Um `.md` podia abrir qualquer `.md` do disco por link ou wikilink, mostrar qualquer imagem, e no Windows um caminho UNC (`\\servidor\x.png`) abre conexão SMB só por abrir o documento.
- **Decisão:** `relative_only` (`lib.rs`) recusa caminho com raiz, UNC ou prefixo de drive (`C:x`, drive-relativo no Windows) em `resolve_path`, `allow_assets` e `resolve_wikilinks`. A regra do drive vale em todo SO, então um nome `a:b.png` ou `[[A: nota]]` também é recusado; é raro e parece esquema de URL, fica assim. `..` continua valendo: `../assets/` é comum em repositórios de docs, e o alvo ainda passa por `canonical` e pela concessão.
- **Consequência:** "origem legítima" da concessão por link quer dizer relativo à pasta do documento. Confinar `..` à pasta seria outra decisão, a registrar aqui.

## O documento não cobre a interface

- **Contexto:** HTML cru com `position: fixed` (no `style`, por `var()`, por `attr()` ou por uma classe que colide com o CSS do app, como `.drop`) escapava de `#main` e desenhava por cima da barra: barra falsa, botão falso, aviso falso. Filtrar o `style` é enxugar gelo: cada forma nova de computar `fixed` reabre o buraco.
- **Decisão:** `#content` é bloco de contenção (`contain: layout` em `.markdown-body`): tudo que o documento posicionar como `fixed` ou `absolute` fica dentro da área do documento, por qualquer caminho. `stripFixed` (`render.ts`) continua como segunda camada: tira `position: fixed` literal e derruba o `style` inteiro quando há escape (`\`) ou `var(`. O que vai à camada superior do navegador, fora de qualquer contenção, é proibido no sanitize: `popover`, `dialog` e os invoker commands `command`/`commandfor` (que abririam um `<dialog>` modal sem JS). O aviso de conteúdo remoto sai de `#main` para a faixa acima do corpo: dentro de `#main` um `absolute` do documento o cobria.
- **Consequência:** um `fixed` do documento vira, na prática, um `absolute` dentro de `#content`. `style` legítimo com `var()` some inteiro (raro em Markdown; o documento não vê as variáveis do app). Classe do documento que coincida com uma do app ainda herda o visual dela, mas confinada à área do documento. `contain: layout` tira o overflow de `#content` da rolagem de `#main`, então `#content` rola na horizontal por conta própria (`overflow-x: auto`) para HTML cru mais largo que a coluna. `offsetTop` dos filhos de `#content` passa a ser relativo a `#content`; com o aviso fora de `#main`, `#content` começa em 0 e as contas de rolagem (`scroll.ts`, `toc.ts`) não mudam. Teste em `tests/render.test.ts` guarda a regra de CSS.

## Recarga que acompanha o tamanho do arquivo

- **Contexto:** o watcher emitia a cada 150 ms e cada evento re-renderizava o documento inteiro. Com autosave num arquivo de 5 MB (render de ~1,5 s), a CPU ficava saturada o tempo todo e a tela piscava; 10 salvamentos em 3 s custavam 13 s de CPU do WebContent.
- **Decisão:** o debounce do watcher depende do tamanho do arquivo (`debounce_for` em `lib.rs`: 150 ms até 200 KB, 500 ms até 1 MB, 1 s até 5 MB, 2 s acima), reavaliado a cada recarga porque `watch_file` é chamado de novo. No frontend, `reloadCurrent` (`main.ts`) faz uma recarga por vez: evento que chega no meio só marca "de novo", e ao terminar roda uma única recarga com o conteúdo mais novo. A posição continua pela âncora de rolagem (filho no topo conferido pelo título acima; se a edição mudou os índices, pelo título).
- **Consequência:** recarga passa por `reloadCurrent`, nunca por `loadDoc` direto, inclusive o ⌘R. Degrau novo entra em `DEBOUNCE_STEPS`. O vigia não é recriado a cada recarga (`watch_decision`): trocar o debouncer descarta o evento pendente, e com espera de segundos isso perderia o último salvamento; ele só muda quando o arquivo ou o degrau mudam, e nesse caso avisa o frontend uma vez. Render incremental por bloco é outra decisão, só se isto não bastar.

## Avisos de terceiros (EPL/MPL/CDLA)

- **Contexto:** MPL-2.0 (cinco crates do Rust: `cssparser`, `cssparser-macros`, `dtoa-short`, `option-ext`, `selectors`) e CDLA-Permissive-2.0 (`webpki-root-certs`, via `reqwest` do Tauri) pedem o texto da licença junto da distribuição e, no caso da MPL, indicação de onde está a fonte. DOMPurify é MPL-2.0 OR Apache-2.0. Nenhuma GPL/AGPL no grafo. A EPL-2.0 (elkjs) saiu com o corte do ELK (ver "Mermaid sem o layout ELK").
- **Decisão:** `THIRD_PARTY_NOTICES.md` traz o texto integral de cada licença e a fonte de cada componente (crates.io por versão). Do DOMPurify, o Leve redistribui sob a **Apache-2.0**. `scripts/third-party.mjs` gera `THIRD_PARTY.md` com a seção "Licenças com obrigação de aviso (EPL/MPL/CDLA)", e `tests/notices.test.ts` exige no NOTICES um título com nome e versão de cada um.
- **Consequência:** dependência nova com EPL/MPL/CDLA, ou bump de versão de uma listada, derruba o teste depois que `node scripts/third-party.mjs` regenera `THIRD_PARTY.md` (o gerador não roda no CI; regerar faz parte de atualizar dependência). Dupla nova com `OR` só avisa no gerador até entrar em `escolhas`; pacote instalado mas cortado do bundle entra em `foraDoBundle`. As escolhas e os textos aqui são orientação técnica, não parecer jurídico.

## Distribuição: release do GitHub, sem assinatura de sistema por enquanto

- **Contexto:** a Moralia ainda não tem conta Apple Developer nem certificado de assinatura de código Windows.
- **Decisão:** o canal é a release do GitHub de `moraliasp/leve`: `.dmg` universal para macOS, `-setup.exe` (NSIS, por usuário) e `.msi` para Windows, com `SHA256SUMS.txt` e attestation de proveniência (`actions/attest-build-provenance`). Sem assinatura Apple nem Authenticode até a Moralia ter as contas; o README explica o aviso do Gatekeeper e do SmartScreen. Versão semver `0.y.z`, a tag manda na versão, notas de release geradas por PR e guiadas pelo `CHANGELOG.md`.
- **Consequência:** Homebrew cask e winget ficam para depois da assinatura (os dois exigem ou recomendam fortemente). Ligar a assinatura é configurar segredos e variáveis (ver `docs/assinatura.md`), sem mudar o fluxo.

## Versão e tag

- **Contexto:** a versão vive em `package.json`, `tauri.conf.json`, `Cargo.toml` e `Cargo.lock`. Uma tag que não acompanha os arquivos gera instaladores com a versão errada e um Sobre que mente.
- **Decisão:** semver `x.y.z`. A tag `vX.Y.Z` manda: `pnpm version:set X.Y.Z` (`scripts/version.mjs`) grava a versão nos três arquivos e no `Cargo.lock` antes de taguear, e `pnpm version:set` sem argumento imprime a atual e sai 1 se divergirem. O passo "Conferir versão" do `release.yml` roda logo após o checkout e falha cedo se `${GITHUB_REF_NAME#v}` for diferente da versão dos arquivos. `tests/version.test.ts` é o tripwire: os quatro arquivos têm de concordar. Notas da release vêm de `gh release create --generate-notes`, com o `CHANGELOG.md` como texto principal.
- **Consequência:** nunca editar a versão à mão em um arquivo só. Release nova = `pnpm version:set`, commit, tag. Versão nova em outro arquivo entra em `scripts/version.mjs` e no teste.

## Sumário em janela estreita

- **Contexto:** `minWidth` é 480, mas o sumário fixo de 260 px deixava ~120 px de texto a 480 px (menos o padding de 48 px de cada lado), e o documento quebrava no meio da palavra.
- **Decisão:** abaixo de 720 px (`@media (max-width: 719px)` em `styles.css`) o sumário vira sobreposição: `position: absolute` dentro de `#body`, altura toda, com sombra, e fica fechado por padrão. O botão e o ⌘B (`toggle-toc` em `main.ts`) alternam `body.toc-peek`, que vive só na sessão; clicar num item, no documento ou voltar a janela larga fecha. Nessa faixa o padding de `#content` cai para 24/20 px. `mdview.toc` só muda pelo botão com a janela larga, então ao voltar a ≥ 720 px o sumário reaparece se a preferência era "visível". Fechado por padrão, e não "aberto se a preferência é visível", porque a preferência padrão é visível e o sumário cobriria o texto em toda abertura. `minWidth` fica em 480.
- **Consequência:** o breakpoint (720) vive no CSS e em `narrowMq` (`main.ts`); mudar um exige mudar o outro. `tests/largura.test.ts` guarda a regra de CSS. Sem `word-break: break-all` em lugar nenhum; quebra de palavra só por `overflow-wrap` do tema, quando uma palavra sozinha não cabe.

## Modo documento grande

- **Contexto:** no app instalado, `docs/exemplo.md` ocupa 134 MB no WebContent e um documento de 5 MB (124 mil nós) ocupa 492 MB, com 2,9 s até o título. Pelo mesmo ritmo, o teto de 20 MB da leitura chegaria perto de 2 GB. Bancada em node + jsdom (fora do repositório) com um `.md` sintético de 5 MB (títulos h1 a h4, parágrafos com URL solta, listas, tabelas e 10% de blocos `ts`, 919 blocos de código): o render produz 142 mil nós; o realce, que no app roda em segundo plano até cobrir o documento inteiro, acrescenta 289 mil nós (98 mil `<span>`) e 400 a 520 ms de CPU; os links automáticos são 7,3 mil `<a>`; o sumário completo tem 2.639 itens (7,9 mil nós).
- **Decisão:** acima de 2 MB de texto em UTF-8 (`LARGE_DOC_BYTES` e `isLargeDoc` em `src/limits.ts`) o documento abre em modo grande: sem `linkify` (`render(src, { large })`), sem realce (`loadDoc` chama `cancelHighlight` em vez de `highlightLazily`) e sumário só com h1/h2 (`buildToc(..., LARGE_TOC_MAX_LEVEL)`). Link escrito à mão continua link, os títulos h3+ continuam com âncora no documento, e o bloco de código mantém rótulo e botão de copiar. A barra avisa "Documento grande: links automáticos, realce e sumário reduzidos" até o próximo documento, pelo mesmo canal do aviso de leitura (`setDocNotice` em `main.ts`). O teto de 20 MB (`MAX_DOC_BYTES`) fica: a mensagem de recusa já é clara, e o modo grande corta justamente o que mais cresce.
- **Medição (5 MB, jsdom, mediana de 9 renders e 3 montagens, máquina compartilhada):** nós no fim (documento + realce + sumário) 438.813 → 123.740 (−72%); heap do DOM no jsdom 444 MB → 154 MB (−65%); montagem do DOM 1.183 → 1.003 ms (−15%); o tempo de `render()` em si não muda de forma consistente (−23% numa rodada, igual dentro do ruído em outra). O ganho maior vem do realce, que não pesa na abertura mas leva a memória ao triplo dos nós ao terminar; na abertura o ganho é de linkify e sumário. O heap do jsdom não equivale ao WebContent, só a proporção serve; o jsdom ainda retém ~145 MB por `DOMPurify.sanitize` desse tamanho, o que não foi medido no WebKit.
- **Consequência:** limiar novo ou recurso a mais no modo grande muda só `src/limits.ts` e `loadDoc`. O golden de `docs/exemplo.md` não muda (documento pequeno). Abaixo de 2 MB nada muda. Se o modo grande não bastar, os próximos passos são outra decisão: render em fatias ou virtualização, e baixar o teto para 10 MB.

## Assinatura Windows pronta, desligada

- **Contexto:** o instalador Windows sai sem assinatura e o SmartScreen avisa. O Tauri 2 assina por um comando externo (`signCommand`). O Azure Trusted Signing (hoje Artifact Signing) seria o mais barato, mas a Microsoft só valida organizações de uma lista de países que não inclui o Brasil; entre as ACs comerciais, só serve chave em nuvem que assine sem pessoa no celular. Certificado EV não pula mais o SmartScreen, então OV basta.
- **Decisão:** o `release.yml` já suporta dois provedores com os mesmos arquivos, escolhidos pela variável `WINDOWS_SIGN_PROVIDER` no environment `release` do GitHub: `esigner` (SSL.com eSigner, CodeSignTool com versão e SHA-256 fixos no script) ou `artifact-signing` (Azure, signtool + dlib e `azure/login` por OIDC). Sem a variável, o build sai sem assinatura. O comando vive em `src-tauri/tauri.sign.conf.json`, mesclado por `--config` só no CI, para o build local não mudar. Qual certificado comprar segue em aberto.
- **Consequência:** segredos e variáveis de assinatura vivem no environment `release`, nunca no repositório nem em `pull_request`; `id-token: write` fica só nos jobs do `release.yml` que precisam. Não usar `tauri.windows.conf.json`, que o Tauri mescla sozinho. Trocar de provedor é trocar a variável e os segredos.

## Nome Leve, Moralia e licença MIT

- **Contexto:** o app nasceu como "mdview", nome descritivo e genérico. O código passou a ser produto da Moralia (org `moraliasp` no GitHub). Antes do lançamento o código esteve sob a MPL-2.0, que pede publicar alterações por arquivo, peso que um visualizador pequeno não justifica.
- **Decisão (2026-10-25):** o nome é **Leve** (o pacote npm `leve` existe e é irrelevante, porque o app não é publicado no npm). Licença **MIT**, "Copyright (c) 2026 Moralia". Nome, logo e marca Moralia ficam fora da licença (seção "Licença" do README e frase do Sobre). Identificador `br.com.moralia.leve`, crate `leve` (`leve_lib`), pacote npm `leve`, repositório de destino `github.com/moraliasp/leve` (no Sobre e no `signtool /du`). O repositório público começou sem o histórico anterior.
- **Consequência:** arquivo novo já nasce MIT. Dependência nova precisa ser compatível com distribuição sob MIT (permissiva ou copyleft fraco por arquivo/módulo, como MPL-2.0 e EPL-2.0; GPL/AGPL não entram). O identificador novo muda a pasta de dados (`~/Library/Application Support/br.com.moralia.leve/`), então o Leve não herda as concessões do mdview. As chaves `mdview.*` do localStorage ficam com o nome antigo de propósito: renomear não traz nada ao leitor e quebraria preferências onde o armazenamento sobreviver. Mudar nome, empresa ou licença é decisão nova, aqui.

## Preferências em localStorage, com espelho no menu

- **Contexto:** as preferências (tema, largura, fonte, zoom, sumário, imagens remotas) nasceram como chaves `mdview.*` em localStorage, cada uma alcançável só pelo item correspondente do menu Exibir. A tela Preferências (Mod+,) junta tudo num lugar e acrescenta "Restaurar posição de leitura", "Reabrir abas ao iniciar", "Esquecer arquivos autorizados" e "Restaurar padrões". A alternativa seria um arquivo de preferências gravado pelo Rust (como `grants.json`), com o frontend lendo por comando.
- **Decisão:** as preferências ficam em localStorage, uma chave por preferência, listadas em `src/prefs.ts` (`PREF_KEYS`). A tela e o menu leem e escrevem as mesmas chaves pelas mesmas ações de `main.ts` (`actions`): o item de menu chama a ação, a tela chama a mesma ação e depois relê o estado (`syncPrefsUI`); uma ação disparada pelo menu com a tela aberta passa por `runAction`, que também relê. O menu nativo é só espelho: o frontend o sincroniza com `sync_view_menu` e `sync_remote_menu` no início e a cada troca. O Rust não guarda preferência nenhuma; a única coisa dele que a tela toca é a lista de concessões, por um comando próprio (`forget_grants`, que preserva as abas abertas). Por quê: o localStorage do WebView já é por usuário e por app, sobrevive a atualizações e dispensa comando, serialização e tratamento de erro de arquivo; e tudo que lê preferência está no frontend, então a verdade fica onde é consumida. Um arquivo do Rust só se pagaria se outra coisa fora do WebView precisasse ler (um segundo processo, um CLI), o que não existe.
- **Consequência:** preferência nova = chave em `PREF_KEYS`, ação em `actions`, controle na tela (`#prefs` em index.html, `wirePreferences`/`syncPrefsUI` em main.ts) e, se tiver item de menu, sincronização para o Rust. Nunca duas fontes: a tela não guarda estado próprio, só reflete. "Restaurar padrões" apaga só `PREF_KEYS` (`resetPrefs`); recentes, pontos de leitura e abas (`leve.recent`, `leve.scroll`, `leve.tabs`) são dados, não preferências, e saem só por "Limpar recentes" e "Esquecer arquivos autorizados". O localStorage é do app de dev ou do instalado, cada um o seu (origem diferente): prova de preferência no `tauri dev` não altera o app instalado. As chaves eram `mdview.*` até a 0.2.0 e passaram a `leve.*`; `migrateLegacyKeys` (`src/prefs.ts`) renomeia as antigas ao carregar, com a nova vencendo se as duas existirem, para quem atualiza não perder preferências, idioma, recentes nem abas.

## Interface em português e inglês

- **Contexto:** o repositório é público e o app era só em português. Uma biblioteca de i18n (formatação, plural, carregamento por idioma) pesaria mais do que o problema: são ~170 frases e dois idiomas.
- **Decisão:** dicionário tipado em `src/i18n.ts` (`pt` é a referência e `en` tem o mesmo conjunto de chaves por tipo; parâmetros `{nome}`), e `src-tauri/src/i18n.rs` para o menu nativo e as mensagens do Rust (`Strings` é uma struct, então idioma incompleto não compila). Idioma: preferência `mdview.lang` (Sistema, Português, English); "Sistema" segue `navigator.languages` no frontend e `sys-locale` no Rust na abertura; qualquer português vira pt-BR, o resto vira inglês. O frontend confirma o idioma ao Rust por `set_locale`, que reconstrói o menu. Trocar o idioma recarrega a página (abas e posição voltam pelo `beforeunload`). O instalador NSIS leva inglês e português e escolhe pelo sistema; o `.msi` sai só em inglês (WiX gera um arquivo por idioma).
- **Consequência:** texto novo de interface entra nos dois dicionários (TS ou Rust), nunca direto no HTML ou no código. No HTML, `data-i18n*` e `applyI18n`. `tests/i18n.test.ts` confere chaves e parâmetros iguais; os testes rodam em pt-BR (`tests/setup.ts`), e o golden de `docs/exemplo.md` continua em português.

## Atualização pela release do GitHub

- **Contexto:** sem atualização dentro do app, quem instala fica na versão do dia. A ordem antiga era assinar no sistema primeiro e só então ter atualizador; mas o atualizador do Tauri tem assinatura própria (minisign) e não depende da assinatura Apple ou Authenticode para garantir que o pacote veio da Moralia.
- **Decisão:** `tauri-plugin-updater` + `tauri-plugin-process`. Endpoint `https://github.com/moraliasp/leve/releases/latest/download/latest.json`, gerado pelo `release.yml` (`scripts/latest-json.mjs`) com a assinatura de cada pacote. A chave pública fica em `tauri.conf.json`; a privada e a senha ficam fora do repositório (cofre da Moralia e segredos `TAURI_SIGNING_PRIVATE_KEY`/`TAURI_SIGNING_PRIVATE_KEY_PASSWORD`). O app só procura quando o leitor pede (menu, Sobre, Preferências) ou, com "Procurar atualizações uma vez por dia" ligado, no máximo a cada 24 h; a opção nasce **desligada**, para a frase "sem telemetria, rede só quando você pede" continuar verdadeira. Antes de baixar, o app pergunta. Windows instala em modo `passive`.
- **Consequência:** `/releases/latest/` ignora rascunho e pre-release: uma `vX.Y.Z-rc.N` publicada como pre-release não chega a ninguém, e é assim que se testa. Perder a chave privada obriga a publicar uma versão com chave nova e pedir reinstalação manual; vazar a chave permite publicar atualização falsa, então ela fica só no cofre e no secret. Prova do atualizador: build de teste com `plugins.updater.endpoints` apontando para o `latest.json` de uma rc.

## Repositório público enxuto

- **Contexto:** um app deste tamanho não precisa de todo padrão de repositório grande.
- **Decisão:** entram README em inglês com versão em português, `LICENSE`, `THIRD_PARTY_NOTICES.md`, `CHANGELOG.md` (Keep a Changelog), `CONTRIBUTING.md` curto, `SECURITY.md` (Private Vulnerability Reporting do GitHub), templates de issue em formulário e de PR, `CODEOWNERS`, `.editorconfig`, Dependabot agrupado, rulesets na `main` e nas tags `v*`, e OpenSSF Scorecard (`scorecard.yml`, semanal e a cada push na `main`; entrou porque o repositório guarda a chave do atualizador e o Scorecard acusa regressão nos controles que a protegem: ruleset, permissões de token, pin de actions). Ficam de fora: CodeQL de JS/TS (o código de risco é o sanitize, coberto por teste e por `tests/fixtures/ataque.md`; acrescentaria minutos de CI e alarmes sobre `innerHTML` que já são decisão registrada), Code of Conduct próprio (o `CONTRIBUTING.md` remete ao padrão do GitHub), docs em inglês além do README (os registros de decisão ficam em português, a língua de quem mantém), e workflow de auditoria (os alertas do Dependabot já cobrem npm, RustSec e actions).
- **Consequência:** qualquer um desses entra quando houver um motivo concreto (contribuidores frequentes, um achado de segurança que a análise estática pegaria), registrado aqui.

## Release sem cache e chave atrás de aprovação

- **Contexto:** quem tiver a chave do atualizador (`TAURI_SIGNING_PRIVATE_KEY`) publica atualização para todo Leve instalado. A chave só existe no environment `release` do GitHub e no cofre da Moralia. O que pode chegar nela: um job do `release.yml` com código ou dependência adulterados, e quem conseguir disparar esse job.
- **Decisão:** o `release.yml` não usa cache de Actions (nem `cache: pnpm`, nem `actions/cache`): o cache de uma tag pode vir do que a `main` gravou, e um cache envenenado entraria no binário assinado. Expressões `${{ }}` não entram em `run:`; passam por `env:`. Fora do código, em `docs/seguranca-repo.md`: o environment `release` só aceita tags `v*` e pede aprovação do Eduardo; tags `v*` só são criadas por admin e não mudam nem somem depois de criadas; `GITHUB_TOKEN` somente leitura por padrão; workflows de fork esperam aprovação.
- **Consequência:** cada release compila do zero (alguns minutos a mais por plataforma). Toda release, inclusive `-rc`, para esperando o clique de aprovação no run. Apagar uma tag `v*` de teste exige desligar o ruleset "tags v* — imutáveis" antes e religar depois. Mudança de workflow passa por `zizmor` e `actionlint` sem achado alto ou médio.
