"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { api } from "@/trpc/react";
import { useToast } from "@/components/ui/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, MessageCircle, Trophy, User2, Scale } from "lucide-react";
import type { RouterOutputs } from "@/trpc/shared";
import type { ScoringPhase, ScoreCategory } from "@/server/debate/types";
import React from "react";
import { Label } from "@/components/ui/label";

type DebateStatus = RouterOutputs["debate"]["getDebateStatus"] & {
  streamingText?: string;
  isThinking?: boolean;
  currentSpeaker?: "pro" | "con" | null;
  currentStreamingSide?: "pro" | "con" | null;
  scoringAnimation?: {
    phase: ScoringPhase;
    currentJudge: number;
    totalJudges: number;
    highlightedScore?: {
      side: "pro" | "con";
      category?: ScoreCategory;
      score: number;
    };
    currentCategory?: ScoreCategory;
  };
};

interface DebateMessage {
  side: "pro" | "con";
  message: string;
  timestamp: Date;
}

interface Judge {
  name: string;
  score: {
    pro: number;
    con: number;
  };
  detailedScores: {
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
  comment: string;
  commentHighlights?: {
    pros: string[];
    cons: string[];
    suggestions: string[];
  };
  scoreReasons?: {
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
  overallComment?: string;
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

interface JudgeConfig {
  apiKey: string;
  name: string;
}

type JudgeConfigsTuple = [
  JudgeConfig,
  JudgeConfig,
  JudgeConfig,
  JudgeConfig,
  JudgeConfig,
  JudgeConfig
];

const Message = React.memo(({ message, isStreaming, streamingText, roundNumber }: {
  message: DebateMessage;
  isStreaming: boolean;
  streamingText: string;
  roundNumber: number;
}) => {
  const isPro = message.side === "pro";
  const messageContent = isStreaming ? streamingText : message.message;

  return (
    <div className="w-full">
      <div className={`flex ${isPro ? "justify-start" : "justify-end"} items-start space-x-2 mb-4`}>
        {isPro && (
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
            <User2 className="w-6 h-6 text-blue-400" />
          </div>
        )}
        <div className={`flex-1 max-w-[80%] ${isPro ? "mr-auto" : "ml-auto"}`}>
          <div 
            className={`p-4 rounded-lg backdrop-blur-sm ${
              isPro 
                ? "bg-blue-900/30 border border-blue-800/50 text-blue-100" 
                : "bg-red-900/30 border border-red-800/50 text-red-100"
            }`}
            style={{ minHeight: '100px' }}
          >
            <div className="flex items-center justify-between mb-2">
              <span className={`text-sm font-medium ${isPro ? "text-blue-400" : "text-red-400"}`}>
                {isPro ? "正方" : "反方"} 第{roundNumber}轮
              </span>
              <span className={`text-xs ${isPro ? "text-blue-400" : "text-red-400"}`}>
                {new Date(message.timestamp).toLocaleTimeString()}
              </span>
            </div>
            <div className="text-lg whitespace-pre-wrap leading-relaxed">
              {messageContent}
              {isStreaming && (
                <span className="inline-block w-2 h-4 ml-1 align-middle animate-pulse">▋</span>
              )}
            </div>
          </div>
        </div>
        {!isPro && (
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
            <User2 className="w-6 h-6 text-red-400" />
          </div>
        )}
      </div>
    </div>
  );
});

Message.displayName = 'Message';

const MessageList = React.memo(({ messages, streamingText, currentStreamingSide }: {
  messages: DebateMessage[];
  streamingText: string;
  currentStreamingSide: "pro" | "con" | null;
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [shouldScroll, setShouldScroll] = useState(true);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const scrollTimeoutRef = useRef<NodeJS.Timeout>();

  // 处理滚动事件
  useEffect(() => {
    const container = messagesEndRef.current?.parentElement;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const bottom = scrollHeight - clientHeight;
      const isNear = Math.abs(scrollTop - bottom) < 100;
      setIsNearBottom(isNear);
      setShouldScroll(isNear);
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  // 处理自动滚动
  useEffect(() => {
    if (shouldScroll && isNearBottom) {
      const scrollToBottom = () => {
        if (messagesEndRef.current) {
          try {
            messagesEndRef.current.scrollIntoView({ 
              behavior: "smooth",
              block: "end"
            });
          } catch (error) {
            console.error("滚动失败:", error);
            // 如果平滑滚动失败，尝试直接滚动
            messagesEndRef.current.scrollIntoView();
          }
        }
      };

      // 清除之前的定时器
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }

      // 设置新的定时器
      scrollTimeoutRef.current = setTimeout(scrollToBottom, 100);
    }

    // 清理函数
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [messages.length, streamingText, shouldScroll, isNearBottom]);

  const allMessages = useMemo(() => {
    const result = [...messages];
    if (streamingText && currentStreamingSide) {
      const lastMessage = result[result.length - 1];
      if (!lastMessage || lastMessage.side !== currentStreamingSide) {
        result.push({
          side: currentStreamingSide,
          message: streamingText,
          timestamp: new Date(),
        });
      }
    }
    return result;
  }, [messages, streamingText, currentStreamingSide]);

  return (
    <div className="flex-1 overflow-y-auto space-y-4 pr-4 custom-scrollbar">
      <div className="flex flex-col items-stretch min-h-full">
        {allMessages.map((message, index) => {
          const roundNumber = Math.floor(index / 2) + 1;
          return (
            <Message
              key={`${message.side}-${message.timestamp.getTime()}`}
              message={message}
              isStreaming={index === allMessages.length - 1 && message.side === currentStreamingSide}
              streamingText={index === allMessages.length - 1 && message.side === currentStreamingSide ? streamingText : message.message}
              roundNumber={roundNumber}
            />
          );
        })}
        <div ref={messagesEndRef} className="h-4" />
      </div>
    </div>
  );
});

MessageList.displayName = 'MessageList';

const ScoringAnimation = ({ phase, currentJudge, totalJudges, highlightedScore, currentCategory }: {
  phase: ScoringPhase;
  currentJudge: number;
  totalJudges: number;
  highlightedScore?: {
    side: "pro" | "con";
    category?: ScoreCategory;
    score: number;
  };
  currentCategory?: ScoreCategory;
}) => {
  const getCategoryLabel = (category?: ScoreCategory) => {
    switch (category) {
      case "logic": return "论点逻辑性";
      case "evidence": return "论据相关性";
      case "rebuttal": return "反驳有效性";
      case "expression": return "表达说服力";
      default: return "综合评分";
    }
  };

  const getPhaseLabel = (phase: ScoringPhase) => {
    switch (phase) {
      case "judge_thinking": return "评委思考中";
      case "revealing_scores": return "评分展示中";
      case "calculating_final": return "计算最终得分";
      case "showing_winner": return "评分完成";
      default: return "评分进行中";
    }
  };

  return (
    <Card className="bg-black/50 backdrop-blur-md border-yellow-800/50 p-6">
      <div className="space-y-6">
        <div className="flex items-center justify-center gap-3">
          <Trophy className="h-6 w-6 text-yellow-400 animate-pulse" />
          <h3 className="text-xl font-semibold text-yellow-400">{getPhaseLabel(phase)}</h3>
        </div>
        
        <div className="space-y-4">
          <div className="flex justify-between text-sm text-yellow-300">
            <span>评委进度 {currentJudge}/{totalJudges}</span>
            <span>{Math.round((currentJudge / totalJudges) * 100)}%</span>
          </div>
          <div className="w-full bg-yellow-950/50 rounded-full h-2.5 overflow-hidden">
            <motion.div
              className="bg-gradient-to-r from-yellow-600 to-yellow-400 h-full rounded-full"
              initial={{ width: "0%" }}
              animate={{ width: `${(currentJudge / totalJudges) * 100}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
        </div>

        <AnimatePresence mode="wait">
          {phase === "judge_thinking" && (
            <motion.div
              key="thinking"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="text-center space-y-3"
            >
              <div className="flex items-center justify-center gap-2">
                <Scale className="h-5 w-5 animate-bounce text-yellow-300" />
                <span className="text-yellow-300">评委正在仔细思考...</span>
              </div>
              <div className="text-sm text-yellow-300/80">
                正在评估双方表现
              </div>
            </motion.div>
          )}
          
          {phase === "revealing_scores" && highlightedScore && (
            <motion.div
              key="revealing"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="space-y-4"
            >
              <div className="text-center space-y-2">
                <motion.div 
                  className="text-yellow-300 font-medium"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.2 }}
                >
                  {highlightedScore.side === "pro" ? "正方" : "反方"}
                  {highlightedScore.category ? ` - ${getCategoryLabel(highlightedScore.category)}` : ""}
                </motion.div>
                <motion.div
                  className="text-4xl font-bold text-yellow-400"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 200, damping: 10 }}
                >
                  {highlightedScore.score.toFixed(1)}
                </motion.div>
              </div>
            </motion.div>
          )}
          
          {phase === "calculating_final" && (
            <motion.div
              key="calculating"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="text-center space-y-4"
            >
              <div className="flex items-center justify-center gap-2 text-yellow-300/80">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>正在计算最终得分...</span>
              </div>
              {currentCategory && (
                <motion.div 
                  className="text-yellow-300"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.2 }}
                >
                  <span>正在统计{getCategoryLabel(currentCategory)}</span>
                </motion.div>
              )}
            </motion.div>
          )}

          {phase === "showing_winner" && (
            <motion.div
              key="winner"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="text-center space-y-4"
            >
              <div className="flex items-center justify-center gap-2 text-yellow-300">
                <Trophy className="h-6 w-6 animate-bounce" />
                <span className="text-xl font-bold">评分完成</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Card>
  );
};

export default function DebatePage() {
  const [proConfig, setProConfig] = useState({
    apiKey: "",
  });
  const [conConfig, setConConfig] = useState({
    apiKey: "",
  });
  
  const [judgeConfigs, setJudgeConfigs] = useState<JudgeConfigsTuple>([
    { apiKey: "", name: "评委1" },
    { apiKey: "", name: "评委2" },
    { apiKey: "", name: "评委3" },
    { apiKey: "", name: "评委4" },
    { apiKey: "", name: "评委5" },
    { apiKey: "", name: "评委6" }
  ] as JudgeConfigsTuple);

  const [topic, setTopic] = useState("");
  const [background, setBackground] = useState("");
  const [maxRounds, setMaxRounds] = useState(5);
  const [debateId, setDebateId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DebateMessage[]>([]);
  const [judges, setJudges] = useState<Judge[]>([]);
  const [winner, setWinner] = useState<"pro" | "con" | null>(null);
  const proMessagesEndRef = useRef<HTMLDivElement>(null);
  const conMessagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const updateJudgeConfig = (index: number, apiKey: string) => {
    setJudgeConfigs(prev => {
      const newConfigs = [...prev] as JudgeConfigsTuple;
      newConfigs[index] = { apiKey, name: `评委${index + 1}` };
      return newConfigs;
    });
  };

  // 自动滚动到最新消息
  const scrollToBottom = (side: "pro" | "con") => {
    const ref = side === "pro" ? proMessagesEndRef : conMessagesEndRef;
    ref.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage) {
        scrollToBottom(lastMessage.side);
      }
    }
  }, [messages]);

  // tRPC mutations and queries
  const startDebateMutation = api.debate.startDebate.useMutation({
    onSuccess: (data) => {
      setDebateId(data.debateId);
      toast({
        title: "辩论开始",
        description: "AI辩手正在进行辩论...",
      });
    },
    onError: (error) => {
      toast({
        title: "错误",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const { data: debateStatusData, isPending } = api.debate.getDebateStatus.useQuery(
    { debateId: debateId! },
    {
      enabled: !!debateId,
      refetchInterval: 300,
      retry: false,
      refetchOnWindowFocus: false,
    }
  );

  // 监听状态变化
  useEffect(() => {
    if (debateStatusData) {
      setMessages(debateStatusData.messages);
      setJudges(debateStatusData.judges);
      setWinner(debateStatusData.winner);

      if (debateStatusData.status === "completed") {
        toast({
          title: "辩论结束",
          description: "评委已完成评判",
        });
      } else if (debateStatusData.status === "error") {
        toast({
          title: "辩论出错",
          description: debateStatusData.errorMessage || "未知错误",
          variant: "destructive",
        });
      }
    }
  }, [debateStatusData, toast]);

  const startDebate = () => {
    if (!proConfig.apiKey || !conConfig.apiKey || !topic || !background || 
        judgeConfigs.some(judge => !judge.apiKey)) {
      toast({
        title: "错误",
        description: "请填写所有必要的配置信息",
        variant: "destructive",
      });
      return;
    }

    startDebateMutation.mutate({
      topic,
      background,
      config: {
        proConfig,
        conConfig,
        judgeConfigs,
        maxRounds,
      },
    });
  };

  // 计算进度
  const progress = messages.length > 0 ? Math.min(100, (messages.length / (maxRounds * 2)) * 100) : 0;
  const currentRound = Math.floor(messages.length / 2) + 1;
  const isProTurn = messages.length % 2 === 0;
  const streamingText = debateStatusData?.streamingText || "";
  const isThinking = debateStatusData?.isThinking || false;

  // 渲染所有消息
  const renderMessages = () => {
    const allMessages = [...messages];
    
    // 如果有流式消息，添加到适当的位置
    if (streamingText && debateStatusData?.currentStreamingSide) {
      const lastMessage = allMessages[allMessages.length - 1];
      const isNewMessage = !lastMessage || lastMessage.side !== debateStatusData.currentStreamingSide;
      
      if (isNewMessage) {
        allMessages.push({
          side: debateStatusData.currentStreamingSide,
          message: streamingText,
          timestamp: new Date(),
        });
      } else {
        // 更新最后一条消息的内容
        allMessages[allMessages.length - 1] = {
          ...lastMessage,
          message: streamingText,
        };
      }
    }

    return allMessages.map((message, index) => renderMessage(message, index));
  };

  // 渲染消息
  const renderMessage = (message: DebateMessage, index: number) => {
    const isPro = message.side === "pro";
    const roundNumber = Math.floor(index / 2) + 1;
    const isStreaming = streamingText && 
                       debateStatusData?.currentStreamingSide === message.side && 
                       index === messages.length;

    return (
      <motion.div
        key={`${message.side}-${roundNumber}-${message.timestamp.getTime()}`}
        initial={{ opacity: 0, x: isPro ? -20 : 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: isPro ? -20 : 20 }}
        className={`flex ${isPro ? "justify-start" : "justify-end"} items-start space-x-2 mb-4`}
      >
        {isPro && (
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
            <User2 className="w-6 h-6 text-blue-400" />
          </div>
        )}
        <div className={`max-w-[80%] ${isPro ? "mr-auto" : "ml-auto"}`}>
          <div 
            className={`p-4 rounded-lg backdrop-blur-sm ${
              isPro 
                ? "bg-blue-900/30 border border-blue-800/50 text-blue-100" 
                : "bg-red-900/30 border border-red-800/50 text-red-100"
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className={`text-sm font-medium ${isPro ? "text-blue-400" : "text-red-400"}`}>
                {isPro ? "正方" : "反方"} #{roundNumber}
              </span>
              <span className={`text-xs ${isPro ? "text-blue-400" : "text-red-400"}`}>
                {new Date(message.timestamp).toLocaleTimeString()}
              </span>
            </div>
            <p className="text-lg whitespace-pre-wrap leading-relaxed">
              {message.message}
              {isStreaming && (
                <span className="animate-pulse">▋</span>
              )}
            </p>
          </div>
        </div>
        {!isPro && (
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
            <User2 className="w-6 h-6 text-red-400" />
          </div>
        )}
      </motion.div>
    );
  };

  // 渲染进度区域
  const renderProgress = () => (
    <Card className="bg-black/50 backdrop-blur-md border-gray-800 p-6 flex-shrink-0">
      <div className="flex flex-col items-center mb-6">
        {debateStatusData?.status === "judging" ? (
          <div className="text-2xl font-bold text-yellow-400 mb-2 flex items-center gap-2">
            <Scale className="h-6 w-6 animate-bounce" />
            评委正在评分中
          </div>
        ) : (
          <>
            <div className="text-4xl font-bold text-yellow-400 mb-2">
              第 {Math.floor((messages.length + 1) / 2)} 轮
            </div>
            <div className="text-lg text-gray-400">共 {maxRounds} 轮</div>
          </>
        )}
      </div>
      
      <div className="space-y-6">
        <div>
          <div className="flex justify-between mb-2">
            <span className="text-lg font-medium text-yellow-400">总进度</span>
            <span className="text-lg font-medium text-yellow-400">
              {debateStatusData?.status === "judging" ? "100%" : `${Math.round(progress)}%`}
            </span>
          </div>
          <div className="w-full bg-gray-900/50 rounded-full h-4 p-1">
            <motion.div 
              className="bg-gradient-to-r from-blue-500 via-yellow-500 to-red-500 h-2 rounded-full relative"
              initial={{ width: "0%" }}
              animate={{ width: debateStatusData?.status === "judging" ? "100%" : `${progress}%` }}
              transition={{ duration: 0.5 }}
            >
              <div className="absolute -right-2 -top-1 w-4 h-4 bg-white rounded-full shadow-lg shadow-yellow-500/50" />
            </motion.div>
          </div>
        </div>
        
        {debateStatusData?.status === "judging" ? (
          <div className="bg-yellow-900/30 p-4 rounded-lg border border-yellow-800">
            <div className="flex items-center justify-center space-x-3">
              <div className="w-3 h-3 bg-yellow-500 rounded-full animate-pulse" />
              <span className="text-xl font-medium text-yellow-400">
                评委正在仔细评分...
              </span>
            </div>
          </div>
        ) : (isThinking || streamingText) && (
          <div className="bg-black/30 p-4 rounded-lg border border-gray-800">
            <div className="flex items-center justify-center space-x-3">
              {isThinking ? (
                <>
                  <div className="w-3 h-3 bg-green-500 rounded-full animate-ping" />
                  <span className="text-xl font-medium text-green-400">
                    {debateStatusData?.currentStreamingSide === "pro" ? "正方" : "反方"}正在思考...
                  </span>
                </>
              ) : streamingText ? (
                <>
                  <div className="w-3 h-3 bg-yellow-500 rounded-full animate-pulse" />
                  <span className="text-xl font-medium text-yellow-400">
                    {debateStatusData?.currentStreamingSide === "pro" ? "正方" : "反方"}正在回应...
                  </span>
                </>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </Card>
  );

  // 渲染主题和背景区域
  const renderTopicAndBackground = () => (
    <Card className="bg-black/50 backdrop-blur-md border-gray-800 p-6 flex-shrink-0">
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-bold text-center mb-2">辩题</h2>
          <p className="text-center text-yellow-400 text-lg font-medium">{topic}</p>
        </div>
        <div className="border-t border-gray-800 my-4" />
        <div>
          <h2 className="text-xl font-bold text-center mb-2">背景</h2>
          <p className="text-center text-gray-300 text-base leading-relaxed whitespace-pre-wrap">{background}</p>
        </div>
      </div>
    </Card>
  );

  // 配置页面的输入部分
  const renderConfigInputs = () => (
    <div className="space-y-8">
      {/* 辩手配置区域 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* 正方配置 */}
        <div className="space-y-4 p-6 rounded-xl bg-gradient-to-br from-blue-950/50 to-blue-900/30 border border-blue-800/50 backdrop-blur-sm">
          <h2 className="text-2xl font-semibold text-blue-400 flex items-center gap-2">
            <User2 className="h-6 w-6" />
            正方辩手
          </h2>
          <div className="space-y-2">
            <Label className="text-blue-300">API Key</Label>
            <Input
              type="password"
              value={proConfig.apiKey}
              onChange={(e) => setProConfig({ apiKey: e.target.value })}
              placeholder="请输入正方 Dify API Key"
              className="bg-black/30 border-blue-800/50 focus:border-blue-500 transition-colors"
            />
          </div>
        </div>

        {/* 反方配置 */}
        <div className="space-y-4 p-6 rounded-xl bg-gradient-to-br from-red-950/50 to-red-900/30 border border-red-800/50 backdrop-blur-sm">
          <h2 className="text-2xl font-semibold text-red-400 flex items-center gap-2">
            <User2 className="h-6 w-6" />
            反方辩手
          </h2>
          <div className="space-y-2">
            <Label className="text-red-300">API Key</Label>
            <Input
              type="password"
              value={conConfig.apiKey}
              onChange={(e) => setConConfig({ apiKey: e.target.value })}
              placeholder="请输入反方 Dify API Key"
              className="bg-black/30 border-red-800/50 focus:border-red-500 transition-colors"
            />
          </div>
        </div>
      </div>

      {/* 评委配置区域 */}
      <div className="space-y-4 p-6 rounded-xl bg-gradient-to-br from-yellow-950/50 to-yellow-900/30 border border-yellow-800/50 backdrop-blur-sm">
        <h2 className="text-2xl font-semibold text-yellow-400 flex items-center gap-2 mb-6">
          <Trophy className="h-6 w-6" />
          评委配置
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {judgeConfigs.map((judge, index) => (
            <div key={index} className="space-y-2 bg-black/20 p-4 rounded-lg border border-yellow-800/30">
              <Label className="text-yellow-300">评委 {index + 1}</Label>
              <Input
                type="password"
                value={judge.apiKey}
                onChange={(e) => updateJudgeConfig(index, e.target.value)}
                placeholder={`请输入评委${index + 1}的API Key`}
                className="bg-black/30 border-yellow-800/50 focus:border-yellow-500 transition-colors"
              />
            </div>
          ))}
        </div>
      </div>

      {/* 辩论设置区域 */}
      <div className="space-y-4 p-6 rounded-xl bg-gradient-to-br from-purple-950/50 to-purple-900/30 border border-purple-800/50 backdrop-blur-sm">
        <h2 className="text-2xl font-semibold text-purple-400 flex items-center gap-2 mb-6">
          <MessageCircle className="h-6 w-6" />
          辩论设置
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label className="text-purple-300">辩论主题</Label>
            <Input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="请输入辩论主题"
              className="bg-black/30 border-purple-800/50 focus:border-purple-500 transition-colors"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-purple-300">辩论轮次</Label>
            <Input
              type="number"
              min={1}
              max={50}
              value={maxRounds}
              onChange={(e) => setMaxRounds(Math.min(50, Math.max(1, parseInt(e.target.value) || 1)))}
              placeholder="辩论轮次 (1-50)"
              className="bg-black/30 border-purple-800/50 focus:border-purple-500 transition-colors"
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label className="text-purple-300">辩论背景</Label>
            <textarea
              value={background}
              onChange={(e) => setBackground(e.target.value)}
              placeholder="请输入辩论背景（可以详细说明辩题的上下文和限定）"
              className="w-full min-h-[120px] p-4 rounded-lg bg-black/30 border border-purple-800/50 focus:border-purple-500 transition-colors text-white resize-y"
            />
          </div>
        </div>
      </div>

      {/* 开始辩论按钮 */}
      <Button 
        onClick={startDebate}
        disabled={startDebateMutation.isPending}
        className="w-full bg-gradient-to-r from-blue-600 via-purple-600 to-red-600 hover:from-blue-700 hover:via-purple-700 hover:to-red-700 text-white py-8 text-xl rounded-xl transition-all transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none shadow-lg shadow-purple-900/20"
      >
        {startDebateMutation.isPending ? (
          <>
            <Loader2 className="mr-2 h-6 w-6 animate-spin" />
            正在开始...
          </>
        ) : (
          "开始辩论"
        )}
      </Button>
    </div>
  );

  // 在评委区域的渲染部分更新如下：
  const renderJudgesArea = () => (
    <div className="flex-1 overflow-y-auto space-y-4 custom-scrollbar">
      {debateStatusData?.scoringAnimation && (
        <ScoringAnimation
          phase={debateStatusData.scoringAnimation.phase}
          currentJudge={debateStatusData.scoringAnimation.currentJudge}
          totalJudges={debateStatusData.scoringAnimation.totalJudges}
          highlightedScore={debateStatusData.scoringAnimation.highlightedScore}
          currentCategory={debateStatusData.scoringAnimation.currentCategory}
        />
      )}
      <AnimatePresence>
        {judges.map((judge, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ delay: index * 0.1 }}
          >
            <Card className="bg-black/50 backdrop-blur-md border-gray-800 p-6">
              {/* 评委名称和总分 */}
              <div className="border-b border-gray-800 pb-4 mb-4">
                <h3 className="font-semibold text-yellow-400 text-lg mb-4 flex items-center gap-2">
                  <Trophy className="h-5 w-5" />
                  {judge.name}
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">正方总分</span>
                      <span className="text-lg font-medium text-blue-400">{judge.score.pro.toFixed(1)}分</span>
                    </div>
                    <div className="w-full bg-gray-900 rounded-full h-2">
                      <motion.div
                        className="bg-blue-500 h-2 rounded-full"
                        initial={{ width: "0%" }}
                        animate={{ width: `${judge.score.pro}%` }}
                        transition={{ duration: 0.5 }}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">反方总分</span>
                      <span className="text-lg font-medium text-red-400">{judge.score.con.toFixed(1)}分</span>
                    </div>
                    <div className="w-full bg-gray-900 rounded-full h-2">
                      <motion.div
                        className="bg-red-500 h-2 rounded-full"
                        initial={{ width: "0%" }}
                        animate={{ width: `${judge.score.con}%` }}
                        transition={{ duration: 0.5 }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* 详细评分 */}
              <div className="space-y-6">
                {/* 正方详细评分 */}
                <div className="space-y-4">
                  <h4 className="text-blue-400 font-medium">正方评分详情</h4>
                  <div className="grid grid-cols-1 gap-4">
                    {Object.entries(judge.detailedScores.pro).map(([category, score]) => (
                      <div key={category} className="bg-black/30 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm text-gray-400">
                            {category === "logic" ? "论点逻辑性" :
                             category === "evidence" ? "论据相关性" :
                             category === "rebuttal" ? "反驳有效性" :
                             "表达说服力"}
                          </span>
                          <span className="text-blue-400 font-medium">{score.toFixed(1)}分</span>
                        </div>
                        <p className="text-sm text-gray-300 mt-2">
                          {judge.scoreReasons?.pro[category as ScoreCategory]}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 反方详细评分 */}
                <div className="space-y-4">
                  <h4 className="text-red-400 font-medium">反方评分详情</h4>
                  <div className="grid grid-cols-1 gap-4">
                    {Object.entries(judge.detailedScores.con).map(([category, score]) => (
                      <div key={category} className="bg-black/30 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm text-gray-400">
                            {category === "logic" ? "论点逻辑性" :
                             category === "evidence" ? "论据相关性" :
                             category === "rebuttal" ? "反驳有效性" :
                             "表达说服力"}
                          </span>
                          <span className="text-red-400 font-medium">{score.toFixed(1)}分</span>
                        </div>
                        <p className="text-sm text-gray-300 mt-2">
                          {judge.scoreReasons?.con[category as ScoreCategory]}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 总评 */}
                {judge.overallComment && (
                  <div className="border-t border-gray-800 pt-4 mt-4">
                    <h4 className="text-yellow-400 font-medium mb-3">总评</h4>
                    <p className="text-gray-300 text-sm leading-relaxed">
                      {judge.overallComment}
                    </p>
                  </div>
                )}

                {/* 评委推荐 */}
                {judge.recommendedWinner && (
                  <div className="border-t border-gray-800 pt-4 mt-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Trophy className="h-4 w-4 text-yellow-400" />
                      <h4 className="text-yellow-400 font-medium">
                        推荐获胜方：
                        <span className={judge.recommendedWinner.side === "pro" ? "text-blue-400" : "text-red-400"}>
                          {judge.recommendedWinner.side === "pro" ? "正方" : "反方"}
                        </span>
                      </h4>
                    </div>
                    <p className="text-gray-300 text-sm leading-relaxed">
                      {judge.recommendedWinner.reason}
                    </p>
                  </div>
                )}

                {/* 亮点与建议 */}
                {judge.commentHighlights && (
                  <div className="border-t border-gray-800 pt-4 mt-4 grid grid-cols-1 gap-4">
                    <div>
                      <h4 className="text-green-400 font-medium mb-2">亮点</h4>
                      <ul className="list-disc list-inside space-y-1">
                        {judge.commentHighlights.pros.map((pro, i) => (
                          <li key={i} className="text-gray-300 text-sm">{pro}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <h4 className="text-orange-400 font-medium mb-2">不足</h4>
                      <ul className="list-disc list-inside space-y-1">
                        {judge.commentHighlights.cons.map((con, i) => (
                          <li key={i} className="text-gray-300 text-sm">{con}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <h4 className="text-purple-400 font-medium mb-2">建议</h4>
                      <ul className="list-disc list-inside space-y-1">
                        {judge.commentHighlights.suggestions.map((suggestion, i) => (
                          <li key={i} className="text-gray-300 text-sm">{suggestion}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );

  return (
    <div className="min-h-screen bg-[url('/debate-background.jpg')] bg-cover bg-center bg-no-repeat text-white">
      <div className="min-h-screen bg-black/80 backdrop-blur-sm py-12">
        {!debateId ? (
          // 配置页面
          <div className="container mx-auto px-4 max-w-5xl">
            <motion.h1 
              className="text-5xl font-bold text-center mb-12 text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-purple-400 to-red-400"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              AI 智能辩论赛
            </motion.h1>
            
            <motion.div 
              className="space-y-8"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              {renderConfigInputs()}
            </motion.div>
          </div>
        ) : (
          // 辩论场景
          <div className="container mx-auto p-4">
            <div className="grid grid-cols-12 gap-6">
              {/* 辩论区域 */}
              <div className="col-span-9">
                <Card className="bg-black/50 backdrop-blur-md border-gray-800 p-6 h-[calc(100vh-2rem)] flex flex-col">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center space-x-3">
                      <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse" />
                      <h2 className="text-xl font-bold text-blue-400">正方辩手</h2>
                    </div>
                    <div className="flex items-center space-x-3">
                      <h2 className="text-xl font-bold text-red-400">反方辩手</h2>
                      <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                    </div>
                  </div>

                  <MessageList
                    messages={messages}
                    streamingText={debateStatusData?.streamingText || ""}
                    currentStreamingSide={debateStatusData?.currentStreamingSide || null}
                  />

                  {/* 思考/回应状态指示器 */}
                  {(isThinking || streamingText) && (
                    <div className="mt-4 p-4 bg-black/30 rounded-lg border border-gray-800">
                      <div className="flex items-center justify-center space-x-3">
                        {isThinking ? (
                          <>
                            <div className="w-3 h-3 bg-green-500 rounded-full animate-ping" />
                            <span className="text-lg font-medium text-green-400">
                              {debateStatusData?.currentStreamingSide === "pro" ? "正方" : "反方"}正在思考...
                            </span>
                          </>
                        ) : streamingText ? (
                          <>
                            <div className="w-3 h-3 bg-yellow-500 rounded-full animate-pulse" />
                            <span className="text-lg font-medium text-yellow-400">
                              {debateStatusData?.currentStreamingSide === "pro" ? "正方" : "反方"}正在回应...
                            </span>
                          </>
                        ) : null}
                      </div>
                    </div>
                  )}
                </Card>
              </div>

              {/* 控制区 */}
              <div className="col-span-3">
                <div className="space-y-6 h-[calc(100vh-2rem)] flex flex-col">
                  {renderTopicAndBackground()}
                  {renderProgress()}

                  {winner && (
                    <Card className="bg-gradient-to-r from-yellow-600/50 to-yellow-800/50 backdrop-blur-md border-yellow-700 p-6 flex-shrink-0">
                      <div className="flex items-center justify-center space-x-2">
                        <Trophy className="h-8 w-8 text-yellow-300" />
                        <h3 className="font-bold text-xl text-yellow-300">获胜方</h3>
                      </div>
                      <p className="text-center mt-4 text-2xl font-bold text-white">
                        {winner === "pro" ? "正方" : "反方"}
                      </p>
                    </Card>
                  )}

                  {/* 评委区域 */}
                  {renderJudgesArea()}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 