import { describe, expect, it } from "vitest";
import { type Note, captureNote, collapse, formatReview, locate, locateAll, textIndex } from "../src/review";

const labels = {
  title: (s: string, n: number) => `Revisão de ${s} (${n})`,
  section: (h: string) => `Em "${h}":`,
  excerpt: "Trecho:",
};

function note(over: Partial<Note>): Note {
  return { id: 1, quote: "", before: "", after: "", repeated: false, shown: "", heading: "", comment: "", resolved: false, ...over };
}

function doc(html: string): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = html;
  document.body.append(root);
  return root;
}

/** Range de `quote`, dentro de um nó de texto só. */
function select(root: HTMLElement, quote: string, occurrence = 0): Range {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let seen = 0;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    let i = (n.nodeValue ?? "").indexOf(quote);
    while (i !== -1) {
      if (seen++ === occurrence) {
        const r = document.createRange();
        r.setStart(n, i);
        r.setEnd(n, i + quote.length);
        return r;
      }
      i = (n.nodeValue ?? "").indexOf(quote, i + 1);
    }
  }
  throw new Error(`sem ${quote}`);
}

describe("collapse", () => {
  it("reduz espaços e guarda de onde cada caractere veio", () => {
    const { text, map } = collapse("a \n  b");
    expect(text).toBe("a b");
    expect(Array.from(map)).toEqual([0, 1, 5, 6]);
  });
});

describe("locate", () => {
  it("acha a citação, e `null` quando ela sumiu", () => {
    expect(locate("um dois tres", note({ quote: "dois" }))).toEqual({ start: 3, end: 7 });
    expect(locate("um tres", note({ quote: "dois" }))).toBeNull();
    expect(locate("um", note({ quote: "" }))).toBeNull();
  });

  it("citação repetida: vale a que tem o contexto", () => {
    const text = "primeiro foo fim. segundo foo fim.";
    expect(locate(text, note({ quote: "foo", before: "segundo ", after: " fim.", repeated: true }))?.start).toBe(26);
    expect(locate(text, note({ quote: "foo" }))?.start).toBe(9);
  });

  it("citação repetida ao anotar: mudou a anotada, não pula para a outra ocorrência", () => {
    const root = doc("<p>A virada, migrar todos de uma vez na sexta.</p><p>Depois da virada, migrar todos de uma vez deixa de valer.</p>");
    const n = captureNote(root, select(root, "migrar todos de uma vez", 1), 1)!;
    expect(n.repeated).toBe(true);
    expect(locate("A virada, migrar todos de uma vez na sexta. Depois da virada, por etapas deixa de valer.", n)).toBeNull();
  });

  it("citação única continua valendo com o contexto mudado", () => {
    const root = doc("<p>Antes do trecho, migrar todos, depois do trecho.</p>");
    const n = captureNote(root, select(root, "migrar todos"), 1)!;
    expect(n.repeated).toBe(false);
    expect(locate("Outro texto: migrar todos, e outro fim.", n)?.start).toBe(13);
  });
});

describe("captureNote", () => {
  it("guarda citação, contexto, título acima e o texto como o leitor viu", () => {
    const root = doc("<h1>Plano</h1><p>antes</p><h2>Rollout</h2><p>migrar   todos\nde uma vez na sexta</p><h2>Depois</h2>");
    const n = captureNote(root, select(root, "todos\nde uma"), 7)!;
    expect(n).toMatchObject({ id: 7, quote: "todos de uma", heading: "Rollout", shown: "todos de uma", comment: "", resolved: false });
    expect(n.before.endsWith("migrar ")).toBe(true);
    expect(n.after.startsWith(" vez")).toBe(true);
  });

  it("sem título acima, o título fica vazio", () => {
    const root = doc("<p>solto</p><h2>Depois</h2>");
    expect(captureNote(root, select(root, "solto"), 1)?.heading).toBe("");
  });

  it("seleção que pega dois blocos e termina no início do seguinte", () => {
    const root = doc("<p>um dois</p><p>tres</p><p>quatro</p>");
    const r = document.createRange();
    r.setStart(root.children[0].firstChild!, 3);
    r.setEnd(root.children[2], 0);
    expect(captureNote(root, r, 1)?.quote).toBe("doistres");
  });

  it("Mermaid, fórmula e rótulo de código não contam: seleção só neles não anota", () => {
    const root = doc('<pre class="mermaid">graph TD</pre><span class="math">x^2</span><div class="code-tools">python</div>');
    expect(textIndex(root).raw).toBe("");
    expect(captureNote(root, select(root, "graph"), 1)).toBeNull();
  });
});

describe("locateAll", () => {
  it("devolve o Range da citação, atravessando nós, ou `null`", () => {
    const root = doc("<p>um <b>dois</b> tres</p>");
    const [found, gone] = locateAll(textIndex(root), [note({ quote: "um dois tres" }), note({ quote: "cinco" })]);
    expect(found?.toString()).toBe("um dois tres");
    expect(gone).toBeNull();
  });

  it("quebra de linha nova no parágrafo não resolve a anotação", () => {
    const root = doc("<p>todos\nde uma vez</p>");
    expect(locateAll(textIndex(root), [note({ quote: "todos de uma" })])[0]?.toString()).toBe("todos\nde uma");
  });

  it("citação de novo depois que o realce troca os nós de texto", () => {
    const root = doc("<pre><code>const a = 1;</code></pre>");
    const code = root.querySelector("code")!;
    code.innerHTML = '<span class="k">const</span> a = 1;';
    expect(locateAll(textIndex(root), [note({ quote: "const a" })])[0]?.toString()).toBe("const a");
  });
});

describe("formatReview", () => {
  it("Markdown com seção, citação e comentário, só das abertas", () => {
    const text = formatReview(
      "/p/plano.md",
      [
        note({ heading: "Rollout", shown: "de uma vez", comment: " Por etapas.\nCom volta. " }),
        note({ shown: "feita", comment: "x", resolved: true }),
        note({ shown: "sem custo", comment: "Conferir." }),
      ],
      labels,
    );
    expect(text).toBe(
      'Revisão de /p/plano.md (2)\n\n1. Em "Rollout":\n   > de uma vez\n   Por etapas.\n   Com volta.\n\n2. Trecho:\n   > sem custo\n   Conferir.\n',
    );
  });
});
