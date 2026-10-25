#!/usr/bin/env bash
# Gera o instalador Windows (.exe NSIS) a partir do macOS/Linux com cargo-xwin.
# O .msi exige WiX e só sai em Windows (ou no workflow release.yml).
#
# Pré-requisitos (uma vez):
#   brew install llvm lld makensis          # clang-cl, llvm-lib (llvm), lld-link (lld), makensis (NSIS)
#   rustup target add x86_64-pc-windows-msvc
#   cargo install cargo-xwin                # baixa o SDK do Windows no 1º uso (~2 GB em cache)
set -euo pipefail

cd "$(dirname "$0")/.."
[ -f "$HOME/.cargo/env" ] && . "$HOME/.cargo/env"

TARGET="${TARGET:-x86_64-pc-windows-msvc}"

# makensis aborta com std::bad_alloc ao gerar as tabelas de idioma quando o shell
# não tem locale UTF-8 (LANG vazio, comum em shells não interativos e agentes).
if [ -z "${LC_ALL:-}" ] && [ -z "${LANG:-}" ]; then
  export LC_ALL=en_US.UTF-8
fi

if command -v brew >/dev/null 2>&1; then
  for f in llvm lld; do
    p="$(brew --prefix "$f" 2>/dev/null || true)"
    [ -d "$p/bin" ] && export PATH="$p/bin:$PATH"
  done
fi

faltam=()
command -v cargo-xwin >/dev/null 2>&1 || faltam+=("cargo-xwin (cargo install cargo-xwin)")
command -v clang-cl   >/dev/null 2>&1 || faltam+=("clang-cl (brew install llvm)")
command -v lld-link   >/dev/null 2>&1 || faltam+=("lld-link (brew install lld)")
command -v makensis   >/dev/null 2>&1 || faltam+=("makensis (brew install makensis)")
rustup target list --installed | grep -q "^${TARGET}$" || faltam+=("target ${TARGET} (rustup target add ${TARGET})")
if [ ${#faltam[@]} -gt 0 ]; then
  printf 'Faltam ferramentas:\n'; printf '  - %s\n' "${faltam[@]}"; exit 1
fi

pnpm tauri build --runner cargo-xwin --target "$TARGET" --bundles nsis "$@"

echo
echo "Instalador:"
ls -1 "src-tauri/target/${TARGET}/release/bundle/nsis/"*.exe
