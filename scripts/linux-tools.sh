#!/usr/bin/env bash
# Pré-carrega, conferidas por hash, as ferramentas que o bundler do Tauri usa para montar o
# AppImage, no cache onde ele as procura. Com elas no lugar, o empacotamento não baixa nada.
#   scripts/linux-tools.sh           baixa, confere contra scripts/linux-tools.sha256 e instala
#   scripts/linux-tools.sh --check   confere que o cache tem só esses arquivos (depois do build)
# Cache e nomes vêm de `prepare_tools` em crates/tauri-bundler/src/bundle/linux/appimage/
# linuxdeploy.rs (tauri-cli 2.12.4 = tauri-bundler 2.10.4): `dirs::cache_dir()/tauri`, isto é
# `${XDG_CACHE_HOME:-~/.cache}/tauri`, com o linuxdeploy em
# `linuxdeploy-<LINUXDEPLOY_COMMIT_HASH>-<arch>.AppImage`. Atualizar a CLI do Tauri pode mudar
# esse commit: aí o bundler procura outro nome, o --check acusa e os hashes daqui são revistos.
# O `runtime-x86_64` (type2-runtime do AppImage) não é do Tauri: sem ele, o appimagetool de dentro
# do plugin baixa o da tag `continuous`. scripts/bundle-linux.sh o passa por LDAI_RUNTIME_FILE.
# Ver docs/decisoes.md ("Linux: AppImage e .deb").
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
SUMS="$HERE/linux-tools.sha256"
CACHE="${XDG_CACHE_HOME:-$HOME/.cache}/tauri"

# Nome no cache e URL. O plugin do AppImage vem da release versionada, não da `continuous`.
NOMES=(AppRun-x86_64 linuxdeploy-07333c6-x86_64.AppImage linuxdeploy-plugin-appimage.AppImage runtime-x86_64)
URLS=(
  "https://github.com/tauri-apps/binary-releases/releases/download/apprun-old/AppRun-x86_64"
  "https://github.com/tauri-apps/binary-releases/releases/download/linuxdeploy-07333c6/linuxdeploy-x86_64.AppImage"
  "https://github.com/linuxdeploy/linuxdeploy-plugin-appimage/releases/download/1-alpha-20250213-1/linuxdeploy-plugin-appimage-x86_64.AppImage"
  "https://github.com/AppImage/type2-runtime/releases/download/20251108/runtime-x86_64"
)
# Scripts que o bundler grava a partir do próprio binário (embutidos, sem rede).
EMBUTIDOS=(linuxdeploy-plugin-gstreamer.sh linuxdeploy-plugin-gtk.sh)

if [ "${1:-}" = "--check" ]; then
  esperado="$(printf '%s\n' "${NOMES[@]}" "${EMBUTIDOS[@]}" | sort)"
  achado="$(ls -1 "$CACHE" | sort)"
  if [ "$esperado" != "$achado" ]; then
    echo "::error::O cache do bundler ($CACHE) não bate com scripts/linux-tools.sha256: o build procurou ferramenta fora da lista."
    diff <(echo "$esperado") <(echo "$achado") || true
    exit 1
  fi
  echo "Cache do bundler sem arquivo novo:"
  ls -l "$CACHE"
  exit 0
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
for i in "${!NOMES[@]}"; do
  curl -fsSL --retry 3 -o "$TMP/${NOMES[$i]}" "${URLS[$i]}"
done
(cd "$TMP" && sha256sum --check --strict "$SUMS")
mkdir -p "$CACHE"
for n in "${NOMES[@]}"; do
  install -m 755 "$TMP/$n" "$CACHE/$n"
done
ls -l "$CACHE"
