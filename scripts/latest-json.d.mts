export const REPO: string;
export interface UpdaterPlatform {
  url: string;
  signature: string;
}
export interface Latest {
  version: string;
  notes: string;
  pub_date: string;
  platforms: Record<string, UpdaterPlatform>;
}
export function buildLatest(opts: {
  tag: string;
  files: string[];
  sig: (file: string) => string;
  date?: Date;
  notes?: string;
}): Latest;
