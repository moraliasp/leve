#!/usr/bin/env node
// Versão da release mais recente do metainfo do Flatpak (o primeiro <release> de <releases>):
//   node scripts/metainfo.mjs   imprime a versão e sai 1 se ela não for a do app (scripts/version.mjs)
// Usado por scripts/flatpak-build.sh e por tests/version.test.ts, para a página do app (GNOME
// Software, KDE Discover) nunca mostrar versão velha; `addRelease` é chamado pelo `pnpm version:set`.
// Ver docs/decisoes.md, "Flatpak a partir do fonte".
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
// Ciclo com version.mjs (que usa addRelease): ESM resolve, porque nenhum dos dois chama o outro ao carregar.
import { current } from "./version.mjs";

export const METAINFO = "packaging/flatpak/br.com.moralia.leve.metainfo.xml";

/** `version` do primeiro `<release>`, com os atributos em qualquer ordem; null se não houver. */
export function latestRelease(xml) {
  const tag = /<release\b[^>]*>/.exec(xml.replace(/<!--[\s\S]*?-->/g, ""));
  if (!tag) return null;
  const v = /\sversion\s*=\s*(["'])([^"']*)\1/.exec(tag[0]);
  return v ? v[2] : null;
}

/**
 * Põe `<release version date>` (com o link das notas da tag) no topo de `<releases>`. Se a versão
 * já é a mais recente, devolve o XML igual: rodar `version:set` duas vezes não duplica.
 */
export function addRelease(xml, version, date) {
  if (latestRelease(xml) === version) return xml;
  const m = /^([ \t]*)<releases>[ \t]*\r?\n/m.exec(xml);
  if (!m) throw new Error("metainfo sem <releases>");
  const i = m[1];
  const nl = m[0].endsWith("\r\n") ? "\r\n" : "\n";
  const entry =
    `${i}  <release version="${version}" date="${date}">${nl}` +
    `${i}    <url type="details">https://github.com/moraliasp/leve/releases/tag/v${version}</url>${nl}` +
    `${i}  </release>${nl}`;
  const at = m.index + m[0].length;
  return xml.slice(0, at) + entry + xml.slice(at);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const top = latestRelease(readFileSync(join(root, METAINFO), "utf8"));
  const app = current(root)["package.json"].replace(/-.*$/, "");
  console.log(top ?? "(nenhuma)");
  if (top !== app) {
    console.error(
      `::error::${METAINFO} tem ${top ?? "nenhuma release"} como release mais recente, e o app está em ${app}. ` +
        `Acrescente <release version="${app}" date="AAAA-MM-DD"> no topo de <releases>.`,
    );
    process.exit(1);
  }
}
