/**
 * Busca aproximada do abrir rápido (`Mod+P`, `src/quick-open.ts`): as letras da consulta, em ordem,
 * dentro do caminho, sem distinguir caixa nem acento. Pura e testada em `tests/fuzzy.test.ts`.
 * Por quê: docs/decisoes.md, "Abrir rápido".
 */

export interface Match {
  item: string;
  score: number;
  /** Índices de `item` que casaram, para destacar. */
  hits: number[];
}

/** Minúscula sem acento, mantendo o comprimento (um caractere por caractere). */
function fold(s: string): string {
  return [...s].map((c) => c.normalize("NFD")[0].toLowerCase()).join("");
}

const SEP = /[/\\\-_. ]/;

/**
 * Casa `query` em `item` ou devolve `null`. Pontos: começo de palavra (depois de `/`, `-`, `_`,
 * `.`, espaço) e letras seguidas valem mais; casar no nome do arquivo vale mais que na pasta;
 * caminho curto desempata. Espaços na consulta são ignorados.
 */
export function fuzzyMatch(query: string, item: string): Match | null {
  const q = fold(query.replace(/\s+/g, ""));
  if (!q) return { item, score: 0, hits: [] };
  const s = fold(item);
  const base = Math.max(item.lastIndexOf("/"), item.lastIndexOf("\\")) + 1;
  // Guloso de trás para a frente acha a ocorrência mais à direita (nome do arquivo); depois, de
  // frente para trás a partir do começo dela, aperta as letras seguidas.
  let end = s.length;
  for (let i = q.length - 1; i >= 0; i--) {
    end = s.lastIndexOf(q[i], end - 1);
    if (end < 0) return null;
  }
  const hits: number[] = [];
  let at = end;
  for (const c of q) {
    at = s.indexOf(c, at);
    hits.push(at);
    at++;
  }
  let score = 0;
  hits.forEach((h, k) => {
    score += 1;
    if (h === 0 || SEP.test(item[h - 1])) score += 8;
    if (k > 0 && hits[k - 1] === h - 1) score += 5;
    if (h >= base) score += 2;
  });
  if (s.slice(base).startsWith(q)) score += 10;
  score -= item.length / 100;
  return { item, score, hits };
}

/** Os `limit` melhores, do maior ponto para o menor; empate fica na ordem de entrada. */
export function fuzzyFilter(query: string, items: readonly string[], limit = 50): Match[] {
  const out: Match[] = [];
  for (const item of items) {
    const m = fuzzyMatch(query, item);
    if (m) out.push(m);
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}
