# Segurança do repositório

Configuração de `moraliasp/leve` no GitHub: o que existe, o que deveria existir e o risco de cada diferença.
O que se protege, em ordem: **a chave do atualizador** (`TAURI_SIGNING_PRIVATE_KEY`, environment `release`; quem a tiver publica atualização para todo Leve instalado), a capacidade de **publicar release**, e a **`main`**.

Auditoria de 2026-10-25, lida por `gh api` com a conta `eclbrz` (admin do repositório, owner da org); a parte da org relida no mesmo dia com `admin:org` e `admin:org_hook`. Status: ✅ ok ou aplicado (conferido por API) · ⏳ recomendado, ainda não aplicado · ✋ decidido, falta o passo manual na tela · ⏸ decidido não aplicar agora · 👁 conferir na tela (a API não mostra).

## Resumo

- **A chave não vazou.** Nunca esteve no histórico git; nos logs dos 4 runs do `release.yml` (`v0.2.0-rc.1`, `v0.2.0-rc.2`, `v0.2.1-rc.1`, `v0.2.0`) aparece só mascarada (`***`); nenhum alerta de secret scanning. Não precisa rotacionar.
- **O que já segurava:** environment `release` só aceita tag `v*` (branch não chega à chave), `GITHUB_TOKEN` somente leitura, bot sem permissão de aprovar PR, ruleset na `main` sem bypass, actions pinadas por SHA, `pull_request_target`/`workflow_run` ausentes.
- **Estado final (2026-10-25, depois de `scripts/aplicar-seguranca.sh`):** nenhum release usa a chave sem aprovação da conta `eclbrz` (environment `release` com revisor, sem bypass de admin, só tag `v*`). A aprovação só é um clique humano enquanto o token dessa conta não estiver ao alcance de outro processo: com o `gh` da máquina, um agente cria a tag e aprova o deployment pela API, por isso o `admin:org` sai do token depois de usado e sessões de agente não rodam com permissão de gravar configuração; só admin cria tag `v*`, e tag `v*` não muda nem some; a `main` exige 1 aprovação (admin passa só via PR); releases imutáveis. O cache poisoning do release (achado **alto** do zizmor) sai com este PR.
- **Falta (✋, manual na tela):** tirar o app **Claude** do `leve` (ainda instalado em todos os repositórios com escrita) e ligar o 2FA obrigatório da org (a API não liga).
- **Fora do repositório:** a chave e a senha estão juntas em texto puro em `~/.tauri/` (`leve.key` e `leve.key.password`, modo 600). Qualquer processo com o usuário do Mac, inclusive uma sessão de agente, lê as duas.

## Org `moraliasp`

Plano Free. Repositórios: `leve` (público) e `mfo` (privado). O que vale para a org vale para os dois.

| Item | Atual | Recomendado | Risco | Status |
|---|---|---|---|---|
| Owners | `eclbrz`, único membro (`role: admin`); sem convites pendentes, sem security managers, sem bloqueios | 1 ou 2 owners, cada um com passkey | baixo | ✅ |
| 2FA obrigatório | **desligado** (a conta `eclbrz` tem 2FA); a API aceitou o pedido e não mudou | ligado | médio: um membro futuro sem 2FA vira porta de entrada | ✋ |
| Permissão base dos membros | `read` | `read` ou `none` | baixo | ✅ |
| Membros criam repo | público, privado e Pages (público e privado) | só owner | baixo enquanto só há o Eduardo | ⏳ |
| Membros apagam repo, mudam visibilidade, convidam colaborador externo, criam time | sim (padrão do GitHub) | não | baixo enquanto só há o Eduardo; vira médio com o segundo membro | ⏳ |
| Times / colaboradores externos | nenhum | — | — | ✅ |
| Apps instalados | só o **Claude** (`claude`, app 1236702), instalado em **todos** os repositórios (`leve` e `mfo`), ativo; escrita em `contents`, `workflows`, `actions`, `pull_requests`, `issues`, `checks`, `discussions`, `repository_hooks`; leitura em `administration`, `members` | só nos repositórios onde é usado; fora do `leve` | **alto**: cria tag `v*`, mexe em workflow e webhook, abre e mergeia PR (o ruleset aceita 0 aprovação) | ✋ |
| Webhooks da org | nenhum | nenhum | — | ✅ |
| Secrets e variáveis da org (Actions, Dependabot) | nenhum | nenhum (a chave fica só no environment) | — | ✅ |
| Runners próprios | nenhum; grupo padrão não aceita repositório público | só hospedados pelo GitHub | — | ✅ |
| PATs fine-grained com acesso | a API só responde para GitHub App (`404` com token de usuário) | nenhum ou só os conhecidos, com expiração | médio | 👁 Settings da org › Personal access tokens › Active tokens |
| Actions da org: quais rodam | **todas**, sem pin por SHA exigido | GitHub + allowlist, pin exigido (o `leve` já está assim; o repositório só pode apertar o que a org permite) | médio: vale para o `mfo` e todo repositório novo | ⏳ |
| Actions da org: `GITHUB_TOKEN` | somente leitura; não aprova PR | idem | — | ✅ |
| Actions da org: fork em repo público | aprovação só no primeiro PR (`first_time_contributors`) | todo contribuidor externo (o `leve` já está assim) | médio | ⏳ |
| Actions da org: fork em repo privado | não roda; sem token de escrita nem secrets | idem | — | ✅ |
| Rulesets da org | indisponível no Free ("Upgrade to GitHub Team") | rulesets por repositório | — | — |
| Deploy keys | desligadas na org | desligadas | — | ✅ |
| Padrões para repositório novo | Dependabot, grafo de dependências, secret scanning, push protection e validity checks **desligados**; a configuração "GitHub recommended" existe mas não é aplicada a nada | ligados | baixo (vale para os próximos) | ⏳ |

## Repositório

| Item | Atual | Recomendado | Risco | Status |
|---|---|---|---|---|
| Visibilidade | pública | — (decisão de produto, não muda aqui) | — | — |
| Colaboradores | `eclbrz` (admin); sem convites, sem times | — | — | ✅ |
| Deploy keys / webhooks | nenhum | nenhum | — | ✅ |
| Merge | só squash; auto-delete de branch ligado | idem | — | ✅ |
| "Atualizar branch" no PR | desligado → **ligado** | ligado (necessário com CI "atualizado") | — | ✅ aplicado |
| Wiki, Projects, Discussions | desligados | desligados | — | ✅ |
| Releases imutáveis | **ligado** | ligado | médio: com token de escrita, dá para trocar o `latest.json` ou um pacote de uma release já publicada (a assinatura minisign barra pacote falso, mas não um downgrade para versão antiga e vulnerável) | ✅ |
| Ruleset `main` (#25837657) | PR, CI `check` **atualizado com a `main`**, sem force-push nem delete, só squash, **histórico linear**, **conversas resolvidas** | idem | — | ✅ |
| Aprovação no PR | **1 aprovação**, descartada em push novo; admin passa só via PR (`RepositoryRole:5:pull_request`) | idem | — | ✅ |
| Commits assinados | não exigido; o Eduardo **não assina** localmente (`commit.gpgsign` vazio, `2ea2dbf` "unsigned"). Os squash merges feitos pelo GitHub saem assinados ("valid") | exigir na `main` | baixo | ⏸ |
| Rulesets de tags `v*` | "criação só por admin" (#25841546, bypass admin) e "imutáveis" (#25841549: update, deletion, non_fast_forward; sem bypass) | idem | — | ✅ |

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
| Quem dispara | quem cria tag `v*`: só admin (ruleset de tags) | idem | — | ✅ |
| Required reviewers | `eclbrz`, auto-aprovação permitida (é ele quem cria a tag) | idem | — | ✅ |
| Wait timer | 0 | 0 | — | ✅ |
| Admins podem pular | **não** | não | — | ✅ |

## Segurança (Code security)

| Item | Atual | Recomendado | Risco | Status |
|---|---|---|---|---|
| Secret scanning + push protection | ligados | ligados | — | ✅ |
| Validity checks, padrões genéricos | desligados | ligados | baixo | — a API aceitou e ignorou: exige GitHub Secret Protection (pago) em repositório de org |
| Dependabot alerts e security updates | ligados; 0 alertas abertos | ligados | — | ✅ |
| CodeQL | default setup de **Actions** ligado (`languages: ["actions"]`); 1ª análise da `main` em 2026-10-25, 0 alertas. JS/TS fora por decisão (`docs/decisoes.md`, "Repositório público enxuto") | idem | — | ✅ |
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
| `pull_request_target`, `workflow_run`, `workflow_dispatch` | ausentes | ausentes; depois, `workflow_dispatch` no `ci.yml` para o job `bundle-linux` (só quem tem escrita dispara; sem environment nem segredo, chave do atualizador descartável) |
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

## ⏳ Aplicar

Tudo o que foi decidido e tem API está em [`scripts/aplicar-seguranca.sh`](../scripts/aplicar-seguranca.sh). O script é idempotente, imprime cada passo e relê tudo no fim. O agente não grava configuração; quem roda é o Eduardo, da raiz do repositório, com o `gh` dele (escopos `repo` e `admin:org`):

```bash
bash scripts/aplicar-seguranca.sh
```

O que o script faz:

1. Ruleset "tags v* — criação só por admin": criar tag `v*` só com papel admin.
2. Ruleset "tags v* — imutáveis": tag `v*` não muda, não é apagada, sem bypass. Para apagar uma tag de teste: desligar o ruleset, apagar, religar.
3. Ruleset `main`: 1 aprovação (some depois de push novo), o admin passa só pelo botão de merge do PR (`bypass_mode: pull_request`), histórico linear, conversas resolvidas, CI `check` atualizado com a `main`, só squash, sem force-push nem delete.
4. Environment `release`: revisor `eclbrz` (pode aprovar o próprio run), só tags `v*`, **sem bypass de admin**.
5. Releases imutáveis.
6. CodeQL default setup só de Actions. A resposta logo depois do pedido mostra `languages: []`; as linguagens aparecem quando o run "CodeQL Setup" termina (cerca de 1 min).
7. 2FA obrigatório na org. Se a API não aceitar, o fim do script imprime o link da tela.

Desfazer, se algo travar: rulesets em `https://github.com/moraliasp/leve/settings/rules` (desligar o ruleset é imediato); environment em `https://github.com/moraliasp/leve/settings/environments`; releases imutáveis com `gh api -X DELETE repos/moraliasp/leve/immutable-releases` (as releases publicadas enquanto ligado continuam imutáveis).

### ✋ Manual

- **App Claude fora do `leve`:** https://github.com/organizations/moraliasp/settings/installations/129415688 › *Repository access* › *Only select repositories* › deixar só os repositórios que usam o app (o `mfo`, se usar) › *Save*. Não desinstalar da org. As sessões locais seguem pelo `gh` do Eduardo.
- **2FA na org**, só se o script disser que a API não ligou: https://github.com/organizations/moraliasp/settings/security › *Require two-factor authentication* › *Save*.

### ⏳ Org: política de Actions e permissões de membro

Recomendado, fora do script porque vale também para o `mfo`: antes de rodar a segunda linha, conferir que os workflows dele usam só actions do GitHub ou da allowlist, pinadas por SHA.

```bash
gh api -X PATCH orgs/moraliasp -F members_can_create_public_repositories=false -F members_can_create_public_pages=false -F members_can_delete_repositories=false -F members_can_change_repo_visibility=false -F members_can_invite_outside_collaborators=false -F dependabot_alerts_enabled_for_new_repositories=true -F dependency_graph_enabled_for_new_repositories=true -F secret_scanning_enabled_for_new_repositories=true -F secret_scanning_push_protection_enabled_for_new_repositories=true
gh api -X PUT orgs/moraliasp/actions/permissions --input - <<<'{"enabled_repositories":"all","allowed_actions":"selected","sha_pinning_required":true}'
gh api -X PUT orgs/moraliasp/actions/permissions/selected-actions --input - <<<'{"github_owned_allowed":true,"verified_allowed":false,"patterns_allowed":["pnpm/action-setup@*","azure/login@*","ossf/scorecard-action@*"]}'
gh api -X PUT orgs/moraliasp/actions/permissions/fork-pr-contributor-approval -f approval_policy=all_external_contributors
```

Conferir depois: `gh api orgs/moraliasp --jq '{members_can_create_public_repositories, secret_scanning_enabled_for_new_repositories}'`, `gh api orgs/moraliasp/actions/permissions`. Desfazer as Actions da org: `gh api -X PUT orgs/moraliasp/actions/permissions -f enabled_repositories=all -f allowed_actions=all -F sha_pinning_required=false`.

## Decisões (Eduardo, 2026-10-25: "sigo suas recomendações")

1. **App Claude:** sai do `leve`; a instalação fica restrita aos repositórios que usam o app, sem desinstalar da org. ✋
2. **Bypass de admin no environment `release`:** desligado. Nem token de admin vazado pula a aprovação; se a conta do Eduardo estiver fora, não há release até recuperar. ✅
3. **`main`:** 1 aprovação, admin passa só via PR. Outra conta com escrita não mergeia sozinha; o Eduardo marca o bypass no merge dos PRs dele (o bypass também dispensa o CI naquele merge, então só usar com o `check` verde). ✅
4. **2FA obrigatório na org.** ✋ (a API não liga)
5. **Commits assinados:** não exigir agora. ⏸ Os merges pelo GitHub já saem assinados. Para assinar também os commits de branch: `git config --global gpg.format ssh`, `git config --global user.signingkey ~/.ssh/id_ed25519.pub`, `git config --global commit.gpgsign true` e cadastrar a mesma chave como *Signing key* em github.com/settings/keys. Depois, se quiser exigir, acrescentar `{"type":"required_signatures"}` às regras do ruleset `main` no script.
6. **Releases imutáveis:** ligar. Release publicada não troca de arquivo nem de tag, e a tag fica queimada; para testar, usar release em rascunho (o `release.yml` já cria rascunho). ✅
7. **CodeQL:** só Actions. JS/TS segue fora (`docs/decisoes.md`, "Repositório público enxuto"). ✅ / ⏸

## Para o Eduardo fazer (fora do alcance do agente)

- **Rotacionar a chave:** não precisa; a auditoria não achou exposição. Se um dia precisar (`pnpm tauri signer generate`, nova chave pública no `tauri.conf.json`, release com a chave nova, e quem tem a versão antiga reinstala na mão):

  ```bash
  pnpm tauri signer generate -w ~/.tauri/leve-2.key
  gh secret set TAURI_SIGNING_PRIVATE_KEY --env release --repo moraliasp/leve < ~/.tauri/leve-2.key
  gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD --env release --repo moraliasp/leve
  ```

- **Cofre:** confirmar que `leve.key` e a senha estão no cofre da Moralia, em itens separados. Depois disso, apagar `~/.tauri/leve.key.password` (e, se quiser, `leve.key`): hoje os dois ficam lado a lado no disco, então a senha não protege nada contra quem lê a pasta.
- **Conta GitHub:** conferir em github.com/settings/security que há passkey ou chave de segurança, além do TOTP, e códigos de recuperação guardados no cofre.
- **PATs:** abrir Settings da org › Personal access tokens › Active tokens e revogar o que não reconhecer; a API não lista isso para token de usuário.
- **Token do `gh`:** o desta máquina tem `repo`, `workflow`, `gist` e, desde a auditoria da org, `admin:org` e `admin:org_hook`, sem expiração. Para a rotina bastam os três primeiros: depois de aplicar a parte da org, tirar os dois de admin com `gh auth refresh -h github.com -r admin:org,admin:org_hook`.
