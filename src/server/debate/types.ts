export interface DebateMessage {
  side: "pro" | "con";
  message: string;
  timestamp: Date;
}

export type ScoringPhase = 
  | "not_started"
  | "judge_thinking"
  | "revealing_scores"
  | "showing_details"
  | "calculating_final"
  | "showing_winner"
  | "completed";

export type ScoreCategory = "logic" | "evidence" | "rebuttal" | "expression";

export interface ScoringAnimation {
  phase: ScoringPhase;
  currentJudge: number;
  totalJudges: number;
  currentCategory?: ScoreCategory;
  revealProgress: number;
  highlightedScore?: {
    side: "pro" | "con";
    category?: ScoreCategory;
    score: number;
  };
  eliminatedScores?: {
    highest: number;
    lowest: number;
  };
}

export interface Judge {
  name: string;
  score: {
    pro: number;
    con: number;
  };
  detailedScores: {
    pro: {
      logic: number;      // 论点的清晰度和逻辑性
      evidence: number;   // 论据的充分性和相关性
      rebuttal: number;   // 反驳的有效性
      expression: number; // 表达的说服力
    };
    con: {
      logic: number;
      evidence: number;
      rebuttal: number;
      expression: number;
    };
  };
  comment: string;
  commentHighlights?: {
    pros: string[];
    cons: string[];
    suggestions: string[];
  };
  scoreReasons: {
    pro: {
      logic: string;
      evidence: string;
      rebuttal: string;
      expression: string;
    };
    con: {
      logic: string;
      evidence: string;
      rebuttal: string;
      expression: string;
    };
  };
  overallComment: string;
  recommendedWinner?: {
    side: "pro" | "con";
    reason: string;
  } | null;
  animationState?: {
    isScoring: boolean;
    currentCategory?: ScoreCategory;
    scoreRevealProgress: number;
    phase: ScoringPhase;
  };
}

export interface DebateProgress {
  currentRound: number;
  totalRounds: number;
  percentage: number;
  currentSpeaker: "pro" | "con" | null;
  isThinking: boolean;
  streamingText: string;
  currentStreamingSide: "pro" | "con" | null;
  scoringAnimation?: ScoringAnimation;
  debateStatus?: "pending" | "in_progress" | "judging" | "completed" | "error";
}

export interface DebateState {
  id: string;
  topic: string;
  background: string;
  status: "pending" | "in_progress" | "judging" | "completed" | "error";
  messages: DebateMessage[];
  judges: Judge[];
  winner: "pro" | "con" | null;
  finalScores?: {
    pro: number;
    con: number;
    details: {
      pro: {
        logic: number;
        evidence: number;
        rebuttal: number;
        expression: number;
      };
      con: {
        logic: number;
        evidence: number;
        rebuttal: number;
        expression: number;
      };
    };
    eliminatedScores: {
      pro: {
        highest: number;
        lowest: number;
      };
      con: {
        highest: number;
        lowest: number;
      };
    };
  };
  createdAt: Date;
  updatedAt: Date;
  errorMessage: string | null;
  config: DebateConfig;
}

export interface DebateAgentConfig {
  apiKey: string;
  baseUrl?: string;
}

export interface DebateAgent {
  side: "pro" | "con";
  generateResponse: (
    topic: string, 
    context: DebateMessage[],
    streamCallback?: (text: string) => void
  ) => Promise<string>;
}

export interface DebateJudge {
  evaluate: (topic: string, messages: DebateMessage[]) => Promise<Judge>;
}

export interface DifyConfig {
  apiKey: string;
}

export interface JudgeConfig {
  apiKey: string;  // 评委的 Dify API Key
  name: string;    // 评委名字
}

export interface DebateConfig {
  proConfig: DifyConfig;
  conConfig: DifyConfig;
  judgeConfigs: [JudgeConfig, JudgeConfig, JudgeConfig, JudgeConfig, JudgeConfig, JudgeConfig];  // 必须提供6个评委
  maxRounds: number;
} 