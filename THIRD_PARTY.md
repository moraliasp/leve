# Terceiros

Gerado por `node scripts/third-party.mjs` em 2026-10-29. Textos completos das licenças com obrigação de aviso (Lucide, DOMPurify, crates MPL-2.0, webpki-root-certs) em `THIRD_PARTY_NOTICES.md`.

## Licenças com obrigação de aviso (EPL/MPL/CDLA)

Pacotes npm de produção e crates do grafo do Rust cuja licença é EPL ou MPL sem alternativa permissiva, mais os de licença dupla com escolha registrada. Cada um precisa de um título com o nome em `THIRD_PARTY_NOTICES.md` (conferido por `tests/notices.test.ts`). Revisão do jurídico antes da release.

| Pacote | Versão | Origem | Licença | Situação |
|---|---|---|---|---|
| [cssparser](https://github.com/servo/rust-cssparser) | 0.37.0 | crate | MPL-2.0 | sem alternativa permissiva; texto e fonte em THIRD_PARTY_NOTICES.md |
| [cssparser-macros](https://github.com/servo/rust-cssparser) | 0.7.1 | crate | MPL-2.0 | sem alternativa permissiva; texto e fonte em THIRD_PARTY_NOTICES.md |
| [dtoa-short](https://github.com/upsuper/dtoa-short) | 0.3.5 | crate | MPL-2.0 | sem alternativa permissiva; texto e fonte em THIRD_PARTY_NOTICES.md |
| [option-ext](https://github.com/soc/option-ext.git) | 0.2.0 | crate | MPL-2.0 | sem alternativa permissiva; texto e fonte em THIRD_PARTY_NOTICES.md |
| [selectors](https://github.com/servo/stylo) | 0.38.0 | crate | MPL-2.0 | sem alternativa permissiva; texto e fonte em THIRD_PARTY_NOTICES.md |
| [webpki-root-certs](https://github.com/rustls/webpki-roots) | 1.0.11 | crate | CDLA-Permissive-2.0 | sem alternativa permissiva; texto e fonte em THIRD_PARTY_NOTICES.md |
| [dompurify](https://github.com/cure53/DOMPurify) | 3.4.17 | npm | (MPL-2.0 OR Apache-2.0) | Apache-2.0 escolhida; texto e fonte em THIRD_PARTY_NOTICES.md |

Fora do bundle (dependência instalada, não distribuída no app):

- elkjs 0.9.3 (EPL-2.0): layout ELK do Mermaid, cortado pelo plugin `mermaidSemElk` do `vite.config.ts`.

## npm (produção, 134 pacotes incluindo transitivos)

| Pacote | Versão | Licença |
|---|---|---|
| [@antfu/install-pkg](https://github.com/antfu-collective/install-pkg#readme) | 2.1.0 | MIT |
| [@braintree/sanitize-url](https://github.com/braintree/sanitize-url#readme) | 7.1.2 | MIT |
| [@chevrotain/cst-dts-gen](https://github.com/Chevrotain/chevrotain#readme) | 13.2.0 | Apache-2.0 |
| [@chevrotain/gast](https://github.com/Chevrotain/chevrotain#readme) | 13.2.0 | Apache-2.0 |
| [@chevrotain/regexp-to-ast](https://github.com/Chevrotain/chevrotain#readme) | 13.2.0 | Apache-2.0 |
| [@chevrotain/types](https://chevrotain.io/documentation/) | 13.2.0 | Apache-2.0 |
| [@chevrotain/utils](https://github.com/Chevrotain/chevrotain#readme) | 13.2.0 | Apache-2.0 |
| [@iconify/types](https://github.com/iconify/iconify) | 2.0.0 | MIT |
| [@iconify/utils](https://iconify.design/docs/libraries/utils/) | 3.1.7 | MIT |
| [@mermaid-js/parser](https://github.com/mermaid-js/mermaid/tree/develop/packages/mermaid/parser/#readme) | 2.0.1 | MIT |
| [@tauri-apps/api](https://github.com/tauri-apps/tauri#readme) | 2.12.4 | Apache-2.0 OR MIT |
| [@tauri-apps/plugin-process](https://github.com/tauri-apps/plugins-workspace#readme) | 2.4.0 | MIT OR Apache-2.0 |
| [@tauri-apps/plugin-updater](https://github.com/tauri-apps/plugins-workspace#readme) | 2.14.0 | MIT OR Apache-2.0 |
| [@types/d3](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/d3) | 7.4.3 | MIT |
| [@types/d3-array](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/d3-array) | 3.2.2 | MIT |
| [@types/d3-axis](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/d3-axis) | 3.0.6 | MIT |
| [@types/d3-brush](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/d3-brush) | 3.0.6 | MIT |
| [@types/d3-chord](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/d3-chord) | 3.0.6 | MIT |
| [@types/d3-color](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/d3-color) | 3.1.3 | MIT |
| [@types/d3-contour](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/d3-contour) | 3.0.6 | MIT |
| [@types/d3-delaunay](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/d3-delaunay) | 6.0.4 | MIT |
| [@types/d3-dispatch](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/d3-dispatch) | 3.0.7 | MIT |
| [@types/d3-drag](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/d3-drag) | 3.0.7 | MIT |
| [@types/d3-dsv](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/d3-dsv) | 3.0.7 | MIT |
| [@types/d3-ease](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/d3-ease) | 3.0.2 | MIT |
| [@types/d3-fetch](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/d3-fetch) | 3.0.7 | MIT |
| [@types/d3-force](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/d3-force) | 3.0.10 | MIT |
| [@types/d3-format](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/d3-format) | 3.0.4 | MIT |
| [@types/d3-geo](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/d3-geo) | 3.1.1 | MIT |
| [@types/d3-hierarchy](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/d3-hierarchy) | 3.1.7 | MIT |
| [@types/d3-interpolate](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/d3-interpolate) | 3.0.4 | MIT |
| [@types/d3-path](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/d3-path) | 3.1.1 | MIT |
| [@types/d3-polygon](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/d3-polygon) | 3.0.2 | MIT |
| [@types/d3-quadtree](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/d3-quadtree) | 3.0.6 | MIT |
| [@types/d3-random](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/d3-random) | 3.0.4 | MIT |
| [@types/d3-scale](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/d3-scale) | 4.0.9 | MIT |
| [@types/d3-scale-chromatic](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/d3-scale-chromatic) | 3.1.0 | MIT |
| [@types/d3-selection](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/d3-selection) | 3.0.12 | MIT |
| [@types/d3-shape](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/d3-shape) | 3.2.0 | MIT |
| [@types/d3-time](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/d3-time) | 3.0.4 | MIT |
| [@types/d3-time-format](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/d3-time-format) | 4.0.3 | MIT |
| [@types/d3-timer](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/d3-timer) | 3.0.2 | MIT |
| [@types/d3-transition](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/d3-transition) | 3.0.9 | MIT |
| [@types/d3-zoom](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/d3-zoom) | 3.0.9 | MIT |
| [@types/geojson](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/geojson) | 7946.0.16 | MIT |
| [@types/linkify-it](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/linkify-it) | 5.0.0 | MIT |
| [@types/markdown-it](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/markdown-it) | 14.2.0 | MIT |
| [@types/mdurl](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/mdurl) | 2.0.0 | MIT |
| [@types/trusted-types](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/trusted-types) | 2.0.7 | MIT |
| [@upsetjs/venn.js](https://github.com/upsetjs/venn.js) | 2.0.0 | MIT |
| [argparse](https://github.com/nodeca/argparse#readme) | 3.0.3 | PSF-2.0 |
| [chevrotain](https://chevrotain.io/docs/) | 13.2.0 | Apache-2.0 |
| [commander](https://github.com/tj/commander.js#readme) | 7.2.0, 15.0.0 | MIT |
| [cose-base](https://github.com/iVis-at-Bilkent/cose-base#readme) | 1.0.3, 2.2.0 | MIT |
| [cytoscape](http://js.cytoscape.org) | 3.34.4 | MIT |
| [cytoscape-cose-bilkent](https://github.com/cytoscape/cytoscape.js-cose-bilkent) | 4.1.0 | MIT |
| [cytoscape-fcose](https://github.com/iVis-at-Bilkent/cytoscape.js-fcose) | 2.2.0 | MIT |
| [d3](https://d3js.org) | 7.9.0 | ISC |
| [d3-array](https://d3js.org/d3-array/) | 3.2.4 | ISC |
| [d3-array](https://d3js.org/d3-array/) | 2.12.1 | BSD-3-Clause |
| [d3-axis](https://d3js.org/d3-axis/) | 3.0.0 | ISC |
| [d3-brush](https://d3js.org/d3-brush/) | 3.0.0 | ISC |
| [d3-chord](https://d3js.org/d3-chord/) | 3.0.1 | ISC |
| [d3-color](https://d3js.org/d3-color/) | 3.1.0 | ISC |
| [d3-contour](https://d3js.org/d3-contour/) | 4.0.2 | ISC |
| [d3-delaunay](https://github.com/d3/d3-delaunay) | 6.0.4 | ISC |
| [d3-dispatch](https://d3js.org/d3-dispatch/) | 3.0.1 | ISC |
| [d3-drag](https://d3js.org/d3-drag/) | 3.0.0 | ISC |
| [d3-dsv](https://d3js.org/d3-dsv/) | 3.0.1 | ISC |
| [d3-ease](https://d3js.org/d3-ease/) | 3.0.1 | BSD-3-Clause |
| [d3-fetch](https://d3js.org/d3-fetch/) | 3.0.1 | ISC |
| [d3-force](https://d3js.org/d3-force/) | 3.0.0 | ISC |
| [d3-format](https://d3js.org/d3-format/) | 3.1.2 | ISC |
| [d3-geo](https://d3js.org/d3-geo/) | 3.1.1 | ISC |
| [d3-hierarchy](https://d3js.org/d3-hierarchy/) | 3.1.2 | ISC |
| [d3-interpolate](https://d3js.org/d3-interpolate/) | 3.0.1 | ISC |
| [d3-path](https://d3js.org/d3-path/) | 3.1.0 | ISC |
| [d3-path](https://d3js.org/d3-path/) | 1.0.9 | BSD-3-Clause |
| [d3-polygon](https://d3js.org/d3-polygon/) | 3.0.1 | ISC |
| [d3-quadtree](https://d3js.org/d3-quadtree/) | 3.0.1 | ISC |
| [d3-random](https://d3js.org/d3-random/) | 3.0.1 | ISC |
| [d3-sankey](https://github.com/d3/d3-sankey) | 0.12.3 | BSD-3-Clause |
| [d3-scale](https://d3js.org/d3-scale/) | 4.0.2 | ISC |
| [d3-scale-chromatic](https://d3js.org/d3-scale-chromatic/) | 3.1.0 | ISC |
| [d3-selection](https://d3js.org/d3-selection/) | 3.0.0 | ISC |
| [d3-shape](https://d3js.org/d3-shape/) | 3.2.0 | ISC |
| [d3-shape](https://d3js.org/d3-shape/) | 1.3.7 | BSD-3-Clause |
| [d3-time](https://d3js.org/d3-time/) | 3.1.0 | ISC |
| [d3-time-format](https://d3js.org/d3-time-format/) | 4.1.0 | ISC |
| [d3-timer](https://d3js.org/d3-timer/) | 3.0.1 | ISC |
| [d3-transition](https://d3js.org/d3-transition/) | 3.0.1 | ISC |
| [d3-zoom](https://d3js.org/d3-zoom/) | 3.0.0 | ISC |
| [dagre-d3-es](https://github.com/tbo47/dagre-es#readme) | 7.0.14 | MIT |
| [dayjs](https://day.js.org) | 1.11.23 | MIT |
| [delaunator](https://github.com/mapbox/delaunator#readme) | 5.1.0 | ISC |
| [dompurify](https://github.com/cure53/DOMPurify) | 3.4.17 | (MPL-2.0 OR Apache-2.0) |
| [elkjs](https://github.com/kieler/elkjs#readme) | 0.9.3 | EPL-2.0 |
| [entities](https://github.com/fb55/entities#readme) | 8.1.0 | BSD-2-Clause |
| [es-toolkit](https://es-toolkit.dev) | 1.52.0 | MIT |
| [hachure-fill](https://github.com/pshihn/hachure-fill#readme) | 0.5.2 | MIT |
| [highlight.js](https://highlightjs.org/) | 11.12.0 | BSD-3-Clause |
| [iconv-lite](https://github.com/ashtuchkin/iconv-lite) | 0.6.3 | MIT |
| [import-meta-resolve](https://github.com/wooorm/import-meta-resolve#readme) | 4.2.0 | MIT |
| [internmap](https://github.com/mbostock/internmap/) | 1.0.1, 2.0.3 | ISC |
| [katex](https://katex.org) | 0.18.10 | MIT |
| [khroma](https://github.com/fabiospampinato/khroma#readme) | 2.1.0 | MIT (arquivo `license` do pacote) |
| [layout-base](https://github.com/iVis-at-Bilkent/layout-base#readme) | 1.0.2, 2.0.1 | MIT |
| [linkify-it](https://github.com/markdown-it/linkify-it#readme) | 6.1.0 | MIT |
| [lodash-es](https://lodash.com/custom-builds) | 4.18.1 | MIT |
| [lucide-static](https://lucide.dev) | 1.61.0 | ISC |
| [markdown-it](https://github.com/markdown-it/markdown-it#readme) | 15.0.3 | MIT |
| [markdown-it-anchor](https://github.com/valeriangalliat/markdown-it-anchor#readme) | 10.0.0 | Unlicense |
| [markdown-it-footnote](https://github.com/markdown-it/markdown-it-footnote#readme) | 4.0.0 | MIT |
| [markdown-it-front-matter](https://github.com/ParkSB/markdown-it-front-matter#readme) | 0.2.4 | MIT |
| [markdown-it-task-lists](https://github.com/revin/markdown-it-task-lists#readme) | 2.1.1 | ISC |
| [marked](https://marked.js.org) | 16.4.2 | MIT |
| [mdurl](https://github.com/markdown-it/mdurl#readme) | 2.1.0 | MIT |
| [mermaid](https://github.com/mermaid-js/mermaid#readme) | 12.2.0 | MIT |
| [package-manager-detector](https://github.com/antfu-collective/package-manager-detector#readme) | 1.9.0 | MIT |
| [path-data-parser](https://github.com/pshihn/path-data-parser#readme) | 0.1.0 | MIT |
| [points-on-curve](https://github.com/pshihn/bezier-points#readme) | 0.2.0 | MIT |
| [points-on-path](https://github.com/pshihn/points-on-path#readme) | 0.2.1 | MIT |
| [punycode.js](https://mths.be/punycode) | 2.3.1 | MIT |
| [robust-predicates](https://github.com/mourner/robust-predicates#readme) | 3.0.3 | Unlicense |
| [roughjs](https://roughjs.com) | 4.6.6 | MIT |
| [rw](https://github.com/mbostock/rw) | 1.3.3 | BSD-3-Clause |
| [safer-buffer](https://github.com/ChALkeR/safer-buffer#readme) | 2.1.2 | MIT |
| [stylis](https://github.com/thysultan/stylis.js) | 4.4.0 | MIT |
| [tinyexec](https://github.com/tinylibs/tinyexec#readme) | 1.3.1 | MIT |
| [ts-dedent](https://github.com/tamino-martinius/node-ts-dedent#readme) | 2.3.0 | MIT |
| [uc.micro](https://github.com/markdown-it/uc.micro#readme) | 3.0.0 | MIT |
| [uuid](https://github.com/uuidjs/uuid#readme) | 14.0.3 | MIT |
| [yaml](https://eemeli.org/yaml/) | 2.9.1 | ISC |

## Rust (crates diretos; o grafo completo tem 551 crates)

| Pacote | Versão | Licença |
|---|---|---|
| [arboard](https://github.com/1Password/arboard) | 3.7.0 | MIT OR Apache-2.0 |
| [base64](https://github.com/marshallpierce/rust-base64) | 0.22.1 | MIT OR Apache-2.0 |
| [notify](https://github.com/notify-rs/notify.git) | 8.2.0 | CC0-1.0 |
| [notify-debouncer-mini](https://github.com/notify-rs/notify.git) | 0.6.0 | MIT OR Apache-2.0 |
| [serde](https://github.com/serde-rs/serde) | 1.0.229 | MIT OR Apache-2.0 |
| [serde_json](https://github.com/serde-rs/json) | 1.0.154 | MIT OR Apache-2.0 |
| [sys-locale](https://github.com/1Password/sys-locale) | 0.3.2 | MIT OR Apache-2.0 |
| [tauri](https://github.com/tauri-apps/tauri) | 2.12.5 | Apache-2.0 OR MIT |
| [tauri-build](https://github.com/tauri-apps/tauri) | 2.7.4 | Apache-2.0 OR MIT |
| [tauri-plugin-dialog](https://github.com/tauri-apps/plugins-workspace) | 2.8.3 | Apache-2.0 OR MIT |
| [tauri-plugin-opener](https://github.com/tauri-apps/plugins-workspace) | 2.7.2 | Apache-2.0 OR MIT |
| [tauri-plugin-process](https://github.com/tauri-apps/plugins-workspace) | 2.4.0 | Apache-2.0 OR MIT |
| [tauri-plugin-single-instance](https://github.com/tauri-apps/plugins-workspace) | 2.5.4 | Apache-2.0 OR MIT |
| [tauri-plugin-updater](https://github.com/tauri-apps/plugins-workspace) | 2.14.0 | Apache-2.0 OR MIT |
| [tauri-plugin-window-state](https://github.com/tauri-apps/plugins-workspace) | 2.5.0 | Apache-2.0 OR MIT |

Licenças no grafo completo do Rust: MIT OR Apache-2.0 (249), MIT (131), Apache-2.0 OR MIT (53), MIT/Apache-2.0 (19), Zlib OR Apache-2.0 OR MIT (18), Unicode-3.0 (18), Unlicense OR MIT (9), MPL-2.0 (5), ISC (5), Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT (5), Apache-2.0 (4), BSD-3-Clause (3), Apache-2.0/MIT (3), Zlib (3), Apache-2.0 OR ISC OR MIT (3), BSL-1.0 (2), MIT OR Zlib OR Apache-2.0 (2), BSD-3-Clause OR MIT OR Apache-2.0 (2), MIT OR Apache-2.0 OR LGPL-2.1-or-later (2), MIT OR Apache-2.0 OR Zlib (2), Unlicense/MIT (2), 0BSD OR MIT OR Apache-2.0 (1), BSD-3-Clause AND MIT (1), BSD-3-Clause/MIT (1), Apache-2.0 AND MIT (1), CC0-1.0 OR MIT-0 OR Apache-2.0 (1), Apache-2.0 / MIT (1), CC0-1.0 (1), Apache-2.0 AND ISC (1), Apache-2.0 WITH LLVM-exception (1), (MIT OR Apache-2.0) AND Unicode-3.0 (1), CDLA-Permissive-2.0 (1).
