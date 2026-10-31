#!/usr/bin/env bash
# Comprime em LZMA (ULMO, macOS 10.15+) os .dmg que o Tauri gera em UDZO; o bundler não deixa escolher
# o formato. `hdiutil convert` só troca a compressão, então o volume, com fundo e posição dos ícones,
# fica igual. A assinatura do .dmg não sobrevive: com APPLE_SIGNING_IDENTITY definida, assina de novo
# com APPLE_CERTIFICATE (base64 do .p12) numa keychain temporária, porque a do Tauri termina com o
# build. Roda antes de notarizar (release.yml). Ver docs/decisoes.md.
#   scripts/dmg-lzma.sh <arquivo.dmg>...
set -euo pipefail

if [ "$#" -eq 0 ]; then
  echo "uso: scripts/dmg-lzma.sh <arquivo.dmg>..." >&2
  exit 2
fi

IDENTITY="${APPLE_SIGNING_IDENTITY:-}"
WORK=""
KEYCHAIN=""
LISTED=()

cleanup() {
  if [ -n "$KEYCHAIN" ]; then
    if [ "${#LISTED[@]}" -gt 0 ]; then security list-keychains -d user -s "${LISTED[@]}"; fi
    security delete-keychain "$KEYCHAIN" || true
  fi
  if [ -n "$WORK" ]; then rm -rf "$WORK"; fi
}
trap cleanup EXIT

if [ -n "$IDENTITY" ]; then
  : "${APPLE_CERTIFICATE:?falta APPLE_CERTIFICATE para assinar o .dmg}"
  : "${APPLE_CERTIFICATE_PASSWORD:?falta APPLE_CERTIFICATE_PASSWORD para assinar o .dmg}"
  WORK="$(mktemp -d)"
  KEYCHAIN="$WORK/dmg.keychain-db"
  PASSWORD="$(uuidgen)"
  (umask 077 && printf '%s' "$APPLE_CERTIFICATE" | base64 --decode > "$WORK/cert.p12")
  while IFS= read -r LINE; do LISTED+=("$LINE"); done < <(security list-keychains -d user | sed -e 's/^ *"//' -e 's/"$//')
  security create-keychain -p "$PASSWORD" "$KEYCHAIN"
  security set-keychain-settings -t 3600 -u "$KEYCHAIN"
  security unlock-keychain -p "$PASSWORD" "$KEYCHAIN"
  security import "$WORK/cert.p12" -k "$KEYCHAIN" -P "$APPLE_CERTIFICATE_PASSWORD" -T /usr/bin/codesign
  rm -f "$WORK/cert.p12"
  security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$PASSWORD" "$KEYCHAIN" > /dev/null
  security list-keychains -d user -s "$KEYCHAIN" "${LISTED[@]}"
fi

for DMG in "$@"; do
  OUT="${DMG%.dmg}.ulmo.dmg"
  hdiutil convert "$DMG" -format ULMO -ov -quiet -o "$OUT"
  hdiutil verify -quiet "$OUT"
  FORMAT="$(hdiutil imageinfo -format "$OUT")"
  if [ "$FORMAT" != "ULMO" ]; then
    echo "$DMG: formato $FORMAT depois de converter, esperado ULMO" >&2
    exit 1
  fi
  mv -f "$OUT" "$DMG"
  if [ -n "$IDENTITY" ]; then
    codesign --force --sign "$IDENTITY" --keychain "$KEYCHAIN" --timestamp "$DMG"
    codesign --verify --verbose "$DMG"
  fi
  ls -l "$DMG"
done
