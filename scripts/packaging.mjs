#!/usr/bin/env node
// Gera os manifestos do winget e o cask do Homebrew de uma versão publicada, a partir do
// `SHA256SUMS.txt` da release (o release.yml grava e atesta esse arquivo):
//   node scripts/packaging.mjs <SHA256SUMS.txt> <X.Y.Z> [AAAA-MM-DD] [pasta]
// Grava em <pasta>/packaging/winget/<X.Y.Z>/ e <pasta>/packaging/homebrew/Casks/leve.rb (pasta
// padrão: a atual). Não publica nada: o passo a passo está em docs/publicar-pacotes.md.
// winget: só o `-setup.exe` (NSIS, por usuário). O `.msi` fica fora porque o ProductCode dele muda
// a cada build (WiX `Id="*"`) e só se lê abrindo o .msi; ver "Homebrew e winget" em docs/decisoes.md.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

export const REPO = "moraliasp/leve";
export const WINGET_ID = "Moralia.Leve";
export const WINGET_SCHEMA = "1.12.0";
export const EXTENSIONS = ["md", "markdown", "mdown", "mkd"];

/** Nomes dos pacotes da release, como o release.yml os grava. */
export const assetNames = (version) => ({
  dmg: `Leve_${version}_universal.dmg`,
  nsis: `Leve_${version}_x64-setup.exe`,
});

/** `sha256sum` (`<hash>  <nome>`, `*` antes do nome em modo binário) → Map nome → hash minúsculo. */
export function parseSums(text) {
  const sums = new Map();
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const m = /^([0-9a-fA-F]{64}) [ *](.+)$/.exec(line.trim());
    if (!m) throw new Error(`linha inválida no SHA256SUMS: ${line}`);
    sums.set(m[2], m[1].toLowerCase());
  }
  return sums;
}

const yamlHeader = (kind) =>
  `# yaml-language-server: $schema=https://aka.ms/winget-manifest.${kind}.${WINGET_SCHEMA}.schema.json\n\n`;
const list = (items, indent = "") => items.map((x) => `${indent}- ${x}`).join("\n");

/**
 * `version`: X.Y.Z de uma release estável (pre-release não vai para gerenciador de pacotes).
 * `sums`: Map de `parseSums`. `releaseDate`: AAAA-MM-DD, opcional.
 * Devolve { caminho relativo → conteúdo }. Erro se faltar o hash de um pacote: um manifesto com
 * hash errado instala nada (winget e brew recusam) e só se descobre na mão do usuário.
 */
export function buildPackaging({ version, sums, releaseDate }) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`versão inválida (esperado X.Y.Z): ${version}`);
  if (releaseDate !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(releaseDate)) {
    throw new Error(`data inválida (esperado AAAA-MM-DD): ${releaseDate}`);
  }
  const names = assetNames(version);
  const hash = (name) => {
    const h = sums.get(name);
    if (!h) throw new Error(`falta o hash de ${name} no SHA256SUMS`);
    return h;
  };
  const tag = `v${version}`;
  const download = `https://github.com/${REPO}/releases/download/${tag}`;
  const notes = `https://github.com/${REPO}/releases/tag/${tag}`;
  const id = WINGET_ID;
  const base = `PackageIdentifier: ${id}\nPackageVersion: ${version}\n`;
  const tail = (type) => `ManifestType: ${type}\nManifestVersion: ${WINGET_SCHEMA}\n`;

  const versionYaml =
    yamlHeader("version") + base + `DefaultLocale: en-US\n` + tail("version");

  const installerYaml =
    yamlHeader("installer") +
    base +
    `InstallerType: nullsoft\n` +
    `Scope: user\n` +
    `InstallModes:\n${list(["interactive", "silent", "silentWithProgress"])}\n` +
    `UpgradeBehavior: install\n` +
    `FileExtensions:\n${list(EXTENSIONS)}\n` +
    (releaseDate ? `ReleaseDate: ${releaseDate}\n` : "") +
    `Installers:\n` +
    `- Architecture: x64\n` +
    `  InstallerUrl: ${download}/${names.nsis}\n` +
    `  InstallerSha256: ${hash(names.nsis).toUpperCase()}\n` +
    tail("installer");

  const tags = ["markdown", "viewer", "md", "reader", "mermaid", "katex"];
  const defaultLocaleYaml =
    yamlHeader("defaultLocale") +
    base +
    `PackageLocale: en-US\n` +
    `Publisher: Moralia\n` +
    `PublisherUrl: https://github.com/moraliasp\n` +
    `PublisherSupportUrl: https://github.com/${REPO}/issues\n` +
    `PrivacyUrl: https://github.com/${REPO}#privacy\n` +
    `PackageName: Leve\n` +
    `PackageUrl: https://github.com/${REPO}\n` +
    `License: MIT\n` +
    `LicenseUrl: https://github.com/${REPO}/blob/main/LICENSE\n` +
    `Copyright: Copyright (c) 2026 Moralia\n` +
    `ShortDescription: A small, fast, private Markdown viewer\n` +
    `Description: |-\n` +
    `  Double-click a .md file and it just looks right. Leve reloads when you save in your editor,\n` +
    `  with table of contents, find, tabs, light and dark themes, Mermaid diagrams, KaTeX math and\n` +
    `  PDF or HTML export. Remote images are blocked by default and nothing is sent anywhere.\n` +
    `Tags:\n${list(tags)}\n` +
    `ReleaseNotesUrl: ${notes}\n` +
    tail("defaultLocale");

  const ptBrYaml =
    yamlHeader("locale") +
    base +
    `PackageLocale: pt-BR\n` +
    `Publisher: Moralia\n` +
    `PackageName: Leve\n` +
    `License: MIT\n` +
    `ShortDescription: Visualizador de Markdown pequeno, rápido e privado\n` +
    `Description: |-\n` +
    `  Dê duplo-clique num .md e ele aparece do jeito certo. O Leve recarrega quando você salva no\n` +
    `  editor, com sumário, busca, abas, temas claro e escuro, diagramas Mermaid, matemática KaTeX e\n` +
    `  exportação para PDF ou HTML. Imagens remotas ficam bloqueadas por padrão e nada sai do computador.\n` +
    `Tags:\n${list(["markdown", "visualizador", "md", "leitor", "mermaid", "katex"])}\n` +
    `ReleaseNotesUrl: ${notes}\n` +
    tail("locale");

  const cask = `cask "leve" do
  version "${version}"
  sha256 "${hash(names.dmg)}"

  url "https://github.com/${REPO}/releases/download/v#{version}/Leve_#{version}_universal.dmg"
  name "Leve"
  desc "Small, fast, private Markdown viewer"
  homepage "https://github.com/${REPO}"

  livecheck do
    url :url
    strategy :github_latest
  end

  auto_updates true
  depends_on :macos

  app "Leve.app"

  preflight_steps do
    if_path_exists "Leve.app/Contents/Info.plist", base: :appdir do
      run "/bin/echo", args: ["Leve is already installed. Keeping it; it updates itself."], print_stdout: true
      remove "Leve.app", recursive: true
      move "Leve.app", "Leve.app", source_base: :appdir
    end
  end

  zap trash: [
    "~/Library/Application Support/br.com.moralia.leve",
    "~/Library/Caches/br.com.moralia.leve",
    "~/Library/HTTPStorages/br.com.moralia.leve",
    "~/Library/Preferences/br.com.moralia.leve.plist",
    "~/Library/Saved Application State/br.com.moralia.leve.savedState",
    "~/Library/WebKit/br.com.moralia.leve",
  ]

  caveats <<~EOS
    Leve is not signed or notarized by Apple yet, so macOS blocks the first launch.
    Open Leve once, click Done, then go to System Settings > Privacy & Security
    and click Open Anyway. macOS may ask again after brew upgrade.
    Or remove the quarantine flag yourself, if you trust this download:
      xattr -dr com.apple.quarantine "#{appdir}/Leve.app"
    Checksums and build provenance: https://github.com/${REPO}/releases
  EOS
end
`;

  const dir = `packaging/winget/${version}`;
  return {
    [`${dir}/${id}.yaml`]: versionYaml,
    [`${dir}/${id}.installer.yaml`]: installerYaml,
    [`${dir}/${id}.locale.en-US.yaml`]: defaultLocaleYaml,
    [`${dir}/${id}.locale.pt-BR.yaml`]: ptBrYaml,
    "packaging/homebrew/Casks/leve.rb": cask,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [sumsFile, version, releaseDate, out = "."] = process.argv.slice(2);
  if (!sumsFile || !version) {
    console.error("uso: node scripts/packaging.mjs <SHA256SUMS.txt> <X.Y.Z> [AAAA-MM-DD] [pasta]");
    process.exit(2);
  }
  const files = buildPackaging({
    version,
    sums: parseSums(readFileSync(sumsFile, "utf8")),
    releaseDate: releaseDate || undefined,
  });
  for (const [rel, content] of Object.entries(files)) {
    const path = join(out, rel);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
    console.log(path);
  }
}
