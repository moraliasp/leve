export interface TocItem {
  id: string;
  level: number;
  el: HTMLElement;
  link: HTMLAnchorElement;
}

const HEADINGS = ["h1", "h2", "h3", "h4", "h5", "h6"];

/** `maxLevel` corta os títulos mais fundos (modo documento grande: só h1/h2, src/limits.ts). */
export function buildToc(container: HTMLElement, tocEl: HTMLElement, maxLevel = 6): TocItem[] {
  const selector = HEADINGS.slice(0, Math.max(1, Math.min(6, maxLevel))).join(", ");
  const headings = Array.from(container.querySelectorAll<HTMLElement>(selector));
  tocEl.replaceChildren();
  if (headings.length === 0) {
    tocEl.dataset.empty = "true";
    return [];
  }
  delete tocEl.dataset.empty;
  const min = Math.min(...headings.map((h) => Number(h.tagName[1])));
  const list = document.createElement("ul");
  const items: TocItem[] = [];
  for (const h of headings) {
    if (!h.id) continue;
    const level = Number(h.tagName[1]) - min + 1;
    const li = document.createElement("li");
    li.className = `lvl-${level}`;
    const a = document.createElement("a");
    a.href = `#${h.id}`;
    a.textContent = h.textContent ?? "";
    a.title = a.textContent;
    li.appendChild(a);
    list.appendChild(li);
    items.push({ id: h.id, level, el: h, link: a });
  }
  tocEl.appendChild(list);
  return items;
}

/** Marca no sumário o último título que já passou do topo da área visível. */
export function updateActive(items: TocItem[], scroller: HTMLElement): void {
  if (items.length === 0) return;
  const top = scroller.scrollTop + 96;
  let active = items[0];
  for (const it of items) {
    if (it.el.offsetTop <= top) active = it;
    else break;
  }
  for (const it of items) {
    it.link.classList.toggle("active", it === active);
    if (it === active) it.link.setAttribute("aria-current", "location");
    else it.link.removeAttribute("aria-current");
  }
  active.link.scrollIntoView({ block: "nearest" });
}
