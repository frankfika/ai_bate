import { DebateJudge, DebateMessage, Judge, ScoreCategory } from "./types";
import { DifyClient, DifyConfig } from "./dify";

export class DifyDebateJudge implements DebateJudge {
  private client: DifyClient;
  private name: string;
  private conversationId?: string;
  private maxRetries = 3;

  constructor(config: DifyConfig, name: string) {
    this.client = new DifyClient(config);
    this.name = name;
  }

  private async retryWithDelay(fn: () => Promise<any>, attempt: number): Promise<any> {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= this.maxRetries) throw error;
      
      const delay = Math.min(1000 * Math.pow(2, attempt), 10000); // Max 10s delay
      await new Promise(resolve => setTimeout(resolve, delay));
      return this.retryWithDelay(fn, attempt + 1);
    }
  }

  private parseScores(content: string): { 
    pro: { logic: number; evidence: number; rebuttal: number; expression: number }, 
    con: { logic: number; evidence: number; rebuttal: number; expression: number } 
  } {
    type ScoreCategories = {
      logic: number;
      evidence: number;
      rebuttal: number;
      expression: number;
    };

    const scores: {
      pro: ScoreCategories;
      con: ScoreCategories;
    } = {
      pro: {
        logic: 0,
        evidence: 0,
        rebuttal: 0,
        expression: 0
      },
      con: {
        logic: 0,
        evidence: 0,
        rebuttal: 0,
        expression: 0
      }
    };

    // 使用更精确和健壮的评分解析
    const scorePatterns = {
      pro: {
        logic: /正方.*?(?:论点|逻辑)[^：:]*[：:]\s*(\d+)/,
        evidence: /正方.*?(?:论据|证据)[^：:]*[：:]\s*(\d+)/,
        rebuttal: /正方.*?(?:反驳|回应)[^：:]*[：:]\s*(\d+)/,
        expression: /正方.*?(?:表达|表现)[^：:]*[：:]\s*(\d+)/
      },
      con: {
        logic: /反方.*?(?:论点|逻辑)[^：:]*[：:]\s*(\d+)/,
        evidence: /反方.*?(?:论据|证据)[^：:]*[：:]\s*(\d+)/,
        rebuttal: /反方.*?(?:反驳|回应)[^：:]*[：:]\s*(\d+)/,
        expression: /反方.*?(?:表达|表现)[^：:]*[：:]\s*(\d+)/
      }
    };

    // 解析分数并进行合理性检查
    const parseScoreForCategory = (text: string, pattern: RegExp, defaultScore: number = 75): number => {
      const match = text.match(pattern);
      if (!match?.[1]) {
        console.warn(`未找到匹配的分数，使用默认分数: ${defaultScore}`);
        return defaultScore;
      }
      
      const score = parseInt(match[1]);
      if (isNaN(score) || score < 0 || score > 100) {
        console.warn(`分数解析异常: ${match[1]}，使用默认分数: ${defaultScore}`);
        return defaultScore;
      }
      
      return score;
    };

    // 解析正反方分数
    Object.entries(scorePatterns).forEach(([side, patterns]) => {
      Object.entries(patterns).forEach(([category, pattern]) => {
        try {
          scores[side as "pro" | "con"][category as ScoreCategory] = 
            parseScoreForCategory(content, pattern);
        } catch (error) {
          console.error(`解析${side}方${category}分数时出错:`, error);
          scores[side as "pro" | "con"][category as ScoreCategory] = 75;
        }
      });
    });

    // 验证所有分数的合理性
    const validateScores = (sideScores: ScoreCategories) => {
      let hasValidScore = false;
      Object.entries(sideScores).forEach(([category, score]) => {
        if (score > 0) hasValidScore = true;
      });
      
      // 如果所有分数都是0，可能是解析失败，使用默认分数
      if (!hasValidScore) {
        Object.keys(sideScores).forEach(category => {
          sideScores[category as ScoreCategory] = 75;
        });
      }
    };

    validateScores(scores.pro);
    validateScores(scores.con);

    return scores;
  }

  private parseCommentHighlights(content: string) {
    const highlights = {
      pros: [] as string[],
      cons: [] as string[],
      suggestions: [] as string[]
    };

    // 提取优点（支持多种可能的标记）
    const prosSection = content.match(/(?:优点|亮点|表现出色)[：:]([\s\S]*?)(?=(?:缺点|不足|问题|建议|改进|总结)|$)/i);
    if (prosSection?.[1]) {
      highlights.pros = prosSection[1]
        .split(/[,，.。;；\n]/)
        .map(s => s.trim())
        .filter(s => s.length > 0 && s.length < 100); // 过滤掉过长的内容
    }

    // 提取缺点（支持多种可能的标记）
    const consSection = content.match(/(?:缺点|不足|问题)[：:]([\s\S]*?)(?=(?:建议|改进|总结)|$)/i);
    if (consSection?.[1]) {
      highlights.cons = consSection[1]
        .split(/[,，.。;；\n]/)
        .map(s => s.trim())
        .filter(s => s.length > 0 && s.length < 100);
    }

    // 提取建议（支持多种可能的标记）
    const suggestionsSection = content.match(/(?:建议|改进)[：:]([\s\S]*?)(?=总结|$)/i);
    if (suggestionsSection?.[1]) {
      highlights.suggestions = suggestionsSection[1]
        .split(/[,，.。;；\n]/)
        .map(s => s.trim())
        .filter(s => s.length > 0 && s.length < 100);
    }

    // 确保每个部分至少有一个项目
    if (highlights.pros.length === 0) highlights.pros = ["表现尚可"];
    if (highlights.cons.length === 0) highlights.cons = ["有待提升"];
    if (highlights.suggestions.length === 0) highlights.suggestions = ["建议继续努力"];

    return highlights;
  }

  private calculateTotalScore(detailedScores: { [key: string]: number }): number {
    const weights = {
      logic: 0.3,      // 30%
      evidence: 0.3,   // 30%
      rebuttal: 0.2,   // 20%
      expression: 0.2  // 20%
    };

    return Object.entries(detailedScores).reduce((total, [category, score]) => {
      return total + score * weights[category as keyof typeof weights];
    }, 0);
  }

  async evaluate(topic: string, messages: DebateMessage[]): Promise<Judge> {
    const prompt = `
作为辩论评委${this.name}，请对以下辩论进行专业的评分和点评。请确保评分公正、客观，并给出详细的评价理由。

辩论主题：${topic}

辩论过程：
${messages.map((msg, index) => `第${Math.floor(index/2) + 1}轮 ${msg.side === "pro" ? "正方" : "反方"}：${msg.message}`).join("\n\n")}

请从以下四个维度进行评分（1-100分）：

1. 论点的清晰度和逻辑性（权重30%）：
- 论证过程是否严密
- 论点表达是否清晰
- 整体结构是否完整

2. 论据的充分性和相关性（权重30%）：
- 论据是否充分
- 证据的可靠性
- 例证的说服力

3. 反驳的有效性（权重20%）：
- 对对方论点的理解
- 反驳的针对性
- 反驳的说服力

4. 表达的说服力（权重20%）：
- 语言的准确性
- 论述的连贯性
- 表达的感染力

请按以下格式给出评分和评价：

正方评分：
论点逻辑性：[分数]
论据相关性：[分数]
反驳有效性：[分数]
表达说服力：[分数]

反方评分：
论点逻辑性：[分数]
论据相关性：[分数]
反驳有效性：[分数]
表达说服力：[分数]

评价意见：
优点：
[列出3-5个主要优点]

缺点：
[列出3-5个主要不足]

建议：
[给出3-5条具体改进建议]

评分理由：
[详细解释每一项评分的具体理由]`;

    try {
      console.log(`评委${this.name}开始评分...`);
      const response = await this.retryWithDelay(async () => {
        return await this.client.chat(prompt, "judge", this.conversationId);
      }, 0);
      
      this.conversationId = response.conversation_id;
      const content = response.answer;
      
      console.log(`评委${this.name}评分完成，开始解析评分结果...`);
      
      // 解析评分
      const scores = this.parseScores(content);
      const highlights = this.parseCommentHighlights(content);
      
      // 计算总分
      const proTotalScore = this.calculateTotalScore(scores.pro);
      const conTotalScore = this.calculateTotalScore(scores.con);

      console.log(`评委${this.name}评分结果：正方${proTotalScore}分，反方${conTotalScore}分`);

      return {
        name: this.name,
        score: {
          pro: proTotalScore,
          con: conTotalScore,
        },
        detailedScores: {
          pro: scores.pro,
          con: scores.con,
        },
        comment: content,
        commentHighlights: highlights,
        animationState: {
          isScoring: true,
          currentCategory: "logic",
          scoreRevealProgress: 0,
          phase: "judge_thinking"
        }
      };
    } catch (error) {
      console.error(`评委${this.name}评分失败:`, error);
      // 返回一个默认的评分结果，避免整个过程中断
      return {
        name: this.name,
        score: {
          pro: 75,
          con: 75,
        },
        detailedScores: {
          pro: {
            logic: 75,
            evidence: 75,
            rebuttal: 75,
            expression: 75
          },
          con: {
            logic: 75,
            evidence: 75,
            rebuttal: 75,
            expression: 75
          }
        },
        comment: `评委${this.name}评分过程中遇到技术问题，已使用默认评分。`,
        commentHighlights: {
          pros: ["技术原因，未能完成详细点评"],
          cons: ["技术原因，未能完成详细点评"],
          suggestions: ["建议重新进行评分"]
        },
        animationState: {
          isScoring: false,
          currentCategory: "logic",
          scoreRevealProgress: 100,
          phase: "completed"
        }
      };
    }
  }
} 