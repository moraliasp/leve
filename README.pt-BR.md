<p align="center">
  <img src="design/icon-1024.png" width="128" height="128" alt="Leve">
</p>

<h1 align="center">Leve</h1>

<p align="center">
  <strong>Duplo-clique num <code>.md</code> e pronto: o Markdown aparece bonito, na hora.</strong><br>
  Um visualizador de Markdown pequeno, rápido e privado para macOS, Windows e Linux. Salve no editor e o Leve recarrega.
</p>

<p align="center">
  <a href="https://github.com/moraliasp/leve/releases/latest"><img alt="versão" src="https://img.shields.io/github/v/release/moraliasp/leve?label=vers%C3%A3o&color=431A60"></a>
  <img alt="macOS · Windows · Linux" src="https://img.shields.io/badge/plataforma-macOS%20%C2%B7%20Windows%20%C2%B7%20Linux-431A60">
  <a href="LICENSE"><img alt="MIT" src="https://img.shields.io/badge/licen%C3%A7a-MIT-C9A6F2"></a>
</p>

<p align="center">
  <a href="https://github.com/moraliasp/leve/releases/latest"><strong>Baixar</strong></a> ·
  <a href="#primeira-abertura">Primeira abertura</a> ·
  <a href="docs/exemplo.md">Documento de exemplo</a> ·
  <a href="README.md">English</a>
</p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/img/screenshot-pt-BR-dark.png">
    <img src="docs/img/screenshot-pt-BR-light.png" width="860" alt="O Leve mostrando um documento com sumário lateral, diagrama Mermaid e alertas no estilo do GitHub">
  </picture>
</p>

## Download

Baixe a versão mais recente em [Releases](https://github.com/moraliasp/leve/releases/latest):

- **macOS 11+** (Apple silicon e Intel): `Leve_x.y.z_universal.dmg`
- **Windows 10/11** (x64): `Leve_x.y.z_x64-setup.exe` (por usuário, sem administrador) ou `.msi`
- **Linux** (x86_64, glibc 2.35+: Ubuntu 22.04, Debian 12, Fedora 36 ou mais novos): `Leve_x.y.z_amd64.AppImage` (qualquer distribuição, sem instalar) ou `Leve_x.y.z_amd64.deb` (Debian, Ubuntu e derivados)

Cada release traz os SHA-256 em `SHA256SUMS.txt` e [attestations de proveniência](https://github.com/moraliasp/leve/attestations) (`gh attestation verify <arquivo> --repo moraliasp/leve`).

### Primeira abertura

O Leve ainda não tem assinatura Apple nem Microsoft, então o sistema avisa uma vez.
**macOS:** abra o Leve, clique em *Concluído*, vá em *Ajustes do Sistema › Privacidade e Segurança* e clique em *Abrir Mesmo Assim* (ou rode `xattr -dr com.apple.quarantine /Applications/Leve.app`).
**Windows:** no aviso do SmartScreen, clique em *Mais informações › Executar assim mesmo*.
**Linux:** torne o AppImage executável (`chmod +x Leve_*.AppImage`) e abra, ou instale o `.deb` com `sudo apt install ./Leve_*_amd64.deb`.

Passo a passo em [`docs/instalacao.md`](docs/instalacao.md). As atualizações têm assinatura própria, conferida pelo app antes de instalar: *Leve › Verificar atualizações…* (no Windows e no Linux, *Ajuda › Verificar atualizações…*), ou ligue a checagem diária nas *Preferências*.

## Recursos

- Markdown no padrão do GitHub: tabelas, listas de tarefas, notas de rodapé, alertas (`> [!NOTE]`) e callouts do Obsidian
- Realce de código, diagramas Mermaid e fórmulas KaTeX, carregados só quando o documento usa
- Frontmatter como tabela, `[[wikilinks]]`, links e imagens relativos
- Sumário, busca no documento, abas, voltar/avançar
- Tema claro e escuro, três larguras de leitura, três fontes, zoom
- Imprimir ou exportar PDF; exportar um HTML autocontido (offline, sem scripts) ou copiar como HTML
- Português e inglês, pelo idioma do sistema ou pela escolha nas *Preferências*
- Documentos grandes (até 20 MB) abrem num modo mais leve
- Um guia de Markdown embutido abre quando o Leve inicia sem nada para mostrar (*Ajuda › Documento de exemplo*; dá para desligar nas *Preferências*)

## Privacidade

Sem telemetria. O Leve só lê arquivos que você abriu (diálogo, duplo-clique, arrastar) e os que um documento aberto aponta por caminho relativo. Imagens remotas ficam bloqueadas até você pedir. A rede só é usada nos links que você abre, nas imagens remotas que você pedir e para procurar atualizações.

## Build

Pré-requisitos: Node 22+, pnpm, Rust estável e Xcode Command Line Tools (macOS), Visual Studio Build Tools + WebView2 (Windows) ou os [pacotes do Tauri 2 para Linux](https://v2.tauri.app/start/prerequisites/#linux) (`libwebkit2gtk-4.1-dev` e afins).

```bash
pnpm install
pnpm tauri dev -- -- docs/exemplo.md   # roda com um documento
pnpm test                               # testes unitários e golden
pnpm tauri build                        # .app/.dmg no macOS, .exe/.msi no Windows, .deb/.AppImage no Linux (--bundles deb,appimage)
```

Do Mac também sai o instalador NSIS do Windows com `pnpm build:windows` (precisa de `cargo-xwin`, `llvm`, `lld` e `makensis`; ver `scripts/build-windows.sh`).

Contribuições: [CONTRIBUTING.md](CONTRIBUTING.md). As decisões de projeto ficam em [`docs/decisoes.md`](docs/decisoes.md).

## Licença

Código sob a [licença MIT](LICENSE), © 2026 Moralia. Avisos de terceiros: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) e [THIRD_PARTY.md](THIRD_PARTY.md).

**Marca:** o nome Leve, o logo e a marca Moralia não estão sob a MIT. Um fork distribuído deve usar outro nome e outro ícone.
