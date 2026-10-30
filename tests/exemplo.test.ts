import { describe, expect, it } from "vitest";
import src from "../docs/exemplo.md?raw";
import { render } from "../src/render";
import { loadYaml } from "../src/yaml";

// O front matter lê o `yaml`, que o app carrega sob demanda (src/yaml.ts). Antes do `describe`,
// que renderiza na coleta.
await loadYaml();

/**
 * Golden test: o HTML sanitizado de docs/exemplo.md. Mudou o render de propósito?
 * Rode `pnpm test -- -u` e revise o diff do snapshot junto com a mudança.
 */
describe("docs/exemplo.md", () => {
  const html = render(src);

  it("exercita todos os recursos da fase 1", () => {
    expect(html).toContain('class="frontmatter"');
    expect(html).toContain('class="alert alert-caution"');
    expect(html).toContain('class="wikilink"');
    expect(html).toContain('class="math math-block"');
    expect(html).toContain('<pre class="mermaid">');
    expect(html).toContain('class="hljs"');
    expect(html).toContain('class="task-list-item"');
    expect(html).toContain('class="footnote-ref"');
  });

  it("não muda sem querer", () => {
    expect(html).toMatchSnapshot();
  });
});
