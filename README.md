# AI 智能辩论赛平台 / AI Debate Platform

一个基于 AI 的智能辩论平台，支持正反双方 AI 辩手进行辩论，并由多位 AI 评委进行专业评判。

An AI-powered debate platform that supports real-time debates between AI debaters with professional judging by multiple AI judges.

## 功能特点 / Features

- 🤖 支持正反双方 AI 辩手实时对战 / Real-time debates between AI debaters
- ⚖️ 6位 AI 评委专业评分 / Professional scoring by 6 AI judges
- 🎯 多维度评分系统 / Multi-dimensional scoring system
- 💬 实时对话流式输出 / Real-time streaming responses
- 📊 详细的评分反馈 / Detailed scoring feedback
- 🏆 智能评判获胜方 / Smart winner determination
- 🔄 自动状态保存和恢复 / Auto state persistence and recovery
- 🎨 优雅的用户界面 / Elegant user interface

## 技术栈 / Tech Stack

- **前端框架 / Frontend Framework**: Next.js 14
- **UI 组件 / UI Components**: Tailwind CSS, Radix UI
- **状态管理 / State Management**: tRPC
- **AI 接口 / AI Interface**: Dify API
- **动画效果 / Animations**: Framer Motion
- **开发语言 / Language**: TypeScript

## 系统要求 / System Requirements

- Node.js 18+
- npm or yarn
- 有效的 Dify API Keys（需要8个，包括正反方辩手和6位评委）/ Valid Dify API Keys (8 required, including debaters and judges)

## 快速开始 / Quick Start

1. 克隆项目 / Clone the repository
```bash
git clone [项目地址/repository URL]
cd ai_bate
```

2. 安装依赖 / Install dependencies
```bash
npm install
# 或/or
yarn install
```

3. 配置环境变量 / Configure environment variables
创建 `.env` 文件 / Create `.env` file:
```env
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

4. 启动开发服务器 / Start development server
```bash
npm run dev
# 或/or
yarn dev
```

5. 访问应用 / Access the application
打开浏览器访问 / Open browser and visit: `http://localhost:3000`

## 使用说明 / Usage Guide

### 1. 配置辩论 / Debate Configuration

配置以下信息 / Configure the following:
- 正方辩手 API Key / Pro side API Key
- 反方辩手 API Key / Con side API Key
- 6位评委的 API Keys / 6 judge API Keys
- 辩论主题 / Debate topic
- 辩论背景说明 / Background description
- 辩论轮次（1-50轮）/ Debate rounds (1-50)

### 2. 开始辩论 / Start Debate

点击"开始辩论"后 / After clicking "Start Debate":
1. 自动开始正反双方辩论 / Auto-start debate between both sides
2. 实时显示辩论进程 / Real-time debate progress
3. 显示思考和回应状态 / Show thinking and response status
4. 流式输出对话内容 / Stream conversation content

### 3. 评分阶段 / Scoring Phase

辩论结束后 / After debate ends:
- 6位评委同时评分 / 6 judges score simultaneously
- 展示详细评分维度 / Show detailed scoring dimensions
- 提供评分理由说明 / Provide scoring rationale
- 展示优缺点分析 / Display strengths and weaknesses
- 给出改进建议 / Offer improvement suggestions

### 4. 结果展示 / Results Display

最终展示 / Final display includes:
- 去掉最高分和最低分后的平均分 / Average score after removing highest and lowest
- 各维度得分详情 / Detailed scores by dimension
- 获胜方判定 / Winner determination
- 完整的评委点评 / Complete judges' comments

## 评分维度说明 / Scoring Dimensions

评委从以下维度评分 / Judges score on these dimensions:

1. **论点逻辑性 / Logical Reasoning** (30%)
   - 论证的清晰度 / Clarity of argumentation
   - 逻辑的严密性 / Logical rigor
   - 观点的连贯性 / Coherence of viewpoints

2. **论据相关性 / Evidence Relevance** (30%)
   - 论据的充分性 / Sufficiency of evidence
   - 证据的相关性 / Relevance of evidence
   - 例证的说服力 / Persuasiveness of examples

3. **反驳有效性 / Rebuttal Effectiveness** (20%)
   - 反驳的针对性 / Targeting of rebuttals
   - 驳论的有效性 / Effectiveness of counter-arguments
   - 应对的灵活性 / Flexibility in responses

4. **表达说服力 / Expression & Persuasion** (20%)
   - 语言的准确性 / Language accuracy
   - 表达的流畅性 / Expression fluency
   - 论述的感染力 / Argumentative appeal

## 文件结构 / Project Structure

```
src/
├── app/                    # Next.js 应用页面 / Next.js pages
├── components/            # UI 组件 / UI components
├── server/
│   └── debate/           # 辩论核心逻辑 / Core debate logic
│       ├── agents.ts     # AI 辩手实现 / AI debater implementation
│       ├── dify.ts       # Dify API 客户端 / Dify API client
│       ├── judge.ts      # 评委实现 / Judge implementation
│       ├── manager.ts    # 辩论管理器 / Debate manager
│       ├── store.ts      # 状态存储 / State storage
│       └── types.ts      # 类型定义 / Type definitions
└── styles/               # 全局样式 / Global styles
```

## 注意事项 / Important Notes

1. 请确保所有 API Key 的有效性 / Ensure all API Keys are valid
2. 建议辩论轮次设置在 3-10 轮之间 / Recommended 3-10 rounds per debate
3. 辩论背景应当清晰详细 / Provide clear and detailed background
4. 系统会自动保存辩论状态 / System auto-saves debate state
5. 评分过程可能需要一定时间 / Scoring process may take time

## 开发计划 / Development Roadmap

- [ ] 添加更多 AI 模型支持 / Add more AI model support
- [ ] 引入人机混合辩论模式 / Introduce human-AI hybrid debate mode
- [ ] 支持自定义评分规则 / Support custom scoring rules
- [ ] 添加辩论历史记录功能 / Add debate history feature
- [ ] 优化评分算法 / Optimize scoring algorithm
- [ ] 支持多语言 / Support multiple languages

## 贡献指南 / Contributing

欢迎提交 Issue 和 Pull Request 来帮助改进项目。

We welcome Issues and Pull Requests to help improve the project.

## 许可证 / License

MIT License
