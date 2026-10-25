/**
 * Âncora de rolagem: em vez de guardar só `scrollTop` em pixels, guarda o bloco do documento
 * que está no topo da área visível e o deslocamento até ele. Assim, quando Mermaid, KaTeX ou
 * imagens terminam de renderizar e mudam a altura do que vem antes, dá para recolocar o leitor
 * no mesmo ponto visual.
 */
export interface ScrollAnchor {
  /** `scrollTop` bruto, último recurso. */
  top: number;
  /** Índice do filho direto de `#content` no topo da área visível. */
  index: number;
  /** `scrollTop - filho.offsetTop`. */
  offset: number;
  /** Último título com id acima do filho (confere se o índice ainda vale após edição). */
  id?: string;
  /** `scrollTop - título.offsetTop`. */
  idOffset?: number;
}

const HEADING = /^H[1-6]$/;

function headingAbove(children: HTMLCollection, from: number): HTMLElement | null {
  for (let i = from; i >= 0; i--) {
    const el = children[i] as HTMLElement;
    if (HEADING.test(el.tagName) && el.id) return el;
  }
  return null;
}

export function captureAnchor(scroller: HTMLElement, content: HTMLElement): ScrollAnchor {
  const top = scroller.scrollTop;
  const children = content.children;
  let index = 0;
  for (let i = 0; i < children.length; i++) {
    if ((children[i] as HTMLElement).offsetTop <= top) index = i;
    else break;
  }
  const el = children[index] as HTMLElement | undefined;
  const a: ScrollAnchor = { top, index, offset: el ? top - el.offsetTop : 0 };
  const h = headingAbove(children, index);
  if (h) {
    a.id = h.id;
    a.idOffset = top - h.offsetTop;
  }
  return a;
}

/** Recoloca a rolagem na âncora. Prefere o filho pelo índice (se o título acima confere), depois o título, depois o pixel. */
export function applyAnchor(scroller: HTMLElement, content: HTMLElement, a: ScrollAnchor): void {
  const children = content.children;
  const el = children[a.index] as HTMLElement | undefined;
  if (el) {
    const h = headingAbove(children, a.index);
    if ((h?.id ?? undefined) === a.id) {
      scroller.scrollTop = el.offsetTop + a.offset;
      return;
    }
  }
  if (a.id) {
    const h = document.getElementById(a.id);
    if (h && content.contains(h)) {
      scroller.scrollTop = h.offsetTop + (a.idOffset ?? 0);
      return;
    }
  }
  scroller.scrollTop = a.top;
}

/** Chama `fn` quando cada imagem ainda não carregada terminar (ou falhar). */
export function onImagesSettled(content: HTMLElement, fn: () => void): void {
  for (const img of content.querySelectorAll<HTMLImageElement>("img")) {
    if (img.complete) continue;
    img.addEventListener("load", fn, { once: true });
    img.addEventListener("error", fn, { once: true });
  }
}
