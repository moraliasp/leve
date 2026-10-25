export const FILES: string[];
export const SEMVER: RegExp;
export function current(root?: string): Record<string, string>;
export function set(root: string | undefined, version: string): void;
