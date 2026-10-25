<#
signCommand do Tauri (src-tauri/tauri.sign.conf.json): assina um arquivo (%1) e confere a assinatura,
conforme WINDOWS_SIGN_PROVIDER. Depende do ambiente preparado por scripts/install-sign-tools.ps1.
Ver docs/assinatura.md.

  esigner           CodeSignTool do SSL.com. Credenciais em ESIGNER_USERNAME, ESIGNER_PASSWORD,
                    ESIGNER_CREDENTIAL_ID e ESIGNER_TOTP_SECRET (segredos do environment "release").
                    O arquivo é enviado como hash; o carimbo de tempo é o do SSL.com (ts.ssl.com).
  artifact-signing  signtool + dlib do Azure Artifact Signing, com uma credencial que o DefaultAzureCredential
                    aceite: `az login` (azure/login com OIDC no CI) ou AZURE_CLIENT_ID/TENANT/SECRET em teste manual.
#>
param([Parameter(Mandatory = $true)][string]$File)
$ErrorActionPreference = 'Stop'

function Require-Env([string[]]$names) {
  foreach ($name in $names) {
    if (-not [Environment]::GetEnvironmentVariable($name)) {
      throw "Falta a variável $name; confira os segredos do environment e rode scripts/install-sign-tools.ps1 antes do build."
    }
  }
}

if (-not (Test-Path -LiteralPath $File)) { throw "Arquivo para assinar não existe: $File" }
$File = (Resolve-Path -LiteralPath $File).Path

switch ($env:WINDOWS_SIGN_PROVIDER) {
  'esigner' {
    Require-Env 'CODESIGNTOOL_JAR', 'ESIGNER_USERNAME', 'ESIGNER_PASSWORD', 'ESIGNER_CREDENTIAL_ID', 'ESIGNER_TOTP_SECRET'
    # O CodeSignTool lê conf/code_sign_tool.properties relativo ao próprio diretório (ou a CODE_SIGN_TOOL_PATH),
    # e o Tauri chama este script com cwd em src-tauri: por isso entra na pasta da ferramenta antes.
    # -override assina no lugar; -program_name é o nome que o UAC mostra para o .msi.
    $toolDir = Split-Path -Parent (Split-Path -Parent $env:CODESIGNTOOL_JAR)
    $env:CODE_SIGN_TOOL_PATH = $toolDir
    Push-Location $toolDir
    try {
      & java -jar $env:CODESIGNTOOL_JAR sign `
        -credential_id $env:ESIGNER_CREDENTIAL_ID -username $env:ESIGNER_USERNAME `
        -password $env:ESIGNER_PASSWORD -totp_secret $env:ESIGNER_TOTP_SECRET `
        -program_name 'Leve' -input_file_path $File -override
      $code = $LASTEXITCODE
    } finally { Pop-Location }
    if ($code -ne 0) { throw "CodeSignTool falhou (código $code) em $File" }
  }
  'artifact-signing' {
    Require-Env 'SIGNTOOL_EXE', 'AZURE_SIGNING_DLIB', 'AZURE_SIGNING_METADATA'
    # Certificado do Artifact Signing vale 3 dias: o carimbo de tempo (/tr) é o que mantém a assinatura válida depois.
    & $env:SIGNTOOL_EXE sign /v /fd SHA256 /tr 'http://timestamp.acs.microsoft.com' /td SHA256 `
      /d 'Leve' /du 'https://github.com/moraliasp/leve' `
      /dlib $env:AZURE_SIGNING_DLIB /dmdf $env:AZURE_SIGNING_METADATA $File
    if ($LASTEXITCODE -ne 0) { throw "signtool sign falhou (código $LASTEXITCODE) em $File" }
  }
  default { throw "WINDOWS_SIGN_PROVIDER desconhecido: '$($env:WINDOWS_SIGN_PROVIDER)' (use esigner ou artifact-signing)." }
}

# Conferência independente da ferramenta: a cadeia tem de fechar numa raiz confiável do Windows.
$sig = Get-AuthenticodeSignature -LiteralPath $File
if ($sig.Status -ne 'Valid') { throw "Assinatura inválida em ${File}: $($sig.Status) $($sig.StatusMessage)" }
Write-Host "Assinado: $File"
Write-Host "  Assinante: $($sig.SignerCertificate.Subject)"
Write-Host "  Carimbo: $($sig.TimeStamperCertificate.Subject)"
