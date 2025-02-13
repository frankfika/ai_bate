import { createTRPCRouter } from "./trpc";
import { debateRouter } from "./routers/debate";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  debate: debateRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;

// Export a server-side caller
export const createCaller = async (ctx: any) => appRouter.createCaller(ctx);
