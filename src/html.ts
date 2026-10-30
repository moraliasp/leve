const ENTITY: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Texto para HTML montado em string: vale em conteúdo e em atributo com aspas duplas ou simples. */
export const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => ENTITY[c]);
