import { beforeEach, describe, expect, it } from "vitest";
import { render } from "../src/render";
import { applyRemotePolicy, blockedCount } from "../src/remote-ui";

const setup = (md: string): { content: HTMLElement; banner: HTMLElement } => {
  const content = document.createElement("div");
  content.innerHTML = render(md);
  const banner = document.createElement("div");
  banner.hidden = true;
  return { content, banner };
};
const DOC = "![logo](https://a.example/logo.png) texto ![](https://b.example/x.png) ![local](img/l.png)";

describe("interface do conteúdo remoto", () => {
  beforeEach(() => localStorage.clear());

  it("placeholder clicável por imagem bloqueada e aviso com a contagem", () => {
    const { content, banner } = setup(DOC);
    expect(applyRemotePolicy(content, banner, { allowAll: false })).toBe(2);
    const phs = content.querySelectorAll<HTMLButtonElement>("button.img-remote");
    expect(phs).toHaveLength(2);
    expect(phs[0].textContent).toContain("Imagem remota bloqueada · carregar");
    expect(phs[0].textContent).toContain("a.example");
    expect(phs[0].getAttribute("aria-label")).toBe("Imagem remota bloqueada, logo; carregar de a.example");
    expect(banner.hidden).toBe(false);
    expect(banner.textContent).toContain("2 recursos remotos bloqueados");
    expect(banner.querySelector("button")!.textContent).toBe("Carregar imagens remotas neste documento");
    // A imagem local segue intacta.
    expect(content.querySelector('img[src="img/l.png"]')).not.toBeNull();
  });

  it("clicar no placeholder carrega só aquela imagem e atualiza o aviso", () => {
    const { content, banner } = setup(DOC);
    const watched: string[] = [];
    applyRemotePolicy(content, banner, { allowAll: false, watch: (_img, url) => watched.push(url) });
    content.querySelector<HTMLButtonElement>("button.img-remote")!.click();
    const imgs = content.querySelectorAll("img");
    expect(imgs[0].getAttribute("src")).toBe("https://a.example/logo.png");
    expect(imgs[0].classList.contains("remote-hidden")).toBe(false);
    expect(imgs[1].hasAttribute("src")).toBe(false);
    expect(content.querySelectorAll("button.img-remote")).toHaveLength(1);
    expect(blockedCount(content)).toBe(1);
    expect(banner.textContent).toContain("1 recurso remoto bloqueado");
    expect(watched).toEqual(["https://a.example/logo.png"]);
    // Carregar a última some com o aviso.
    content.querySelector<HTMLButtonElement>("button.img-remote")!.click();
    expect(blockedCount(content)).toBe(0);
    expect(banner.hidden).toBe(true);
  });

  it("'neste documento' libera tudo e avisa quem chamou", () => {
    const { content, banner } = setup(DOC);
    let allowed = 0;
    applyRemotePolicy(content, banner, { allowAll: false, onAllowAll: () => allowed++ });
    banner.querySelector("button")!.click();
    expect(blockedCount(content)).toBe(0);
    expect(content.querySelectorAll(".img-remote")).toHaveLength(0);
    expect(content.querySelectorAll('img[src^="https://"]')).toHaveLength(2);
    expect(banner.hidden).toBe(true);
    expect(allowed).toBe(1);
  });

  it("com allowAll (preferência global) nada é bloqueado nem avisado", () => {
    const { content, banner } = setup(DOC);
    expect(applyRemotePolicy(content, banner, { allowAll: true })).toBe(0);
    expect(content.querySelectorAll(".img-remote")).toHaveLength(0);
    expect(banner.hidden).toBe(true);
    expect(content.querySelectorAll('img[src^="https://"]')).toHaveLength(2);
  });

  it("documento sem recurso remoto não mostra aviso", () => {
    const { content, banner } = setup("![local](img/l.png)");
    banner.hidden = false;
    expect(applyRemotePolicy(content, banner, { allowAll: false })).toBe(0);
    expect(banner.hidden).toBe(true);
  });

  it("placeholder também para imagem só com srcset; poster de vídeo volta ao liberar", () => {
    const { content, banner } = setup(
      '<img srcset="https://a.example/1.png 1x, https://a.example/2.png 2x" alt="dois"><video poster="https://b.example/p.jpg"></video>',
    );
    expect(applyRemotePolicy(content, banner, { allowAll: false })).toBe(2);
    const ph = content.querySelector<HTMLButtonElement>("button.img-remote")!;
    expect(ph.getAttribute("aria-label")).toBe("Imagem remota bloqueada, dois; carregar de a.example");
    ph.click();
    expect(content.querySelector("img")!.getAttribute("srcset")).toContain("https://a.example/1.png 1x");
    expect(content.querySelector("video")!.hasAttribute("poster")).toBe(false);
    banner.querySelector("button")!.click();
    expect(content.querySelector("video")!.getAttribute("poster")).toBe("https://b.example/p.jpg");
  });

  it("data-remote-* escrito no documento é descartado: liberar não cria atributo forjado", () => {
    const { content, banner } = setup('<img data-remote data-remote-onerror="alert(1)" data-remote-src="https://x.example/a.png" src="l.png">');
    const img = content.querySelector("img")!;
    expect(img.hasAttribute("data-remote")).toBe(false);
    expect(img.hasAttribute("data-remote-onerror")).toBe(false);
    expect(applyRemotePolicy(content, banner, { allowAll: true })).toBe(0);
    expect(img.hasAttribute("onerror")).toBe(false);
    expect(img.getAttribute("src")).toBe("l.png");
  });
});
