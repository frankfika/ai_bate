import "server-only";

import { headers } from "next/headers";
import { cache } from "react";

import { createCaller, type AppRouter } from "../server/api/root";
import { createTRPCContext } from "../server/api/trpc";

/**
 * This wraps the `createTRPCContext` helper and provides the required context for the tRPC API when
 * handling a tRPC call from a React Server Component.
 */
const getContext = cache(() => {
  return createTRPCContext({
    headers: headers(),
  });
});

const getCaller = cache(async () => {
  const ctx = await getContext();
  return createCaller(ctx);
});

export const api = {
  async query(path: [keyof AppRouter, string], ...args: unknown[]) {
    const caller = await getCaller();
    return (caller as any)[path[0]][path[1]](...args);
  },
  async mutation(path: [keyof AppRouter, string], ...args: unknown[]) {
    const caller = await getCaller();
    return (caller as any)[path[0]][path[1]](...args);
  },
};

export const HydrateClient = ({ children }: { children: React.ReactNode }) => {
  return children;
};
