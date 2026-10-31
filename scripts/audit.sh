#!/usr/bin/env bash
# Vulnerabilidade conhecida nas dependências que vão no app (npm de produção e Rust) reprova.
# Aviso de crate sem manutenção não reprova (padrão do cargo audit). Exceção, só com motivo:
# `ignore` em .cargo/audit.toml ou `pnpm.auditConfig.ignoreGhsas`, registrada em docs/decisoes.md.
# Rodam: o job `audit` do ci.yml (aviso, fora do ruleset) e do release.yml (barra a tag).
set -euo pipefail
cd "$(dirname "$0")/.."
pnpm audit --prod
cargo audit --file src-tauri/Cargo.lock
