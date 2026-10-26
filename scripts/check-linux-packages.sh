#!/usr/bin/env bash
# Confere os pacotes Linux antes de publicar (release.yml) e no job bundle-linux (ci.yml):
#   scripts/check-linux-packages.sh <pasta com o .deb e o .AppImage>
# Falha se: faltar pacote ou assinatura; o .desktop (do .deb e do AppImage) não tiver `%F`/`%U`
# no Exec (sem isso, abrir um .md pelo gerenciador de arquivos abre o Leve vazio) ou não tiver
# `MimeType=text/markdown`; o binário pedir glibc acima de GLIBC_MAX (o piso declarado nos docs).
set -euo pipefail

DIR="${1:?uso: scripts/check-linux-packages.sh <pasta>}"
GLIBC_MAX="2.35"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

shopt -s nullglob
debs=("$DIR"/*_amd64.deb)
appimages=("$DIR"/*_amd64.AppImage)
[ "${#debs[@]}" -eq 1 ] || { echo "::error::esperado um .deb em $DIR, achei ${#debs[@]}"; exit 1; }
[ "${#appimages[@]}" -eq 1 ] || { echo "::error::esperado um .AppImage em $DIR, achei ${#appimages[@]}"; exit 1; }
DEB="$(realpath "${debs[0]}")"
APPIMAGE="$(realpath "${appimages[0]}")"
for f in "$DEB" "$APPIMAGE"; do
  [ -s "$f.sig" ] || { echo "::error::falta a assinatura $f.sig"; exit 1; }
done

confere_desktop() { # $1 = arquivo .desktop, $2 = de onde veio
  echo "--- .desktop do $2"
  cat "$1"
  grep -Eq '^Exec=[^ ]+ %[FU]$' "$1" || { echo "::error::Exec do .desktop do $2 sem %F/%U"; exit 1; }
  grep -qx 'MimeType=text/markdown' "$1" || { echo "::error::.desktop do $2 sem MimeType=text/markdown"; exit 1; }
}

dpkg-deb --info "$DEB"
dpkg-deb -x "$DEB" "$TMP/deb"
confere_desktop "$TMP/deb/usr/share/applications/Leve.desktop" ".deb"

# O Leve.desktop da raiz do AppImage é link para este.
(cd "$TMP" && "$APPIMAGE" --appimage-extract usr/share/applications/Leve.desktop >/dev/null)
confere_desktop "$TMP/squashfs-root/usr/share/applications/Leve.desktop" "AppImage"

# Maior versão de glibc que o binário pede (as bibliotecas do AppImage vêm do runner, que é o teto).
maior="$(objdump -T "$TMP/deb/usr/bin/leve" | grep -o 'GLIBC_[0-9.]*' | sed 's/GLIBC_//' | sort -uV | tail -1)"
echo "--- glibc: o binário pede até $maior; piso declarado $GLIBC_MAX"
if [ "$(printf '%s\n%s\n' "$maior" "$GLIBC_MAX" | sort -V | tail -1)" != "$GLIBC_MAX" ]; then
  echo "::error::o binário pede GLIBC_$maior, acima do piso declarado ($GLIBC_MAX)"
  exit 1
fi
echo "Pacotes Linux conferidos."
