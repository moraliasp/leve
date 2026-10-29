#!/usr/bin/env node
// Notas da release a partir da seção da versão no CHANGELOG.md:
//   node scripts/release-notes.mjs <tag> <saída>   grava as notas e sai 1 se a versão não tiver seção
// Usado pelo release.yml ao criar o rascunho, para a página da release explicar cada mudança como o
// CHANGELOG, e não só listar títulos de PR. A tag `vX.Y.Z-rc.N` usa a seção de X.Y.Z.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** `v0.4.0-rc.1` → `0.4.0`. */
export function versionOfTag(tag) {
  return tag.replace(/^v/, "").replace(/-.*$/, "");
}

/**
 * Corpo da seção `## [version]` do CHANGELOG (sem o título), seguido do link de comparação da
 * referência `[version]: url` no rodapé, se houver. null se a seção não existir ou estiver vazia.
 */
export function releaseNotes(changelog, version) {
  const lines = changelog.split(/\r?\n/);
  const esc = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const start = lines.findIndex((l) => new RegExp(`^## \\[${esc}\\]`).test(l));
  if (start < 0) return null;
  let end = start + 1;
  while (end < lines.length && !/^## /.test(lines[end]) && !/^\[[^\]]+\]:\s/.test(lines[end])) end++;
  const body = lines.slice(start + 1, end).join("\n").trim();
  if (!body) return null;
  const ref = new RegExp(`^\\[${esc}\\]:\\s*(\\S+)`, "m").exec(changelog);
  return ref ? `${body}\n\n**Full changelog:** ${ref[1]}\n` : `${body}\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [tag, out] = process.argv.slice(2);
  if (!tag || !out) {
    console.error("uso: node scripts/release-notes.mjs <tag> <saída>");
    process.exit(2);
  }
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const version = versionOfTag(tag);
  const notes = releaseNotes(readFileSync(join(root, "CHANGELOG.md"), "utf8"), version);
  if (!notes) {
    console.error(`CHANGELOG.md não tem seção "## [${version}]" com conteúdo.`);
    process.exit(1);
  }
  writeFileSync(out, notes);
  console.log(notes);
}
