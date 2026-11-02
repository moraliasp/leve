import { $, browser, expect } from "@wdio/globals";
import { acionarMenu, esperarDocumento } from "../helpers";
import {
  escutarMenu,
  esperarEventos,
  esperarSemEventos,
  eventosMenu,
  focarJanela,
  layout,
  limparEventos,
  teclas,
} from "../teclas";

// #100: atalhos pelo teclado do sistema. A tecla sai de um script do sistema (SendInput no Windows,
// xdotool no Linux: `scripts/e2e/`), passa pelo caminho de verdade (AcceleratorKeyPressed do WebView2,
// aceleradores do GTK) e o WebDriver só confere o efeito: o evento `menu` e o DOM. O que o WebDriver
// sozinho não vê foi o bug do #90 (docs/decisoes.md, "Atalhos só no menu nativo").

const js = (js: string): Promise<unknown> => browser.execute(js);
const abas = (): Promise<number> => js("return document.querySelectorAll('#tabs .tab').length;") as Promise<number>;
const abaAtiva = (): Promise<number> =>
  js(
    "return Array.prototype.findIndex.call(document.querySelectorAll('#tabs .tab'), function (t) { return t.getAttribute('aria-selected') === 'true'; });",
  ) as Promise<number>;

describe("atalhos pelo teclado do sistema", () => {
  before(async () => {
    await esperarDocumento();
    await escutarMenu();
    focarJanela();
  });
  beforeEach(limparEventos);

  it("Ctrl+F abre a busca e foca o campo", async () => {
    teclas("ctrl+f");
    await esperarEventos(["find"]);
    await expect($("#find")).not.toHaveElementClass("hidden");
    await expect($("#find-input")).toBeFocused();
    await $("#find-close").click();
    await expect($("#find")).toHaveElementClass("hidden");
  });

  it("Ctrl+P abre o Abrir rápido", async () => {
    teclas("ctrl+p");
    await esperarEventos(["quick-open"]);
    await browser.waitUntil(() => browser.execute("var d = document.getElementById('quick'); return !!d && d.open;"), {
      timeoutMsg: "o Abrir rápido não abriu",
    });
    await js("document.getElementById('quick').close();");
  });

  it("Ctrl+Shift+L troca o tema, uma volta de três passos", async () => {
    const modo = async (): Promise<string> => (await js("return localStorage.getItem('leve.theme') || 'auto';")) as string;
    const ordem = ["auto", "light", "dark"];
    const inicio = await modo();
    for (let i = 1; i <= 3; i++) {
      await limparEventos();
      teclas("ctrl+shift+l");
      await esperarEventos(["cycle-theme"]);
      expect(await modo()).toBe(ordem[(ordem.indexOf(inicio) + i) % 3]);
    }
    expect(await modo()).toBe(inicio);
  });

  it("Ctrl+Shift+N copia as anotações (sem anotação, só avisa)", async () => {
    teclas("ctrl+shift+n");
    await esperarEventos(["copy-review"]);
  });

  it("Ctrl+Shift+A abre o campo de anotação sobre o texto selecionado", async () => {
    await js(
      "var p = document.querySelector('#content p'); var r = document.createRange(); r.selectNodeContents(p);" +
        "var s = getSelection(); s.removeAllRanges(); s.addRange(r);",
    );
    teclas("ctrl+shift+a");
    await esperarEventos(["annotate"]);
    await browser.waitUntil(() => browser.execute("var f = document.querySelector('.review-compose'); return !!f && !f.hidden;"), {
      timeoutMsg: "o campo de anotação não abriu",
    });
    // Esc no campo cancela, sem deixar anotação.
    await browser.keys("Escape");
    await browser.waitUntil(() => browser.execute("return document.querySelector('.review-compose').hidden;"), {
      timeoutMsg: "o campo de anotação não fechou",
    });
  });

  it("Ctrl+[ e Ctrl+] voltam e avançam no histórico", async () => {
    teclas("ctrl+[");
    await esperarEventos(["back"]);
    await limparEventos();
    teclas("ctrl+]");
    await esperarEventos(["forward"]);
  });

  describe("abas", () => {
    before(async () => {
      // Uma segunda aba: o exemplo embutido, como no menu Ajuda.
      await acionarMenu("sample");
      await browser.waitUntil(async () => (await abas()) === 2, { timeoutMsg: "a segunda aba não abriu" });
      await browser.waitUntil(async () => (await abaAtiva()) === 1, { timeoutMsg: "a aba do exemplo não ficou ativa" });
    });

    // Nos dois sistemas: no Windows pelo `accel.rs` (VK), no Linux pelo `accel_gtk.rs`. O GTK compara o keyval
    // já traduzido pelo Shift (`braceright`), e o `muda` registra `bracketright` no menu: sem o grupo do
    // `accel_gtk.rs` a página recebe `}` com Ctrl e Shift e nenhum evento `menu` chega (#106).
    it("Ctrl+Shift+] e Ctrl+Shift+[ alternam as abas", async () => {
      await limparEventos();
      teclas("ctrl+shift+]");
      await esperarEventos(["next-tab"]);
      await browser.waitUntil(async () => (await abaAtiva()) === 0, { timeoutMsg: "Ctrl+Shift+] não foi para a aba seguinte" });

      await limparEventos();
      teclas("ctrl+shift+[");
      await esperarEventos(["prev-tab"]);
      await browser.waitUntil(async () => (await abaAtiva()) === 1, { timeoutMsg: "Ctrl+Shift+[ não voltou para a aba anterior" });
    });

    it("Ctrl+W fecha a aba ativa", async () => {
      await limparEventos();
      teclas("ctrl+w");
      await esperarEventos(["close-tab"]);
      await browser.waitUntil(async () => (await abas()) <= 1, { timeoutMsg: "Ctrl+W não fechou a aba" });
    });
  });
});

// AltGr é Ctrl+Alt no Windows. Numa caixa de texto com teclado internacional ele digita caractere, e o
// `accel.rs` não pode tratar como atalho: AltGr+W em ABNT2 é `?`, e Ctrl+W é Fechar aba. Se o Alt fosse
// ignorado ao casar a tecla, a aba fecharia no lugar de digitar.
describe("ABNT2: AltGr e as teclas da pontuação", () => {
  before(async () => {
    await esperarDocumento();
    await escutarMenu();
    focarJanela();
    layout("abnt2");
    teclas("ctrl+f");
    await esperarEventos(["find"]);
    await expect($("#find-input")).toBeFocused();
  });
  after(() => layout("us"));
  beforeEach(async () => {
    await limparEventos();
    await js("var i = document.getElementById('find-input'); i.value = ''; i.focus();");
  });

  const campo = (): Promise<string> => js("return document.getElementById('find-input').value;") as Promise<string>;

  it("AltGr+Q digita / e AltGr+W digita ?, sem disparar ação do menu", async () => {
    teclas("altgr+q");
    await browser.waitUntil(async () => (await campo()) === "/", { timeoutMsg: `AltGr+Q devia digitar "/", e o campo tem "${await campo()}"` });
    teclas("altgr+w");
    await browser.waitUntil(async () => (await campo()) === "/?", { timeoutMsg: `AltGr+W devia digitar "?", e o campo tem "${await campo()}"` });
    await esperarSemEventos();
    expect(await eventosMenu()).toEqual([]);
    // O documento continua aberto: o AltGr+W não virou Ctrl+W (Fechar aba).
    await expect($("#content h1")).toBeDisplayed();
  });

  it("as teclas físicas de [, ] e / do ABNT2 digitam o caractere certo", async () => {
    teclas("[");
    teclas("]");
    teclas("/");
    await browser.waitUntil(async () => (await campo()) === "[]/", { timeoutMsg: `esperava "[]/" e o campo tem "${await campo()}"` });
    await esperarSemEventos();
  });

  // #111: no ABNT2 a tecla de `[` tem o VK do `]` do US (VK_OEM_6) e a de `]` tem VK_OEM_5. Casando pelo VK,
  // Ctrl+[ avançava, Ctrl+] não fazia nada e as abas andavam ao contrário. O `accel.rs` casa pelo caractere
  // que o layout ativo dá à tecla. No Linux o GTK já compara o keyval traduzido (`accel_gtk.rs`).
  it("Ctrl+[ e Ctrl+] voltam e avançam, Ctrl+Shift+] e Ctrl+Shift+[ alternam as abas", async () => {
    teclas("ctrl+[");
    await esperarEventos(["back"]);
    await limparEventos();
    teclas("ctrl+]");
    await esperarEventos(["forward"]);

    // Uma segunda aba, como no bloco US (lá o Ctrl+W fechou a do exemplo).
    await acionarMenu("sample");
    await browser.waitUntil(async () => (await abas()) === 2, { timeoutMsg: "a segunda aba não abriu" });
    await browser.waitUntil(async () => (await abaAtiva()) === 1, { timeoutMsg: "a aba do exemplo não ficou ativa" });

    await limparEventos();
    teclas("ctrl+shift+]");
    await esperarEventos(["next-tab"]);
    await browser.waitUntil(async () => (await abaAtiva()) === 0, { timeoutMsg: "Ctrl+Shift+] não foi para a aba seguinte" });

    await limparEventos();
    teclas("ctrl+shift+[");
    await esperarEventos(["prev-tab"]);
    await browser.waitUntil(async () => (await abaAtiva()) === 1, { timeoutMsg: "Ctrl+Shift+[ não voltou para a aba anterior" });
  });
});
