#!/usr/bin/env node
// Contraste WCAG dos tokens de texto de src/styles.css nos dois temas: `node scripts/contraste.mjs`.
// Mínimo: 4,5:1 para texto, 3:1 para ícone/controle. Cor nova de texto passa por aqui antes do PR.
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const tokens = (block) => Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]));
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
if (bad) {
  console.error(`${bad} combinação(ões) abaixo do mínimo`);
  process.exit(1);
}
