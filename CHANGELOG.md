# Changelog

All notable changes to Leve are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- macOS downloads are now one per architecture, about half the size of the old universal build: `Leve_x.y.z_aarch64.dmg` for Apple silicon and `Leve_x.y.z_x64.dmg` for Intel, compressed with LZMA. Installed copies update themselves to the right one, including universal installs from 0.6.0 and earlier. The Homebrew cask picks the right file.
- Smaller app on every platform: plugin commands that Leve never allows are left out of the build.

### Fixed

- Opening several Markdown files at once now opens all of them in tabs, with the last one active, even when Leve was closed. This covers Finder, `open -a`, `leve a.md b.md` and, on Windows and Linux, the file manager. Before, only one file opened and the others were lost without notice.
- Changing the interface language no longer reopens the last file that came from the system.
- Exported HTML, Copy as HTML and Copy as Formatted Text no longer carry paths from your disk: a missing image keeps its alt text and the path as the document wrote it, and a path written as absolute is left out. The notice in the document also shows the path as written.
- Windows: paths no longer show the `\\?\` prefix in image notices, exported HTML or notes copied for AI. Recent files, tabs and allowed files saved with the prefix keep working.
- The result of *Check for Updates* can now be read while Preferences or About is open, and it stays longer in the status bar.

## [0.6.0] - 2026-10-31

### Added

- Review for AI: select text and choose *Annotate* (⌘⇧A / Ctrl+Shift+A, or the button beside the selection) to write what should change. *Edit › Copy Notes for AI* (⌘⌥C / Ctrl+Alt+C), or the button in the notes panel, copies the notes as Markdown with the file path, the section, the quoted text and your comment, ready to paste into an AI tool. When the AI changes the file, Leve reloads it, marks what changed, and a note whose text is gone shows as resolved. Notes stay in memory: Leve writes nothing to your file or disk and sends nothing anywhere. Closing a tab with notes asks first.

### Fixed

- `brew install --cask moraliasp/tap/leve` no longer fails when Leve is already in `/Applications`: it keeps that app, which goes on updating itself.
- The install and build commands in the READMEs can be pasted as they are. Their trailing `#` notes broke them in zsh, the default macOS shell, and in the Windows Command Prompt.

### Security

- Updated the ZIP library behind the Windows updater (`zip` 9.1.3) to clear three published advisories. Leve opens an update package only after verifying its signature, and its Windows updates are not ZIP files.
- Every release is now checked against known vulnerabilities in its dependencies, and one with a known problem doesn't ship.

## [0.5.0] - 2026-10-30

### Added

- *File › Open Folder…* (⌘⇧O / Ctrl+Shift+O) shows a folder's Markdown files in a tree beside the table of contents: folders first, natural order, full keyboard navigation. A click opens the file in the current tab; ⌘-click / Ctrl-click, or ⌘↩ / Ctrl+Enter, opens it in a new one. *View › Folder* (⌘⇧E / Ctrl+Shift+E) shows or hides the tree, *File › Close Folder* closes it, and the folder comes back with your tabs and joins Recent files. Leve reads only the Markdown files inside the folder you chose, never other file types, and doesn't follow links that lead outside it.
- *File › Quick Open…* (⌘P / Ctrl+P) finds a file by typing part of its name, with approximate matching that ignores case and accents: across the open folder or, with no folder open, across Recent files.
- `[[wikilinks]]` in a document also resolve across the open folder, not only next to the file.
- Four document styles in *View › Style* and in Settings: GitHub (the default), Editor, Terminal and Book, each in light and dark. Exported HTML keeps the style, in its light theme.
- *File › Open from Clipboard* (⌘⇧V / Ctrl+Shift+V) shows the copied text as an unsaved "Untitled" document in a new tab, without touching the disk, so Markdown from an AI chat or a web page no longer has to be saved before Leve can show it. The toolbar says "Not saved"; *File › Save…* (⌘S / Ctrl+S, enabled only for that document) saves it as `.md`, suggesting the Documents folder, and from then on it reloads on change and joins Recent files like any other document. Leve reads the clipboard only on that command. An empty clipboard, or one without text, shows a short notice.

### Changed

- **Print moved to ⌘⇧P / Ctrl+Shift+P**, because ⌘P / Ctrl+P is now Quick Open. *File › Print / Export PDF…* stays where it was.
- The font setting has a new option, *Style default*, which is now the default: each document style brings its own font. Switching style goes back to it, and choosing Sans, Serif or Mono afterwards overrides only the family and size.
- Less code loads when a window opens (about 294 kB instead of 430 kB), even with the new features, which load only when used: the YAML parser loads only for documents with front matter or Mermaid node data, the updater only when checking for updates, and the GitHub stylesheets gave way to a smaller one built on tokens.

### Fixed

- Five syntax highlighting colors in the GitHub style that fell below 4.5:1 contrast on code blocks (four in light, one in dark) now use the colors from github.com.

## [0.4.0] - 2026-10-28

### Added

- After each reload, Leve marks what changed since the previous version: a bar in the left margin next to blocks that were added or edited, and a small triangle where something was removed. The toolbar says how many sections changed (click to jump to the first), and *View › Next Change* (⌘⇧↓ / Ctrl+Shift+↓) and *Previous Change* (⌘⇧↑ / Ctrl+Shift+↑) walk through them; *View › Clear Change Marks* removes them. The comparison is per tab and only in memory: no copy of the document is written to disk, and marks don't appear in exported, copied or printed output.
- Nothing in a document stays hidden from the reader: when a document has HTML comments, invisible or text-direction characters (zero-width spaces, bidi overrides, Unicode tag characters) or elements hidden by markup or style, the toolbar says how many hidden passages it has, and *Show* reveals them in place, marked, as inert text: comments as labeled blocks, each invisible character as a chip with its code point, hidden elements with a dashed outline. *View › Show Hidden Content* (also in Settings) shows them in every document. Legitimate uses don't count: closed `<details>`, emoji sequences, Arabic and Hebrew text, a leading BOM. Exported, copied and printed output stays as the document is.
- Flatpak packaging (`br.com.moralia.leve`), built from source on the GNOME 51 runtime, with AppStream metadata in English and Portuguese. Each release now includes `Leve_x.y.z_x86_64.flatpak` (install with `flatpak install --user --bundle <file>`; the GNOME runtime comes from Flathub), listed in `SHA256SUMS.txt` and in the build provenance attestation. Leve on Flathub is coming.
- Each release now includes an `.rpm` for Fedora, openSUSE and derivatives: the same build as the `.deb`, about 4 MB, using the system's WebKitGTK, registered for `text/markdown` and updated from *Help › Check for Updates…*.

### Changed

- Inside Flatpak, Leve doesn't use its own updater: *Check for Updates…* points to your software store or `flatpak update` (or, for the `.flatpak` file from Releases, to installing the new one), and the daily check is hidden in Settings.

### Fixed

- The *Show in Finder / Explorer* menu item now names only the current platform's file manager: *Show in Finder* on macOS, *Show in Explorer* on Windows, *Show in Folder* on Linux.
- *Edit › Copy as Formatted Text*: Mermaid diagrams pasted into TextEdit (and other apps that size images by the file's resolution) came out about twice as large as on screen. The PNG now carries its density, so they paste at the on-screen width (up to 640 pt) and stay sharp.
- *Edit › Copy as Formatted Text*: two code blocks in a row no longer paste into TextEdit as one block. A selection that ends at the end of a code block now pastes that block as a whole paragraph.

## [0.3.0] - 2026-10-27

### Added

- Linux builds (x86_64, experimental: built and smoke-tested headless in CI, not yet tested on a real Linux desktop): an `.AppImage` built on Ubuntu 22.04 (needs glibc 2.35 or newer) and a `.deb` for Debian, Ubuntu and derivatives that registers Leve for `text/markdown`. Both update in place from *Help › Check for Updates…* and are listed in `SHA256SUMS.txt` and in the build provenance attestation.
- Homebrew cask (own tap, `moraliasp/tap/leve`) and winget manifests (`Moralia.Leve`), generated per release from `SHA256SUMS.txt` by a manual workflow. Not published yet.
- Sample document: a Markdown primer (history, syntax, good practices, uses) in English and Portuguese that also shows what Leve renders. It opens when Leve is started directly with no tabs to restore, from *Help › Sample Document* at any time, and can be turned off with "Show sample document at startup" in Settings. It lives in memory: no file is written, read or authorized.
- File › Open in Editor (⌘E / Ctrl+E) opens the active document in the editor chosen in Settings › Integration: VS Code, Cursor, Zed, Sublime Text, TextEdit/Notepad, or the default app for `.md` (refused when that default is Leve itself). Only installed editors are listed; the app builds the command from a fixed list, never from text the page sends.
- `leve file.md` in a terminal opens the file in Leve, with paths relative to the terminal's folder, also when Leve is already open. On macOS, *Leve › Install 'leve' Command in Terminal…* installs a small script without a password when a writable folder is in your `PATH`, or with the macOS administrator prompt after you confirm. Windows and Linux steps are in `docs/instalacao.md`.
- File › Export HTML… saves the document as a single self-contained `.html` file that opens offline in any browser: light theme, highlighted code, KaTeX math with its fonts, Mermaid diagrams as SVG, callouts and front matter, local images up to 5 MB embedded, no scripts. Links to other `.md` files become text or point to the sibling `.html`. File › Copy as HTML… copies the same HTML to the clipboard.
- Edit › Copy as Formatted Text (Cmd/Ctrl+Shift+C) copies the document, or only the selection, as rich text with inline styles plus the Markdown source as plain text, so pasting into Google Docs, Gmail, Apple Mail, Word, Notion or Slack keeps headings, bold, lists, links, tables, callouts and code blocks (with syntax colors). Mermaid diagrams are pasted as PNG images and math as its LaTeX source (`$...$`); the sample document can be copied too.

### Changed

- Settings redesigned: fixed header and footer, settings grouped in panels with one row per option, segmented controls for theme, font, width and language, switches for on/off options, actions separated from preferences, and a layout that adapts to narrow windows.
- Settings are now stored under `leve.*` keys; settings saved by 0.2.0 under the old `mdview.*` names are migrated on first launch.
- Mermaid no longer ships the ELK layout engine (elkjs), the largest asset in the app (1.4 MB). Diagrams that ask for `layout: elk` or `flowchart-elk` render with the default dagre layout.
- Smaller app on macOS and Windows: the updater now uses the system's TLS (Security.framework, SChannel) instead of a bundled one, which cuts about 600 KB from the macOS binary (5.1 → 4.5 MB). Update downloads are still checked over HTTPS and by signature.

### Fixed

- Unhandled errors in the interface (rejected promises, exceptions in callbacks) now show in the status bar instead of only in the WebView console, at most one notice every 3 seconds and without repeating the same message. Failure to resolve `[[wikilinks]]` is shown too.

## [0.2.0] - 2026-10-25

First public release.

### Added

- Markdown rendering: GitHub Flavored Markdown (tables, task lists, footnotes, strikethrough, autolinks), GitHub alerts and Obsidian callouts (including collapsible ones), front matter shown as a table, `[[wikilinks]]`, KaTeX math and Mermaid diagrams loaded on demand, syntax highlighting with a copy button.
- Reading: table of contents with the current section, find in document, tabs, back/forward history, reading position restored per file, light/dark/system theme, three widths, three fonts, zoom, print and export to PDF.
- Files: opens `.md`, `.markdown`, `.mdown` and `.mkd` from the dialog, double-click, "Open With", drag and drop, recent files and links between documents; reloads when the file changes on disk; large-document mode above 2 MB; UTF-16 and invalid UTF-8 handled.
- Settings window (theme, language, font, width, text size, reading and privacy options), About window and keyboard shortcuts reference.
- English and Portuguese (Brazil) interface, native menus and Windows installer, following the system language or the choice in Settings.
- In-app updates from GitHub Releases, signed and verified (`tauri-plugin-updater`), on request or once a day if enabled.
- Release builds for macOS (universal) and Windows (NSIS and MSI) with SHA-256 checksums and build provenance attestations.

### Security

- Raw HTML is sanitized (DOMPurify); remote images and resources are blocked until requested; the window never navigates away from the app; documents can only reach files by relative path; file access is granted per file.

[Unreleased]: https://github.com/moraliasp/leve/compare/v0.6.0...HEAD
[0.6.0]: https://github.com/moraliasp/leve/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/moraliasp/leve/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/moraliasp/leve/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/moraliasp/leve/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/moraliasp/leve/releases/tag/v0.2.0
