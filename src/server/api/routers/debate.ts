import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { DebateStore } from "../../debate/store";

const difyConfigSchema = z.object({
  apiKey: z.string().min(1, "API Key不能为空"),
});

const judgeConfigSchema = z.object({
  apiKey: z.string().min(1, "API Key不能为空"),
  name: z.string().min(1, "评委名字不能为空"),
});

export const debateRouter = createTRPCRouter({
  startDebate: publicProcedure
    .input(
      z.object({
        topic: z.string(),
        background: z.string(),
        config: z.object({
          proConfig: difyConfigSchema,
          conConfig: difyConfigSchema,
          judgeConfigs: z.tuple([
            judgeConfigSchema,
            judgeConfigSchema,
            judgeConfigSchema,
            judgeConfigSchema,
            judgeConfigSchema,
            judgeConfigSchema
          ]),
          maxRounds: z.number().min(1).max(50),
        }),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        const debateStore = DebateStore.getInstance();
        const debateId = await debateStore.createDebate(
          input.topic,
          input.background,
          input.config
        );

        return {
          id: debateId,
          debateId,
          topic: input.topic,
          background: input.background,
          status: "pending",
          messages: [],
          judges: [],
          winner: null,
          errorMessage: null,
        };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to start debate",
          cause: error,
        });
      }
    }),

  getDebateStatus: publicProcedure
    .input(z.object({ 
      debateId: z.string(),
    }))
    .query(async ({ input }) => {
      try {
        const debateStore = DebateStore.getInstance();
        const debate = debateStore.getDebate(input.debateId);

        if (!debate) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Debate not found",
          });
        }

        const state = debate.getState();
        const progress = debate.getProgress();

        return {
          status: state.status,
          messages: state.messages,
          judges: state.judges,
          winner: state.winner,
          errorMessage: state.errorMessage,
          streamingText: progress.streamingText,
          isThinking: progress.isThinking,
          currentSpeaker: progress.currentSpeaker,
          currentStreamingSide: progress.currentStreamingSide,
          scoringAnimation: progress.scoringAnimation,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to get debate status",
          cause: error,
        });
      }
    }),
}); 