#!/usr/bin/env bash
# Build do Flatpak do job `flatpak` do ci.yml e do release.yml (o mesmo caminho nos dois):
#   scripts/flatpak-build.sh <saída.flatpak>
# 1. Confere que o metainfo traz a versão do app como a release mais recente (`<releases>`).
# 2. Instala flatpak, o remote do Flathub e o org.flatpak.Builder (flatpak-builder e lint do Flathub).
# 3. Gera as fontes do Cargo e do pnpm dos lockfiles (scripts/flatpak-sources.sh).
# 4. Lint do manifesto, build sem rede (o manifesto não pede --share=network no build), lint do
#    repositório e bundle em <saída.flatpak>.
# Precisa de sudo sem senha (runner do GitHub, Ubuntu 24.04). Por quê: docs/decisoes.md,
# "Flatpak a partir do fonte".
set -euo pipefail

OUT="${1:?uso: scripts/flatpak-build.sh <saída.flatpak>}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_ID=br.com.moralia.leve
MANIFEST="packaging/flatpak/$APP_ID.yml"
cd "$ROOT"

node scripts/metainfo.mjs

sudo apt-get update
sudo apt-get install -y --no-install-recommends flatpak dbus
# O AppArmor do Ubuntu 24.04 barra o namespace de usuário sem privilégio que o bwrap usa.
sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0
flatpak remote-add --user --if-not-exists flathub https://dl.flathub.org/repo/flathub.flatpakrepo
flatpak install --user -y --noninteractive flathub org.flatpak.Builder
flatpak info --user org.flatpak.Builder

scripts/flatpak-sources.sh

flatpak run --command=flatpak-builder-lint org.flatpak.Builder manifest "$MANIFEST"
# O builder instala SDK e extensões pelo `flatpak` do host, que pede uma sessão D-Bus. Sem
# `--sandbox`, que recusa a fonte `../..` (o checkout) fora da pasta do manifesto.
dbus-run-session -- flatpak run org.flatpak.Builder --user --force-clean --install-deps-from=flathub \
  --compose-url-policy=full --mirror-screenshots-url=https://dl.flathub.org/media/ --repo=flatpak-repo \
  flatpak-build "$MANIFEST"
flatpak run --command=flatpak-builder-lint org.flatpak.Builder repo flatpak-repo

mkdir -p "$(dirname "$OUT")"
flatpak build-bundle --runtime-repo=https://dl.flathub.org/repo/flathub.flatpakrepo flatpak-repo "$OUT" "$APP_ID"
ls -l "$OUT"
