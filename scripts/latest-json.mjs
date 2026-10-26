#!/usr/bin/env node
// Gera o `latest.json` que o atualizador do app lê (endpoint em tauri.conf.json), a partir dos
// pacotes e assinaturas que o release.yml juntou numa pasta:
//   node scripts/latest-json.mjs <pasta> <tag>   → grava <pasta>/latest.json
// macOS: um `.app.tar.gz` universal serve às duas arquiteturas. Windows: o `-setup.exe` (NSIS) é o
// padrão; o `.msi` entra como `windows-x86_64-msi` para quem instalou por ele. Linux: o `.AppImage`
// é o padrão (`linux-x86_64`, o próprio arquivo assinado, sem .tar.gz); o `.deb` entra como
// `linux-x86_64-deb`, que o atualizador procura antes do padrão quando o app veio do .deb (sem essa
// entrada, quem instalou pelo .deb baixaria o AppImage e o `dpkg` recusaria).
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const REPO = "moraliasp/leve";

/**
 * `files`: nomes na pasta; `sig(nome)`: conteúdo do `.sig` do pacote. Erro se faltar pacote ou
 * assinatura: um latest.json incompleto deixaria uma plataforma sem atualização sem ninguém ver.
 */
export function buildLatest({ tag, files, sig, date = new Date(), notes }) {
  // `vX.Y.Z-rc.N` compila a versão X.Y.Z (ver "Conferir versão" no release.yml).
  const version = tag.replace(/^v/, "").replace(/-rc\.\d+$/, "");
  const url = (f) => `https://github.com/${REPO}/releases/download/${tag}/${f}`;
  const pick = (re, what) => {
    const f = files.find((x) => re.test(x));
    if (!f) throw new Error(`falta o pacote ${what}`);
    if (!files.includes(`${f}.sig`)) throw new Error(`falta a assinatura de ${f}`);
    return { url: url(f), signature: sig(f).trim() };
  };
  const mac = pick(/_universal\.app\.tar\.gz$/, "macOS (.app.tar.gz)");
  const nsis = pick(/-setup\.exe$/, "Windows (-setup.exe)");
  const msi = pick(/\.msi$/, "Windows (.msi)");
  const appimage = pick(/_amd64\.AppImage$/, "Linux (.AppImage)");
  const deb = pick(/_amd64\.deb$/, "Linux (.deb)");
  return {
    version,
    notes: notes ?? `https://github.com/${REPO}/releases/tag/${tag}`,
    pub_date: date.toISOString(),
    platforms: {
      "darwin-aarch64": mac,
      "darwin-x86_64": mac,
      "windows-x86_64": nsis,
      "windows-x86_64-nsis": nsis,
      "windows-x86_64-msi": msi,
      "linux-x86_64": appimage,
      "linux-x86_64-appimage": appimage,
      "linux-x86_64-deb": deb,
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [dir, tag] = process.argv.slice(2);
  if (!dir || !tag) {
    console.error("uso: node scripts/latest-json.mjs <pasta> <tag>");
    process.exit(2);
  }
  const files = readdirSync(dir);
  const latest = buildLatest({ tag, files, sig: (f) => readFileSync(join(dir, `${f}.sig`), "utf8") });
  writeFileSync(join(dir, "latest.json"), `${JSON.stringify(latest, null, 2)}\n`);
  console.log(`latest.json: ${latest.version}, ${Object.keys(latest.platforms).length} plataformas`);
}
