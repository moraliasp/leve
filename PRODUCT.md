# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

A interface é HTML/CSS num WebView do Tauri 2; menus, diálogos de arquivo e janela são nativos e seguem o SO sozinhos. Distribuído para macOS 11+ (universal) e Windows 10/11 (x64).

## Users

Leitor principal: dev ou pessoa técnica com arquivos `.md` em repositório (README, ADR, notas, docs). Quer ler o Markdown renderizado sem abrir editor nem navegador: dá duplo-clique, lê, e edita em outro lugar enquanto o Leve recarrega ao salvar.

## Product Purpose

Visualizador de Markdown: abrir um `.md` e ver bonito, na hora. Sucesso é o leitor esquecer o app e ficar no documento: abre rápido, renderiza fiel ao GitHub, recarrega ao salvar, não pede nada e não manda nada para fora.

## Positioning

- **Privado por padrão:** nenhum recurso remoto carrega sem o leitor pedir, o app só lê arquivos concedidos um a um, a janela nunca navega para fora, sem telemetria. Atualização só a pedido ou com a checagem diária ligada.
- **Pequeno e rápido:** app Tauri, abre por duplo-clique, recarga acompanhando o tamanho do arquivo, modo documento grande acima de 2 MiB.
- **Livre:** licença MIT, da Moralia; nome, logo e marca ficam fora da licença.

## Operating Context

- O arquivo chega por duplo-clique/"Abrir com", diálogo, arrastar para a janela, Recentes, link entre documentos, abas restauradas.
- Uso lado a lado com um editor: o leitor salva lá e o Leve recarrega.
- Leitura longa: sumário lateral, busca, abas, voltar/avançar, ponto de leitura guardado por arquivo, impressão e PDF.
- Markdown do GitHub (tabelas, tarefas, notas de rodapé, alertas), callouts do Obsidian, frontmatter, `[[wikilinks]]`, Mermaid e KaTeX sob demanda, realce de código.

## Capabilities and Constraints

- Só lê; não há modo de edição.
- Atalhos vivem no menu nativo, com rótulos formatados por plataforma (⌘ no macOS, Ctrl no resto); nunca símbolo fixo no texto.
- Preferências em localStorage, uma chave por preferência; a tela Preferências e o menu chamam as mesmas ações.
- Interface em pt-BR e inglês; todo texto novo entra nos dois.
- Ícones de interface só Lucide (licença ISC); nada copiado de outros produtos.
- HTML cru do documento é sanitizado, e o documento não pode cobrir a interface.
- Sem framework de UI: TypeScript sem framework no frontend, Rust no backend.
- Decisões e o porquê de cada uma: `docs/decisoes.md`.

## Brand Commitments

- Nome **Leve** (o app se chamava mdview); produto da **Moralia**.
- Ícone em `design/icon.svg`; card social em `design/social-preview.svg`.
- Tom do texto: direto e curto, em pt-BR e inglês, como o README.

## Evidence on Hand

- Documento de exemplo que exercita o render: `docs/exemplo.md`.
- Capturas claro/escuro do app: `docs/img/screenshot-*`.
- Ainda não há usuários citáveis, depoimentos, números de uso nem imprensa: não inventar.

## Product Principles

1. O documento é o produto; a interface sai do caminho.
2. Privacidade não é opção escondida: o padrão já é o seguro, e o leitor libera só o que pedir.
3. Rápido antes de completo: o que é pesado carrega sob demanda.
4. Uma fonte para cada coisa: preferência, atalho, texto e ícone têm um lugar só.

## Accessibility & Inclusion

- Teclado completo também no WebKit do macOS sem "Navegação por teclado" ligada (`keepTabbable`); prova por `AXFocusedUIElement` no app de dev.
- Texto a ≥ 4,5:1 nos dois temas, conferido por `node scripts/contraste.mjs`.
- Respeita `prefers-reduced-motion`.
