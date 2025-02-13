import { DebateAgent, DebateMessage } from "./types";
import { DifyClient, DifyConfig } from "./dify";

export class DifyDebateAgent implements DebateAgent {
  private client: DifyClient;
  public side: "pro" | "con";
  private conversationId?: string;

  constructor(config: DifyConfig, side: "pro" | "con") {
    this.client = new DifyClient(config);
    this.side = side;
  }

  async generateResponse(
    topic: string, 
    context: DebateMessage[],
    streamCallback?: (text: string) => void
  ): Promise<string> {
    const systemPrompt = this.side === "pro"
      ? `你是一位正方辩手，需要支持并论证以下观点：${topic}。请注意：
1. 保持逻辑清晰，论点明确
2. 使用有力的论据支持你的观点
3. 有理有据地反驳对方论点
4. 语言要简洁有力，每次回复控制在200字以内
5. 保持辩论的专业性和礼貌性
6. 注意辩论技巧，适时使用反问、比喻等修辞手法
7. 展现出自信和说服力`
      : `你是一位反方辩手，需要反对并驳斥以下观点：${topic}。请注意：
1. 保持逻辑清晰，论点明确
2. 使用有力的论据支持你的观点
3. 有理有据地反驳对方论点
4. 语言要简洁有力，每次回复控制在200字以内
5. 保持辩论的专业性和礼貌性
6. 注意辩论技巧，适时使用反问、比喻等修辞手法
7. 展现出自信和说服力`;

    // 构建对话历史
    const messages = context.map(msg => 
      `${msg.side === "pro" ? "正方" : "反方"}：${msg.message}`
    ).join("\n");

    const prompt = `${systemPrompt}\n\n当前辩论历史：\n${messages}\n\n请继续发言：`;

    try {
      const response = await this.client.chat(prompt, this.side, this.conversationId, streamCallback);
      this.conversationId = response.conversation_id;
      return response.answer;
    } catch (error) {
      console.error(`Dify API error:`, error);
      throw error;
    }
  }
} 