import { describe, expect, it } from "vitest";
import { clearBanner, showBanner } from "../src/banner";

const el = (): HTMLElement => {
  const d = document.createElement("div");
  d.hidden = true;
  return d;
};

describe("aviso no topo do documento", () => {
  it("mostra o texto, sem botão quando não há ação", () => {
    const b = el();
    showBanner(b, "aviso");
    expect(b.hidden).toBe(false);
    expect(b.innerHTML).toBe("<span>aviso</span>");
  });

  it("botão de texto depois do aviso, que chama a ação", () => {
    const b = el();
    let runs = 0;
    showBanner(b, "aviso", { label: "fazer", run: () => runs++ });
    const btn = b.querySelector("button")!;
    expect(b.lastElementChild).toBe(btn);
    expect(btn.type).toBe("button");
    expect(btn.className).toBe("text");
    expect(btn.textContent).toBe("fazer");
    btn.click();
    expect(runs).toBe(1);
  });

  it("texto muda, botão sai e o aviso esconde sem perder o conteúdo", () => {
    const b = el();
    const n = showBanner(b, "um", { label: "fazer", run: () => {} });
    n.setText("dois");
    n.removeAction();
    expect(b.innerHTML).toBe("<span>dois</span>");
    n.hide();
    expect(b.hidden).toBe(true);
    expect(b.textContent).toBe("dois");
  });

  it("`clearBanner` esconde e esvazia", () => {
    const b = el();
    showBanner(b, "aviso");
    clearBanner(b);
    expect(b.hidden).toBe(true);
    expect(b.childElementCount).toBe(0);
  });
});
