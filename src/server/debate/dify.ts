import { env } from "@/env";

export interface DifyResponse {
  answer: string;
  conversation_id: string;
  id: string;
}

export interface DifyStreamResponse extends DifyResponse {
  isStreaming: boolean;
  streamCallback?: (text: string) => void;
}

export interface DifyConfig {
  apiKey: string;
}

export class DifyClient {
  private apiKey: string;
  private baseUrl = "https://api.dify.ai/v1";
  private maxRetries = 5;
  private retryDelay = 3000;
  private lastRequestTime: number = 0;
  private minRequestInterval = 1500;
  private timeout = 60000;

  constructor(config: DifyConfig) {
    this.apiKey = config.apiKey;
  }

  private async delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async waitForRateLimit() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.minRequestInterval) {
      await this.delay(this.minRequestInterval - timeSinceLastRequest);
    }
    this.lastRequestTime = Date.now();
  }

  private shouldRetry(error: any): boolean {
    const retryableStatusCodes = [408, 429, 500, 502, 503, 504, 520, 521, 522, 524];
    const errorStatus = error?.response?.status || 
                       (error?.message?.includes('504') ? 504 : null) ||
                       (error?.message?.includes('timeout') ? 408 : null);
    
    return retryableStatusCodes.includes(errorStatus) ||
           error?.message?.toLowerCase().includes('timeout') ||
           error?.message?.toLowerCase().includes('econnreset') ||
           error?.message?.toLowerCase().includes('network error') ||
           error?.message?.toLowerCase().includes('failed to fetch');
  }

  private async handleStreamResponse(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    streamCallback?: (text: string) => void
  ): Promise<DifyResponse> {
    let answer = "";
    let conversation_id = "";
    let id = "";
    let hasReceivedData = false;
    let buffer = "";
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim() || !line.startsWith("data: ")) continue;
          
          try {
            const data = JSON.parse(line.slice(6));
            if (data.event === "message") {
              const chunk = data.answer || "";
              if (chunk) {
                answer += chunk;
                conversation_id = data.conversation_id || conversation_id;
                id = data.id || id;
                streamCallback?.(chunk);
                hasReceivedData = true;
              }
            } else if (data.event === "error") {
              throw new Error(data.message || "Stream error");
            }
          } catch (e) {
            console.error("Failed to parse stream data:", e);
            continue;
          }
        }
      }

      if (!hasReceivedData) {
        throw new Error("No data received from stream");
      }

      return {
        answer,
        conversation_id,
        id,
      };
    } finally {
      reader.releaseLock();
    }
  }

  async chat(
    message: string, 
    role: "pro" | "con" | "judge", 
    conversationId?: string,
    streamCallback?: (text: string) => void
  ): Promise<DifyResponse> {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        await this.waitForRateLimit();

        if (attempt > 0) {
          console.log(`Retry attempt ${attempt + 1} for ${role}...`);
          const jitter = Math.random() * 2000;
          const delay = (this.retryDelay * Math.pow(2, attempt)) + jitter;
          await this.delay(delay);
        }

        console.log(`Sending request to Dify API as ${role}...`);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        try {
          const response = await fetch(`${this.baseUrl}/chat-messages`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${this.apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              inputs: {
                role: role,
                context: message
              },
              query: message,
              response_mode: streamCallback ? "streaming" : "blocking",
              conversation_id: conversationId,
              user: role === "pro" ? "pro-debater" : role === "con" ? "con-debater" : "judge",
            }),
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            const errorText = await response.text();
            console.error("Dify API error response:", {
              status: response.status,
              statusText: response.statusText,
              body: errorText
            });

            const error = new Error(`Dify API error: ${response.status} ${response.statusText}`);
            if (this.shouldRetry({ response, message: errorText })) {
              lastError = error;
              continue;
            }
            throw error;
          }

          if (streamCallback) {
            const reader = response.body?.getReader();
            if (!reader) {
              throw new Error("Failed to get response reader");
            }
            return await this.handleStreamResponse(reader, streamCallback);
          }

          const data = await response.json();
          if (!data.answer) {
            console.error("Unexpected Dify API response:", data);
            throw new Error("Invalid response from Dify API: missing answer");
          }

          console.log(`Received response from Dify API for ${role}`);
          return {
            answer: data.answer,
            conversation_id: data.conversation_id || "",
            id: data.id || "",
          };
        } finally {
          clearTimeout(timeoutId);
        }
      } catch (error) {
        console.error(`Error in Dify API call (attempt ${attempt + 1}):`, error);
        lastError = error as Error;
        
        if (this.shouldRetry(error)) {
          continue;
        }
        throw error;
      }
    }

    throw lastError || new Error("Failed after all retry attempts");
  }
} 