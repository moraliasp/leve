import YAML from "yaml";

/**
 * Conteúdo remoto bloqueado por padrão (privacidade): nada é buscado na rede só por abrir um
 * documento. O hook roda dentro do DOMPurify, antes de o HTML entrar na página, então o
 * WebView nunca chega a pedir o recurso. O original fica em `data-remote-<atributo>` e volta
 * se o leitor clicar em "Carregar imagens remotas".
 */

/**
 * Base fictícia de esquema "especial" (http): faz `new URL` normalizar como o navegador faz no pior
 * caso — tira tab/quebra de linha e controles das pontas, trata `\` como `/`. Assim `\\host`,
 * `ht<tab>tps://host` e `/\host` resolvem para fora desta origem e contam como remotos.
 */
const LOCAL_BASE = "http://leve.invalid/";
const LOCAL_ORIGIN = new URL(LOCAL_BASE).origin;
/** Esquemas que nunca vão à rede. Qualquer outro é tratado como remoto (allowlist, não blacklist). */
const LOCAL_SCHEMES = new Set(["data:", "blob:", "asset:", "file:", "about:", "tauri:", "mailto:", "tel:"]);

/** Verdadeiro se o navegador buscaria a URL fora da máquina. URL inválida não é buscada: não é remota. */
export function isRemote(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw, LOCAL_BASE);
  } catch {
    return false;
  }
  return u.origin !== LOCAL_ORIGIN && !LOCAL_SCHEMES.has(u.protocol);
}

/** Atributos que fazem o navegador buscar algo sozinho. `href` só conta fora de link. */
const FETCH_ATTRS = new Set(["src", "srcset", "poster", "background", "href", "xlink:href"]);
const LINK_TAGS = new Set(["a", "area"]);

function srcsetIsRemote(v: string): boolean {
  return v.split(",").some((c) => isRemote(c.trim().split(/\s+/)[0] ?? ""));
}

/**
 * CSS em `style` ou em atributo de apresentação SVG (`fill="url(…)"`). Escape (`\`) pode esconder
 * qualquer URL, então bloqueia. Senão confere cada `url(…)` e cada string (`image-set("…")`).
 */
const CSS_URL = /url\(\s*(?:(['"])(.*?)(?:\1|$)|([^)\s]*))/gis;
const CSS_STRING = /(['"])(.*?)(?:\1|$)/gs;
function cssIsRemote(v: string): boolean {
  if (v.includes("\\")) return true;
  for (const m of v.matchAll(CSS_URL)) if (isRemote(m[2] ?? m[3] ?? "")) return true;
  if (/image-set|image\(|src\(/i.test(v)) for (const m of v.matchAll(CSS_STRING)) if (isRemote(m[2])) return true;
  return false;
}

/** Tira de um elemento sanitizado tudo que buscaria um recurso remoto. */
export function stripRemote(el: Element): void {
  let blocked = false;
  const isLink = LINK_TAGS.has(el.tagName.toLowerCase());
  // `data-remote*` só nasce aqui. Vindo do documento é forjado (`data-remote-onerror`…) e
  // `restoreRemote` o promoveria a atributo real: sai antes de qualquer coisa.
  for (const attr of Array.from(el.attributes)) if (attr.name.startsWith("data-remote")) el.removeAttribute(attr.name);
  for (const attr of Array.from(el.attributes)) {
    const { name, value } = attr;
    let remote: boolean;
    if (FETCH_ATTRS.has(name)) {
      if (isLink && (name === "href" || name === "xlink:href")) continue;
      remote = name === "srcset" ? srcsetIsRemote(value) : isRemote(value);
    } else if (name === "style" || /url\s*\(/i.test(value)) {
      remote = cssIsRemote(value);
    } else continue;
    if (!remote) continue;
    el.setAttribute(`data-remote-${name.replace(":", "-")}`, value);
    el.removeAttribute(name);
    blocked = true;
  }
  if (blocked) el.setAttribute("data-remote", "");
}

/** Host para mostrar ao leitor ("tauri.app"), ou a própria URL se não der para ler. */
export function remoteHost(url: string): string {
  try {
    return new URL(url.trim().startsWith("//") ? `https:${url.trim()}` : url.trim()).host || url;
  } catch {
    return url;
  }
}

/** Devolve os atributos guardados ao elemento (carregar a pedido). */
export function restoreRemote(el: Element): void {
  for (const attr of Array.from(el.attributes)) {
    if (!attr.name.startsWith("data-remote-")) continue;
    const original = attr.name.slice("data-remote-".length).replace(/^xlink-/, "xlink:");
    el.setAttribute(original, attr.value);
    el.removeAttribute(attr.name);
  }
  el.removeAttribute("data-remote");
}

/**
 * Limpa CSS que não passou pelo DOMPurify (`<style>` do Mermaid e os `style`/`classDef` na fonte
 * dos diagramas): `url(…)` remoto, ou com escape (`\`), ou sem fechar, vira `none`; `@import`
 * remoto sai; `image-set()`/`image()`/`src()` com string remota viram `none`. Mesmas regras de
 * `cssIsRemote`, só que trocando em vez de descartar o atributo inteiro.
 */
const CSS_URL_FULL = /url\(\s*(?:(['"])(.*?)\1|([^)]*?))\s*(?:\)|$)/gis;
const CSS_IMPORT = /@import\s+(?:url\([^)]*\)|(['"])(.*?)\1)[^;]*;?/gis;
const CSS_IMAGE_FN = /\b(?:image-set|image|src)\(([^)]*)\)/gis;
const badUrl = (v: string): boolean => v.includes("\\") || isRemote(v);
export function scrubCss(css: string): { css: string; blocked: number } {
  let blocked = 0;
  let out = css.replace(CSS_IMPORT, (m, _q, quoted) => {
    const v = quoted ?? (m.match(/url\(\s*['"]?([^'")]*)/i)?.[1] ?? "");
    if (!badUrl(v)) return m;
    blocked++;
    return "";
  });
  out = out.replace(CSS_IMAGE_FN, (m, inner: string) => {
    for (const str of inner.matchAll(CSS_STRING)) if (badUrl(str[2])) {
      blocked++;
      return "none";
    }
    return m;
  });
  out = out.replace(CSS_URL_FULL, (m, _q, quoted, bare) => {
    if (!badUrl(quoted ?? bare ?? "")) return m;
    blocked++;
    return "none";
  });
  return { css: out, blocked };
}

/**
 * Aplica a política a uma árvore que entrou na página sem passar pelo `render()` (SVG do Mermaid):
 * atributos como no hook do DOMPurify, e o CSS dos `<style>` limpo de `url()` remoto.
 * Devolve quantos recursos foram bloqueados.
 */
export function stripRemoteTree(root: Element): number {
  let blocked = 0;
  for (const el of [root, ...root.querySelectorAll("*")]) {
    if (el.tagName.toLowerCase() === "style") {
      const r = scrubCss(el.textContent ?? "");
      if (r.blocked > 0) el.textContent = r.css;
      blocked += r.blocked;
      continue;
    }
    stripRemote(el);
    if (el.hasAttribute("data-remote")) blocked++;
  }
  return blocked;
}

/**
 * Fonte de um diagrama Mermaid, antes do render: ele busca recursos ao desenhar, antes de existir
 * SVG para limpar. Dois lugares: (1) dados do nó `A@{ … }`, que o Mermaid lê como YAML, então a
 * chave `img` pode vir com aspas, escapes (`"\x68ttp…"`) ou bloco; aqui o mesmo parser decide, e
 * `img` remoto é esvaziado e todo bloco volta reescrito em YAML de fluxo (bloco ilegível sai
 * inteiro, fechado por padrão); (2) `style`/`classDef` com
 * `url(…)` (CSS inline que o Mermaid aplica ao desenhar), limpos por `scrubCss`. O CSS do tema
 * (`themeCSS`, `fontFamily`) fica fora das diretivas pela lista `secure` (render.ts).
 */
/**
 * Fim do bloco `@{ … }` como o lexer do Mermaid vê: `}` dentro de aspas duplas não fecha, e a aspa
 * não tem escape (`\"` termina a string lá também). Devolve o índice do `}` ou -1 se não fecha.
 */
function shapeDataEnd(src: string, from: number): number {
  let quoted = false;
  for (let i = from; i < src.length; i++) {
    const c = src[i];
    if (c === '"') quoted = !quoted;
    else if (c === "}" && !quoted) return i;
  }
  return -1;
}
function parseShapeData(inner: string): Record<string, unknown> | null {
  for (const text of [inner, `{${inner}}`]) {
    try {
      const v: unknown = YAML.parse(text);
      if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
    } catch {
      /* tenta a outra forma */
    }
  }
  return null;
}
export function scrubMermaidSource(src: string): { src: string; blocked: number } {
  let blocked = 0;
  let out = "";
  let pos = 0;
  // Todo `@{` é tratado como dados de nó, mesmo dentro de `"…"` ou de comentário `%%`: se este
  // scanner e o lexer do Mermaid discordassem sobre o que é string, um bloco escaparia. Um `@{` em
  // rótulo legítimo sai reescrito (e o diagrama pode falhar com erro visível), nunca sem limpeza.
  for (let i = src.indexOf("@{"); i >= 0; i = src.indexOf("@{", i)) {
    out += src.slice(pos, i);
    const end = shapeDataEnd(src, i + 2);
    // Bloco que não fecha ou que o YAML não entende sai inteiro: o que não dá para ler não dá para
    // limpar, e o Mermaid lê com o mesmo YAML.
    if (end < 0) {
      blocked++;
      pos = src.length;
      break;
    }
    const data = parseShapeData(src.slice(i + 2, end));
    pos = end + 1;
    i = pos;
    if (!data) {
      blocked++;
      continue;
    }
    // `img` só como string local: lista/objeto viram string no `new Image().src` do Mermaid.
    if ("img" in data && (typeof data.img !== "string" || badUrl(data.img))) {
      blocked++;
      data.img = "";
    }
    out += `@${JSON.stringify(data)}`;
  }
  out += src.slice(pos);
  const css = scrubCss(out);
  out = css.css;
  blocked += css.blocked;
  return { src: out, blocked };
}
