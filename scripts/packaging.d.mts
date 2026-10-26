export const REPO: string;
export const WINGET_ID: string;
export const WINGET_SCHEMA: string;
export const EXTENSIONS: string[];
export function assetNames(version: string): { dmg: string; nsis: string };
export function parseSums(text: string): Map<string, string>;
export function buildPackaging(opts: {
  version: string;
  sums: Map<string, string>;
  releaseDate?: string;
}): Record<string, string>;
