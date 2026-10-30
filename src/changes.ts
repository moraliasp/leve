/**
 * O que mudou desde a versão anterior do documento, nesta sessão. Cada filho de topo do HTML
 * sanitizado de `render()` vira uma chave (hash do `outerHTML`), lida antes dos pós-processos
 * (realce, Mermaid, KaTeX, `.code-wrap`), que mudam o DOM sem o documento mudar. A comparação é
 * um Myers sobre as chaves: o resultado são trechos (`Hunk`) nos índices do documento novo, que
 * são os mesmos índices de `#content.children` depois dos pós-processos (nenhum deles acrescenta
 * nem tira filho de topo; a âncora de rolagem depende da mesma coisa).
 *
 * Tudo em memória, por aba (`Snapshot`): nada vai para o disco. Decisão em `docs/decisoes.md`.
 */

/** Trecho que mudou: blocos `[start, end)` do documento novo entraram no lugar de `removed` antigos. */
export interface Hunk {
  start: number;
  end: number;
  removed: number;
}

/** Versão anterior de uma aba: caminho, chaves dos blocos e as marcas em vigor. */
export interface Snapshot {
  path: string;
  keys: readonly number[];
  hunks: Hunk[];
}

/** Acima disso a comparação desiste do detalhe e marca do primeiro ao último bloco diferente. */
const MAX_EDITS = 1000;

/** cyrb53: hash de 53 bits, sem colisão prática para blocos de um documento. */
export function hashKey(s: string): number {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/**
 * Chaves dos filhos de topo, na ordem. Texto solto entre blocos não conta (não há o que marcar).
 * Fora de `pre`/`textarea`, sequências de espaço viram um só: parágrafo reflowado (quebra de linha
 * suave em outro lugar) desenha igual e não é mudança para quem lê. `normalize` tira do HTML o que
 * muda a cada render sem o documento mudar (o nonce dos marcadores de comentário, `hidden.ts`).
 */
export function blockKeys(root: ParentNode, normalize: (html: string) => string = (h) => h): number[] {
  return Array.from(root.children, (el) => {
    const html = normalize(el.outerHTML);
    const literal = el.tagName === "PRE" || el.querySelector("pre, textarea") !== null;
    return hashKey(literal ? html : html.replace(/\s+/g, " "));
  });
}

/**
 * Trechos de `next` que não estão em `prev`, por diferença mínima (Myers). Prefixo e sufixo iguais
 * saem antes; acima de `maxEdits` edições, o meio inteiro vira um trecho só.
 */
export function diffBlocks<K>(prev: readonly K[], next: readonly K[], maxEdits = MAX_EDITS): Hunk[] {
  let head = 0;
  while (head < prev.length && head < next.length && prev[head] === next[head]) head++;
  let tail = 0;
  while (tail < prev.length - head && tail < next.length - head && prev[prev.length - 1 - tail] === next[next.length - 1 - tail]) tail++;
  const a = prev.slice(head, prev.length - tail);
  const b = next.slice(head, next.length - tail);
  if (a.length === 0 && b.length === 0) return [];
  const pairs = matches(a, b, maxEdits);
  if (!pairs) return [{ start: head, end: head + b.length, removed: a.length }];
  const out: Hunk[] = [];
  let i = 0;
  let j = 0;
  for (const [x, y] of [...pairs, [a.length, b.length] as const]) {
    if (x > i || y > j) out.push({ start: head + j, end: head + y, removed: x - i });
    i = x + 1;
    j = y + 1;
  }
  return out;
}

/** Pares `[i, j]` com `a[i] === b[j]` de uma subsequência comum máxima, ou `null` acima do limite. */
function matches<K>(a: readonly K[], b: readonly K[], maxEdits: number): [number, number][] | null {
  const n = a.length;
  const m = b.length;
  const limit = Math.min(n + m, maxEdits);
  const off = limit + 1;
  const v = new Int32Array(2 * limit + 3);
  // trace[d]: `v` no fim do passo d-1, só a janela [-d-1, d+1] (O(D²) em memória, não O(D·N)).
  const trace: Int32Array[] = [];
  for (let d = 0; d <= limit; d++) {
    trace.push(v.slice(off - d - 1, off + d + 2));
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]) ? v[off + k + 1] : v[off + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[off + k] = x;
      if (x >= n && y >= m) return backtrack(trace, d, n, m);
    }
  }
  return null;
}

function backtrack(trace: Int32Array[], dEnd: number, n: number, m: number): [number, number][] {
  const out: [number, number][] = [];
  let x = n;
  let y = m;
  for (let d = dEnd; d > 0; d--) {
    const w = trace[d];
    const at = (k: number): number => w[k + d + 1];
    const k = x - y;
    const prevK = k === -d || (k !== d && at(k - 1) < at(k + 1)) ? k + 1 : k - 1;
    const px = at(prevK);
    const py = px - prevK;
    // Diagonal até o fim do passo anterior + uma edição (inserção se veio de k+1, remoção se de k-1).
    const sx = prevK === k + 1 ? px : px + 1;
    while (x > sx) out.push([--x, --y]);
    x = px;
    y = py;
  }
  while (x > 0 && y > 0) out.push([--x, --y]);
  return out.reverse();
}

/**
 * Próxima versão da aba. Mesmo arquivo: compara com a anterior; sem diferença, as marcas que
 * havia ficam (recarga sem mudança, troca de aba). Outro arquivo ou primeira leitura: sem marcas.
 */
export function track(prev: Snapshot | undefined, path: string, keys: readonly number[]): Snapshot {
  if (!prev || prev.path !== path) return { path, keys, hunks: [] };
  const hunks = diffBlocks(prev.keys, keys);
  return { path, keys, hunks: hunks.length ? hunks : prev.hunks };
}

/** Índice do bloco que representa o trecho: o primeiro novo; remoção pura, o vizinho (ou nada). */
export function hunkTarget(h: Hunk, count: number): number | null {
  if (h.end > h.start) return h.start;
  if (count === 0) return null;
  return Math.min(h.start, count - 1);
}

/**
 * Próximo (`dir` 1) ou anterior (-1) trecho a partir do topo da área visível, em volta: depois do
 * último vem o primeiro. `tops` em ordem crescente; o trecho já no topo (até `slack` px) não conta.
 */
export function stepChange(tops: readonly number[], viewTop: number, dir: 1 | -1, slack = 4): number {
  if (tops.length === 0) return -1;
  if (dir === 1) {
    const i = tops.findIndex((t) => t > viewTop + slack);
    return i === -1 ? 0 : i;
  }
  for (let i = tops.length - 1; i >= 0; i--) if (tops[i] < viewTop - slack) return i;
  return tops.length - 1;
}

const CHANGE_ATTR = "data-change";

/**
 * Marca os blocos de `root.children`: `changed` nos que entraram ou mudaram; remoção pura marca
 * a fronteira no vizinho (`removed-before` no bloco seguinte, `removed-after` no último).
 * Atributo só, sem elemento novo: a âncora de rolagem e a busca não veem as marcas, e o clone do
 * Exportar/Copiar tira o atributo (`UI_ATTRS` em `export.ts`).
 */
export function markChanges(root: Element, hunks: readonly Hunk[]): HTMLElement[] {
  clearMarks(root);
  const kids = root.children;
  const targets: HTMLElement[] = [];
  for (const h of hunks) {
    for (let i = h.start; i < h.end && i < kids.length; i++) kids[i].setAttribute(CHANGE_ATTR, "changed");
    const t = hunkTarget(h, kids.length);
    if (t === null || t >= kids.length) continue;
    const el = kids[t] as HTMLElement;
    if (h.end === h.start && !el.hasAttribute(CHANGE_ATTR)) el.setAttribute(CHANGE_ATTR, t < h.start ? "removed-after" : "removed-before");
    targets.push(el);
  }
  return targets;
}

function clearMarks(root: Element): void {
  for (const el of root.querySelectorAll(`[${CHANGE_ATTR}]`)) el.removeAttribute(CHANGE_ATTR);
}
