import { findAnnouncement } from "./a11y";

/* Busca no documento com a CSS Custom Highlight API (WebKit 17.2+, Chromium 105+). */

type HighlightCtor = new (...ranges: Range[]) => unknown;
const highlights: Map<string, unknown> | undefined = (CSS as unknown as { highlights?: Map<string, unknown> }).highlights;
const HighlightClass = (globalThis as unknown as { Highlight?: HighlightCtor }).Highlight;

export class Finder {
  private ranges: Range[] = [];
  private idx = -1;

  constructor(
    private root: HTMLElement,
    private scroller: HTMLElement,
    private countEl: HTMLElement,
    /** Região `aria-live`: anuncia a contagem por extenso. */
    private liveEl?: HTMLElement,
  ) {}

  private announce(text: string): void {
    if (this.liveEl) this.liveEl.textContent = text;
  }

  get count(): number {
    return this.ranges.length;
  }

  private query = "";

  search(query: string): void {
    this.clear();
    this.query = query;
    this.collect();
    if (this.ranges.length > 0) this.goTo(0);
    else if (this.query) {
      this.countEl.textContent = "0";
      this.announce(findAnnouncement(0, 0));
    }
  }

  /**
   * Recalcula os resultados depois que o DOM do documento mudou por baixo (realce de código troca
   * os nós de texto). Mantém o resultado atual e não rola: o leitor pode estar rolando agora.
   */
  refresh(): void {
    if (!this.query || this.idx < 0) return;
    const keep = this.idx;
    this.ranges = [];
    this.collect();
    if (this.ranges.length === 0) {
      this.clear();
      return;
    }
    this.idx = Math.min(keep, this.ranges.length - 1);
    if (highlights && HighlightClass) highlights.set("find-current", new HighlightClass(this.ranges[this.idx]));
    this.countEl.textContent = `${this.idx + 1}/${this.ranges.length}`;
  }

  private collect(): void {
    const q = this.query.toLowerCase();
    if (!q) return;
    const walker = document.createTreeWalker(this.root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => {
        const p = n.parentElement;
        if (!p || p.closest("script, style, svg, .code-tools, .img-remote")) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = (node.textContent ?? "").toLowerCase();
      let from = 0;
      for (;;) {
        const i = text.indexOf(q, from);
        if (i === -1) break;
        const r = document.createRange();
        r.setStart(node, i);
        r.setEnd(node, i + q.length);
        this.ranges.push(r);
        from = i + q.length;
      }
    }
    if (highlights && HighlightClass) highlights.set("find", new HighlightClass(...this.ranges));
  }

  next(): void {
    if (this.ranges.length) this.goTo((this.idx + 1) % this.ranges.length);
  }

  prev(): void {
    if (this.ranges.length) this.goTo((this.idx - 1 + this.ranges.length) % this.ranges.length);
  }

  private goTo(i: number): void {
    this.idx = i;
    const r = this.ranges[i];
    if (highlights && HighlightClass) highlights.set("find-current", new HighlightClass(r));
    const rect = r.getBoundingClientRect();
    const box = this.scroller.getBoundingClientRect();
    this.scroller.scrollTop += rect.top - box.top - box.height / 3;
    this.countEl.textContent = `${i + 1}/${this.ranges.length}`;
    this.announce(findAnnouncement(i, this.ranges.length));
  }

  clear(): void {
    highlights?.delete("find");
    highlights?.delete("find-current");
    this.ranges = [];
    this.idx = -1;
    this.query = "";
    this.countEl.textContent = "";
    this.announce("");
  }
}
