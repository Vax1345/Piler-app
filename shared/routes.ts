import { z } from "zod";
import { chatRequestSchema, chatResponseSchema } from "./schema";

export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type ChatResponse = z.infer<typeof chatResponseSchema>;

export const api = {
  chat: {
    process: {
      method: "POST",
      path: "/api/chat",
      input: chatRequestSchema,
      responses: {
        200: chatResponseSchema,
        400: z.object({ message: z.string() }),
        500: z.object({ message: z.string() }),
      },
    },
  },
};
