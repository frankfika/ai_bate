import { 
  DebateState, 
  DebateMessage, 
  Judge, 
  ScoringAnimation,
  ScoreCategory,
  ScoringPhase,
  DebateProgress,
  DifyConfig,
  JudgeConfig,
  DebateConfig
} from "./types";
import { DifyDebateAgent } from "./agents";
import { DifyDebateJudge } from "./judge";
import { randomUUID } from "crypto";

export class DebateManager {
  private state: DebateState;
  private proAgent!: DifyDebateAgent;
  private conAgent!: DifyDebateAgent;
  private judges!: DifyDebateJudge[];
  private maxRounds: number;
  private currentRound = 0;
  private isRunning = false;
  private debatePromise: Promise<void> | null = null;
  private errorMessage: string | null = null;
  private onStateChange?: (state: DebateState) => void;
  private onProgressChange?: (progress: DebateProgress) => void;
  private streamingText: string = "";
  private currentStreamingSide: "pro" | "con" | null = null;
  private isThinking: boolean = false;

  constructor(
    topic: string, 
    background: string,
    config: DebateConfig, 
    onStateChange?: (state: DebateState) => void,
    onProgressChange?: (progress: DebateProgress) => void
  ) {
    this.maxRounds = config.maxRounds;
    this.state = {
      id: randomUUID(),
      topic,
      background,
      status: "pending",
      messages: [],
      judges: [],
      winner: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      errorMessage: null,
      config,
    };
    this.onStateChange = onStateChange;
    this.onProgressChange = onProgressChange;
    this.initializeAgents(config);
  }

  private initializeAgents(config: DebateConfig) {
    this.proAgent = new DifyDebateAgent(config.proConfig, "pro");
    this.conAgent = new DifyDebateAgent(config.conConfig, "con");
    
    // 确保有6个评委的配置
    if (config.judgeConfigs.length !== 6) {
      throw new Error("必须配置6个评委");
    }

    // 初始化6个评委
    this.judges = config.judgeConfigs.map(judgeConfig => 
      new DifyDebateJudge({ apiKey: judgeConfig.apiKey }, judgeConfig.name)
    );
  }

  private notifyStateChange() {
    if (this.onStateChange) {
      this.onStateChange(this.getState());
    }
  }

  private notifyProgressChange(currentSpeaker: "pro" | "con" | null = null) {
    if (this.onProgressChange) {
      // 计算进度：当前轮次占总轮次的百分比
      const roundProgress = Math.min(100, (this.currentRound / this.maxRounds) * 100);
      
      this.onProgressChange({
        currentRound: Math.min(this.currentRound + 1, this.maxRounds), // 确保不超过最大轮次
        totalRounds: this.maxRounds,
        percentage: roundProgress,
        currentSpeaker,
        isThinking: this.isThinking,
        streamingText: this.streamingText,
        currentStreamingSide: this.currentStreamingSide,
      });
    }
  }

  public getId(): string {
    return this.state.id;
  }

  public getState(): DebateState {
    return { ...this.state };
  }

  private async addMessage(side: "pro" | "con", message: string) {
    const debateMessage: DebateMessage = {
      side,
      message,
      timestamp: new Date(),
    };
    this.state.messages.push(debateMessage);
    this.state.updatedAt = new Date();
    this.notifyStateChange();
  }

  private async runDebateRound(): Promise<void> {
    try {
      console.log(`Running round ${this.currentRound + 1} of ${this.maxRounds}`);
      
      // 正方发言
      console.log("Waiting for pro side response...");
      this.isThinking = true;
      this.currentStreamingSide = "pro";
      this.streamingText = "";
      this.notifyProgressChange("pro");
      
      let accumulatedProText = "";
      const proResponse = await this.proAgent.generateResponse(
        this.state.topic,
        this.state.messages,
        (text) => {
          this.isThinking = false;
          accumulatedProText += text;
          this.streamingText = accumulatedProText;
          this.notifyProgressChange("pro");
        }
      );
      await this.addMessage("pro", proResponse);
      console.log("Pro side responded");

      // 反方发言
      console.log("Waiting for con side response...");
      this.isThinking = true;
      this.currentStreamingSide = "con";
      this.streamingText = "";
      this.notifyProgressChange("con");
      
      let accumulatedConText = "";
      const conResponse = await this.conAgent.generateResponse(
        this.state.topic,
        this.state.messages,
        (text) => {
          this.isThinking = false;
          accumulatedConText += text;
          this.streamingText = accumulatedConText;
          this.notifyProgressChange("con");
        }
      );
      await this.addMessage("con", conResponse);
      console.log("Con side responded");

      // 重置状态
      this.streamingText = "";
      this.currentStreamingSide = null;
      this.isThinking = false;
      this.notifyProgressChange(null);
      this.notifyStateChange();
    } catch (error) {
      console.error("Error in debate round:", error);
      this.setErrorStatus(error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  private async runDebateLoop(): Promise<void> {
    try {
      console.log("Starting debate loop");
      // 修改循环条件，确保只进行指定轮次的辩论
      while (this.currentRound < this.maxRounds) {
        await this.runDebateRound();
        this.currentRound++; // 移动到这里，确保每轮结束后才增加轮次
      }

      console.log("All rounds completed, starting judging");
      await this.runJudging();
      this.state.status = "completed";
      this.notifyStateChange();
      console.log("Debate completed");
    } catch (error) {
      console.error("Error in debate loop:", error);
      this.setErrorStatus(error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      this.debatePromise = null;
    }
  }

  private updateScoringAnimation(animation: Partial<Omit<ScoringAnimation, 'phase'>> & { phase: ScoringPhase }) {
    if (this.onProgressChange) {
      const currentAnimation: Required<ScoringAnimation> = {
        phase: animation.phase,
        currentJudge: animation.currentJudge ?? 1,
        totalJudges: animation.totalJudges ?? this.judges.length,
        currentCategory: animation.currentCategory ?? "logic",
        revealProgress: animation.revealProgress ?? 0,
        highlightedScore: animation.highlightedScore ?? {
          side: "pro",
          category: "logic",
          score: 0
        },
        eliminatedScores: animation.eliminatedScores ?? {
          highest: 0,
          lowest: 0
        }
      };

      this.onProgressChange({
        ...this.getProgress(),
        scoringAnimation: currentAnimation
      });
    }
  }

  private calculateFinalScore(scores: number[]): number {
    const sortedScores = [...scores].sort((a, b) => a - b);
    // 去掉最高分和最低分
    sortedScores.pop();
    sortedScores.shift();
    // 计算剩余分数的平均值
    const sum = sortedScores.reduce((a, b) => a + b, 0);
    return sum / sortedScores.length;
  }

  private async calculateDetailedFinalScores(
    updateScoringAnimation: (animation: Partial<Omit<ScoringAnimation, 'phase'>> & { phase: ScoringPhase }) => void
  ) {
    const categories = ["logic", "evidence", "rebuttal", "expression"] as const;
    type Category = typeof categories[number];
    
    const getScores = (side: "pro" | "con", category: Category): number[] => {
      return this.state.judges.map(judge => 
        judge.detailedScores?.[side][category] ?? 50
      );
    };

    const result = {
      pro: {
        logic: this.calculateFinalScore(getScores("pro", "logic")),
        evidence: this.calculateFinalScore(getScores("pro", "evidence")),
        rebuttal: this.calculateFinalScore(getScores("pro", "rebuttal")),
        expression: this.calculateFinalScore(getScores("pro", "expression"))
      },
      con: {
        logic: this.calculateFinalScore(getScores("con", "logic")),
        evidence: this.calculateFinalScore(getScores("con", "evidence")),
        rebuttal: this.calculateFinalScore(getScores("con", "rebuttal")),
        expression: this.calculateFinalScore(getScores("con", "expression"))
      }
    } as const;

    // 展示每个类别的最终分数
    for (const category of categories) {
      updateScoringAnimation({
        phase: "calculating_final",
        currentCategory: category,
        revealProgress: (categories.indexOf(category) + 1) / categories.length * 100,
        highlightedScore: {
          side: "pro",
          category,
          score: result.pro[category]
        }
      });
      await new Promise(resolve => setTimeout(resolve, 800));

      updateScoringAnimation({
        phase: "calculating_final",
        currentCategory: category,
        highlightedScore: {
          side: "con",
          category,
          score: result.con[category]
        }
      });
      await new Promise(resolve => setTimeout(resolve, 800));
    }

    return result;
  }

  private async runJudging(): Promise<void> {
    console.log("Starting judging process");
    
    // 初始化评分动画状态
    this.updateScoringAnimation({
      phase: "judge_thinking",
      currentJudge: 1,
      totalJudges: this.judges.length,
      revealProgress: 0
    });

    // 逐个评委进行评分，以展示动画效果
    const judgeResults = [];
    for (let i = 0; i < this.judges.length; i++) {
      // 更新当前评委状态
      this.updateScoringAnimation({
        phase: "judge_thinking",
        currentJudge: i + 1,
        totalJudges: this.judges.length,
        revealProgress: (i / this.judges.length) * 100
      });

      // 等待当前评委评分
      const result = await this.judges[i].evaluate(this.state.topic, this.state.messages);
      judgeResults.push(result);

      // 展示评分结果
      this.updateScoringAnimation({
        phase: "revealing_scores",
        currentJudge: i + 1,
        totalJudges: this.judges.length,
        revealProgress: ((i + 1) / this.judges.length) * 100,
        highlightedScore: {
          side: "pro",
          score: result.score.pro
        }
      });
      await new Promise(resolve => setTimeout(resolve, 800));

      this.updateScoringAnimation({
        phase: "revealing_scores",
        currentJudge: i + 1,
        totalJudges: this.judges.length,
        revealProgress: ((i + 1) / this.judges.length) * 100,
        highlightedScore: {
          side: "con",
          score: result.score.con
        }
      });
      await new Promise(resolve => setTimeout(resolve, 800));
    }

    // 保存评委结果
    this.state.judges = judgeResults;

    // 计算最终分数
    this.updateScoringAnimation({
      phase: "calculating_final",
      revealProgress: 0
    });

    // 计算去掉最高分和最低分后的平均分
    const calculateFinalScore = async (scores: number[]) => {
      const sortedScores = [...scores].sort((a, b) => a - b);
      
      const highest = sortedScores[sortedScores.length - 1] ?? 0;
      const lowest = sortedScores[0] ?? 0;
      
      // 展示被移除的最高分和最低分
      this.updateScoringAnimation({
        phase: "calculating_final",
        eliminatedScores: {
          highest,
          lowest
        }
      });
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // 去掉最高分和最低分
      sortedScores.pop();
      sortedScores.shift();
      
      // 计算剩余分数的平均值
      const sum = sortedScores.reduce((a, b) => a + b, 0);
      return sum / sortedScores.length;
    };

    const detailedFinalScores = await this.calculateDetailedFinalScores(this.updateScoringAnimation.bind(this));
    const proScores = this.state.judges.map(judge => judge.score.pro);
    const conScores = this.state.judges.map(judge => judge.score.con);

    const proFinalScore = await calculateFinalScore(proScores);
    const conFinalScore = await calculateFinalScore(conScores);

    // 更新状态中的最终得分
    this.state.finalScores = {
      pro: proFinalScore,
      con: conFinalScore,
      details: detailedFinalScores,
      eliminatedScores: {
        pro: {
          highest: Math.max(...proScores),
          lowest: Math.min(...proScores)
        },
        con: {
          highest: Math.max(...conScores),
          lowest: Math.min(...conScores)
        }
      }
    };

    // 确定获胜方
    this.state.winner = proFinalScore > conFinalScore ? "pro" : 
                       proFinalScore < conFinalScore ? "con" : null;

    // 展示获胜方
    this.updateScoringAnimation({
      phase: "showing_winner",
      revealProgress: 100,
      highlightedScore: {
        side: this.state.winner || "pro",
        score: this.state.winner === "pro" ? proFinalScore : conFinalScore
      }
    });
    await new Promise(resolve => setTimeout(resolve, 1500));

    // 完成评分动画
    this.updateScoringAnimation({
      phase: "completed",
      revealProgress: 100
    });
  }

  public async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error("Debate is already running");
    }

    try {
      console.log("Starting debate");
      this.isRunning = true;
      this.state.status = "in_progress";
      this.notifyStateChange();
      
      this.debatePromise = this.runDebateLoop();
      await this.debatePromise;
    } catch (error) {
      console.error("Error in debate:", error);
      this.setErrorStatus(error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  public setErrorStatus(message: string): void {
    this.state.status = "error";
    this.state.errorMessage = message;
    this.state.updatedAt = new Date();
    this.isRunning = false;
    this.notifyProgressChange(null);
    this.notifyStateChange();
  }

  public restoreState(state: DebateState): void {
    // Create a new state object with proper date conversions
    this.state = {
      ...state,
      createdAt: new Date(state.createdAt),
      updatedAt: new Date(state.updatedAt),
      messages: state.messages.map(msg => ({
        ...msg,
        timestamp: new Date(msg.timestamp)
      }))
    };

    // Reset all runtime state
    this.maxRounds = state.config.maxRounds;
    this.currentRound = Math.floor(state.messages.length / 2);
    this.initializeAgents(state.config);
    this.isRunning = false;  // Always start as not running
    this.errorMessage = state.errorMessage;
    this.streamingText = "";
    this.currentStreamingSide = null;
    this.isThinking = false;
    
    // Notify initial state
    this.notifyProgressChange(null);
    this.notifyStateChange();

    // Only resume if the debate was in progress and there's no error
    if (state.status === "in_progress" && !state.errorMessage && !this.debatePromise) {
      this.isRunning = true;
      this.debatePromise = this.runDebateLoop();
    }
  }

  public getProgress(): DebateProgress {
    return {
      currentRound: this.currentRound + 1,
      totalRounds: this.maxRounds,
      percentage: (this.currentRound / this.maxRounds) * 100,
      currentSpeaker: this.state.messages.length % 2 === 0 ? "pro" : "con",
      isThinking: this.isThinking,
      streamingText: this.streamingText,
      currentStreamingSide: this.currentStreamingSide,
    };
  }
} 