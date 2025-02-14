import { DebateJudge, DebateMessage, Judge, ScoreCategory } from "./types";
import { DifyClient, DifyConfig } from "./dify";

export class DifyDebateJudge implements DebateJudge {
  private client: DifyClient;
  private name: string;
  private conversationId?: string;

  constructor(config: DifyConfig, name: string) {
    this.client = new DifyClient(config);
    this.name = name;
  }

  public getName(): string {
    return this.name;
  }

  private parseScores(content: string): { 
    pro: { logic: number; evidence: number; rebuttal: number; expression: number }, 
    con: { logic: number; evidence: number; rebuttal: number; expression: number } 
  } {
    const defaultScore = 75;
    const scores = {
      pro: { logic: defaultScore, evidence: defaultScore, rebuttal: defaultScore, expression: defaultScore },
      con: { logic: defaultScore, evidence: defaultScore, rebuttal: defaultScore, expression: defaultScore }
    };

    try {
      // 更灵活的分数提取逻辑
      const proMatch = content.match(/正方[^]*?(?=反方|$)/i);
      const conMatch = content.match(/反方[^]*?(?=总评|本轮辩论总评|亮点|$)/i);
      
      const proSection = proMatch?.[0] ?? "";
      const conSection = conMatch?.[0] ?? "";

      const extractScore = (text: string, category: string): number => {
        // 更灵活的分数匹配模式
        const patterns = [
          // 标准格式匹配
          new RegExp(`${category}[^0-9]*?(\\d+(?:\\.\\d+)?)[^0-9]*分`, 'i'),
          new RegExp(`${category}[：:]+\\s*(\\d+(?:\\.\\d+)?)\\s*分`, 'i'),
          // 分数在前的格式
          new RegExp(`(\\d+(?:\\.\\d+)?)\\s*分[^\\n]*${category}`, 'i'),
          // 更宽松的匹配
          new RegExp(`${category}[^]*?(\\d+(?:\\.\\d+)?)(?:分数|得分|分|点)`, 'i'),
          // 带小数点的分数
          new RegExp(`${category}[^]*?(\\d+\\.?\\d*)(?:分数|得分|分|点)?`, 'i'),
          // 冒号后的数字
          new RegExp(`${category}[：:](\\d+(?:\\.\\d+)?)`, 'i'),
          // 括号中的数字
          new RegExp(`${category}[^]*?[（(](\\d+(?:\\.\\d+)?)[)）]`, 'i')
        ];

        let bestScore = defaultScore;
        let foundValidScore = false;
        let minDiffFromExpected = Infinity;

        for (const pattern of patterns) {
          const matches = text.matchAll(pattern);
          for (const match of matches) {
            if (match?.[1]) {
              const score = parseFloat(match[1]);
              // 确保分数在合理范围内
              if (!isNaN(score) && score >= 0 && score <= 100) {
                // 优先选择接近预期范围的分数 (60-90)
                const diffFromExpected = Math.min(
                  Math.abs(score - 75),  // 理想分数
                  Math.abs(score - 60),  // 最低预期
                  Math.abs(score - 90)   // 最高预期
                );
                
                if (!foundValidScore || diffFromExpected < minDiffFromExpected) {
                  bestScore = score;
                  foundValidScore = true;
                  minDiffFromExpected = diffFromExpected;
                }
              }
            }
          }
        }
        
        return bestScore;
      };

      const categoryMappings = [
        { cn: ["论点逻辑", "逻辑性", "论点", "逻辑", "论证", "论述"], en: "logic" },
        { cn: ["论据相关", "论据", "相关性", "证据", "论据充分", "论据支撑"], en: "evidence" },
        { cn: ["反驳有效", "反驳", "有效性", "反驳能力", "反驳效果", "反驳力度"], en: "rebuttal" },
        { cn: ["表达说服", "表达", "说服力", "表现力", "语言表达", "表达能力"], en: "expression" }
      ];

      // 为每个类别尝试所有可能的中文表述
      categoryMappings.forEach(({ cn, en }) => {
        let bestProScore = defaultScore;
        let bestConScore = defaultScore;
        let minProDiff = Infinity;
        let minConDiff = Infinity;

        for (const term of cn) {
          const proScore = extractScore(proSection, term);
          const conScore = extractScore(conSection, term);
          
          // 更新最佳分数
          const proDiff = Math.abs(proScore - 75);
          const conDiff = Math.abs(conScore - 75);
          
          if (proScore !== defaultScore && proDiff < minProDiff) {
            bestProScore = proScore;
            minProDiff = proDiff;
          }
          if (conScore !== defaultScore && conDiff < minConDiff) {
            bestConScore = conScore;
            minConDiff = conDiff;
          }
        }

        // 只有在找到更好的分数时才更新
        if (minProDiff < Infinity) {
          scores.pro[en as keyof typeof scores.pro] = bestProScore;
        }
        if (minConDiff < Infinity) {
          scores.con[en as keyof typeof scores.con] = bestConScore;
        }
      });

      // 验证分数的合理性
      const validateScores = (side: "pro" | "con") => {
        let hasValidScore = false;
        let totalValidScores = 0;
        let validScoreCount = 0;

        // 检查是否有有效分数
        for (const category in scores[side]) {
          const score = scores[side][category as keyof typeof scores.pro];
          if (score !== defaultScore) {
            hasValidScore = true;
            totalValidScores += score;
            validScoreCount++;
          }
        }
        
        // 如果某一方完全没有有效分数，使用更宽松的匹配
        if (!hasValidScore) {
          const section = side === "pro" ? proSection : conSection;
          const numbers = section.match(/\d+(?:\\.\\d+)?/g);
          if (numbers) {
            const validScores = numbers
              .map(n => parseFloat(n))
              .filter(n => !isNaN(n) && n >= 0 && n <= 100);
            
            if (validScores.length > 0) {
              // 移除异常值
              const sortedScores = [...validScores].sort((a, b) => a - b);
              const q1Index = Math.floor(sortedScores.length * 0.25);
              const q3Index = Math.floor(sortedScores.length * 0.75);
              
              // 确保有足够的数据计算四分位数
              if (q1Index < sortedScores.length && q3Index < sortedScores.length) {
                const q1 = sortedScores[q1Index];
                const q3 = sortedScores[q3Index];
                
                // 只有在成功获取四分位数时才进行异常值过滤
                if (typeof q1 === 'number' && typeof q3 === 'number') {
                  const iqr = q3 - q1;
                  const lowerBound = Math.max(0, q1 - 1.5 * iqr);
                  const upperBound = Math.min(100, q3 + 1.5 * iqr);
                  
                  const validRangeScores = sortedScores.filter(
                    score => score >= lowerBound && score <= upperBound
                  );

                  if (validRangeScores.length > 0) {
                    // 使用中位数而不是平均值，避免极端值的影响
                    const medianIndex = Math.floor(validRangeScores.length / 2);
                    const medianScore = validRangeScores[medianIndex] ?? defaultScore;
                    for (const category in scores[side]) {
                      scores[side][category as keyof typeof scores.pro] = medianScore;
                    }
                  }
                }
              }
            }
          }
        } else if (validScoreCount > 0 && validScoreCount < 4) {
          // 如果只找到部分分数，使用中位数填充其他分数
          const validScores = Object.values(scores[side]).filter(score => score !== defaultScore);
          const medianIndex = Math.floor(validScores.length / 2);
          const medianScore = validScores[medianIndex] ?? defaultScore;
          for (const category in scores[side]) {
            if (scores[side][category as keyof typeof scores.pro] === defaultScore) {
              scores[side][category as keyof typeof scores.pro] = medianScore;
            }
          }
        }

        // 最后验证所有分数是否在合理范围内
        for (const category in scores[side]) {
          const score = scores[side][category as keyof typeof scores.pro];
          if (score < 0 || score > 100) {
            scores[side][category as keyof typeof scores.pro] = defaultScore;
          }
        }
      };

      validateScores("pro");
      validateScores("con");

    } catch (error) {
      console.error('分数解析错误:', error);
      // 保持默认分数
    }

    return scores;
  }

  private parseHighlights(content: string) {
    const defaultHighlights = {
      pros: ["表现尚可"],
      cons: ["有待提升"],
      suggestions: ["继续努力"]
    };

    try {
      const extractSection = (marker: string): string[] => {
        const section = content.match(new RegExp(`${marker}[：:]([\s\S]*?)(?=(?:优点|缺点|建议|评分理由)|$)`, 'i'))?.[1];
        if (!section) return defaultHighlights[marker === "优点" ? "pros" : marker === "缺点" ? "cons" : "suggestions"];
        
        const results = section
          .split(/[,，.。;\n]/)
          .map(s => s.trim())
          .filter(s => s.length > 0 && s.length < 100);
          
        return results.length > 0 ? results : defaultHighlights[marker === "优点" ? "pros" : marker === "缺点" ? "cons" : "suggestions"];
      };

      return {
        pros: extractSection("优点"),
        cons: extractSection("缺点"),
        suggestions: extractSection("建议")
      };
    } catch (error) {
      console.error('亮点解析错误:', error);
      return defaultHighlights;
    }
  }

  private calculateTotalScore(scores: { [key: string]: number }): number {
    const weights = { logic: 0.3, evidence: 0.3, rebuttal: 0.2, expression: 0.2 };
    return Object.entries(scores)
      .reduce((total, [category, score]) => total + score * weights[category as keyof typeof weights], 0);
  }

  async evaluate(topic: string, messages: DebateMessage[]): Promise<Judge> {
    const maxRetries = 3;
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          console.log(`Retry attempt ${attempt + 1} for judge ${this.name}...`);
          // Add exponential backoff
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }

        const prompt = this.buildPrompt(topic, messages);
        console.log(`评委${this.name}开始评分...`);
        
        const response = await this.client.chat(prompt, "judge", this.conversationId);
        this.conversationId = response.conversation_id;
        
        // Parse scores with validation
        const scores = this.parseScores(response.answer);
        if (!this.validateScores(scores)) {
          throw new Error("Invalid scores detected");
        }
        
        const highlights = this.parseHighlights(response.answer);
        if (!this.validateHighlights(highlights)) {
          throw new Error("Invalid highlights detected");
        }
        
        const proTotal = this.calculateTotalScore(scores.pro);
        const conTotal = this.calculateTotalScore(scores.con);

        const scoreReasons = this.parseScoreReasons(response.answer);
        if (!this.validateScoreReasons(scoreReasons)) {
          throw new Error("Invalid score reasons detected");
        }
        
        const overallComment = this.parseOverallComment(response.answer);
        if (!overallComment) {
          throw new Error("Failed to parse overall comment");
        }
        
        const recommendedWinner = this.parseRecommendedWinner(response.answer);

        return {
          name: this.name,
          score: { pro: proTotal, con: conTotal },
          detailedScores: scores,
          comment: response.answer,
          commentHighlights: highlights,
          scoreReasons,
          overallComment,
          recommendedWinner,
          animationState: {
            isScoring: true,
            currentCategory: "logic",
            scoreRevealProgress: 0,
            phase: "judge_thinking"
          }
        };
      } catch (error) {
        console.error(`评委${this.name}评分失败 (attempt ${attempt + 1}/${maxRetries}):`, error);
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // On final attempt, return a more informative default response
        if (attempt === maxRetries - 1) {
          const defaultScore = 75;
          const errorMessage = lastError.message;
          return {
            name: this.name,
            score: { pro: defaultScore, con: defaultScore },
            detailedScores: {
              pro: { logic: defaultScore, evidence: defaultScore, rebuttal: defaultScore, expression: defaultScore },
              con: { logic: defaultScore, evidence: defaultScore, rebuttal: defaultScore, expression: defaultScore }
            },
            comment: `评委${this.name}评分过程中遇到技术问题：${errorMessage}`,
            commentHighlights: {
              pros: ["由于技术原因暂时无法完成详细点评"],
              cons: ["由于技术原因暂时无法完成详细点评"],
              suggestions: ["请稍后重新进行评分，或联系技术支持"]
            },
            scoreReasons: {
              pro: {
                logic: `评分失败：${errorMessage}`,
                evidence: `评分失败：${errorMessage}`,
                rebuttal: `评分失败：${errorMessage}`,
                expression: `评分失败：${errorMessage}`
              },
              con: {
                logic: `评分失败：${errorMessage}`,
                evidence: `评分失败：${errorMessage}`,
                rebuttal: `评分失败：${errorMessage}`,
                expression: `评分失败：${errorMessage}`
              }
            },
            overallComment: `评分过程中遇到技术问题：${errorMessage}`,
            recommendedWinner: null,
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

    throw lastError || new Error("评分失败，已达到最大重试次数");
  }

  private validateScores(scores: any): boolean {
    const validateSide = (side: any) => {
      if (!side || typeof side !== 'object') return false;
      const categories = ['logic', 'evidence', 'rebuttal', 'expression'];
      return categories.every(cat => 
        typeof side[cat] === 'number' && 
        !isNaN(side[cat]) && 
        side[cat] >= 0 && 
        side[cat] <= 100
      );
    };
    return validateSide(scores.pro) && validateSide(scores.con);
  }

  private validateHighlights(highlights: any): boolean {
    if (!highlights || typeof highlights !== 'object') return false;
    return ['pros', 'cons', 'suggestions'].every(key => 
      Array.isArray(highlights[key]) && 
      highlights[key].every((item: any) => typeof item === 'string' && item.length > 0)
    );
  }

  private validateScoreReasons(reasons: any): boolean {
    const validateSide = (side: any) => {
      if (!side || typeof side !== 'object') return false;
      const categories = ['logic', 'evidence', 'rebuttal', 'expression'];
      return categories.every(cat => 
        typeof side[cat] === 'string' && 
        side[cat].length > 0
      );
    };
    return validateSide(reasons.pro) && validateSide(reasons.con);
  }

  private buildPrompt(topic: string, messages: DebateMessage[]): string {
    return `作为辩论评委${this.name}，请对以下辩论进行专业、详细的评分和点评。

辩论主题：${topic}

辩论过程：
${messages.map((msg, index) => `第${Math.floor(index/2) + 1}轮 ${msg.side === "pro" ? "正方" : "反方"}：${msg.message}`).join("\n\n")}

请严格按以下格式给出评分（1-100分）和评价：

正方评分：
论点逻辑性：[分数]
- 理由：[具体说明为什么给这个分数，包括优点和不足]

论据相关性：[分数]
- 理由：[具体说明为什么给这个分数，包括优点和不足]

反驳有效性：[分数]
- 理由：[具体说明为什么给这个分数，包括优点和不足]

表达说服力：[分数]
- 理由：[具体说明为什么给这个分数，包括优点和不足]

反方评分：
论点逻辑性：[分数]
- 理由：[具体说明为什么给这个分数，包括优点和不足]

论据相关性：[分数]
- 理由：[具体说明为什么给这个分数，包括优点和不足]

反驳有效性：[分数]
- 理由：[具体说明为什么给这个分数，包括优点和不足]

表达说服力：[分数]
- 理由：[具体说明为什么给这个分数，包括优点和不足]

本轮辩论总评：
[对本轮辩论的整体评价，包括双方的表现特点和比较]

亮点：
1. [具体亮点1]
2. [具体亮点2]
3. [具体亮点3]

不足：
1. [具体不足1]
2. [具体不足2]
3. [具体不足3]

改进建议：
1. [具体建议1]
2. [具体建议2]
3. [具体建议3]

获胜方推荐：[正方/反方] 
获胜理由：[详细说明为什么这一方表现更好]`;
  }

  private parseScoreReasons(content: string): {
    pro: { [key in ScoreCategory]: string };
    con: { [key in ScoreCategory]: string };
  } {
    const defaultReason = "未提供具体理由";
    const reasons = {
      pro: {
        logic: defaultReason,
        evidence: defaultReason,
        rebuttal: defaultReason,
        expression: defaultReason
      },
      con: {
        logic: defaultReason,
        evidence: defaultReason,
        rebuttal: defaultReason,
        expression: defaultReason
      }
    };

    try {
      const proSection = content.match(/正方评分：([\s\S]*?)(?=反方评分：|$)/i)?.[1] || "";
      const conSection = content.match(/反方评分：([\s\S]*?)(?=本轮辩论总评：|$)/i)?.[1] || "";

      const categories = {
        "论点逻辑性": "logic",
        "论据相关性": "evidence",
        "反驳有效性": "rebuttal",
        "表达说服力": "expression"
      };

      const extractReason = (text: string, category: string): string => {
        const pattern = new RegExp(`${category}[^\\n]*\\n-\\s*理由：([^\\n]+)`, 'i');
        return text.match(pattern)?.[1]?.trim() || defaultReason;
      };

      Object.entries(categories).forEach(([cn, en]) => {
        reasons.pro[en as ScoreCategory] = extractReason(proSection, cn);
        reasons.con[en as ScoreCategory] = extractReason(conSection, cn);
      });
    } catch (error) {
      console.error('评分理由解析错误:', error);
    }

    return reasons;
  }

  private parseOverallComment(content: string): string {
    try {
      const match = content.match(/本轮辩论总评：\n?([\s\S]*?)(?=亮点：|$)/i);
      return match?.[1]?.trim() || "未提供总评";
    } catch (error) {
      console.error('总评解析错误:', error);
      return "解析总评时出错";
    }
  }

  private parseRecommendedWinner(content: string): { side: "pro" | "con", reason: string } | null {
    try {
      const winnerMatch = content.match(/获胜方推荐：\s*([正反]方)/i);
      const reasonMatch = content.match(/获胜理由：\s*([^\n]+)/i);

      if (!winnerMatch) return null;

      return {
        side: winnerMatch[1] === "正方" ? "pro" : "con",
        reason: reasonMatch?.[1]?.trim() || "未提供具体理由"
      };
    } catch (error) {
      console.error('获胜方解析错误:', error);
      return null;
    }
  }
}