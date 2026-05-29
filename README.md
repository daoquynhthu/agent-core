# Agent Core

集三家之长的 Agent 编程系统 —— 融合 OpenCode（TUI + Provider）× Aider（RepoMap + 双模型模式）× Codex（工具编排 + 压缩）的精华，自研小模型适配核心。

## 核心特性

- **TUI 终端界面** — 基于 Solid.js + @opentui/solid 的炫酷终端 UI，插件化扩展
- **Agent 架构** — 完整的多 Agent 系统（primary + subagent），支持 Plan Mode、Architect/Editor 双模型模式
- **小模型适配** — 独创 Tier 系统（T1/T2/T3），按模型能力自动分配 Prompt Budget、Tool Budget、Progressive Disclosure
- **上下文管理** — Context Kernel 编排、State Ledger 持久化、Task Mode 分类、Drift Guard 输出校验
- **轻量快速** — Bun 运行时，极速启动

## 快速开始

```bash
# 安装依赖
bun install

# 启动 TUI
cd packages/opencode
bun run dev
```

## 项目结构

```
packages/
  small-model/    # 小模型适配系统（Tier / Budget / Detector / Context Kernel）
  context/        # 上下文引擎（RepoMap / Compactor）
  opencode/       # 核心 Agent 平台（TUI / Session / Tool / Agent）
  core/           # 共享工具库（Effect-TS）
  llm/            # LLM 协议层
  plugin/         # 插件系统 SDK
  sdk/            # 客户端 SDK
```

## License

MIT
