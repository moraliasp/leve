export const REPO: string;
export function messages(locale?: string): Record<string, unknown>;
export function pickAsset(
  platform: string,
  arch: string,
  version: string,
): { kind: "mac" | "win"; name: string } | { kind: "linux" | "unsupported"; name?: undefined };
export function assetUrl(version: string, name: string): string;
export function allowedUrl(url: string): boolean;
export function sha256(buf: Uint8Array): string;
export function verify(buf: Uint8Array, expected: string | undefined, name: string, msg?: unknown): void;
export function download(
  url: string,
  fetchImpl?: (url: string, init: { redirect: "manual" }) => Promise<Response>,
): Promise<Uint8Array>;
export function macDestination(): string;
export function installMac(tarPath: string, destDir: string, opts?: { force?: boolean; msg?: unknown; move?: (from: string, to: string) => void }): string;
export function openApp(appPath: string): void;
export function runWindowsInstaller(exePath: string): void;
export function main(
  args?: string[],
  deps?: {
    platform?: string;
    arch?: string;
    fetchImpl?: (url: string, init: { redirect: "manual" }) => Promise<Response>;
    pkg?: { version: string };
    sums?: Record<string, string>;
    dest?: string;
    open?: (appPath: string) => void;
  },
): Promise<number>;
