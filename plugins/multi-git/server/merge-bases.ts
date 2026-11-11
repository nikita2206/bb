import type { PluginKvStorage } from "@get-bb/plugin-sdk";

const KEY_PREFIX = "merge-base/";

export interface ScopeMergeBases {
  get(scopeId: string): Promise<string | null>;
  set(scopeId: string, branch: string | null): Promise<void>;
}

export function createScopeMergeBases(kv: PluginKvStorage): ScopeMergeBases {
  const known = new Map<string, Promise<string | null>>();
  return {
    get(scopeId) {
      const cached = known.get(scopeId);
      if (cached !== undefined) return cached;
      const read = kv.get<string>(`${KEY_PREFIX}${scopeId}`).then(
        (branch) => branch ?? null,
        (error: unknown) => {
          known.delete(scopeId);
          throw error;
        },
      );
      known.set(scopeId, read);
      return read;
    },
    async set(scopeId, branch) {
      const key = `${KEY_PREFIX}${scopeId}`;
      if (branch === null) await kv.delete(key);
      else await kv.set(key, branch);
      known.set(scopeId, Promise.resolve(branch));
    },
  };
}
