/**
 * `yaml` sob demanda (~100 kB, um quarto do chunk de abertura): só o front matter e os dados de nó
 * do Mermaid (`A@{ … }`) usam. Quem renderiza espera `loadYaml()` antes (`loadDoc` quando
 * `hasFrontMatter`, `renderMermaid` sempre); o render continua síncrono e lê `loadedYaml()`. Sem o
 * parser carregado, front matter vira a fonte crua e dado de nó sai inteiro (fechado por padrão).
 */
type Yaml = typeof import("yaml");

let yaml: Yaml | null = null;
let loading: Promise<Yaml> | null = null;

export function loadYaml(): Promise<Yaml> {
  loading ??= import("yaml").then(
    (m) => (yaml = m),
    (e: unknown) => {
      // Falha (chunk ausente) não fica em cache: a próxima chamada tenta de novo.
      loading = null;
      throw e;
    },
  );
  return loading;
}

export const loadedYaml = (): Yaml | null => yaml;

/** Mesmo teste de entrada do `markdown-it-front-matter`: o documento começa com `---`. */
export const hasFrontMatter = (src: string): boolean => src.startsWith("---");
