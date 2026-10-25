<#
Prepara o runner Windows para assinar os instaladores, conforme o provedor escolhido em
WINDOWS_SIGN_PROVIDER (ver docs/assinatura.md):

  esigner           SSL.com eSigner: baixa o CodeSignTool (versão e SHA-256 fixos) e exporta CODESIGNTOOL_JAR.
                    Precisa de `java` no PATH (o runner windows-latest já tem).
  artifact-signing  Azure Artifact Signing (ex-Trusted Signing): baixa pelo NuGet o signtool.exe do Windows SDK
                    e a dlib Microsoft.ArtifactSigning.Client, escreve o metadata.json e exporta SIGNTOOL_EXE,
                    AZURE_SIGNING_DLIB e AZURE_SIGNING_METADATA. Entrada: AZURE_SIGNING_ENDPOINT,
                    AZURE_SIGNING_ACCOUNT e AZURE_SIGNING_PROFILE.

Tudo vai para o GITHUB_ENV (fora do Actions, só imprime). No fim, confere a sintaxe de sign-windows.ps1.
#>
$ErrorActionPreference = 'Stop'

$provider = $env:WINDOWS_SIGN_PROVIDER
if (-not $provider) { throw 'Falta WINDOWS_SIGN_PROVIDER (esigner ou artifact-signing).' }

$root = if ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } else { [IO.Path]::GetTempPath() }
$tools = Join-Path $root 'leve-sign-tools'
New-Item -ItemType Directory -Force -Path $tools | Out-Null
$exports = [ordered]@{}

function Require-Env([string[]]$names) {
  foreach ($name in $names) {
    if (-not [Environment]::GetEnvironmentVariable($name)) { throw "Falta a variável de ambiente $name." }
  }
}

switch ($provider) {
  'esigner' {
    # CodeSignTool do SSL.com (Java). Versão e hash fixos: ao subir, baixe o zip, confira o SHA-256 e atualize aqui.
    $version = '1.3.2'
    $sha256 = 'f14b1e1ef14bfa1fd00279c363aab0debbf5dcfba0e4bcdce5d22bb771de0e3a'
    $url = "https://github.com/SSLcom/CodeSignTool/releases/download/v$version/CodeSignTool-v$version.zip"

    if (-not (Get-Command java -ErrorAction SilentlyContinue)) { throw 'O CodeSignTool precisa de java no PATH.' }
    $zip = Join-Path $tools "CodeSignTool-v$version.zip"
    Invoke-WebRequest -Uri $url -OutFile $zip
    $actual = (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne $sha256) { throw "SHA-256 do CodeSignTool não confere: esperado $sha256, veio $actual." }
    $dir = Join-Path $tools 'CodeSignTool'
    Expand-Archive -LiteralPath $zip -DestinationPath $dir -Force
    $jar = Join-Path $dir "jar\code_sign_tool-$version.jar"
    if (-not (Test-Path -LiteralPath $jar)) { throw "jar não encontrado em $jar." }
    $exports.CODESIGNTOOL_JAR = $jar
  }
  'artifact-signing' {
    Require-Env 'AZURE_SIGNING_ENDPOINT', 'AZURE_SIGNING_ACCOUNT', 'AZURE_SIGNING_PROFILE'

    # Versões fixas para o build ser reproduzível. A Microsoft pede signtool >= 10.0.2261.755 e
    # recomenda a dlib mais recente; ao subir, confira o changelog do pacote no NuGet.
    $sdkVersion = '10.0.28000.2705'   # Microsoft.Windows.SDK.BuildTools
    $clientVersion = '1.0.146'        # Microsoft.ArtifactSigning.Client (dlib)

    $runtimes = & dotnet --list-runtimes 2>$null
    if (-not ($runtimes | Where-Object { $_ -like 'Microsoft.NETCore.App 8.*' })) {
      throw 'A dlib do Artifact Signing precisa do .NET 8 Runtime (x64), que não está instalado.'
    }

    & nuget install Microsoft.Windows.SDK.BuildTools -Version $sdkVersion -OutputDirectory $tools -ExcludeVersion -NonInteractive
    if ($LASTEXITCODE -ne 0) { throw "nuget install (Windows SDK) saiu com código $LASTEXITCODE." }
    & nuget install Microsoft.ArtifactSigning.Client -Version $clientVersion -OutputDirectory $tools -ExcludeVersion -NonInteractive
    if ($LASTEXITCODE -ne 0) { throw "nuget install (Artifact Signing dlib) saiu com código $LASTEXITCODE." }

    $signtool = Get-ChildItem -Path (Join-Path $tools 'Microsoft.Windows.SDK.BuildTools\bin') -Recurse -Filter signtool.exe |
      Where-Object { $_.DirectoryName -like '*\x64' } | Select-Object -First 1
    if (-not $signtool) { throw 'signtool.exe (x64) não encontrado no pacote do Windows SDK.' }

    $dlib = Join-Path $tools 'Microsoft.ArtifactSigning.Client\bin\x64\Azure.CodeSigning.Dlib.dll'
    if (-not (Test-Path -LiteralPath $dlib)) { throw "dlib não encontrada em $dlib." }

    # Fora do Azure, o ManagedIdentityCredential só atrasa (tenta o IMDS e expira). Ficam:
    # EnvironmentCredential (AZURE_CLIENT_ID/TENANT/SECRET, para teste manual), WorkloadIdentityCredential
    # e AzureCliCredential (o `az login` do azure/login no CI).
    $metadata = Join-Path $tools 'metadata.json'
    [ordered]@{
      Endpoint               = $env:AZURE_SIGNING_ENDPOINT
      CodeSigningAccountName = $env:AZURE_SIGNING_ACCOUNT
      CertificateProfileName = $env:AZURE_SIGNING_PROFILE
      CorrelationId          = "leve $($env:GITHUB_REF_NAME) run $($env:GITHUB_RUN_ID)".Trim()
      ExcludeCredentials     = @(
        'ManagedIdentityCredential', 'SharedTokenCacheCredential', 'VisualStudioCredential',
        'VisualStudioCodeCredential', 'AzurePowerShellCredential', 'AzureDeveloperCliCredential',
        'InteractiveBrowserCredential'
      )
    } | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath $metadata -Encoding utf8

    $exports.SIGNTOOL_EXE = $signtool.FullName
    $exports.AZURE_SIGNING_DLIB = $dlib
    $exports.AZURE_SIGNING_METADATA = $metadata
  }
  default { throw "WINDOWS_SIGN_PROVIDER desconhecido: $provider (use esigner ou artifact-signing)." }
}

foreach ($kv in $exports.GetEnumerator()) {
  $line = "$($kv.Key)=$($kv.Value)"
  if ($env:GITHUB_ENV) { Add-Content -LiteralPath $env:GITHUB_ENV -Value $line -Encoding utf8 }
  Write-Host $line
}

# Falha cedo, antes de compilar, se o script de assinatura tiver erro de sintaxe.
$tokens = $null; $errors = $null
[void][System.Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'sign-windows.ps1'), [ref]$tokens, [ref]$errors)
if ($errors) { throw "sign-windows.ps1 com erro de sintaxe: $($errors[0].Message)" }
Write-Host "sign-windows.ps1: sintaxe OK (provedor: $provider)"
