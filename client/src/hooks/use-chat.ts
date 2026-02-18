import { useMutation } from "@tanstack/react-query";
import { api, type ChatRequest, type ChatResponse } from "@shared/routes";
import { apiRequest } from "@/lib/queryClient";

export function useChat() {
  return useMutation({
    mutationFn: async (data: ChatRequest): Promise<ChatResponse> => {
      const res = await apiRequest("POST", api.chat.process.path, data);
      return await res.json();
    },
    onError: (error) => {
      console.error("Chat error:", error);
    }
  });
}
