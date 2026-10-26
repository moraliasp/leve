import DOMPurify from "dompurify";

/**
 * Realce de código fora do caminho crítico. O render só marca `<code class="language-x">` com o
 * texto escapado; aqui o highlight.js é importado sob demanda (só se houver bloco com linguagem) e
 * os blocos são realçados em fatias de poucos milissegundos, a começar pelos mais perto da posição
 * atual de rolagem. Documento grande abre sem pagar o realce de mil blocos, a interface não trava,
 * e documento sem código nem carrega o highlight.js.
 *
 * Fila com `setTimeout` em vez de IntersectionObserver: o observador só dispara quando a página é
 * desenhada, e janela oculta ou em segundo plano ficaria sem realce.
 *
 * O realce troca os nós de texto do bloco. `onHighlighted` avisa quem guarda referência a eles
 * (a busca recalcula os resultados). A altura não muda: mesmo texto, mesma fonte.
 */

type Hljs = typeof import("highlight.js/lib/common").default;

let hljsPromise: Promise<Hljs> | null = null;
/** Muda a cada documento: a fila do anterior para sozinha ao ver que ficou velha. */
let generation = 0;

const loadHljs = (): Promise<Hljs> => (hljsPromise ??= import("highlight.js/lib/common").then((m) => m.default));

/** Tempo máximo de cada fatia, em ms. Abaixo de um quadro, para a rolagem seguir lisa. */
const SLICE_MS = 8;
/**
 * Intervalo mínimo entre avisos de `onHighlighted`. Quem escuta (a busca) percorre o documento
 * inteiro; avisar a cada fatia deixaria o realce de um documento grande parado por segundos.
 */
const NOTIFY_MS = 300;

/** Linguagem declarada no bloco, ou "" para texto puro. */
export function codeLanguage(code: Element): string {
  const m = /(?:^|\s)language-([\w+#.-]+)/.exec(code.className);
  const lang = m?.[1] ?? "";
  return lang === "text" ? "" : lang;
}

/** Realça um bloco agora. Linguagem desconhecida fica como texto. */
export function highlightBlock(hljs: Hljs, code: HTMLElement): void {
  if (code.dataset.hl) return;
  code.dataset.hl = "1";
  const lang = codeLanguage(code);
  if (!lang || !hljs.getLanguage(lang)) return;
  const html = hljs.highlight(code.textContent ?? "", { language: lang, ignoreIllegals: true }).value;
  // A saída do highlight.js já vem escapada; o sanitize mantém a regra de que nada entra no DOM sem passar por ele.
  code.innerHTML = DOMPurify.sanitize(html);
}

/** Ordem de realce: mais perto de `scrollTop` primeiro (o que o leitor está vendo). */
export function byDistance(blocks: HTMLElement[], scrollTop: number): HTMLElement[] {
  const d = new Map(blocks.map((b) => [b, Math.abs(b.offsetTop - scrollTop)]));
  return [...blocks].sort((a, b) => d.get(a)! - d.get(b)!);
}

/** Para a fila do documento anterior sem começar outra (o modo documento grande não realça). */
export function cancelHighlight(): void {
  generation++;
}

/**
 * Realça agora, de uma vez, todo bloco ainda sem realce. Para o Exportar HTML, que trabalha num
 * clone fora da página: a fila em fatias pode não ter chegado ao fim, e o clone não é visto por ela.
 */
export async function highlightAll(container: ParentNode): Promise<void> {
  const blocks = Array.from(container.querySelectorAll<HTMLElement>("pre.hljs > code")).filter((c) => codeLanguage(c) && !c.dataset.hl);
  if (blocks.length === 0) return;
  const hljs = await loadHljs();
  for (const b of blocks) highlightBlock(hljs, b);
}

/** Realça os blocos de `container` em segundo plano. Chamar de novo cancela o documento anterior. */
export async function highlightLazily(container: HTMLElement, scroller: HTMLElement, onHighlighted?: () => void): Promise<void> {
  const gen = ++generation;
  const blocks = Array.from(container.querySelectorAll<HTMLElement>("pre.hljs > code")).filter((c) => codeLanguage(c));
  if (blocks.length === 0) return;
  const hljs = await loadHljs();
  if (gen !== generation) return;
  const queue = byDistance(blocks, scroller.scrollTop);
  let i = 0;
  let lastNotify = performance.now();
  await new Promise<void>((done) => {
    const slice = (): void => {
      if (gen !== generation) return done();
      const end = performance.now() + SLICE_MS;
      while (i < queue.length && performance.now() < end) {
        const b = queue[i++];
        if (b.isConnected) highlightBlock(hljs, b);
      }
      const finished = i >= queue.length;
      if (onHighlighted && (finished || performance.now() - lastNotify >= NOTIFY_MS)) {
        lastNotify = performance.now();
        onHighlighted();
      }
      if (finished) done();
      else setTimeout(slice, 0);
    };
    slice();
  });
}
