/**
 * Aviso no topo do documento (`#remote-banner`, `#hidden-banner`): um texto e, se houver, um botão.
 * Só o DOM, igual para os dois; o que dizer e quando fica com `remote-ui.ts` e `hidden-ui.ts`.
 */

export interface Banner {
  setText(text: string): void;
  /** Tira o botão; o texto fica. */
  removeAction(): void;
  hide(): void;
}

/** Esconde e esvazia: todo documento começa sem aviso. */
export function clearBanner(el: HTMLElement): void {
  el.hidden = true;
  el.replaceChildren();
}

export function showBanner(el: HTMLElement, text: string, action?: { label: string; run: () => void }): Banner {
  const span = document.createElement("span");
  span.textContent = text;
  el.append(span);
  let btn: HTMLButtonElement | null = null;
  if (action) {
    btn = document.createElement("button");
    btn.type = "button";
    btn.className = "text";
    btn.textContent = action.label;
    btn.addEventListener("click", action.run);
    el.append(btn);
  }
  el.hidden = false;
  return {
    setText: (t) => {
      span.textContent = t;
    },
    removeAction: () => btn?.remove(),
    hide: () => {
      el.hidden = true;
    },
  };
}
