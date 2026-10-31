# Assinatura e notarização

## macOS (pendente: conta Apple Developer da Moralia)

Até a Moralia ter conta Apple Developer própria, o app sai sem assinatura. Quando a conta Organization for aprovada:

1. Criar certificado **Developer ID Application** no portal e exportar `.p12`.
2. Criar chave de API do App Store Connect (Issuer ID, Key ID, `.p8`) para o `notarytool`.
3. No environment `release` do GitHub, não no repositório (é o environment que tem revisor e só aceita tag `v*`):
   - Secrets `APPLE_CERTIFICATE` (base64 do .p12), `APPLE_CERTIFICATE_PASSWORD`, `APPLE_API_ISSUER`, `APPLE_API_KEY` (o Key ID) e `APPLE_API_KEY_P8` (o conteúdo do `.p8`).
   - Variable `APPLE_SIGNING_IDENTITY` (ex.: `Developer ID Application: <razão social da Moralia> (TEAMID)`). É ela que liga a assinatura no `release.yml`; sem ela, o build sai como hoje.
4. O passo **Chave de notarização** grava o `.p8` no disco do runner, porque `APPLE_API_KEY_PATH` é o caminho de um arquivo. No **Build**, a CLI do Tauri assina e notariza o `.app` a partir das variáveis `APPLE_*`.
5. O Tauri notariza e grampeia só o `.app`; o `.dmg` sai assinado, sem ticket próprio. O passo **Notarizar o .dmg** faz `notarytool submit`, `stapler staple`, `stapler validate` e `spctl`. Qualquer falha derruba o build.
6. O primeiro build assinado vai por `vX.Y.Z-rc.N`, porque o caminho assinado do `release.yml` só roda com a conta Apple. Conferir o `.dmg` num Mac limpo e atualizar uma instalação sem assinatura para a assinada.

Sem assinatura, o Gatekeeper exige liberar o app em Ajustes → Privacidade e Segurança na primeira abertura.

## Windows: assinatura dos instaladores

**Situação (2026-10-25):** certificado OV ainda a decidir pela Moralia; nada foi comprado e o
instalador Windows sai sem assinatura. O levantamento de 2026-10-25 recomenda o caminho B, certificado de AC
comercial com chave em nuvem. O Azure Trusted Signing (hoje "Azure Artifact Signing") foi o primeiro
candidato, mas a Microsoft não aceita empresa brasileira no Public Trust; o levantamento fica abaixo, em
"Caminho A", porque o código continua pronto para ele e a Microsoft pode abrir o Brasil.

O release suporta os dois provedores com os mesmos arquivos. O que muda é a variável
`WINDOWS_SIGN_PROVIDER` no environment `release` do GitHub: `esigner` (SSL.com) ou `artifact-signing`
(Azure). Sem a variável, o release sai como hoje, sem assinatura. Uma diferença fica mesmo sem a variável:
o job inteiro (macOS e Windows) roda no environment `release`, então, com revisor configurado, cada release
espera uma aprovação antes de compilar. É o mesmo portão que os segredos `APPLE_*` vão usar.

### Caminho B: AC comercial com chave em nuvem (recomendado)

Desde junho de 2023 a chave privada de um certificado de code signing tem de ficar em hardware certificado:
token USB ou HSM em nuvem. Para o CI só serve nuvem, e só serve nuvem que assine sem alguém digitar código no
celular. Levantamento em 2026-10-25 (preços de lista em dólar, por ano, sem imposto; confirmar na compra):

| AC e modo | Certificado OV | Nuvem | Assina no CI sem pessoa? | Aceita CNPJ? | Observação |
| --- | --- | --- | --- | --- | --- |
| **SSL.com + eSigner** | US$ 129 (1 ano; US$ 96,75/ano em 5 anos) | eSigner Tier 1: US$ 15/mês, 240 assinaturas, 1 credencial (cobrança anual é ~25% menor); 30 dias grátis com certificado novo | Sim: CodeSignTool (Java) com usuário, senha, id da credencial e segredo TOTP | Validação por registro empresarial e telefone listado, 3 a 5 dias; não há lista de países na página, confirmar com o suporte antes de pagar | Mais barato; ferramenta roda em qualquer runner; 4 segredos de longa duração no GitHub |
| **SSL.com + Azure Key Vault Premium** | US$ 129 + US$ 75 de atestação do SSL.com por chave | Key Vault Premium, chave RSA-HSM 4096: cerca de US$ 5/mês por chave (valor de terceiros; a página da Azure não mostra) | Sim: AzureSignTool com o `azure/login` por OIDC que já está no workflow | Idem | Sem segredo de longa duração, mas exige assinatura Azure paga, nova chave e nova atestação a cada renovação anual |
| GlobalSign "for HSM" | ~US$ 380 (revenda) | Azure Key Vault | Sim: AzureSignTool | Provável; confirmar | Sem taxa de atestação divulgada; 3× o preço do SSL.com |
| DigiCert + KeyLocker | US$ 996 (assinatura de 12 meses, 1.000 assinaturas/ano) | KeyLocker (HSM da DigiCert) | Sim: `smctl` + KSP + signtool | Sim | Caro para 3 arquivos por release |
| Certum "in the cloud" | US$ 99 a 459 (revendas) | SimplySign | **Não**: o SimplySign Desktop pede código do app no celular | Sim | Descartado para CI |
| Sectigo | US$ 225 a 300 (revendas) | Token USB ou "HSM existente"; não emite para o Key Vault | Só com runner próprio e token | Sim | Descartado |

**EV não vale o preço.** A Microsoft diz hoje, na página do SmartScreen, que certificado EV não pula mais o
aviso e que pagar a mais por EV só para isso "não se justifica mais". OV e EV constroem reputação do mesmo
jeito, por volume de download limpo. Então: **OV**.

**Recomendação: SSL.com OV com eSigner (CodeSignTool).** Custo no primeiro ano por volta de US$ 310
(certificado 129 + eSigner 15 × 12), menos com cobrança anual. Não depende de Azure nem de hardware. O
Key Vault é a alternativa se a Moralia preferir zero segredo de longa duração no GitHub e já tiver
assinatura Azure; troca-se só o ramo `esigner` de `scripts/sign-windows.ps1` por uma chamada ao
AzureSignTool.

#### O que fazer fora do código, se a Moralia seguir este caminho

1. **Comprar** em <https://www.ssl.com/products/software-integrity/code-signing/ov/>: OV Code Signing, 1 ano
   (ou 5 anos pelo desconto; o certificado em si é reemitido a cada 12 meses, sem custo), armazenamento
   **eSigner Cloud Signing**, sem YubiKey, sem validação expressa. Conta no SSL.com em nome da Moralia, com
   e-mail em domínio da empresa.
2. **Validação da organização** (3 a 5 dias): o SSL.com confere a Moralia
   em registro público; pode pedir cartão CNPJ ou contrato social (até 12 meses) e liga para um telefone da
   empresa que apareça em fonte pública (cadastro da Receita, site, D&B). Confirmar com o suporte, antes de
   pagar, que aceitam empresa do Brasil.
3. **Inscrever o certificado no eSigner** no portal do SSL.com: ao ativar, aparece um QR code com o
   **secret code** do TOTP. Guardar esse segredo num gerenciador de senhas, não só no celular. Anotar
   também o usuário e a senha da conta SSL.com.
4. **Plano eSigner:** Tier 1 (240 assinaturas/mês; o Leve usa 3 por release). Os 30 dias grátis cobrem o
   primeiro release.
5. **Id da credencial:** no portal (Signing Credentials) ou pelo CodeSignTool:
   `java -jar jar/code_sign_tool-1.3.2.jar get_credential_ids -username ... -password ...`.
6. **GitHub › repositório do Leve › Settings › Environments › `release`**: criar o
   environment. Required reviewers = um mantenedor da Moralia; Deployment branches and tags = "Selected branches and tags",
   só tags `v*` (sem isso, quem tem escrita no repositório roda o `release.yml` alterado, por
   `workflow_dispatch`, em qualquer branch, contra os segredos). Secrets `ESIGNER_USERNAME`,
   `ESIGNER_PASSWORD`, `ESIGNER_CREDENTIAL_ID`, `ESIGNER_TOTP_SECRET`. Variable `WINDOWS_SIGN_PROVIDER` =
   `esigner`.

#### Como o release assina com o eSigner

- O Tauri 2 assina pelo `bundle.windows.signCommand`, um comando externo que recebe o arquivo no lugar de
  `%1`. O bundler chama o comando para o executável do app, para o `.msi` e para o instalador NSIS. O comando fica
  em `src-tauri/tauri.sign.conf.json`, um fragmento que o CI mescla com `--config`; `tauri.conf.json` e o
  build local não mudam. (Não usar `tauri.windows.conf.json`: o Tauri mescla esse automaticamente e quebraria
  o build local sem credenciais.)
- `scripts/install-sign-tools.ps1` baixa o CodeSignTool 1.3.2 do GitHub do SSL.com, confere o SHA-256
  fixado no script e exporta `CODESIGNTOOL_JAR`. Usa o `java` do runner (o zip "windows" de 214 MB só
  embute um JDK 11; o zip genérico tem 31 MB).
- `scripts/sign-windows.ps1` roda `CodeSignTool sign -credential_id ... -username ... -password ...
  -totp_secret ... -program_name Leve -input_file_path <arquivo> -override`. O CodeSignTool manda só o
  hash do arquivo, assina na nuvem do SSL.com e carimba em `ts.ssl.com`. Depois o script confere com
  `Get-AuthenticodeSignature` (status `Valid`, cadeia fechada numa raiz do Windows) e imprime o assinante.
- Os segredos `ESIGNER_*` entram no passo **Build** pelo `env`, só a partir do environment `release`, que
  tem revisor. Em `pull_request` nada disso existe.
- O `azure/login` e o `--no-bundle` continuam no workflow, mas só rodam com `WINDOWS_SIGN_PROVIDER=artifact-signing`.

### Caminho A: Azure Artifact Signing (bloqueado para o Brasil, mantido como referência)

A Microsoft renomeou o serviço: o que a Tauri e a web chamam de **Trusted Signing** aparece no portal, na
CLI (`az artifact-signing`), no NuGet (`Microsoft.ArtifactSigning.Client`) e no Marketplace
(`azure/artifact-signing-action`) como **Artifact Signing**. A página oficial diz, em nota de pré-requisito
(texto de 2026-10-08):

> Public Trust certificates are available to organizations in the United States, Canada, the European Union,
> the United Kingdom, Australia, New Zealand, Japan, South Korea, Singapore, Switzerland, Norway, and Israel.

O **Brasil não está na lista**. A região Azure "Brazil South" existe para hospedar o recurso, mas a validação de
identidade de uma empresa com CNPJ não é aceita. O FAQ confirma: se o país não aparece na lista suspensa da
validação, a lista de países elegíveis é a dos pré-requisitos. A restrição **não** vale para Private Trust, mas
Private Trust não serve: o Windows não confia nesses certificados. Vale abrir um ticket no Azure Support
perguntando pela previsão e registrar a resposta aqui. Se o Brasil entrar, o custo seria US$ 9,99/mês (Basic,
valor de lançamento; a página de preços hoje não mostra o número) e o que segue passa a valer sem mudar código.

#### O que a Moralia precisa fazer fora do código

1. **Assinatura Azure paga.** O serviço não aceita assinatura gratuita, de avaliação ou patrocinada; precisa
   de pay-as-you-go ou contrato Enterprise. Precisa também de um tenant Microsoft Entra (vem com a assinatura).
2. **Registrar o provedor `Microsoft.CodeSigning`** na assinatura (Subscriptions › Resource providers › Register).
3. **Criar a conta de Artifact Signing** (portal: "Artifact Signing Accounts" › Create).
   - Regiões disponíveis: Brazil South, Central US, East US, Japan East, Korea Central, North Central US,
     North Europe, Poland Central, South Central US, Switzerland North, West Central US, West Europe,
     West US, West US 2, West US 3. Para a Moralia: **Brazil South**, endpoint `https://brs.codesigning.azure.net`.
   - Nome da conta: 3 a 24 caracteres alfanuméricos, único globalmente, começa com letra (sugestão: `moralia`).
   - SKU **Basic**: 5.000 assinaturas/mês e 1 perfil de cada tipo. **Premium**: 100.000/mês e 10 perfis.
     O Leve assina 3 arquivos por release; Basic sobra.
   - **Custo:** a página de preços da Azure hoje mostra o valor mensal como "$-" (sem número). Os valores de
     lançamento eram US$ 9,99/mês (Basic) e US$ 99,99/mês (Premium); confirme na calculadora de preços antes de
     criar. Cobra a partir da criação da conta, mês cheio, sem rateio, em dólar com IOF e sem nota fiscal
     brasileira.
4. **Validação de identidade da organização (Public Trust)**, só pelo portal, com o papel
   **Artifact Signing Identity Verifier** (que exige ao menos Reader na assinatura):
   - Formulário: razão social exata, site da empresa, e-mail primário e secundário em domínio da empresa
     (recebem links que expiram em 7 dias; não pode ser lista de distribuição no primário), identificador da
     empresa (CNPJ), endereço comercial, nome e sobrenome do representante como no documento de identidade.
   - O representante passa por verificação individual (Verified ID com AU10TIX: documento com foto e selfie pelo
     Microsoft Authenticator).
   - Documentos extras, se pedidos: registro da empresa (contrato social ou cartão CNPJ), emitidos nos últimos
     12 meses, e comprovante do domínio (fatura de registro ou renovação em nome da empresa). São 3 tentativas
     de envio.
   - **Prazo oficial: 1 a 20 dias úteis**, mais se pedirem documentos. Não há como acelerar.
   - A validação expira e precisa ser renovada (avisos começam 60 dias antes). Alterar qualquer dado depois
     exige nova validação.
5. **Perfil de certificado "Public Trust"** (Certificate profiles › Create › Public Trust): escolher a validação
   concluída em "Verified CN and O"; nome de 5 a 100 caracteres (sugestão: `leve-public`). O certificado
   emitido vale 3 dias e é renovado sozinho; por isso o carimbo de tempo é obrigatório na assinatura.
6. **Identidade para o GitHub Actions (OIDC federado, sem segredo):**
   - Microsoft Entra › App registrations › New registration (sugestão: `github-leve-release`).
   - Em Certificates & secrets › Federated credentials › Add credential › "GitHub Actions deploying Azure
     resources": Organization `moraliasp`, Repository `leve`, Entity type **Environment**, nome `release`.
     Isso gera o subject `repo:moraliasp/leve:environment:release`, issuer
     `https://token.actions.githubusercontent.com`, audience `api://AzureADTokenExchange`. Não há curinga;
     o nome do environment tem de ser exatamente o do workflow.
   - Na conta de Artifact Signing › Access control (IAM) › Add role assignment: papel
     **Artifact Signing Certificate Profile Signer** para esse app registration. Pode ser no escopo do perfil
     de certificado, por CLI, para o mínimo privilégio.
   - A alternativa com segredo (`AZURE_CLIENT_SECRET`) funciona com o mesmo script, mas é um segredo de longa
     duração para guardar e rodar; só usar em teste manual fora do CI.

Só quem tem Owner na assinatura Azure e admin no repositório consegue fazer os
passos 1 a 6. O que sai deles, e onde vai:

| Valor | Origem | Onde colocar no GitHub (environment `release`) |
| --- | --- | --- |
| Directory (tenant) ID | Entra › App registration › Overview | secret `AZURE_TENANT_ID` |
| Application (client) ID | idem | secret `AZURE_CLIENT_ID` |
| Subscription ID | Azure › Subscriptions | secret `AZURE_SUBSCRIPTION_ID` |
| Endpoint da região | tabela acima (`https://brs.codesigning.azure.net`) | variable `AZURE_SIGNING_ENDPOINT` |
| Nome da conta | passo 3 | variable `AZURE_SIGNING_ACCOUNT` |
| Nome do perfil | passo 5 | variable `AZURE_SIGNING_PROFILE` |

Tenant, client e subscription não são segredos de verdade, mas a Microsoft recomenda guardá-los como secret
e o `azure/login` mascara o client-id no log.

#### Como o release assina com o Artifact Signing

- O Tauri 2 assina pelo `bundle.windows.signCommand`, um comando externo que recebe o arquivo no lugar de `%1`.
  O bundler chama o comando para o executável do app, para o `.msi` e para o instalador NSIS. O comando fica em
  `src-tauri/tauri.sign.conf.json`, um fragmento que o CI mescla com `--config`; `tauri.conf.json` e o build
  local não mudam. (Não usar `tauri.windows.conf.json`: o Tauri mescla esse automaticamente e quebraria o build
  local sem credenciais.)
- `scripts/install-sign-tools.ps1` baixa pelo NuGet o `signtool.exe` do Windows SDK e a dlib
  `Azure.CodeSigning.Dlib.dll` do pacote `Microsoft.ArtifactSigning.Client`, escreve o `metadata.json`
  (endpoint, conta, perfil, credenciais excluídas) e exporta os caminhos para os passos seguintes. Versões
  fixas no topo do script.
- `scripts/sign-windows.ps1` roda `signtool sign /fd SHA256 /tr http://timestamp.acs.microsoft.com /td SHA256
  /dlib ... /dmdf ...` e em seguida confere com `Get-AuthenticodeSignature` (status `Valid`); qualquer falha
  derruba o build.
- Autenticação: `azure/login` (OIDC) faz o `az login`; a dlib usa `DefaultAzureCredential` e encontra o
  `AzureCliCredential`. O `metadata.json` exclui o `ManagedIdentityCredential` e os credenciais de IDE, que fora
  do Azure só atrasam ou travam.
- O job compila antes do login (`pnpm tauri build --no-bundle`) e empacota logo depois, porque o token OIDC do
  GitHub dura minutos e a troca por um token do serviço de assinatura acontece no primeiro arquivo assinado.
- Liga com `WINDOWS_SIGN_PROVIDER=artifact-signing` no environment `release`, mais as variáveis
  `AZURE_SIGNING_*` e os segredos `AZURE_*` da tabela acima. O `permissions: id-token: write` e o
  `environment: release` ficam só no job `build` do `release.yml`; o `ci.yml` não tem nada disso.
- Política de Actions da org: `azure/login` (v3.1.0) e `azure/artifact-signing-action` (v2.0.0) são ambos
  publicados pela organização Azure, marcada no Marketplace como "verified creator", categoria que a política
  da org aceita. O workflow usa só `azure/login`, fixado por SHA. A action de assinatura foi descartada porque
  assina depois do bundle e deixaria o executável do app dentro do instalador sem assinatura; com o `signCommand`
  o Tauri assina tudo no lugar certo. Se a política recusar o `azure/login` (`startup_failure` no primeiro
  run), a troca é trocar o passo de login por um `curl` ao `ACTIONS_ID_TOKEN_REQUEST_URL` com audience
  `api://AzureADTokenExchange`, gravar o token num arquivo e exportar `AZURE_FEDERATED_TOKEN_FILE`,
  `AZURE_CLIENT_ID` e `AZURE_TENANT_ID` (o `WorkloadIdentityCredential` da dlib lê isso). Sem action nova.

### Fontes

- Quickstart (regiões, SKUs, validação, perfil): <https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart>
- FAQ (países, assinatura paga, validade de 3 dias, SmartScreen, erros): <https://learn.microsoft.com/en-us/azure/artifact-signing/faq>
- Integração com signtool e dlib: <https://learn.microsoft.com/en-us/azure/artifact-signing/how-to-signing-integrations>
- Papéis RBAC: <https://learn.microsoft.com/en-us/azure/artifact-signing/tutorial-assign-roles>
- Preços: <https://azure.microsoft.com/en-us/pricing/details/artifact-signing/>
- OIDC GitHub → Azure: <https://learn.microsoft.com/en-us/azure/developer/github/connect-from-azure-openid-connect>
  e <https://learn.microsoft.com/en-us/entra/workload-id/workload-identity-federation-create-trust>
- Tauri 2, assinatura Windows: <https://v2.tauri.app/distribute/sign/windows/> e `signCommand` em
  <https://v2.tauri.app/reference/config/>
- Actions: <https://github.com/marketplace/actions/azure-login> e <https://github.com/azure/artifact-signing-action>
- SmartScreen (EV não dá mais reputação imediata): <https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation>
- SSL.com, OV Code Signing (preço, eSigner, Key Vault, validação): <https://www.ssl.com/products/software-integrity/code-signing/ov/>
- SSL.com, eSigner (planos): <https://www.ssl.com/products/software-integrity/signing-service/>
- SSL.com, CodeSignTool (comando, TOTP): <https://www.ssl.com/guide/esigner-codesigntool-command-guide/> e
  <https://www.ssl.com/how-to/automate-esigner-ev-code-signing/>; releases em <https://github.com/SSLcom/CodeSignTool/releases>
- SSL.com, CSR no Azure Key Vault (atestação): <https://www.ssl.com/how-to/generate-a-certificate-signing-request-in-azure-key-vault/>
- DigiCert, planos e KeyLocker: <https://www.digicert.com/signing/compare-code-signing-certificates>
- GlobalSign, Key Vault: <https://support.globalsign.com/code-signing/code-signing/code-signing-certificate-setup-azure-key-vault>
- Certum, EV na nuvem: <https://certum.store/ev-code-signing-in-the-cloud.html>
- AzureSignTool: <https://github.com/vcsjones/AzureSignTool>

## Checklist (Windows, se a Moralia seguir o caminho B)

1. **Confirmar com o suporte do SSL.com** (chat no site) que validam empresa do Brasil para OV Code Signing
   e o que vão pedir (cartão CNPJ, contrato social, telefone). Custo: zero.
2. **Comprar** OV Code Signing com eSigner Cloud Signing, 1 ano. Custo: US$ 129.
3. **Passar a validação** (3 a 5 dias úteis): enviar o que pedirem e atender a ligação.
4. **Ativar o eSigner** e guardar num gerenciador de senhas: usuário, senha, segredo TOTP (do QR code) e id da
   credencial. Escolher o plano Tier 1 depois dos 30 dias grátis. Custo: US$ 15/mês.
5. **GitHub › repositório do Leve › Settings › Environments › `release`:** Required reviewers = um mantenedor da Moralia;
   Deployment branches and tags = só tags `v*`; secrets `ESIGNER_USERNAME`, `ESIGNER_PASSWORD`,
   `ESIGNER_CREDENTIAL_ID`, `ESIGNER_TOTP_SECRET`; variable `WINDOWS_SIGN_PROVIDER` = `esigner`.
6. **Primeiro release assinado:** a tag manda na versão e o workflow confere (`docs/decisoes.md`, "Versão e
   tag"): `pnpm version:set X.Y.Z`, commit, merge em `main`, depois `git tag vX.Y.Z && git push --tags`;
   aprovar o environment quando o run pedir e esperar o rascunho. No log do job Windows: "Ferramentas de assinatura" verde e, no passo "Build",
   `Signing ... with a custom signing command` três vezes com "Assinado:" e "Assinante: CN=<razão social da Moralia>".
7. **Validar o instalador** numa máquina Windows:
   - `signtool verify /pa /v Leve_X.Y.Z_x64-setup.exe` e o mesmo no `.msi`: "Successfully verified",
     cadeia até a raiz do SSL.com, carimbo de tempo presente. Sem SDK: `Get-AuthenticodeSignature` no
     PowerShell, status `Valid`.
   - Propriedades do arquivo › Assinaturas digitais: a razão social da Moralia.
   - Instalar e repetir no executável instalado.
   - SmartScreen: o aviso "Editor desconhecido" some e aparece o nome da empresa; "o Windows protegeu o
     computador" ainda pode aparecer até o arquivo e o certificado ganharem reputação (semanas e centenas de
     instalações limpas, diz a Microsoft). Cada build recomeça pelo hash, mas o certificado acumula a sua.
8. **Renovação:** o certificado é reemitido a cada 12 meses; o SSL.com avisa por e-mail. A credencial do
   eSigner muda na reemissão: atualizar `ESIGNER_CREDENTIAL_ID` e, se o QR for novo, `ESIGNER_TOTP_SECRET`.
9. **Registrar** em `docs/decisoes.md` a data da compra e, se mudar de provedor, a troca da variável.

Se um dia o Brasil entrar no Artifact Signing: criar conta (Brazil South, Basic), validação, perfil Public
Trust, app registration com credencial federada para o environment `release`, papel "Artifact Signing
Certificate Profile Signer"; no environment, secrets `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`,
`AZURE_SUBSCRIPTION_ID`, variables `AZURE_SIGNING_ENDPOINT`, `AZURE_SIGNING_ACCOUNT`,
`AZURE_SIGNING_PROFILE` e `WINDOWS_SIGN_PROVIDER` = `artifact-signing`. Detalhes no "Caminho A".
