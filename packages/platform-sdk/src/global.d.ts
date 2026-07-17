// Minimal ambient declaration so the platform-sdk (which may be bundled for
// the browser) does not require @types/node for the few Node-only helpers we
// use. At runtime these resolve to Node's `crypto` module.
declare module 'crypto' {
  export function createHmac(
    algorithm: string,
    key: string | Buffer,
  ): {
    update(data: string | Buffer): { digest(encoding: string): string };
  };
}

// Ambient DOM/Node globals used by the adapters and their tests, so the
// SDK does not require @types/node.
declare const fetch: (url: string, init?: any) => Promise<any>;
declare const global: { fetch: typeof fetch; [k: string]: unknown };
interface Response {
  ok: boolean;
  status: number;
  json: () => Promise<any>;
}
