# Agent Core — 工程架构书

> 集三家之长：OpenCode（TUI + Provider）× Aider（RepoMap + 双模型）× Codex（工具编排 + 压缩）
> 自研核心：小模型适配系统（Prompt Budget + Tool Budget + Progressive Disclosure）

---

## 目录

1. [项目定位](#1-项目定位)
2. [整体架构](#2-整体架构)
3. [源码集成策略](#3-源码集成策略)
4. [模块详细设计](#4-模块详细设计)
5. [核心数据流](#5-核心数据流)
6. [小模型适配系统](#6-小模型适配系统)
7. [接口契约](#7-接口契约)
8. [目录结构与命名规范](#8-目录结构与命名规范)
9. [里程碑计划](#9-里程碑计划)

---

## 1. 项目定位

### 1.1 愿景

构建一个**集三家之长**的 Agent 编程系统：
- **不从头造轮子** — 直接复用三个成熟仓库的代码
- **不翻译代码** — 同语言（TypeScript）的组件直接拿，不同语言的取算法设计用 TS 实现
- **核心创新** — 小模型适配系统是三个仓库都没有的能力

### 1.2 设计原则

| 原则 | 说明 |
|------|------|
| **复用 > 重写** | 能直接拷贝的代码绝不手写 |
| **胶水 > 翻译** | 跨语言组件用子进程调用，不翻译 |
| **增量 > 重构** | 在 OpenCode 基座上叠加新能力，不改其核心 |
| **模型无关** | 支持 75+ Provider，但为小模型提供降级保障 |

### 1.3 许可证合规

| 来源 | 许可证 | 使用方式 |
|------|--------|---------|
| OpenCode | MIT | 直接复制/修改，构成基座主体 |
| Aider | Apache 2.0 | 移植算法（TS 重写），保留版权声明 |
| Codex | Apache 2.0 | 移植设计模式（TS 重写），保留版权声明 |

---

## 2. 整体架构

### 2.1 分层架构图

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Layer 1: TUI                                │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  packages/opencode (src/tui/)   取自 OpenCode，增强部分：     │   │
│  │  ├── chat           聊天面板（流式输出）                       │   │
│  │  ├── diff           Diff 视图（+++--- 高亮）   [来自 Codex]   │   │
│  │  ├── file           文件浏览器（@ 模糊搜索）                  │   │
│  │  ├── command        命令面板（/commands）                     │   │
│  │  ├── status         状态栏（token 计数 + provider 状态）       │   │
│  │  ├── multi-agent    多 Agent 并行面板        [来自 Codex]     │   │
│  │  └── theme          主题系统                                  │   │
│  └──────────────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────────┤
│                         Layer 2: Agent                              │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  packages/opencode (src/agent/)   取自 OpenCode，增强部分：   │   │
│  │  ├── agent.ts         基类 Agent                               │   │
│  │  ├── agents/                                                    │   │
│  │  │   ├── build.ts     执行 Agent（全权限）   [来自 OpenCode]   │   │
│  │  │   ├── plan.ts      规划 Agent（只读）     [来自 OpenCode]   │   │
│  │  │   ├── architect.ts 架构师 Agent（强模型） [来自 Aider]      │   │
│  │  │   └── editor.ts    编辑器 Agent（弱模型） [来自 Aider]      │   │
│  │  ├── registry.ts      Agent 注册表                             │   │
│  │  └── bus/             事件总线（Agent 间通信）                  │   │
│  └──────────────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────────┤
│                    Layer 3: Tool System                              │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  packages/opencode (src/tool/)   取自 OpenCode，增强部分：   │   │
│  │  ├── tool.ts          工具定义基类                             │   │
│  │  ├── registry.ts      工具注册表         [来自 Codex 设计]     │   │
│  │  ├── router.ts        工具路由器（按需加载）[来自 Codex 设计]  │   │
│  │  ├── orchestrator.ts  工具编排器（并行/依赖）[来自 Codex 设计] │   │
│  │  ├── tools/                                                     │   │
│  │  │   ├── read.ts      文件读取                                 │   │
│  │  │   ├── edit.ts      文件编辑（多种格式）  [来自 Aider 格式]   │   │
│  │  │   ├── glob.ts      文件搜索                                 │   │
│  │  │   ├── grep.ts      代码搜索                                 │   │
│  │  │   ├── bash.ts      命令执行                                 │   │
│  │  │   ├── lsp.ts       语言服务器                               │   │
│  │  │   └── mcp.ts       MCP 协议                                 │   │
│  │  └── sandbox.ts       安全沙箱                                 │   │
│  └──────────────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────────┤
│                   Layer 4: Context Engine                            │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  packages/context/                    [新模块]                 │   │
│  │  ├── repomap.ts     代码库映射（Tree-sitter tags）[来自 Aider] │   │
│  │  ├── compact.ts     上下文压缩（历史摘要）   [来自 Codex]      │   │
│  │  ├── budget.ts      Prompt Budget（分级分配）[自研 ✦]         │   │
│  │  ├── disclosure.ts  渐进式上下文注入       [自研 ✦]           │   │
│  │  └── priorities.ts  文件重要性排名                             │   │
│  └──────────────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────────┤
│              Layer 5: Small Model Adapter                            │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  packages/small-model/                    [全新模块 ✦✦✦]      │   │
│  │  ├── index.ts          统一入口                                │   │
│  │  ├── tier.ts          模型能力分级（Tier 1/2/3）               │   │
│  │  ├── budget.ts        动态 Token 预算                          │   │
│  │  ├── tool-budget.ts   工具数量限制                              │   │
│  │  ├── prompt-builder.ts 分级提示词组装                          │   │
│  │  └── detector.ts      幻觉检测（超时/重复/无效调用）           │   │
│  └──────────────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────────┤
│                    Layer 6: LLM Provider                             │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  packages/llm/         取自 OpenCode，不改                     │   │
│  │  packages/provider/    75+ Provider，不改                      │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 依赖关系图

```
                     packages/tui (TUI 渲染)
                          │
                ┌─────────┴──────────┐
                │                    │
         packages/agent          packages/small-model
          (Agent 调度)            (小模型适配 ✦✦✦)
                │                    │
         ┌──────┴──────┐      ┌─────┴──────┐
         │             │      │            │
  packages/tool   packages/context   packages/provider
  (工具系统)       (上下文引擎)        (模型提供)
                                              │
                                        packages/llm
                                        (LLM 抽象层)
```

### 2.3 模块职责矩阵

| 模块 | 来源 | 改动策略 | 改动量 |
|------|------|---------|--------|
| `packages/opencode/src/tui/` | OpenCode | 增强：加多面板 + diff | ~200 行新增 |
| `packages/opencode/src/agent/` | OpenCode | 注入新 Agent 类型 | ~100 行新增 |
| `packages/opencode/src/tool/` | OpenCode | 加编排器 + 多编辑格式 | ~300 行新增 |
| `packages/llm/` | OpenCode | **不改** | 0 |
| `packages/provider/` | OpenCode | **不改** | 0 |
| `packages/context/` | **新写** | RepoMap + Compact + Budget | ~600 行 |
| `packages/small-model/` | **新写** | 原创核心能力 | ~500 行 |

---

## 3. 源码集成策略

### 3.1 总原则

```
同语言（TS）→ 直接复制文件，增量修改
不同语言 → 取算法设计，TS 重写
算法逻辑 → 纯函数，无外部依赖，单元测试覆盖
```

### 3.2 各组件来源明细

#### 从 OpenCode 直接复制（基座本体）

| 路径 | 处理方式 |
|------|---------|
| `packages/opencode/src/tui/` | 保留全部，新增文件不修改原文件 |
| `packages/opencode/src/agent/` | 保留，在 `agents/` 下新增 architect/editor |
| `packages/opencode/src/tool/` | 保留，新增 router/orchestrator 作为独立文件 |
| `packages/opencode/src/bus/` | 保留，不改 |
| `packages/opencode/src/provider/` | 保留，不改 |
| `packages/opencode/src/session/` | 保留，在调用链中插入我们的 hook |
| `packages/llm/` | 保留，不改 |
| `packages/core/` | 保留，不改 |

#### 从 Aider 移植（算法 → TS）

| 组件 | Aider 源文件 | 移植方式 | 行数估计 |
|------|------------|---------|---------|
| **RepoMap** | `aider/repomap.py` | 用 npm `tree-sitter` 包重写 tags 解析 + 重要性排名 | ~250 行 |
| **ArchitectCoder** | `aider/coders/architect_coder.py` | TS 实现双模型编排逻辑（~50 行原逻辑） | ~80 行 |
| **EditBlock** | `aider/coders/editblock_coder.py` | search/replace block 解析算法（纯文本处理） | ~120 行 |
| **Tree-sitter queries** | `aider/queries/tree-sitter-language-pack/` | **直接复制** .scm 文件 | 0 行修改 |

#### 从 Codex 移植（设计 → TS）

| 组件 | Codex 源文件 | 移植方式 | 行数估计 |
|------|------------|---------|---------|
| **Context Compaction** | `codex-rs/core/src/compact.rs` | 取压缩策略逻辑（summarization + replace），TS 实现 | ~150 行 |
| **Tool Router** | `codex-rs/core/src/tools/router.rs` | 取 registry + dispatch 设计模式，TS 实现 | ~100 行 |
| **Tool Orchestrator** | `codex-rs/core/src/tools/orchestrator.rs` | 取并行执行 + 依赖解析设计，TS 实现 | ~120 行 |
| **Multi-Agent TUI** | `codex-rs/tui/src/multi_agents.rs` | 取多面板布局设计，TS 实现 | ~180 行 |

### 3.3 不同语言组件处理（子进程调用）

对于无法/不值得用 TS 重写的组件，通过子进程调用：

```
┌──────────────┐     spawn()     ┌──────────────┐
│ 我们的 TS 代码 │ ──────────────→ │  Aider (Python) │
│              │ ←────────────── │  --show-repo-map │
└──────────────┘     stdout      └──────────────┘
```

适用场景：
- Aider 的 RepoMap 在 Python 环境已装好的情况下可直接调用
- 作为 TS 原生实现的 fallback
- 接口见 `packages/adapter/aider-adapter.ts`

---

## 4. 模块详细设计

### 4.1 Agent 系统

```
Agent 类型层级
═══════════════════════════════════════

Agent (abstract)
├── PlanAgent      [OpenCode]   只读模式，分析代码，不修改
├── BuildAgent     [OpenCode]   全权限，执行修改、运行命令
├── ArchitectAgent [Aider]     强模型，出设计方案（不写代码）
│   └── 调用 → EditorAgent     弱模型，执行具体代码修改
└── ExploreAgent   [Codex]     代码库探索、问题定位
```

**Agent 生命周期**：

```
Created → Initialized → Planning → Executing → Reviewing → Completed
                              ↕
                          Paused/Blocked (等待用户确认)
```

**Agent 间通信**（事件总线模式）：

```typescript
// Agent A 发布事件
bus.publish("agent.architect.scheme_ready", { scheme: "..." })

// Agent B 订阅
bus.subscribe("agent.architect.scheme_ready", (event) => {
  // 拿到方案开始实现
})
```

### 4.2 Tool 系统

**工具定义格式**（Schema）：

```typescript
interface ToolDef {
  id: string
  description: string
  parameters: JSONSchema7
  execute(args, ctx: ToolContext): Promise<ToolResult>
  // 预算相关
  cost?: number          // 预估 token 消耗
  requiredTier?: Tier    // 最低所需模型等级
}
```

**工具路由流程**：

```
Agent 调用工具
     │
     ▼
ToolRouter.route(toolId, args)
     │
     ├── 检查注册表 → 未注册则报错
     ├── 检查权限 → 无权限则请求用户确认
     ├── 检查预算 → 超预算则拦截（小模型适配）
     ├── 检查参数 → Schema 验证
     │
     ▼
ToolOrchestrator.execute(toolId, args)
     │
     ├── 同步工具 → 直接执行
     ├── 异步工具 → 后台执行，回调通知
     ├── 并行工具组 → Promise.all
     └── 依赖链 → 拓扑排序，依次执行
     │
     ▼
ToolSandbox.wrap(toolId, execution)
     │
     ├── 超时控制
     ├── 输出截断
     └── 安全策略
```

### 4.3 Context 引擎

```
用户输入到达
     │
     ▼
ContextEngine.build(session, input)
     │
     ├── 1. 收集 RepoMap
     │   ├── Tree-sitter 解析文件
     │   ├── 按修改时间/相关性排名
     │   └── 按 token 预算裁剪
     │
     ├── 2. 压缩历史
     │   ├── token > 80% → 触发压缩
     │   └── 弱模型生成摘要替换旧历史
     │
     ├── 3. 应用 Budget
     │   ├── 根据模型 Tier 分配各级预算
     │   ├── 裁剪提示词长度
     │   └── 限制工具数量
     │
     └── 4. 渐进式注入
         ├── Round 1: 简短提示 + 用户问题
         ├── Round 2: + RepoMap（如果模型需要）
         └── Round 3: + 完整文件内容（如果需要编辑）
     │
     ▼
    组装完成 → 发送到 LLM
```

---

## 5. 核心数据流

### 5.1 完整调用链路

```
用户输入
  │
  ▼
┌─────────────────────────────────────────────────┐
│ TUI (packages/tui)                               │
│  - 渲染聊天界面                                   │
│  - 处理 @ 文件引用                                │
│  - 处理 !bash 命令                                │
│  - 发送消息到 Session                             │
└──────────────────────┬──────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────┐
│ Session (packages/opencode/src/session/)         │
│  - 管理对话状态                                   │
│  - 调用 ContextEngine 构建上下文                   │
│  - 调用 SmallModelAdapter 裁剪                    │
│  - 调用 Provider 发送请求                          │
│  - 处理流式响应                                   │
└──────┬──────────┬──────────┬────────────────────┘
       │          │          │
       ▼          ▼          ▼
┌──────────┐ ┌──────────┐ ┌──────────────┐
│ Context  │ │ Small    │ │ Provider     │
│ Engine   │ │ Model    │ │ /LLM         │
│          │ │ Adapter  │ │              │
│ 组装上下文│ │ 分级裁剪  │ │ 发送到模型   │
│ 压缩历史  │ │ 限制工具 │ │ 接收流式响应 │
└──────────┘ └──────────┘ └──────────────┘
                              │
                              ▼
                    ┌─────────────────────┐
                    │ Tool Call 循环       │
                    │                     │
                    │ LLM 返回工具调用     │
                    │   → ToolRouter      │
                    │   → ToolOrchestrator│
                    │   → 执行工具        │
                    │   → 结果返回 LLM    │
                    │   → 继续直到完成    │
                    └─────────────────────┘
                              │
                              ▼
                    ┌─────────────────────┐
                    │ TUI 渲染结果         │
                    │ 显示给用户           │
                    └─────────────────────┘
```

### 5.2 小模型适配介入点

```
调用链中 SmallModelAdapter 的四个拦截点：

Point 1: 构建上下文前
  → adapter.determineTier(modelId) → Tier
  → adapter.getBudget(tier) → { systemPrompt, repomap, tools }

Point 2: 组装系统提示时
  → adapter.buildSystemPrompt(tier, basePrompt) → 裁剪后的提示词

Point 3: 注册工具时
  → adapter.filterTools(tier, allTools) → 允许的工具列表

Point 4: 每次工具调用前
  → adapter.checkToolBudget(tier, toolId, callCount) → 允许/拒绝
```

---

## 6. 小模型适配系统

### 6.1 模型能力分级（Tier 系统）

```typescript
enum Tier {
  T1 = "tier-1",  // 强模型：Claude Opus, GPT-4o, Gemini Ultra
  T2 = "tier-2",  // 中模型：DeepSeek, GPT-4o-mini, Gemini Flash
  T3 = "tier-3",  // 小模型：Llama 3B, Phi-3, Gemma 2B
}
```

分级依据：

| 指标 | T1 阈值 | T2 阈值 | T3 阈值 |
|------|---------|---------|---------|
| 上下文窗口 | ≥ 128K | ≥ 32K | < 32K |
| 工具调用可靠性 | ≥ 95% | ≥ 80% | < 80% |
| 指令遵循 | 强 | 中 | 弱 |
| 典型模型 | Claude Opus, GPT-4o | DeepSeek, GPT-4o-mini | Llama 3B, Phi-3 |

### 6.2 Tier 对应预算

| 资源 | T1 | T2 | T3 |
|------|----|----|-----|
| System Prompt 上限 | 8,000 tokens | 4,000 tokens | 1,500 tokens |
| RepoMap 上限 | 4,096 tokens | 2,048 tokens | 512 tokens |
| 工具数量 | 全部（15+） | 核心（8个） | 极简（4个） |
| 对话历史 | 全部保留 | 压缩摘要 | 单轮摘要 |
| 单次工具调用超时 | 60s | 30s | 15s |

### 6.3 渐进式 Disclosure 流程

```
适用于 T2 和 T3 模型，防止一次性信息过载导致幻觉

Round 1:
  输入: [系统提示(精简)] + [用户问题]
  输出: 模型判断是否需要更多上下文
         → 输出 "NEED_CONTEXT: <files>" 或 "READY"

Round 2 (如需):
  输入: [系统提示] + [用户问题] + [RepoMap(压缩)] + [相关文件摘要]
  输出: 模型分析 + 修改方案

Round 3 (如需编辑):
  输入: [系统提示] + [用户问题] + [完整文件内容]
  输出: 具体的代码修改
```

### 6.4 幻觉检测器

```typescript
interface HallucinationDetector {
  // 检测无效工具调用
  checkInvalidToolCalls(toolCalls: ToolCall[]): Alert[]

  // 检测重复内容
  checkRepetition(output: string): boolean

  // 检测超时（模型卡住）
  checkTimeout(duration: number): boolean

  // 综合评分
  scoreResponse(response: Response): number
  // < 0.6 → 触发降级（简化工具集 / 切换到更小上下文）
}
```

---

## 7. 接口契约

### 7.1 核心接口定义

```typescript
// === Agent 接口 ===
interface IAgent {
  readonly id: string
  readonly tier: Tier
  readonly capabilities: string[]

  initialize(session: Session): Promise<void>
  process(input: UserInput): AsyncGenerator<AgentEvent>
  cancel(): void
}

// === Tool 接口 ===
interface ITool {
  readonly id: string
  readonly requiredTier: Tier
  readonly schema: JSONSchema7

  execute(args: unknown, ctx: ToolContext): Promise<ToolResult>
}

// === Context 接口 ===
interface IContextEngine {
  build(session: Session, input: UserInput): Promise<ContextPackage>
}

interface ContextPackage {
  systemPrompt: string
  repomap: string
  tools: ITool[]
  history: Message[]
  budget: {
    totalTokens: number
    usedTokens: number
  }
}

// === Small Model Adapter 接口 ===
interface ISmallModelAdapter {
  determineTier(modelId: string): Tier
  getBudget(tier: Tier): ModelBudget
  filterTools(tier: Tier, tools: ITool[]): ITool[]
  buildPrompt(tier: Tier, base: PromptParts): PromptParts
  detectHallucination(response: Response): DetectionResult
}
```

### 7.2 事件总线事件表

| 事件 | 生产者 | 消费者 | 说明 |
|------|--------|--------|------|
| `agent.planning.complete` | PlanAgent | 其他 Agent | 规划完成 |
| `agent.architect.scheme_ready` | ArchitectAgent | EditorAgent | 方案已出 |
| `agent.editor.changes_made` | EditorAgent | ArchitectAgent | 修改完成 |
| `agent.explore.result` | ExploreAgent | 任何 Agent | 探索结果 |
| `tool.execution.complete` | ToolOrchestrator | Agent | 工具执行完毕 |
| `session.context.built` | ContextEngine | Session | 上下文构建完成 |
| `small-model.tier_assigned` | SmallModelAdapter | 全局 | 模型等级已分配 |
| `small-model.budget_exceeded` | SmallModelAdapter | Agent | 预算超限 |

---

## 8. 目录结构与命名规范

### 8.1 完整目录树

```
agent-core/
├── package.json                    ← workspace root
├── ARCHITECTURE.md                 ← 本文档
├── tsconfig.json
├── turbo.json                      ← Turborepo 配置
│
├── packages/
│   ├── opencode/                   ← [源: OpenCode] CLI 核心
│   │   ├── src/
│   │   │   ├── index.ts            ← 入口
│   │   │   ├── tui/                ← TUI 界面
│   │   │   │   ├── index.ts
│   │   │   │   ├── render/         ← 渲染引擎
│   │   │   │   ├── components/     ← UI 组件（chat/diff/explorer）
│   │   │   │   └── theme/          ← 主题
│   │   │   ├── agent/              ← Agent 系统
│   │   │   │   ├── agent.ts        ← Agent 基类
│   │   │   │   ├── agents/
│   │   │   │   │   ├── build.ts    ← [OpenCode]
│   │   │   │   │   ├── plan.ts     ← [OpenCode]
│   │   │   │   │   ├── architect.ts ← [Aider]
│   │   │   │   │   └── editor.ts   ← [Aider]
│   │   │   │   ├── registry.ts
│   │   │   │   └── bus.ts
│   │   │   ├── session/            ← 会话管理
│   │   │   │   ├── session.ts
│   │   │   │   └── message.ts
│   │   │   └── tool/               ← 工具系统
│   │   │       ├── tool.ts
│   │   │       ├── registry.ts     ← [Codex 设计]
│   │   │       ├── router.ts       ← [Codex 设计]
│   │   │       ├── orchestrator.ts ← [Codex 设计]
│   │   │       ├── sandbox.ts
│   │   │       └── tools/
│   │   │           ├── read.ts
│   │   │           ├── edit.ts     ← 含 Aider 编辑格式
│   │   │           ├── glob.ts
│   │   │           ├── grep.ts
│   │   │           ├── bash.ts
│   │   │           ├── lsp.ts
│   │   │           └── mcp.ts
│   │   └── package.json
│   │
│   ├── context/                    ← [新] 上下文引擎
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── repomap.ts          ← [Aider 算法]
│   │   │   ├── compact.ts          ← [Codex 算法]
│   │   │   ├── budget.ts           ← [自研]
│   │   │   ├── disclosure.ts       ← [自研]
│   │   │   └── priorities.ts
│   │   ├── queries/                ← Tree-sitter .scm 文件
│   │   │   ├── python-tags.scm     ← [从 Aider 复制]
│   │   │   ├── typescript-tags.scm ← [从 Aider 复制]
│   │   │   └── ...                 ← 其他语言
│   │   └── package.json
│   │
│   ├── small-model/                ← [新] 小模型适配
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── tier.ts             ← 模型分级
│   │   │   ├── budget.ts           ← Token 预算
│   │   │   ├── tool-budget.ts      ← 工具预算
│   │   │   ├── prompt-builder.ts   ← 提示词组装
│   │   │   └── detector.ts         ← 幻觉检测
│   │   └── package.json
│   │
│   ├── llm/                        ← [源: OpenCode] 不改
│   ├── provider/                   ← [源: OpenCode] 不改
│   ├── core/                       ← [源: OpenCode] 不改
│   ├── bus/                        ← [源: OpenCode] 不改
│   └── adapter/                    ← [新] 胶水层
│       ├── src/
│       │   ├── index.ts
│       │   ├── aider-adapter.ts    ← 子进程调 Aider
│       │   └── types.ts
│       └── package.json
│
└── docs/
    └── LICENSE-NOTICE.md           ← 三方许可证声明
```

### 8.2 命名规范

```typescript
// 文件命名
kebab-case:  repomap.ts, tool-budget.ts, prompt-builder.ts

// 类/接口命名
PascalCase:  class RepoMap, interface IContextEngine

// 函数/变量命名
camelCase:   function buildContext(), const toolRegistry

// 类型/枚举
PascalCase:  type Tier = "t1" | "t2" | "t3"
             enum AgentStatus { Created, Initialized, Running }

// 源标注（移植代码）
// [src: Aider] 移植自 aider/repomap.py
// [src: Codex] 移植自 codex-rs/core/src/compact.rs
```

---

## 9. 里程碑计划

### Phase 0：基座裁剪（1 小时）

```
目标: 得到干净的 OpenCode 骨架
动作:
  ☐ 删除 packages: app, web, desktop, console, slack, stats, storybook, ui,
                   identity, enterprise, function, containers, http-recorder,
                   extensions, docs
  ☐ 验证 opencode CLI 能否正常启动
  ☐ 初始化 git 并做第一次 commit
```

### Phase 1：Context 引擎（3 小时）

```
目标: RepoMap + Compaction 可用
动作:
  ☐ 创建 packages/context
  ☐ 从 Aider 复制 Tree-sitter .scm 查询文件
  ☐ 实现 repomap.ts（Tree-sitter 解析 → 排名 → 裁剪）
  ☐ 实现 compact.ts（Token 检测 → 摘要生成 → 历史替换）
  ☐ 单测覆盖
```

### Phase 2：Tool 增强（2 小时）

```
目标: 工具编排 + 多编辑格式
动作:
  ☐ 实现 tool/registry.ts
  ☐ 实现 tool/router.ts
  ☐ 实现 tool/orchestrator.ts
  ☐ 从 Aider 移植 EditBlock 编辑格式
  ☐ 单测覆盖
```

### Phase 3：Agent 增强（2 小时）

```
目标: Architect/Editor 双模式
动作:
  ☐ 实现 agents/architect.ts
  ☐ 实现 agents/editor.ts
  ☐ 在 session 调用链中注入双模式编排
  ☐ 集成测试
```

### Phase 4：小模型适配（3 小时）✦ 核心创新

```
目标: 完整的小模型适配流水线
动作:
  ☐ 创建 packages/small-model
  ☐ 实现 tier.ts（模型能力分级）
  ☐ 实现 budget.ts（动态 Token 预算）
  ☐ 实现 tool-budget.ts（工具限制）
  ☐ 实现 prompt-builder.ts（分级提示词组装）
  ☐ 实现 disclosure.ts（渐进式注入）
  ☐ 实现 detector.ts（幻觉检测）
  ☐ 在 Session 调用链中插入四个拦截点
  ☐ 单测 + 集成测试
```

### Phase 5：TUI 增强（2 小时）

```
目标: 多 Agent 面板 + Diff 视图
动作:
  ☐ 从 Codex 设计移植多 Agent 并行面板
  ☐ 实现 Diff 视图组件
  ☐ 实现状态栏增强（token 计数 + tier 显示）
  ☐ 视觉调试
```

### Phase 6：集成与发布（2 小时）

```
目标: 完整的可用系统
动作:
  ☐ 端到端集成测试
  ☐ 性能调优（启动速度、内存）
  ☐ LICENSE 合规声明
  ☐ 打包发布
```

---

## 附录 A：源文件引用对照

### A.1 OpenCode（MIT）— 直接复制

```
仓库: https://github.com/anomalyco/opencode
分支: main
Commit: 031f82a
本地: E:\Agent\opencode\
```

### A.2 Aider（Apache 2.0）— 算法移植

```
仓库: https://github.com/Aider-AI/aider
分支: main
Commit: 5dc9490
本地: E:\Agent\aider\

移植组件:
  - repomap.py → repomap.ts (算法)
  - coders/architect_coder.py → agents/architect.ts (设计)
  - coders/editblock_coder.py → tools/edit.ts (格式解析)
  - queries/tree-sitter-language-pack/ → context/queries/ (直接复制)
```

### A.3 Codex（Apache 2.0）— 设计移植

```
仓库: https://github.com/openai/codex
分支: main
Commit: bf72be5
本地: E:\Agent\codex\

移植组件:
  - core/src/compact.rs → context/compact.ts (策略)
  - core/src/tools/router.rs → tool/router.ts (设计)
  - core/src/tools/orchestrator.rs → tool/orchestrator.ts (设计)
  - tui/src/multi_agents.rs → tui/components/multi-agent.ts (布局)
```

---

## 附录 B：技术栈

| 项 | 选型 | 理由 |
|----|------|------|
| 语言 | TypeScript | 与 OpenCode 基座一致，无需跨语言 |
| 运行时 | Node.js (v24+) | 当前环境已有 |
| Monorepo | Turborepo | OpenCode 自带 |
| TUI | Ink + React | OpenCode 自带 |
| Code 解析 | tree-sitter (npm) | 与 Aider 一致 |
| 测试 | Vitest | 轻量快速 |
| Lint | oxlint | OpenCode 自带 |
| 包管理 | pnpm | OpenCode 自带 |
