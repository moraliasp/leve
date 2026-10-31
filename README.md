<p align="center">
  <img src="design/icon-1024.png" width="128" height="128" alt="Leve">
</p>

<h1 align="center">Leve</h1>

<p align="center">
  <strong>Double-click a <code>.md</code> file and it just looks right.</strong><br>
  A small, fast, private Markdown viewer for macOS, Windows and Linux. Save in your editor and Leve reloads.
</p>

<p align="center">
  <a href="https://github.com/moraliasp/leve/releases/latest"><img alt="release" src="https://img.shields.io/github/v/release/moraliasp/leve?label=release&color=431A60"></a>
  <img alt="macOS · Windows · Linux" src="https://img.shields.io/badge/platform-macOS%20%C2%B7%20Windows%20%C2%B7%20Linux-431A60">
  <a href="LICENSE"><img alt="MIT" src="https://img.shields.io/badge/license-MIT-C9A6F2"></a>
</p>

<p align="center">
  <a href="https://github.com/moraliasp/leve/releases/latest"><strong>Download</strong></a> ·
  <a href="#first-launch">First launch</a> ·
  <a href="docs/sample.md">Sample document</a> ·
  <a href="README.pt-BR.md">Português</a>
</p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/img/screenshot-en-dark.png">
    <img src="docs/img/screenshot-en-light.png" width="860" alt="Leve showing a Markdown document with metadata, a tip callout, a task list and a table, with the table of contents on the side">
  </picture>
</p>

## Download

Get the latest version from [Releases](https://github.com/moraliasp/leve/releases/latest):

- **macOS 11+** (Apple silicon and Intel): `Leve_x.y.z_universal.dmg` up to 0.6.0. Later versions have one download per chip: `Leve_x.y.z_aarch64.dmg` for Apple silicon, `Leve_x.y.z_x64.dmg` for Intel. Not sure which? In the Apple menu > About This Mac, a chip named Apple M… is Apple silicon; a processor named Intel is Intel.
- **Windows 10/11** (x64): `Leve_x.y.z_x64-setup.exe` (per-user, no admin) or `.msi`
- **Linux** (x86_64, built on Ubuntu 22.04, needs glibc 2.35+): `Leve_x.y.z_amd64.AppImage` (no install) or `Leve_x.y.z_amd64.deb` (Debian, Ubuntu and derivatives), plus `Leve-x.y.z-1.x86_64.rpm` (Fedora, openSUSE) and `Leve_x.y.z_x86_64.flatpak` for Fedora, openSUSE and other distributions with Flatpak (from 0.4.0; `flatpak install --user --bundle <file>`). New and not yet tested on a real Linux desktop: only built and smoke-tested headless in CI. Reports welcome.

Package managers:

macOS:

```bash
brew install --cask moraliasp/tap/leve
```

Windows (coming soon: under review in winget-pkgs):

```powershell
winget install Moralia.Leve
```

Linux (coming soon: not on Flathub yet):

```bash
flatpak install flathub br.com.moralia.leve
```

Each release lists SHA-256 checksums in `SHA256SUMS.txt` and carries [build provenance attestations](https://github.com/moraliasp/leve/attestations) (`gh attestation verify <file> --repo moraliasp/leve`).

### First launch

Leve isn't signed with an Apple or Microsoft certificate yet, so the system warns you once.
**macOS:** open Leve, click *Done*, then go to *System Settings › Privacy & Security* and click *Open Anyway* (or run `xattr -dr com.apple.quarantine /Applications/Leve.app`).
**Windows:** in the SmartScreen prompt, click *More info › Run anyway*.
**Linux:** make the AppImage executable (`chmod +x Leve_*.AppImage`) and run it, install the `.deb` with `sudo apt install ./Leve_*_amd64.deb`, or the `.rpm` with `sudo dnf install ./Leve-*.x86_64.rpm`.

Updates are signed separately and verified by the app before installing: *Leve › Check for Updates…* (on Windows and Linux, *Help › Check for Updates…*), or turn on the daily check in *Settings*.

## Features

- GitHub Flavored Markdown: tables, task lists, footnotes, alerts (`> [!NOTE]`) and Obsidian callouts
- Syntax highlighting, Mermaid diagrams and KaTeX math, loaded only when a document needs them
- Front matter as a table, `[[wikilinks]]`, relative links and images
- Table of contents, find in document, tabs, back/forward
- *File › Open Folder…* (⌘⇧O / Ctrl+Shift+O) shows a folder's Markdown files in a tree, and *File › Quick Open…* (⌘P / Ctrl+P) finds a file by typing part of its name
- Markdown copied from an AI chat or a web page opens without saving a file first: *File › Open from Clipboard* (⌘⇧V / Ctrl+Shift+V) shows it as an unsaved "Untitled" document; *File › Save…* (⌘S / Ctrl+S) turns it into a `.md` file
- After each reload, a mark in the margin shows what changed since the previous version; *View › Next Change* (⌘⇧↓ / Ctrl+Shift+↓) walks through the changes. The comparison stays in memory, per tab
  <br><img src="docs/img/screenshot-en-changes.png" width="640" alt="Leve after a reload: amber bars in the margin mark a rewritten paragraph and a new one, a small triangle marks where a block was deleted, and the toolbar reads “3 sections changed”">
- Nothing stays hidden from the reader: the toolbar warns about HTML comments, invisible or text-direction characters and elements hidden by markup, and *Show* reveals them in place (*View › Show Hidden Content* for every document)
  <br><img src="docs/img/screenshot-en-hidden.png" width="420" alt="The Leve toolbar warning “This document has 12 hidden passages” with a Show button, above a document whose hidden comments and invisible characters do not appear"> <img src="docs/img/screenshot-en-hidden-shown.png" width="420" alt="The same document after Show: the 12 hidden passages appear in place, outlined and labeled (HTML comments, Unicode code points of invisible characters, hidden elements)">
- Review for AI: select text, *Annotate* (⌘⇧A / Ctrl+Shift+A) what should change, and *Edit › Copy Notes for AI* (⌘⌥C / Ctrl+Alt+C) copies your notes as Markdown to paste into an AI tool. Notes stay in memory: nothing is written to your file or disk. After the AI edits the file, a note whose text is gone shows as resolved
- Light and dark themes, four document styles (GitHub, Editor, Terminal, Book), three reading widths, three fonts, zoom
- Print or export to PDF; export a self-contained HTML file (offline, no scripts) or copy it as HTML
- Copy as formatted text (Edit menu, Cmd/Ctrl+Shift+C): the document, or just the selection, pastes into Google Docs, Gmail, Apple Mail, Word, Notion and Slack with headings, lists, links, tables and code intact; diagrams go as images and formulas as their LaTeX source
- English and Portuguese, following your system or your choice in *Settings*
- Large documents (up to 20 MB) open in a lighter mode
- *File › Open in Editor* (⌘E / Ctrl+E) sends the document to VS Code, Cursor, Zed, Sublime Text, TextEdit/Notepad or the default app (*Settings › Integration*)
- `leve file.md` in a terminal opens it in Leve: on macOS, *Leve › Install 'leve' Command in Terminal…*; on Windows and Linux, see [`docs/instalacao.md`](docs/instalacao.md#comando-leve-no-terminal)
- A built-in Markdown primer opens when you start Leve with nothing else to show (*Help › Sample Document*; can be turned off in *Settings*)

## Privacy

No telemetry. Leve reads only files you open (dialog, double-click, drag and drop), files an open document links to with a relative path, and the Markdown files inside a folder you open (*File › Open Folder…*), never other file types from it. It reads the clipboard only when you choose *Open from Clipboard*, and writes only files you pick in a save dialog. Remote images are blocked until you load them. The network is used only for links you open, remote images you ask for, and update checks.

## Size

<!-- comparativo:inicio (gerado por `pnpm comparativo`, não editar) -->

Download size of the smallest installer each Markdown viewer publishes on GitHub, one chart per platform. The scale is linear and each chart has its own.

<p><picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/img/tamanho-macos-en-dark.svg">
  <img alt="macOS, smallest installer of each app: Leve 6.5 MB (.dmg), Imark 7.1 MB (.dmg), Markdown Reader 7.9 MB (.dmg), MD Reader 8.8 MB (.dmg), Markdown Preview 9.2 MB (.dmg), MDHero 11.5 MB (.dmg), mdview 119.3 MB (.dmg), MarkText 157.8 MB (.dmg), Moji 246.4 MB (.dmg)." src="docs/img/tamanho-macos-en-light.svg">
</picture></p>

<p><picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/img/tamanho-windows-en-dark.svg">
  <img alt="Windows, smallest installer of each app: Leve 2.8 MB (setup.exe), Tinta 3.1 MB (portable .exe), MD Reader 4.4 MB (.msi), MDHero 5.4 MB (setup.exe), mdview 102.6 MB (.exe), Moji 131.2 MB (setup.exe), MarkText 132.4 MB (setup.exe)." src="docs/img/tamanho-windows-en-light.svg">
</picture></p>

<p><picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/img/tamanho-linux-en-dark.svg">
  <img alt="Linux (x86_64), smallest installer of each app: Leve 4.4 MB (.deb), MD Reader 4.8 MB (.deb), MDHero 8.4 MB (.deb), MarkText 111.0 MB (.rpm), Moji 118.5 MB (.deb), mdview 134.1 MB (AppImage)." src="docs/img/tamanho-linux-en-light.svg">
</picture></p>

<details>
<summary>Every format, version and link</summary>

Asset `size` from the GitHub Releases API, `releases/latest`, queried 2026-10-31; MB = 10⁶ bytes. Installers are `.dmg`, `.msi`, `.exe`, `.deb`, `.rpm`, AppImage and Flatpak, for x64 on Windows and Linux; archives (`.zip`, `.tar.gz`) and update-only packages don't count. Architecture is as stated in each asset name; that Tinta's `tinta.exe` is portable, with no installer, comes from its README. A universal macOS build carries code for both Apple silicon and Intel, so it is larger than a single-architecture build of the same app. On Linux, an AppImage carries WebKitGTK and the rest of the GUI stack inside it, while a `.deb` or `.rpm` uses the system's libraries; compare like with like.

| App | Release | macOS | Windows | Linux (x86_64) |
|---|---|--:|--:|--:|
| **Leve** | v0.5.0 (2026-10-30) | 6.5 MB `.dmg` (universal) | 2.8 MB `setup.exe` · 3.4 MB `.msi` (x64) | 4.4 MB `.deb` · 4.4 MB `.rpm` · 4.9 MB `.flatpak` · 82.9 MB AppImage |
| [Tinta](https://github.com/oipoistar/tinta) | v3.9.6 (2026-10-31) | — | 3.1 MB portable `tinta.exe`, no installer (not stated) | — |
| [MD Reader](https://github.com/Neilooo/md-reader) | v0.3.12 (2026-10-10) | 8.8 MB `.dmg` (universal) | 4.4 MB `.msi` · 6.5 MB portable `.exe` (x64) | 4.8 MB `.deb` · 4.8 MB `.rpm` · 83.1 MB AppImage |
| [MDHero](https://github.com/vaibhav-kakde-in/mdhero) | v0.2.10 (2026-09-13) | 11.5 MB `.dmg` (Apple silicon) | 5.4 MB `setup.exe` · 6.9 MB `.msi` (x64) | 8.4 MB `.deb` · 8.4 MB `.rpm` · 85.6 MB AppImage |
| [Imark](https://github.com/migsilva89/imark) | v0.6.9 (2026-10-31) | 7.1 MB `.dmg` (not stated) | — | — |
| [Markdown Reader](https://github.com/davidhoo/MarkdownReader) | v2.4.11 (2026-10-19) | 7.9 MB `.dmg` (not stated) | — | — |
| [Markdown Preview](https://github.com/pluk-inc/markdown-preview) | v0.0.70 (2026-10-28) | 9.2 MB `.dmg` (not stated) | — | — |
| [mdview](https://github.com/c3er/mdview) | v4.0.2 (2026-08-02) | 119.3 MB `.dmg` (Apple silicon) | 102.6 MB `.exe` · 114.9 MB `.msi` (x64) | 134.1 MB AppImage |
| [MarkText](https://github.com/marktext/marktext) | v0.23.0 (2026-10-21) | 157.8 MB `.dmg` (Apple silicon) · 164.7 MB `.dmg` (Intel) | 132.4 MB `setup.exe` (x64) | 111.0 MB `.rpm` · 126.7 MB `.deb` · 165.0 MB AppImage |
| [Moji](https://github.com/alexishida/Moji) | v1.0.7 (2026-09-10) | 246.4 MB `.dmg` (universal) | 131.2 MB `setup.exe` (not stated) | 118.5 MB `.deb` · 154.8 MB AppImage |

</details>

<!-- comparativo:fim -->

These are download sizes only; they say nothing about features, and each app does different things. Opening time and memory are measured for Leve alone, because we have no comparable measurement of the others: method, machine and numbers in [`docs/benchmark.md`](docs/benchmark.md).

## Build

Requirements: Node 22+, pnpm, stable Rust, and Xcode Command Line Tools (macOS), Visual Studio Build Tools + WebView2 (Windows), or the [Tauri 2 Linux packages](https://v2.tauri.app/start/prerequisites/#linux) (`libwebkit2gtk-4.1-dev` and friends).

Install the dependencies and run with a document:

```bash
pnpm install
pnpm tauri dev -- -- docs/sample.md
```

Unit and golden tests:

```bash
pnpm test
```

Build `.app`/`.dmg` on macOS, `.exe`/`.msi` on Windows, or `.deb`/`.rpm`/`.AppImage` on Linux (`--bundles deb,rpm,appimage`):

```bash
pnpm tauri build
```

From a Mac you can also build the Windows NSIS installer with `pnpm build:windows` (needs `cargo-xwin`, `llvm`, `lld` and `makensis`; see `scripts/build-windows.sh`).

Contributions are welcome: see [CONTRIBUTING.md](CONTRIBUTING.md). Design decisions (in Portuguese) live in [`docs/decisoes.md`](docs/decisoes.md).

## License

Code under the [MIT license](LICENSE), © 2026 Moralia. Third-party notices: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and [THIRD_PARTY.md](THIRD_PARTY.md).

**Trademark:** the Leve name, logo and the Moralia brand are not licensed under MIT. If you distribute a fork, please use a different name and icon.
