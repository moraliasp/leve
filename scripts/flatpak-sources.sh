#!/usr/bin/env bash
# Gera packaging/flatpak/{cargo,node}-sources.json a partir de src-tauri/Cargo.lock e pnpm-lock.yaml,
# com o flatpak-builder-tools num commit fixo. As fontes saem com os hashes dos lockfiles (checksum do
# Cargo.lock, integrity sha512 do pnpm-lock), então gerar na hora vale o mesmo que versionar, sem
# ficar velho a cada atualização de dependência. Uso: scripts/flatpak-sources.sh
# Precisa de git e python3 (cria um venv temporário com as dependências fixadas abaixo).
set -euo pipefail

FBT_COMMIT=9d86d336a39b9af38b86f114b6ce5820fe260f91 # flatpak/flatpak-builder-tools, 2026-10-25
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/packaging/flatpak"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

git -c advice.detachedHead=false clone --quiet --filter=blob:none https://github.com/flatpak/flatpak-builder-tools.git "$TMP/fbt"
git -C "$TMP/fbt" checkout --quiet "$FBT_COMMIT"

python3 -m venv "$TMP/venv"
"$TMP/venv/bin/pip" install --quiet --disable-pip-version-check aiohttp==3.14.5 PyYAML==6.0.3 tomlkit==0.15.2

"$TMP/venv/bin/python" "$TMP/fbt/cargo/flatpak-cargo-generator.py" "$ROOT/src-tauri/Cargo.lock" -o "$OUT/cargo-sources.json"
PYTHONPATH="$TMP/fbt/node" "$TMP/venv/bin/python" -m flatpak_node_generator --no-requests-cache \
  pnpm "$ROOT/pnpm-lock.yaml" -o "$OUT/node-sources.json" > "$TMP/node.log" 2>&1 || { tr '\r' '\n' < "$TMP/node.log" | tail -40; exit 1; }
tr '\r' '\n' < "$TMP/node.log" | grep -v 'Generating packages' | grep -v '^ *$' || true
ls -l "$OUT"/*-sources.json
