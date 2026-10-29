#!/usr/bin/env node
// Contraste WCAG nos dois temas: `node scripts/contraste.mjs`. Primeiro os tokens de texto da
// interface (src/styles.css), depois os do documento em cada estilo (src/markdown.css, os alertas de
// src/document.css e src/doc-styles/*.css por cima). Mínimo: 4,5:1 para texto, 3:1 para
// ícone/controle. Cor nova de texto (da interface ou de um estilo) passa por aqui antes do PR.
import { readFileSync, readdirSync } from "node:fs";

const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const tokens = (block) => Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6}(?:[0-9a-f]{2})?)\b/gi)].map((m) => [m[1], m[2]]));
const light = tokens(css.match(/:root \{([^}]*)\}/)[1]);
const dark = tokens(css.match(/:root\[data-theme="dark"\] \{([^}]*)\}/)[1]);

const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const f = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
export const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
/** Cor com opacidade sobre um fundo (ícone do ✕ da aba inativa). */
const blend = (fg, bg, alpha) =>
  "#" + [1, 3, 5].map((i) => Math.round(alpha * parseInt(fg.slice(i, i + 2), 16) + (1 - alpha) * parseInt(bg.slice(i, i + 2), 16)).toString(16).padStart(2, "0")).join("");

let bad = 0;
for (const [name, t] of [["claro", light], ["escuro", dark]]) {
  console.log(`== ${name}`);
  for (const fg of ["bar-fg", "bar-muted", "accent", "error"])
    for (const bg of ["bar-bg", "page-bg"]) {
      const r = ratio(t[fg], t[bg]);
      if (r < 4.5) bad++;
      console.log(`  ${fg} sobre ${bg}: ${r.toFixed(2)}${r < 4.5 ? "  << abaixo de 4,5" : ""}`);
    }
  // Marca de mudança (barra na margem e na barra do app): gráfico, mínimo 3:1.
  for (const bg of ["bar-bg", "page-bg"]) {
    const r = ratio(t.change, t[bg]);
    if (r < 3) bad++;
    console.log(`  change (marca) sobre ${bg}: ${r.toFixed(2)}${r < 3 ? "  << abaixo de 3" : ""}`);
  }
  const skip = ratio(t["page-bg"], t.accent);
  console.log(`  link de pulo (page-bg sobre accent): ${skip.toFixed(2)}`);
  for (const a of [0.55, 0.8]) console.log(`  ✕ da aba inativa (bar-muted a ${a} sobre bar-bg): ${ratio(blend(t["bar-muted"], t["bar-bg"], a), t["bar-bg"]).toFixed(2)}`);
}
// ---------- documento, por estilo ----------
const src = (f) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");
/** Tokens do primeiro bloco cujo seletor é exatamente `sel` (vazio se não houver). */
const blockOf = (text, sel) => {
  const i = text.indexOf(`${sel} {`);
  return i < 0 ? {} : tokens(text.slice(i + sel.length + 2, text.indexOf("}", i)));
};
/** Cor com alfa (#rrggbbaa) pintada sobre um fundo opaco. */
const over = (fg, bg) => (fg.length === 9 ? blend(fg.slice(0, 7), bg, parseInt(fg.slice(7), 16) / 255) : fg);
const base = src("markdown.css");
const doc = src("document.css");
const styleFiles = readdirSync(new URL("../src/doc-styles/", import.meta.url)).filter((f) => f.endsWith(".css")).sort();
const styles = [["github", ""], ...styleFiles.map((f) => [f.replace(/\.css$/, ""), src(`doc-styles/${f}`)])];
// Texto corrido, títulos e links sobre o papel e sobre o fundo do bloco de código (e da linha par
// da tabela); alertas sobre o papel; realce
// sobre o fundo do bloco de código (o `pre`; o `code` dentro é transparente).
const TEXT = ["md-fg", "md-muted", "md-link", "md-danger", "md-heading"];
const ALERTS = ["alert-note", "alert-tip", "alert-important", "alert-warning", "alert-caution"];
const HL = ["hl-keyword", "hl-title", "hl-constant", "hl-string", "hl-variable", "hl-comment", "hl-tag", "hl-section", "hl-bullet", "hl-subst", "hl-emphasis", "hl-strong"];
for (const [id, css] of styles) {
  for (const [name, dark] of [["claro", false], ["escuro", true]]) {
    const sel = `:root[data-style="${id}"]`;
    const t = {
      ...blockOf(base, ":root"),
      ...blockOf(doc, ":root"),
      ...(dark ? { ...blockOf(base, ':root[data-theme="dark"]'), ...blockOf(doc, ':root[data-theme="dark"]') } : {}),
      ...blockOf(css, sel),
      ...(dark ? blockOf(css, `${sel}[data-theme="dark"]`) : {}),
    };
    const pairs = [];
    for (const fg of TEXT) if (t[fg]) for (const bg of ["md-bg", "md-bg-muted"]) pairs.push([fg, bg, t[fg], t[bg]]);
    for (const fg of ALERTS) pairs.push([fg, "md-bg", t[fg], t["md-bg"]]);
    pairs.push(["md-fg", "md-code-bg (código na linha)", t["md-fg"], over(t["md-code-bg"], t["md-bg"])]);
    pairs.push(["md-fg", "md-mark-bg", t["md-fg"], over(t["md-mark-bg"], t["md-bg"])]);
    for (const fg of HL) pairs.push([fg, "md-bg-muted", t[fg], t["md-bg-muted"]]);
    pairs.push(["hl-addition", "hl-addition-bg", t["hl-addition"], t["hl-addition-bg"]]);
    pairs.push(["hl-deletion", "hl-deletion-bg", t["hl-deletion"], t["hl-deletion-bg"]]);
    const low = pairs.map(([f, b, x, y]) => [f, b, ratio(x, y)]).filter(([, , r]) => r < 4.5);
    const min = Math.min(...pairs.map(([, , x, y]) => ratio(x, y)));
    bad += low.length;
    console.log(`== documento ${id}, ${name}: ${pairs.length} pares, menor ${min.toFixed(2)}`);
    for (const [f, b, r] of low) console.log(`  ${f} sobre ${b}: ${r.toFixed(2)}  << abaixo de 4,5`);
  }
}

if (bad) {
  console.error(`${bad} combinação(ões) abaixo do mínimo`);
  process.exit(1);
}
