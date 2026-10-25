# Segurança do repositório

Configuração de `moraliasp/leve` no GitHub: o que existe, o que deveria existir e o risco de cada diferença.
O que se protege, em ordem: **a chave do atualizador** (`TAURI_SIGNING_PRIVATE_KEY`, environment `release`; quem a tiver publica atualização para todo Leve instalado), a capacidade de **publicar release**, e a **`main`**.

Auditoria de 2026-10-25, lida por `gh api` com a conta `eclbrz` (admin do repositório, owner da org). Status: ✅ ok ou aplicado · ⏳ pronto para aplicar (comando abaixo) · ❓ decisão do Eduardo · 🔒 não lido (falta escopo do token).

## Resumo

- **A chave não vazou.** Nunca esteve no histórico git; nos logs dos 4 runs do `release.yml` (`v0.2.0-rc.1`, `v0.2.0-rc.2`, `v0.2.1-rc.1`, `v0.2.0`) aparece só mascarada (`***`); nenhum alerta de secret scanning. Não precisa rotacionar.
- **O que já segurava:** environment `release` só aceita tag `v*` (branch não chega à chave), `GITHUB_TOKEN` somente leitura, bot sem permissão de aprovar PR, ruleset na `main` sem bypass, actions pinadas por SHA, `pull_request_target`/`workflow_run` ausentes.
- **Buracos que restam até aplicar a seção ⏳:** (1) qualquer conta com escrita cria tag `v*` e dispara o release sem clique de ninguém; (2) o app **Claude** (GitHub App) está instalado em **todos** os repositórios da org com `contents`, `workflows` e `actions` em escrita, ou seja, pode criar essa tag; (3) o release usava cache que a `main` grava (cache poisoning, achado **alto** do zizmor, corrigido no PR).
- **Fora do repositório:** a chave e a senha estão juntas em texto puro em `~/.tauri/` (`leve.key` e `leve.key.password`, modo 600). Qualquer processo com o usuário do Mac, inclusive uma sessão de agente, lê as duas.

## Org `moraliasp`

| Item | Atual | Recomendado | Risco | Status |
|---|---|---|---|---|
| Owners | `eclbrz` (único membro) | 1 ou 2 owners, cada um com passkey | baixo | ✅ |
| 2FA obrigatório | **desligado** | ligado | médio: um membro futuro sem 2FA vira porta de entrada. Hoje o único membro é o Eduardo | ❓ |
| Permissão base dos membros | `read` | `read` ou `none` | baixo | ✅ |
| Membros criam repo público | sim | não (só owner) | baixo enquanto só há o Eduardo | ⏳ (precisa `admin:org`) |
| Times / colaboradores externos | nenhum | — | — | ✅ |
| Apps instalados | **Claude** (`claude`), todos os repositórios; escrita em `contents`, `workflows`, `actions`, `pull_requests`, `issues`, `checks`, `discussions`, `repository_hooks` | só nos repositórios onde é usado; no `leve`, nada ou só leitura | **alto**: cria tag `v*`, mexe em workflow e webhook, abre e mergeia PR (o ruleset aceita 0 aprovação) | ❓ |
| Webhooks da org | não lido | nenhum | — | 🔒 `admin:org_hook` |
| PATs fine-grained com acesso | não lido | nenhum ou só os conhecidos, com expiração | médio | 🔒 `admin:org` |
| Política de Actions da org | não lida | GitHub + allowlist; aprovação de fork para todos | médio | 🔒 `admin:org` |
| Deploy keys | desligadas na org | desligadas | — | ✅ |
| Padrões para repositório novo | Dependabot, secret scanning e push protection **desligados** | ligados | baixo (vale para os próximos) | ⏳ (precisa `admin:org`) |

## Repositório

| Item | Atual | Recomendado | Risco | Status |
|---|---|---|---|---|
| Visibilidade | pública | — (decisão de produto, não muda aqui) | — | — |
| Colaboradores | `eclbrz` (admin); sem convites, sem times | — | — | ✅ |
| Deploy keys / webhooks | nenhum | nenhum | — | ✅ |
| Merge | só squash; auto-delete de branch ligado | idem | — | ✅ |
| "Atualizar branch" no PR | desligado → **ligado** | ligado (necessário com CI "atualizado") | — | ✅ aplicado |
| Wiki, Projects, Discussions | desligados | desligados | — | ✅ |
| Releases imutáveis | desligado | ligado | médio: com token de escrita, dá para trocar o `latest.json` ou um pacote de uma release já publicada (a assinatura minisign barra pacote falso, mas não um downgrade para versão antiga e vulnerável) | ❓ |
| Ruleset `main` | PR, CI `check`, sem force-push nem delete, só squash, **sem bypass** | + histórico linear, + conversas resolvidas, + CI atualizado com a `main` | baixo | ⏳ |
| Aprovação no PR | 0 aprovações | 1 aprovação com bypass do admin só via PR | médio: hoje quem tem escrita (o app Claude) mergeia sozinho | ❓ |
| Commits assinados | não exigido; o Eduardo **não assina** localmente (`commit.gpgsign` vazio, `2ea2dbf` "unsigned"). Os squash merges feitos pelo GitHub saem assinados ("valid") | exigir na `main` | baixo | ❓ |
| Ruleset de tags `v*` | **não existe** | criação só por admin; update e delete bloqueados para todos | **alto**: tag `v*` dispara o release, que usa a chave | ⏳ |

## Actions

| Item | Atual | Recomendado | Risco | Status |
|---|---|---|---|---|
| `GITHUB_TOKEN` padrão | somente leitura | somente leitura | — | ✅ |
| Actions criam/aprovam PR | desligado | desligado | — | ✅ |
| Aprovação de workflow de fork | só primeiro PR (`first_time_contributors`) → **todo contribuidor externo** | todo externo | médio | ✅ aplicado |
| Actions permitidas | todas → **GitHub + allowlist** (`pnpm/action-setup@*`, `azure/login@*`, `ossf/scorecard-action@*`); "verificadas" fora | idem | médio: action nova de terceiro não roda sem entrar na lista | ✅ aplicado |
| Pin por SHA | não exigido → **exigido** | exigido | — | ✅ aplicado |

## Environment `release`

| Item | Atual | Recomendado | Risco | Status |
|---|---|---|---|---|
| Secrets | `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (gravados 2026-10-25 20:54Z); nenhum secret de repositório ou Dependabot | só no environment | — | ✅ |
| Deployment policy | só tag `v*` | só tag `v*` | — | ✅ |
| Quem dispara | quem cria tag `v*` (hoje: qualquer um com escrita, inclusive o app Claude) | só admin (ruleset de tags) | alto | ⏳ |
| Required reviewers | **nenhum** | `eclbrz`, auto-aprovação permitida (é ele quem cria a tag) | **alto**: o release lê a chave sem ninguém olhar | ⏳ |
| Wait timer | 0 | 0 | — | ✅ |
| Admins podem pular | **sim** | não | médio: com sim, um token de admin vazado pula a aprovação | ❓ |

## Segurança (Code security)

| Item | Atual | Recomendado | Risco | Status |
|---|---|---|---|---|
| Secret scanning + push protection | ligados | ligados | — | ✅ |
| Validity checks, padrões genéricos | desligados | ligados | baixo | — a API aceitou e ignorou: exige GitHub Secret Protection (pago) em repositório de org |
| Dependabot alerts e security updates | ligados; 0 alertas abertos | ligados | — | ✅ |
| CodeQL | não configurado | default setup só de **Actions** (pega injeção em workflow); JS/TS fica de fora por decisão (`docs/decisoes.md`, "Repositório público enxuto") | baixo | ⏳ (Actions) / ❓ (JS/TS) |
| Private vulnerability reporting | ligado; `SECURITY.md` aponta para ele | ligado | — | ✅ |
| OpenSSF Scorecard | ausente | `scorecard.yml` com SARIF e publicação (grátis em repositório público) | baixo | PR |

## Workflows

`actionlint` limpo antes e depois. `zizmor` 1.31.1:

| | Alto | Médio | Baixo | Info |
|---|---|---|---|---|
| Antes (`main`) | 2 | 0 | 6 | 3 |
| Depois (PR, persona auditor) | **0** | **0** | 0 | 1 |

| Item | Antes | Depois (PR) |
|---|---|---|
| `pull_request_target`, `workflow_run`, `workflow_dispatch` | ausentes | ausentes |
| `${{ github.event.* }}` em `run:` | ausente; havia `${{ matrix.* }}` e `${{ env.* }}` em `run:` (template injection, nível help) | tudo por `env:`, argumentos em array bash |
| `permissions` | `ci.yml` com `contents: read` no topo; `release.yml` com `{}` no topo e mínimo por job | `{}` no topo dos três; mínimo por job, cada permissão comentada na linha |
| `persist-credentials` | `false` em todo checkout | idem |
| Cache | `release.yml` restaurava cache de pnpm e cargo que a `main` grava (**alto**, cache poisoning) | release sem cache nenhum; CI segue com cache (o de PR fica no escopo do PR) |
| Pin por SHA | todas | todas (agora exigido pelo repositório) |

O info que resta é o job `check` do `ci.yml` sem `name:`: o nome do job é o status exigido pelo ruleset da `main`, e renomear quebra o merge.

## Aplicado e conferido (2026-10-25)

Relido por `gh api` depois de aplicar:

```text
actions/permissions                      {"enabled":true,"allowed_actions":"selected","sha_pinning_required":true}
actions/permissions/selected-actions     {"github_owned_allowed":true,"patterns_allowed":["pnpm/action-setup@*","azure/login@*","ossf/scorecard-action@*"],"verified_allowed":false}
actions/permissions/fork-pr-contributor-approval  {"approval_policy":"all_external_contributors"}
actions/permissions/workflow             {"default_workflow_permissions":"read","can_approve_pull_request_reviews":false}
repo                                     {"allow_update_branch":true}
```

Desfazer: `gh api -X PUT repos/moraliasp/leve/actions/permissions -F enabled=true -f allowed_actions=all -F sha_pinning_required=false` e `gh api -X PUT repos/moraliasp/leve/actions/permissions/fork-pr-contributor-approval -f approval_policy=first_time_contributors`.

## ⏳ Pronto para aplicar

Seguro e reversível, mas a sessão que fez a auditoria não teve permissão para gravar rulesets e environment. Rodar da raiz do repositório (ou autorizar o agente a rodar):

```bash
R=repos/moraliasp/leve
# Tags v*: só admin cria
gh api -X POST $R/rulesets --input - <<'EOF'
{"name":"tags v* — criação só por admin","target":"tag","enforcement":"active",
 "conditions":{"ref_name":{"include":["refs/tags/v*"],"exclude":[]}},
 "rules":[{"type":"creation"}],
 "bypass_actors":[{"actor_id":5,"actor_type":"RepositoryRole","bypass_mode":"always"}]}
EOF
# Tags v*: depois de criada, não muda nem some (sem bypass; para apagar tag de teste, desligar e religar)
gh api -X POST $R/rulesets --input - <<'EOF'
{"name":"tags v* — imutáveis","target":"tag","enforcement":"active",
 "conditions":{"ref_name":{"include":["refs/tags/v*"],"exclude":[]}},
 "rules":[{"type":"update"},{"type":"deletion"},{"type":"non_fast_forward"}],
 "bypass_actors":[]}
EOF
# main: + histórico linear, conversas resolvidas, CI atualizado com a main
gh api -X PUT $R/rulesets/25837657 --input - <<'EOF'
{"name":"main","target":"branch","enforcement":"active",
 "conditions":{"ref_name":{"include":["~DEFAULT_BRANCH"],"exclude":[]}},
 "bypass_actors":[],
 "rules":[{"type":"deletion"},{"type":"non_fast_forward"},{"type":"required_linear_history"},
  {"type":"pull_request","parameters":{"required_approving_review_count":0,"dismiss_stale_reviews_on_push":false,"required_reviewers":[],"require_code_owner_review":false,"require_last_push_approval":false,"required_review_thread_resolution":true,"allowed_merge_methods":["squash"]}},
  {"type":"required_status_checks","parameters":{"strict_required_status_checks_policy":true,"do_not_enforce_on_create":false,"required_status_checks":[{"context":"check","integration_id":15368}]}}]}
EOF
# Environment release: aprovação do Eduardo (bypass de admin fica até ele decidir)
gh api -X PUT $R/environments/release --input - <<'EOF'
{"wait_timer":0,"prevent_self_review":false,"reviewers":[{"type":"User","id":84853851}],"can_admins_bypass":true,
 "deployment_branch_policy":{"protected_branches":false,"custom_branch_policies":true}}
EOF
# CodeQL default setup só para Actions
gh api -X PATCH $R/code-scanning/default-setup -f state=configured -f 'languages[]=actions' -f query_suite=default
```

Conferir depois: `gh api $R/rulesets --jq '.[].name'`, `gh api $R/environments/release --jq '{can_admins_bypass, rules: [.protection_rules[].type]}'` (esperado: `required_reviewers` e `branch_policy`), `gh api $R/code-scanning/default-setup --jq .state`.

Org (precisa de `gh auth refresh -h github.com -s admin:org,admin:org_hook` antes):

```bash
gh api -X PATCH orgs/moraliasp -F members_can_create_public_repositories=false -F dependabot_alerts_enabled_for_new_repositories=true -F secret_scanning_enabled_for_new_repositories=true -F secret_scanning_push_protection_enabled_for_new_repositories=true
gh api orgs/moraliasp/actions/permissions; gh api orgs/moraliasp/hooks; gh api orgs/moraliasp/personal-access-tokens
```

## ❓ Decisões do Eduardo

1. **App Claude no `leve`.** Tirar o `leve` da instalação (Settings da org › GitHub Apps › Claude › Repository access › Only select repositories). Ganho: some a única identidade além do Eduardo com escrita no repositório. Custo: Claude Code na web e `@claude` em issue param de funcionar aqui; sessões locais seguem usando o `gh` do Eduardo.
2. **Bypass de admin no environment `release`** (`can_admins_bypass: false`). Ganho: nem um token de admin vazado pula a aprovação. Custo: se a conta do Eduardo estiver fora (perda de 2FA), não há release até recuperar; sendo o único revisor, ele aprova o próprio run normalmente.
3. **1 aprovação no PR da `main` com bypass do admin só via PR.** Ganho: outra conta com escrita não mergeia sozinha. Custo: o Eduardo marca "merge sem aprovação" em todo PR dele (é o único mantenedor); o bypass também dispensa o CI quando usado.
4. **2FA obrigatório na org.** Hoje sem efeito colateral (o único membro é o Eduardo, com 2FA ligado na conta); vale como trava para quem entrar depois. Membro sem 2FA é removido na hora.
5. **Commits assinados na `main`.** Os merges pelo GitHub já saem assinados, então ligar não muda o fluxo atual; quebra só push direto (já proibido) e merge local. Para assinar também os commits de branch: `git config --global gpg.format ssh`, `git config --global user.signingkey ~/.ssh/id_ed25519.pub`, `git config --global commit.gpgsign true` e cadastrar a mesma chave como *Signing key* em github.com/settings/keys.
6. **Releases imutáveis.** Ganho: release publicada não troca de arquivo nem de tag. Custo: tag de release publicada fica queimada para sempre (rc de teste incluída; usar rascunho para testar o que não precisa ser publicado).
7. **CodeQL de JS/TS.** A decisão registrada é ficar de fora; reabrir só se quiser.

## Para o Eduardo fazer (fora do alcance do agente)

- **Rotacionar a chave:** não precisa; a auditoria não achou exposição. Se um dia precisar (`pnpm tauri signer generate`, nova chave pública no `tauri.conf.json`, release com a chave nova, e quem tem a versão antiga reinstala na mão):

  ```bash
  pnpm tauri signer generate -w ~/.tauri/leve-2.key
  gh secret set TAURI_SIGNING_PRIVATE_KEY --env release --repo moraliasp/leve < ~/.tauri/leve-2.key
  gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD --env release --repo moraliasp/leve
  ```

- **Cofre:** confirmar que `leve.key` e a senha estão no cofre da Moralia, em itens separados. Depois disso, apagar `~/.tauri/leve.key.password` (e, se quiser, `leve.key`): hoje os dois ficam lado a lado no disco, então a senha não protege nada contra quem lê a pasta.
- **Conta GitHub:** conferir em github.com/settings/security que há passkey ou chave de segurança, além do TOTP, e códigos de recuperação guardados no cofre.
- **Token do `gh`:** o desta máquina tem `repo`, `workflow` e `gist` sem expiração. Para a rotina basta isso; dar `admin:org` só na hora de aplicar a parte da org e revogar depois (`gh auth refresh -h github.com -r admin:org,admin:org_hook`).
