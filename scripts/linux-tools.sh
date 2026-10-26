#!/usr/bin/env bash
# Pré-carrega, conferidas por hash, as ferramentas que o bundler do Tauri usa para montar o
# AppImage, no cache onde ele as procura. Com elas no lugar, o empacotamento não baixa nada.
#   scripts/linux-tools.sh           baixa, confere contra scripts/linux-tools.sha256 e instala
#   scripts/linux-tools.sh --check   depois do build: o cache tem só esses arquivos, com os mesmos hashes
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

# A lista de nomes e o arquivo de hashes andam juntos: nome sem hash, ou hash sem nome, é erro.
nomes_sums="$(awk '{print $2}' "$SUMS" | sort)"
if [ "$nomes_sums" != "$(printf '%s\n' "${NOMES[@]}" | sort)" ]; then
  echo "::error::scripts/linux-tools.sh (NOMES) e scripts/linux-tools.sha256 não listam os mesmos arquivos."
  diff <(printf '%s\n' "${NOMES[@]}" | sort) <(echo "$nomes_sums") || true
  exit 1
fi
if [ "$(wc -l <"$SUMS")" -ne "${#NOMES[@]}" ]; then
  echo "::error::scripts/linux-tools.sha256 tem linha repetida ou em branco."
  exit 1
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

if [ "${1:-}" = "--check" ]; then
  # 1. Nenhum arquivo novo no cache (ferramenta procurada fora da lista).
  esperado="$(printf '%s\n' "${NOMES[@]}" "${EMBUTIDOS[@]}" | sort)"
  achado="$(ls -1 "$CACHE" | sort)"
  if [ "$esperado" != "$achado" ]; then
    echo "::error::O cache do bundler ($CACHE) não bate com scripts/linux-tools.sha256: o build procurou ferramenta fora da lista."
    diff <(echo "$esperado") <(echo "$achado") || true
    exit 1
  fi
  # 2. Os arquivos usados no empacotamento ainda são os conferidos (nenhum trocado no mesmo nome).
  # O bundler zera os 3 bytes da assinatura AppImage ("AI\x02", offset 8) do linuxdeploy depois
  # de usá-lo (`dd ... seek=8` em `prepare_tools`, para integradores de AppImage não o
  # registrarem); a cópia conferida aqui recebe esses bytes de volta e só eles.
  for n in "${NOMES[@]}"; do
    cp "$CACHE/$n" "$TMP/$n"
  done
  for f in "$TMP"/linuxdeploy-*-x86_64.AppImage; do
    if [ "$(od -An -tx1 -j8 -N3 "$f" | tr -d ' \n')" = "000000" ]; then
      printf 'AI\002' | dd of="$f" bs=1 seek=8 count=3 conv=notrunc status=none
    fi
  done
  (cd "$TMP" && sha256sum --check --strict "$SUMS")
  echo "Cache do bundler sem arquivo novo e com os mesmos hashes:"
  ls -l "$CACHE"
  exit 0
fi

for i in "${!NOMES[@]}"; do
  curl -fsSL --retry 3 -o "$TMP/${NOMES[$i]}" "${URLS[$i]}"
done
(cd "$TMP" && sha256sum --check --strict "$SUMS")
mkdir -p "$CACHE"
for n in "${NOMES[@]}"; do
  install -m 755 "$TMP/$n" "$CACHE/$n"
done
ls -l "$CACHE"
