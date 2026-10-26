#!/usr/bin/env bash
# Aplica no GitHub a configuração de segurança decidida em docs/seguranca-repo.md e relê tudo no fim.
# Idempotente: rodar de novo só regrava o mesmo estado. Rode da raiz, com o gh do Eduardo
# (escopos repo + admin:org):   bash scripts/aplicar-seguranca.sh
# O que não tem API fica de fora e aparece no fim como passo manual (app Claude, 2FA se a API recusar).
set -euo pipefail

ORG=moraliasp
REPO=$ORG/leve
R=repos/$REPO
MAINTAINER=eclbrz
ADMIN_ROLE=5 # RepositoryRole "admin"

passo() { printf '\n== %s\n' "$1"; }

# Cria ou atualiza um ruleset pelo nome (POST na primeira vez, PUT depois).
ruleset() {
  local name=$1 body=$2 id
  id=$(gh api "$R/rulesets" --jq ".[] | select(.name == \"$name\") | .id")
  if [ -n "$id" ]; then
    gh api -X PUT "$R/rulesets/$id" --input - --jq '"atualizado: \(.name) (#\(.id))"' <<<"$body"
  else
    gh api -X POST "$R/rulesets" --input - --jq '"criado: \(.name) (#\(.id))"' <<<"$body"
  fi
}

passo "Tags v*: criação só por admin"
ruleset "tags v* — criação só por admin" '{
  "name": "tags v* — criação só por admin", "target": "tag", "enforcement": "active",
  "conditions": {"ref_name": {"include": ["refs/tags/v*"], "exclude": []}},
  "rules": [{"type": "creation"}],
  "bypass_actors": [{"actor_id": '$ADMIN_ROLE', "actor_type": "RepositoryRole", "bypass_mode": "always"}]
}'

passo "Tags v*: depois de criada, não muda nem some (sem bypass)"
ruleset "tags v* — imutáveis" '{
  "name": "tags v* — imutáveis", "target": "tag", "enforcement": "active",
  "conditions": {"ref_name": {"include": ["refs/tags/v*"], "exclude": []}},
  "rules": [{"type": "update"}, {"type": "deletion"}, {"type": "non_fast_forward"}],
  "bypass_actors": []
}'

passo "main: 1 aprovação (admin passa só via PR), histórico linear, conversas resolvidas, CI atualizado"
ruleset "main" '{
  "name": "main", "target": "branch", "enforcement": "active",
  "conditions": {"ref_name": {"include": ["~DEFAULT_BRANCH"], "exclude": []}},
  "bypass_actors": [{"actor_id": '$ADMIN_ROLE', "actor_type": "RepositoryRole", "bypass_mode": "pull_request"}],
  "rules": [
    {"type": "deletion"}, {"type": "non_fast_forward"}, {"type": "required_linear_history"},
    {"type": "pull_request", "parameters": {
      "required_approving_review_count": 1, "dismiss_stale_reviews_on_push": true,
      "required_reviewers": [], "require_code_owner_review": false, "require_last_push_approval": false,
      "required_review_thread_resolution": true, "allowed_merge_methods": ["squash"]}},
    {"type": "required_status_checks", "parameters": {
      "strict_required_status_checks_policy": true, "do_not_enforce_on_create": false,
      "required_status_checks": [{"context": "check", "integration_id": 15368}]}}
  ]
}'

passo "Environment release: aprovação de $MAINTAINER, só tags v*, sem bypass de admin"
uid=$(gh api "users/$MAINTAINER" --jq .id)
gh api -X PUT "$R/environments/release" --input - --jq '"environment \(.name): bypass de admin = \(.can_admins_bypass)"' <<EOF
{"wait_timer": 0, "prevent_self_review": false, "reviewers": [{"type": "User", "id": $uid}],
 "can_admins_bypass": false,
 "deployment_branch_policy": {"protected_branches": false, "custom_branch_policies": true}}
EOF
if ! gh api "$R/environments/release/deployment-branch-policies" --jq '.branch_policies[] | select(.type == "tag" and .name == "v*") | .id' | grep -q .; then
  gh api -X POST "$R/environments/release/deployment-branch-policies" -f name='v*' -f type=tag --jq '"policy criada: \(.type) \(.name)"'
else
  echo "policy já existe: tag v*"
fi

passo "Releases imutáveis"
gh api -X PUT "$R/immutable-releases" --silent && echo "ligado"

passo "CodeQL default setup: só Actions (JS/TS fica de fora, ver docs/decisoes.md)"
gh api -X PATCH "$R/code-scanning/default-setup" -f state=configured -f 'languages[]=actions' -f query_suite=default --silent
echo "pedido enviado (o GitHub configura em segundo plano)"

passo "Org $ORG: 2FA obrigatório"
gh api -X PATCH "orgs/$ORG" -F two_factor_requirement_enabled=true --silent || true

# ---------- Releitura ----------
passo "Releitura"
echo "-- rulesets"
for id in $(gh api "$R/rulesets" --jq '.[].id'); do
  gh api "$R/rulesets/$id" --jq '"\(.name) [\(.target), \(.enforcement)] bypass=\([.bypass_actors[] | "\(.actor_type):\(.actor_id):\(.bypass_mode)"]) regras=\([.rules[].type])"'
done
gh api "$R/rulesets" --jq '.[] | select(.name == "main") | .id' | while read -r id; do
  gh api "$R/rulesets/$id" --jq '.rules[] | select(.type == "pull_request" or .type == "required_status_checks") | .parameters | "  main: aprovações=\(.required_approving_review_count // "-") conversas=\(.required_review_thread_resolution // "-") ci_atualizado=\(.strict_required_status_checks_policy // "-")"'
done
echo "-- environment release"
gh api "$R/environments/release" --jq '"bypass de admin=\(.can_admins_bypass) regras=\([.protection_rules[].type]) revisores=\([.protection_rules[].reviewers[]?.reviewer.login])"'
gh api "$R/environments/release/deployment-branch-policies" --jq '"policies=\([.branch_policies[] | "\(.type):\(.name)"])"'
echo "-- releases imutáveis"
gh api "$R/immutable-releases" --jq '"ligado=\(.enabled)"'
echo "-- CodeQL"
gh api "$R/code-scanning/default-setup" --jq '"estado=\(.state) linguagens=\(.languages)"'
echo "-- org"
twofa=$(gh api "orgs/$ORG" --jq .two_factor_requirement_enabled)
echo "2FA obrigatório=$twofa"
echo "-- app Claude"
gh api "orgs/$ORG/installations" --jq '.installations[] | select(.app_slug == "claude") | "repositórios=\(.repository_selection)"'

passo "Manual (sem API)"
inst=$(gh api "orgs/$ORG/installations" --jq '.installations[] | select(.app_slug == "claude") | .id')
if [ -n "$inst" ]; then
  echo "- App Claude: https://github.com/organizations/$ORG/settings/installations/$inst"
  echo "  Repository access › Only select repositories › tirar o leve (deixar só os que usam o app) › Save."
fi
if [ "$twofa" != "true" ]; then
  echo "- 2FA: a API não liga. https://github.com/organizations/$ORG/settings/security › Require two-factor authentication › Save."
fi
