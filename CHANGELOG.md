# Changelog

All notable changes to Leve are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- File › Export HTML… saves the document as a single self-contained `.html` file that opens offline in any browser: light theme, highlighted code, KaTeX math with its fonts, Mermaid diagrams as SVG, callouts and front matter, local images up to 5 MB embedded, no scripts. Links to other `.md` files become text or point to the sibling `.html`. File › Copy as HTML… copies the same HTML to the clipboard.

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

[Unreleased]: https://github.com/moraliasp/leve/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/moraliasp/leve/releases/tag/v0.2.0
