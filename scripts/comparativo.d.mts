export const PLATAFORMAS: string[];
export const TEMAS: string[];
export const IDIOMAS: string[];
export const INICIO: string;
export const FIM: string;
export const CORES: Record<string, { tinta: string; suave: string; eixo: string; barra: string; marca: string; superficies: string[] }>;
export interface Asset {
  nome: string;
  bytes: number;
}
export interface App {
  nome: string;
  repo: string;
  versao: string;
  publicado: string;
  assets: Asset[];
}
export interface Dados {
  consultado: string;
  apps: App[];
}
export interface Classe {
  plataforma: string;
  formato: string;
  arq: string;
}
export function classificar(nome: string): Classe | null;
export function instaladores(app: App, plataforma: string): (Asset & Classe)[];
export function barras(dados: Dados, plataforma: string): { nome: string; repo: string; bytes: number; formato: string }[];
export function mb(bytes: number, idioma: string): string;
export function comprimentoMaximo(linhas: { bytes: number; rotulo: number }[], largura?: number, xBarra?: number): number;
export function grafico(dados: Dados, plataforma: string, idioma: string, tema: string): string;
export function textoAlternativo(dados: Dados, plataforma: string, idioma: string): string;
export function caminhoGrafico(plataforma: string, idioma: string, tema: string): string;
export function tabela(dados: Dados, idioma: string): string;
export function secao(dados: Dados, idioma: string): string;
export function trocarSecao(readme: string, novo: string): string;
export function gerar(dados: Dados, lerReadme: (arquivo: string) => string): Record<string, string>;
