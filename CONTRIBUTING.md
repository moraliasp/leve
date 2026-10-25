# Contributing to Leve

Thanks for your interest. Leve is a small app maintained by Moralia; issues and pull requests in English or Portuguese are welcome.

- **Bugs and ideas:** open an [issue](https://github.com/moraliasp/leve/issues/new/choose). For security problems, follow [SECURITY.md](SECURITY.md) instead.
- **Pull requests:** keep them focused, one change per PR. Before opening one, run:

  ```bash
  pnpm build && pnpm test
  cd src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test
  ```

- **Rendering changes:** if the output of `docs/exemplo.md` changes on purpose, update the snapshot with `pnpm test -u` and review the diff.
- **Interface text:** add every string to both dictionaries (`src/i18n.ts` and, for native menus, `src-tauri/src/i18n.rs`).
- **Design decisions** are recorded in [`docs/decisoes.md`](docs/decisoes.md) (Portuguese). Read the relevant entry before changing something listed there.
- Be kind. The [GitHub Community Guidelines](https://docs.github.com/site-policy/github-terms/github-community-guidelines) apply.

By contributing you agree that your contribution is licensed under the MIT license of this repository.
