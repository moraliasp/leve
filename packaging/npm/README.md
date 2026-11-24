# leve.md

Installs [Leve](https://github.com/moraliasp/leve), a small, fast, private Markdown viewer.

```bash
npx leve.md
```

What it does:

- **macOS** (Apple silicon or Intel): downloads `Leve_<version>_aarch64.app.tar.gz` or `Leve_<version>_x64.app.tar.gz`, moves `Leve.app` to `/Applications` (or `~/Applications` if `/Applications` is not writable) and opens it. An existing `Leve.app` is left alone unless you pass `--force`.
- **Windows** (x64): downloads `Leve_<version>_x64-setup.exe` and runs it (per-user installer, no admin).
- **Linux**: not supported. It prints where to get the `.deb`, `.rpm`, AppImage and Flatpak.

Downloads come only from the [GitHub release](https://github.com/moraliasp/leve/releases) of the same version as this package. The SHA-256 of each file ships inside the package (`sums.json`, taken from the release's `SHA256SUMS.txt`), and the download is checked against it before anything is extracted or run. No dependencies, no install scripts.

Options: `--force`, `--help`, `--version`.

Em português: veja o [README do Leve](https://github.com/moraliasp/leve/blob/main/README.pt-BR.md).

MIT license. The Leve name and logo are not covered by the license.
