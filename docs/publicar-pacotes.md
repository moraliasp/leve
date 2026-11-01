# Publicar no Homebrew, no winget e no Flathub

Passo a passo do dono para levar uma release estável do Leve ao tap `moraliasp/homebrew-tap` (macOS), ao `microsoft/winget-pkgs` (Windows) e ao Flathub (Linux, seção 4). Por que assim: "Homebrew (tap próprio) e winget antes da assinatura" em [`decisoes.md`](decisoes.md). Nada aqui roda sozinho: cada passo publica algo fora deste repositório e é feito à mão.

Os arquivos de uma versão saem de `scripts/packaging.mjs` a partir do `SHA256SUMS.txt` da release:

- `packaging/winget/<versão>/Moralia.Leve*.yaml`: manifesto multi-arquivo (versão, instalador NSIS, en-US, pt-BR), schema 1.12.0.
- `packaging/homebrew/Casks/leve.rb`: cask com um dmg por arquitetura (`on_arm`/`on_intel`). Release até a 0.5.0 (e o 0.6.0-rc.1) sai com o dmg universal: o gerador segue o `SHA256SUMS.txt`.

Os de 0.2.0 já estão neste repositório.

## 1. Gerar os arquivos de uma versão nova

Depois que a release `vX.Y.Z` saiu do rascunho (publicada, não pre-release):

As duas rotas abaixo terminam no mesmo lugar, `/tmp/leve-out/packaging/` (com `winget/X.Y.Z/` e `homebrew/Casks/leve.rb`), e os passos seguintes usam esses caminhos.

**Pelo workflow.** `gh workflow run` não devolve o id do run, e `gh run list --limit 1` logo depois pode pegar outro run (o novo leva alguns segundos para aparecer). Por isso: anotar a hora antes de disparar e esperar o primeiro run `workflow_dispatch` do `packaging.yml`, seu, criado depois dela.

```bash
V=X.Y.Z
DESDE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
gh workflow run packaging.yml --repo moraliasp/leve -f version="$V"
EU="$(gh api user --jq .login)"
RUN=""
for _ in $(seq 20); do
  RUN="$(gh run list --repo moraliasp/leve --workflow packaging.yml --event workflow_dispatch --user "$EU" \
    --json databaseId,createdAt --jq "[.[] | select(.createdAt >= \"$DESDE\")] | last | .databaseId // empty")"
  [ -n "$RUN" ] && break
  sleep 3
done
[ -n "$RUN" ] || echo "run não apareceu em 60 s: confira em Actions antes de seguir"
gh run watch --repo moraliasp/leve "$RUN" --exit-status
rm -rf /tmp/leve-out && gh run download "$RUN" --repo moraliasp/leve --name "packaging-$V" --dir /tmp/leve-out/packaging
```

Disparar duas versões ao mesmo tempo atrapalha a escolha (o filtro pega o primeiro depois de `DESDE`): uma de cada vez.

O workflow confere a attestation do `SHA256SUMS.txt` (só aceita o que saiu do `release.yml`) e recusa rascunho e pre-release.

**Localmente**, sem o workflow (o 4º argumento é a pasta de saída; o script grava em `<pasta>/packaging/`):

```bash
V=X.Y.Z
rm -rf /tmp/leve-sums /tmp/leve-out
gh release download "v$V" --repo moraliasp/leve --pattern SHA256SUMS.txt --dir /tmp/leve-sums
gh attestation verify /tmp/leve-sums/SHA256SUMS.txt --repo moraliasp/leve --signer-workflow moraliasp/leve/.github/workflows/release.yml
DATA="$(gh release view "v$V" --repo moraliasp/leve --json publishedAt --jq '.publishedAt[0:10]')"
node scripts/packaging.mjs /tmp/leve-sums/SHA256SUMS.txt "$V" "$DATA" /tmp/leve-out
```

Para guardar o registro aqui, copie `/tmp/leve-out/packaging/winget/X.Y.Z/` e `/tmp/leve-out/packaging/homebrew/Casks/leve.rb` para `packaging/` e abra um PR no `leve`. Ao atualizar o `leve.rb` daqui, troque também o `SUMS` em `tests/packaging.test.ts` pelo `SHA256SUMS.txt` da versão nova e acrescente os manifestos dela ao teste: ele compara o que está versionado com o gerador.

## 2. Homebrew: tap próprio

### Uma vez: criar o tap

O nome `homebrew-tap` faz o `brew` achar o tap como `moraliasp/tap`.

```bash
gh repo create moraliasp/homebrew-tap --public --description "Homebrew tap da Moralia (Leve)"
git clone https://github.com/moraliasp/homebrew-tap.git /tmp/homebrew-tap
mkdir -p /tmp/homebrew-tap/Casks
cp packaging/homebrew/Casks/leve.rb /tmp/homebrew-tap/Casks/leve.rb
cd /tmp/homebrew-tap
printf '# Moralia Homebrew tap\n\n```bash\nbrew install --cask moraliasp/tap/leve\n```\n' > README.md
git add README.md Casks/leve.rb
git commit -m "leve 0.2.0"
git push origin main
```

O tap é protegido como a `main` do Leve (ruleset `main` desde 2026-10-31: sem force-push nem delete, histórico linear, PR obrigatório com squash), porque o cask é código Ruby que roda na máquina de quem instala. Push direto na `main` é recusado até para admin; o admin só pula a aprovação no PR. Ver [`seguranca-repo.md`](seguranca-repo.md).

### Conferir antes de anunciar

```bash
brew tap moraliasp/tap
brew trust --cask moraliasp/tap/leve
brew style moraliasp/tap/leve
brew audit --cask --strict --online moraliasp/tap/leve
brew install --cask moraliasp/tap/leve
brew uninstall --cask leve
```

O `brew install` usa `/Applications` e fica com um Leve que já esteja lá, e o `brew uninstall` apaga esse app, mesmo que ele não tenha vindo do `brew`.

`brew audit --cask --new` reprova (app não passa no Gatekeeper, repositório pouco notável): é a régua do `homebrew/cask` oficial, não a do tap, e é o motivo de o tap existir.

### A cada versão

```bash
cp /tmp/leve-out/packaging/homebrew/Casks/leve.rb /tmp/homebrew-tap/Casks/leve.rb
cd /tmp/homebrew-tap && git switch main && git pull && git switch -c leve-X.Y.Z
git commit -am "leve X.Y.Z" && git push -u origin HEAD
gh pr create --repo moraliasp/homebrew-tap --fill
gh pr merge --repo moraliasp/homebrew-tap --squash --admin --delete-branch
```

O cask tem `livecheck` pela release mais recente (`brew livecheck --cask moraliasp/tap/leve` mostra se ficou para trás) e `auto_updates true`: quem usa o atualizador do app não depende do `brew upgrade`.

## 3. winget: PR no `microsoft/winget-pkgs`

O `PackageIdentifier` é `Moralia.Leve`; não existia no winget-pkgs em 2026-10-26 (`gh api repos/microsoft/winget-pkgs/contents/manifests/m/Moralia` devolveu 404 às 11:55 UTC). Confira de novo antes do primeiro PR. O PR da primeira versão é revisado por moderador; os seguintes passam pelo mesmo pipeline automático. Uma versão por PR.

```bash
gh repo fork microsoft/winget-pkgs --clone=false
git clone --depth 1 --filter=blob:none --sparse "https://github.com/$(gh api user --jq .login)/winget-pkgs.git" /tmp/winget-pkgs
cd /tmp/winget-pkgs
git sparse-checkout set manifests/m/Moralia
git switch -c Moralia.Leve-X.Y.Z
mkdir -p manifests/m/Moralia/Leve/X.Y.Z
cp /tmp/leve-out/packaging/winget/X.Y.Z/*.yaml manifests/m/Moralia/Leve/X.Y.Z/
git add manifests/m/Moralia/Leve/X.Y.Z
git commit -m "New package: Moralia.Leve version X.Y.Z"
git push -u origin HEAD
gh pr create --repo microsoft/winget-pkgs --title "New package: Moralia.Leve version X.Y.Z" --web
```

Na 0.2.0, os manifestos estão em `packaging/winget/0.2.0` deste repositório.

Para versões seguintes, o título é `New version: Moralia.Leve version X.Y.Z`. O `--web` abre o PR no navegador com o template do winget-pkgs: marque os itens que valem (o CLA da Microsoft é assinado pelo bot no primeiro PR).

Se houver uma máquina Windows, teste antes de abrir o PR:

```powershell
winget validate --manifest .\manifests\m\Moralia\Leve\X.Y.Z
winget settings --enable LocalManifestFiles   # precisa de administrador
winget install --manifest .\manifests\m\Moralia\Leve\X.Y.Z
winget uninstall Moralia.Leve
```

O instalador não tem Authenticode: o pipeline pode marcar o PR para revisão manual (`Needs-Manual-Validation`), o que só atrasa. Erro de hash ou URL (`Validation-Hash-Verification-Failed`, `Validation-Url-Error`) quase sempre é release ainda em rascunho ou pacote trocado depois de gerar os manifestos; releases imutáveis evitam o segundo caso.

## 4. Flathub

Por que assim: "Flatpak a partir do fonte" em [`decisoes.md`](decisoes.md). O build e o lint estão provados pelo job `flatpak` do `ci.yml`; o envio é do dono, sem agente de IA.

**Regra do Flathub que manda neste passo** ([Requirements, "Generative AI policy"](https://docs.flathub.org/docs/for-app-authors/requirements#generative-ai-policy), lida em 2026-10-27): o manifesto do Flathub não pode ter conteúdo gerado ou assistido por IA, nem com declaração; agente de IA não abre nem automatiza o PR de envio nem escreve commits, descrição ou respostas aos revisores; o que houver de IA no app ou no empacotamento (aqui: metainfo, `.desktop`, ajustes de código e o manifesto de prova deste repositório) precisa ser declarado no envio. Descumprir pode render banimento da conta. Por isso o manifesto de `packaging/flatpak/` serve de prova de que o build funciona, não de texto para copiar.

### Antes

- Uma release estável com o metainfo e o atualizador desligado no Flatpak (desde a 0.4.0). O manifesto do Flathub aponta para a tag dela e o commit (`type: git`, `tag` + `commit`).
- O job `flatpak` verde na tag: `gh workflow run ci.yml --ref vX.Y.Z -f pacote=flatpak`.
- Ler [Submission](https://docs.flathub.org/docs/for-app-authors/submission) e o template do PR do Flathub.

### Envio (à mão)

1. Fork de `flathub/flathub` na sua conta, branch a partir da `new-pr`, PR contra a `new-pr` com o template preenchido (o processo está em Submission).
2. Manifesto `br.com.moralia.leve.yml` escrito por você. Os fatos técnicos que ele precisa refletir: runtime `org.gnome.Platform` 51; extensões `rust-stable` e `node24`; pnpm da versão do `packageManager` do `package.json`; `pnpm install --offline --frozen-lockfile` e `pnpm tauri build --no-bundle`; binário `src-tauri/target/release/leve` em `/app/bin/leve`; `.desktop`, metainfo e ícones de `packaging/flatpak/` e `src-tauri/icons/`; permissões e o motivo de cada uma em `decisoes.md`.
3. `cargo-sources.json` e `node-sources.json` gerados pela ferramenta (`scripts/flatpak-sources.sh` grava em `packaging/flatpak/`) a partir dos lockfiles da tag; são saída de ferramenta, não de IA.
4. `flathub.json`: por padrão o Flathub builda `x86_64` e `aarch64` (Requirements). O job `flatpak` só prova `x86_64`; o `aarch64` aparece no `bot, build` do PR. Se falhar e não houver correção simples, `{"only-arches": ["x86_64"]}`.
5. No PR, a declaração de IA pedida pela política, com as partes afetadas.

### Verificação (opcional)

O app aparece como não verificado até o dono provar o domínio: o token do Developer Portal do Flathub vai em `https://moralia.com.br/.well-known/org.flathub.VerifiedApps.txt` (ou num TXT do DNS). Sem isso o app é publicado igual, sem o selo.

### Depois do aceite

O Flathub cria `flathub/br.com.moralia.leve` e convida o dono. Cada versão nova é um PR lá (tag, commit e fontes regeradas), com a release nova também no `<releases>` do metainfo deste repositório.

## 5. Depois de publicar

- Tirar o "em breve" das linhas de `winget install`, `brew install` e `flatpak install` nos READMEs e em [`instalacao.md`](instalacao.md).
- Com assinatura Apple e Authenticode, revisar a decisão: a `caveats` sai do cask (`scripts/packaging.mjs`) e o `homebrew/cask` oficial vira opção.
