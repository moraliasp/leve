#!/usr/bin/env node
// Comparativo de tamanho do README. Uma fonte só: `docs/comparativo.json` guarda os assets publicados
// (nome e `size` da API de Releases, sem baixar binário) e daqui saem os SVGs de `docs/img/` e o trecho
// entre marcadores nos dois READMEs. `pnpm comparativo` regenera; `pnpm comparativo --buscar` antes
// atualiza o JSON pela API (`gh`). Decisão em docs/decisoes.md.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const PLATAFORMAS = ["macos", "windows", "linux"];
export const TEMAS = ["light", "dark"];
export const INICIO = "<!-- comparativo:inicio (gerado por `pnpm comparativo`, não editar) -->";
export const FIM = "<!-- comparativo:fim -->";

/** Superfícies do GitHub só para conferir contraste; o SVG tem fundo transparente. */
export const CORES = {
  light: { tinta: "#1f2328", suave: "#59636e", eixo: "#d1d9e0", barra: "#818b98", marca: "#431a60", superficies: ["#ffffff", "#f6f8fa"] },
  dark: { tinta: "#f0f6fc", suave: "#9198a1", eixo: "#3d444d", barra: "#737b86", marca: "#c9a6f2", superficies: ["#0d1117", "#212830"] },
};

const TEXTO = {
  en: {
    arquivo: "README.md",
    decimal: ".",
    nomes: { macos: "macOS", windows: "Windows", linux: "Linux (x86_64)" },
    regra: (data) => `Smallest installer of each app, latest GitHub release, ${data}`,
    alt: (p) => `${p}, smallest installer of each app:`,
    portatil: "portable .exe",
    celulaPortatil: (arquivo) => `portable \`${arquivo}\``,
    semInstalador: ", no installer",
    arquitetura: { universal: "universal", silicon: "Apple silicon", intel: "Intel", x64: "x64", naoInformada: "not stated" },
    resumo: "Every format, version and link",
    colunas: ["App", "Release", "macOS", "Windows", "Linux (x86_64)"],
    abertura:
      "Download size of the smallest installer each Markdown viewer publishes on GitHub, one chart per platform. The scale is linear and each chart has its own.",
    metodo: (data) =>
      `Asset \`size\` from the GitHub Releases API, \`releases/latest\`, queried ${data}; MB = 10⁶ bytes. Installers are \`.dmg\`, \`.msi\`, \`.exe\`, \`.deb\`, \`.rpm\`, AppImage and Flatpak, for x64 on Windows and Linux; archives (\`.zip\`, \`.tar.gz\`) and update-only packages don't count. Architecture is as stated in each asset name; that Tinta's \`tinta.exe\` is portable, with no installer, comes from its README. A universal macOS build carries code for both Apple silicon and Intel, so it is larger than a single-architecture build of the same app. On Linux, an AppImage carries WebKitGTK and the rest of the GUI stack inside it, while a \`.deb\` or \`.rpm\` uses the system's libraries; compare like with like.`,
  },
  "pt-BR": {
    arquivo: "README.pt-BR.md",
    decimal: ",",
    nomes: { macos: "macOS", windows: "Windows", linux: "Linux (x86_64)" },
    regra: (data) => `Menor instalador de cada app, última release no GitHub, ${data}`,
    alt: (p) => `${p}, menor instalador de cada app:`,
    portatil: ".exe portátil",
    celulaPortatil: (arquivo) => `\`${arquivo}\` portátil`,
    semInstalador: ", sem instalador",
    arquitetura: { universal: "universal", silicon: "Apple silicon", intel: "Intel", x64: "x64", naoInformada: "não informada" },
    resumo: "Todos os formatos, versões e links",
    colunas: ["App", "Release", "macOS", "Windows", "Linux (x86_64)"],
    abertura:
      "Tamanho do download do menor instalador que cada visualizador de Markdown publica no GitHub, um gráfico por plataforma. A escala é linear e cada gráfico tem a sua.",
    metodo: (data) =>
      `Campo \`size\` dos assets na API de Releases do GitHub, \`releases/latest\`, consultada em ${data}; MB = 10⁶ bytes. Contam como instalador \`.dmg\`, \`.msi\`, \`.exe\`, \`.deb\`, \`.rpm\`, AppImage e Flatpak, para x64 no Windows e no Linux; arquivos compactados (\`.zip\`, \`.tar.gz\`) e pacotes só de atualização ficam de fora. A arquitetura é a que consta no nome de cada asset; que o \`tinta.exe\` do Tinta é portátil, sem instalador, vem do README do projeto. Um build universal do macOS leva código para Apple silicon e Intel, então é maior que um build de uma arquitetura só do mesmo app. No Linux, o AppImage leva o WebKitGTK e o resto da pilha gráfica dentro dele, enquanto \`.deb\` e \`.rpm\` usam as bibliotecas do sistema; compare formato com formato.`,
  },
};
export const IDIOMAS = Object.keys(TEXTO);

/** Portátil pelo nome, ou porque o README do projeto diz (o `tinta.exe` não traz a palavra). */
const PORTATIL = /portable|^tinta\.exe$/i;
/** Asset que não é o app: pacote só de atualização e o runtime do WebView2 que o MD Reader publica junto. */
const NAO_E_O_APP = /[-_.]update\.|webview2/i;

function arquitetura(nome) {
  if (/universal/i.test(nome)) return "universal";
  if (/arm64|aarch64/i.test(nome)) return "silicon";
  if (/x64|x86_64|amd64|intel/i.test(nome)) return "x64";
  return "naoInformada";
}

/** Diz o que um asset é, pelo nome; `null` se não for instalador da comparação. */
export function classificar(nome) {
  if (NAO_E_O_APP.test(nome)) return null;
  const arq = arquitetura(nome);
  if (/\.dmg$/i.test(nome)) return { plataforma: "macos", formato: ".dmg", arq: arq === "x64" ? "intel" : arq };
  const pc = /\.(msi|exe|deb|rpm|appimage|flatpak)$/i.exec(nome)?.[1].toLowerCase();
  if (!pc || arq === "silicon") return null; // ARM fica de fora no PC: a comparação é x64
  if (pc === "msi") return { plataforma: "windows", formato: ".msi", arq };
  if (pc === "exe") {
    if (PORTATIL.test(nome)) return { plataforma: "windows", formato: "portatil", arq };
    return { plataforma: "windows", formato: /setup/i.test(nome) ? "setup.exe" : ".exe", arq };
  }
  return { plataforma: "linux", formato: pc === "appimage" ? "AppImage" : `.${pc}`, arq };
}

/** Instaladores de um app numa plataforma, do menor para o maior. */
export function instaladores(app, plataforma) {
  return app.assets
    .map((a) => ({ ...a, ...classificar(a.nome) }))
    .filter((a) => a.plataforma === plataforma)
    .sort((a, b) => a.bytes - b.bytes);
}

/** Uma barra por app que publica na plataforma, do menor para o maior instalador. */
export function barras(dados, plataforma) {
  return dados.apps
    .flatMap((app) => {
      const menor = instaladores(app, plataforma)[0];
      return menor ? [{ nome: app.nome, repo: app.repo, bytes: menor.bytes, formato: menor.formato }] : [];
    })
    .sort((a, b) => a.bytes - b.bytes);
}

export function mb(bytes, idioma) {
  return `${(bytes / 1e6).toFixed(1).replace(".", TEXTO[idioma].decimal)} MB`;
}

const rotuloFormato = (formato, idioma) => (formato === "portatil" ? TEXTO[idioma].portatil : formato);
const escapar = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const LARGURA = 560;
const FONTES = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif";
const CORPO = 17;
const MIUDO = 15;
const LINHA = 30;
const TOPO = 72; // título + regra
const X_BARRA = 158; // cabe "Markdown Preview" no corpo 17
const ALTURA_BARRA = 14;
const RAIO = 4;
const VAO = 8;
const BARRA_MINIMA = 2; // o valor está escrito; abaixo disso a barra sumiria

// Sem fonte para medir no Node: largura estimada por cima, para a ponta nunca cortar em nenhuma pilha.
const larguraTexto = (s, fonte) => s.length * fonte * 0.6;

/** Maior comprimento de barra em que todo rótulo ainda cabe à direita da ponta da sua barra. */
export function comprimentoMaximo(linhas, largura = LARGURA, xBarra = X_BARRA) {
  const maior = Math.max(...linhas.map((l) => l.bytes));
  return Math.floor(Math.min(...linhas.map((l) => (largura - xBarra - VAO - l.rotulo) / (l.bytes / maior))));
}

/** Retângulo com as pontas de dado arredondadas e a base reta no eixo. */
function barra(x, y, w, h, fill) {
  const r = Math.min(RAIO, w);
  const reto = Math.round((w - r) * 10) / 10;
  return `<path d="M${x} ${y}h${reto}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}h${-reto}z" fill="${fill}"/>`;
}

export function grafico(dados, plataforma, idioma, tema) {
  const t = TEXTO[idioma];
  const c = CORES[tema];
  const linhas = barras(dados, plataforma).map((b) => {
    const valor = mb(b.bytes, idioma);
    const formato = rotuloFormato(b.formato, idioma);
    return { ...b, valor, formatoRotulo: formato, rotulo: larguraTexto(valor, CORPO) + 8 + larguraTexto(formato, MIUDO) };
  });
  const maior = Math.max(...linhas.map((l) => l.bytes));
  const comprimento = comprimentoMaximo(linhas);
  const altura = TOPO + linhas.length * LINHA + 6;
  const titulo = t.nomes[plataforma];

  const corpo = linhas.map((l, i) => {
    const destaque = l.nome === "Leve";
    const y = TOPO + i * LINHA;
    const meio = y + LINHA / 2;
    const w = Math.max(BARRA_MINIMA, Math.round((l.bytes / maior) * comprimento * 10) / 10);
    const peso = destaque ? ' font-weight="700"' : "";
    return [
      `<text x="0" y="${meio + 6}" font-size="${CORPO}"${peso} fill="${c.tinta}">${escapar(l.nome)}</text>`,
      barra(X_BARRA, meio - ALTURA_BARRA / 2, w, ALTURA_BARRA, destaque ? c.marca : c.barra),
      `<text x="${X_BARRA + w + VAO}" y="${meio + 6}" font-size="${CORPO}"${peso} fill="${c.tinta}">${l.valor}<tspan dx="8" font-size="${MIUDO}" font-weight="400" fill="${c.suave}">${escapar(l.formatoRotulo)}</tspan></text>`,
    ].join("\n  ");
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${LARGURA}" height="${altura}" viewBox="0 0 ${LARGURA} ${altura}" role="img" aria-label="${escapar(textoAlternativo(dados, plataforma, idioma))}" font-family="${FONTES}">
  <!-- Gerado por scripts/comparativo.mjs a partir de docs/comparativo.json. Não editar. -->
  <text x="0" y="24" font-size="22" font-weight="700" fill="${c.tinta}">${escapar(titulo)}</text>
  <text x="0" y="50" font-size="${MIUDO}" fill="${c.suave}">${escapar(t.regra(dados.consultado))}</text>
  <path d="M${X_BARRA - 0.5} ${TOPO + 2}V${altura - 6}" stroke="${c.eixo}" fill="none"/>
  ${corpo.join("\n  ")}
</svg>
`;
}

export function textoAlternativo(dados, plataforma, idioma) {
  const t = TEXTO[idioma];
  const itens = barras(dados, plataforma).map((b) => `${b.nome} ${mb(b.bytes, idioma)} (${rotuloFormato(b.formato, idioma)})`);
  return `${t.alt(t.nomes[plataforma])} ${itens.join(", ")}.`;
}

export const caminhoGrafico = (plataforma, idioma, tema) => `docs/img/tamanho-${plataforma}-${idioma}-${tema}.svg`;

function celula(app, plataforma, idioma) {
  const t = TEXTO[idioma];
  const lista = instaladores(app, plataforma);
  if (!lista.length) return "—";
  const rotulo = (a) => {
    if (a.formato !== "portatil") return `${mb(a.bytes, idioma)} ${a.formato === "AppImage" ? a.formato : `\`${a.formato}\``}`;
    const semInstalador = !/portable/i.test(a.nome); // só o README do projeto diz que é portátil
    return `${mb(a.bytes, idioma)} ${t.celulaPortatil(semInstalador ? a.nome : ".exe")}${semInstalador ? t.semInstalador : ""}`;
  };
  if (plataforma === "linux") return lista.map(rotulo).join(" · ");
  const arqs = new Set(lista.map((a) => a.arq));
  if (arqs.size === 1) return `${lista.map(rotulo).join(" · ")} (${t.arquitetura[lista[0].arq]})`;
  return lista.map((a) => `${rotulo(a)} (${t.arquitetura[a.arq]})`).join(" · ");
}

export function tabela(dados, idioma) {
  const t = TEXTO[idioma];
  const menor = (app) => Math.min(...app.assets.filter((a) => classificar(a.nome)).map((a) => a.bytes));
  const linhas = [...dados.apps].sort((a, b) => menor(a) - menor(b)).map((app) => {
    const nome = app.nome === "Leve" ? "**Leve**" : `[${app.nome}](https://github.com/${app.repo})`;
    return `| ${nome} | ${app.versao} (${app.publicado}) | ${PLATAFORMAS.map((p) => celula(app, p, idioma)).join(" | ")} |`;
  });
  return [`| ${t.colunas.join(" | ")} |`, "|---|---|--:|--:|--:|", ...linhas].join("\n");
}

/** O trecho entre marcadores: abertura, um `<picture>` por plataforma e a tabela recolhida. */
export function secao(dados, idioma) {
  const t = TEXTO[idioma];
  const figuras = PLATAFORMAS.map(
    (p) => `<p><picture>
  <source media="(prefers-color-scheme: dark)" srcset="${caminhoGrafico(p, idioma, "dark")}">
  <img alt="${escapar(textoAlternativo(dados, p, idioma))}" src="${caminhoGrafico(p, idioma, "light")}">
</picture></p>`,
  );
  return [
    INICIO,
    t.abertura,
    ...figuras,
    `<details>\n<summary>${t.resumo}</summary>`,
    t.metodo(dados.consultado),
    tabela(dados, idioma),
    "</details>",
    FIM,
  ].join("\n\n");
}

/** Troca o trecho entre marcadores. Erro se faltar marcador: gerar nada passaria calado. */
export function trocarSecao(readme, novo) {
  const ini = readme.indexOf(INICIO);
  const fim = readme.indexOf(FIM);
  if (ini < 0 || fim < ini) throw new Error("README sem os marcadores do comparativo");
  return readme.slice(0, ini) + novo + readme.slice(fim + FIM.length);
}

/** Todos os arquivos gerados, caminho relativo à raiz → conteúdo. */
export function gerar(dados, lerReadme) {
  const saida = {};
  for (const idioma of IDIOMAS) {
    for (const p of PLATAFORMAS) for (const tema of TEMAS) saida[caminhoGrafico(p, idioma, tema)] = grafico(dados, p, idioma, tema);
    saida[TEXTO[idioma].arquivo] = trocarSecao(lerReadme(TEXTO[idioma].arquivo), secao(dados, idioma));
  }
  return saida;
}

function buscar(dados) {
  const hoje = new Date();
  const dois = (n) => String(n).padStart(2, "0");
  return {
    consultado: `${hoje.getFullYear()}-${dois(hoje.getMonth() + 1)}-${dois(hoje.getDate())}`,
    apps: dados.apps.map((app) => {
      const r = JSON.parse(execFileSync("gh", ["api", `repos/${app.repo}/releases/latest`], { encoding: "utf8", maxBuffer: 1 << 24 }));
      const assets = r.assets.filter((a) => classificar(a.name)).map((a) => ({ nome: a.name, bytes: a.size }));
      if (!assets.length) throw new Error(`${app.repo} ${r.tag_name} sem instalador reconhecido: confira o nome dos assets`);
      return { ...app, versao: r.tag_name, publicado: r.published_at.slice(0, 10), assets };
    }),
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const raiz = fileURLToPath(new URL("..", import.meta.url));
  const caminhoDados = join(raiz, "docs/comparativo.json");
  let dados = JSON.parse(readFileSync(caminhoDados, "utf8"));
  if (process.argv.includes("--buscar")) {
    dados = buscar(dados);
    writeFileSync(caminhoDados, `${JSON.stringify(dados, null, 2)}\n`);
  }
  const saida = gerar(dados, (arquivo) => readFileSync(join(raiz, arquivo), "utf8"));
  for (const [arquivo, conteudo] of Object.entries(saida)) writeFileSync(join(raiz, arquivo), conteudo);
  console.log(`Comparativo de ${dados.consultado}: ${Object.keys(saida).length} arquivos gerados.`);
}
