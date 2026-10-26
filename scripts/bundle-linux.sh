#!/usr/bin/env bash
# Build Linux do release.yml e do job bundle-linux do ci.yml (o mesmo caminho nos dois):
#   scripts/bundle-linux.sh <args do `tauri bundle`>   ex.: --bundles deb,appimage --config '{...}'
# 1. Compila com rede (crates do Cargo.lock), sem empacotar.
# 2. Empacota num namespace de rede vazio (`unshare --net`): o bundler não alcança a internet, então
#    só usa as ferramentas que scripts/linux-tools.sh pré-carregou e conferiu por hash. Se ele
#    precisasse baixar algo, o empacotamento falharia aqui em vez de baixar em silêncio.
# 3. Confere que o cache do bundler continua só com os arquivos conhecidos.
# Precisa de sudo sem senha (runner do GitHub); a chave do atualizador, se houver, passa por `-E`.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"

pnpm tauri build --no-bundle

echo "Empacotando sem rede:"
sudo -E unshare --net -- sudo -E -u "$(id -un)" \
  env "PATH=$PATH" "HOME=$HOME" CARGO_NET_OFFLINE=true \
  bash -c 'if curl -fsS --max-time 5 -o /dev/null https://github.com; then echo "::error::o namespace sem rede alcançou github.com"; exit 1; fi; exec pnpm tauri bundle "$@"' bundle "$@"

"$HERE/linux-tools.sh" --check
