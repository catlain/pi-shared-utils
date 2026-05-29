[English](README.en.md) | 程序中文文档

> 📖 **[pi-atelier 实战指南](https://catlain.github.io/pi-atelier/)** — 从零教会你使用 pi-atelier 扩展生态，让 AI 编程助手从「会写代码」进化到「会管理项目」

# pi-shared-utils

Shared utility library for the [pi](https://github.com/earendil-works/pi-coding-agent) extension ecosystem — memory file parsing, path constants, settings management, tool output truncation, and more. Used by 7+ pi extensions.

## Why You Need It

If you're building a pi extension, you'll inevitably need the same building blocks: reading settings, parsing memory files, truncating tool output, finding agent directories. pi-shared-utils provides these as a single dependency so every extension doesn't reinvent the wheel.

**Used by**: pi-memory, pi-context, pi-shepherd, pi-roadmap, pi-session-analyzer, pi-workflow, and more.

## How It Works

```
pi-shared-utils provides 6 independent modules:

┌─────────────────────────────────────────────────┐
│  memory-parser  ── 解析 topic--kw1,kw2.md 文件名  │
│  paths         ── pi agent 标准路径常量            │
│  settings      ── settings.json 读写扩展配置段    │
│  tool-output   ── 工具输出截断（防上下文溢出）    │
│  agents        ── 子代理定义文件发现              │
│  ephemeral     ── 会话临时 hint/label 栈          │
└─────────────────────────────────────────────────┘
```

Each module is independently importable — use only what you need.

## Installation

```bash
pi install git:github.com/catlain/pi-atelier
```

> 这是 pi-atelier monorepo 内的 workspace 包，通常不需要单独安装。其他独立扩展通过 `bundledDependencies` 自动包含它。

## 导出模块

### 记忆文件解析 (`memory-parser`)

解析 `topic--kw1,kw2,kw3.md` 格式的记忆文件名，扫描目录生成索引。

```ts
import { parseFileName, buildFileName, scanMemoryDir } from "@pi-atelier/shared-utils";

// 解析文件名 → { topic, keywords }
const { topic, keywords } = parseFileName("coding_standards--编码,git,lint.md");
// topic = "coding_standards", keywords = ["编码", "git", "lint"]

// 反向构建文件名
const name = buildFileName("coding_standards", ["编码", "git", "lint"]);
// "coding_standards--编码,git,lint.md"

// 扫描目录，返回 MemoryEntry[]
const entries = await scanMemoryDir("/path/to/memory");
```

### 路径常量 (`paths`)

pi agent 标准路径，避免硬编码。

| 常量 | 路径 | 说明 |
|------|------|------|
| `AGENT_DIR` | `~/.pi/agent/` | agent 根目录 |
| `SETTINGS_PATH` | `~/.pi/agent/settings.json` | 全局设置 |
| `MODELS_CONFIG_PATH` | `~/.pi/agent/models.json` | 模型配置 |
| `MCP_CONFIG_PATH` | `~/.pi/agent/mcp.json` | MCP 服务器配置 |
| `MCP_CACHE_PATH` | `~/.pi/agent/mcp-cache/` | MCP 工具缓存 |
| `AGENTS_DIR` | `~/.pi/agent/agents/` | 子代理定义 |
| `GLOBAL_RULES_PATH` | `~/.pi/agent/rules.md` | 全局规则 |
| `MEMORY_DIR` | `~/.pi/agent/memory/` | 全局记忆 |
| `MEMORY_MD_PATH` | `MEMORY.md` | 记忆索引文件名 |

### 设置管理 (`settings`)

读写 `settings.json` 中扩展的自定义配置段。

```ts
import { getSettingsSection, patchSettingsSection, getSettingsValue, setSettingsValue } from "@pi-atelier/shared-utils";

// 读取扩展配置段
const config = await getSettingsSection("my-extension");

// 增量更新配置
await patchSettingsSection("my-extension", { enabled: true });

// 读取/写入单个值
const val = await getSettingsValue("my-extension", "key", "default");
await setSettingsValue("my-extension", "key", "new-value");
```

### 工具输出截断 (`tool-output`)

防止工具返回超大结果撑爆 LLM 上下文。

```ts
import { truncateToolOutput, truncatedResult, TOOL_OUTPUT_MAX_LINES } from "@pi-atelier/shared-utils";

// 截断过长的输出
const result = truncateToolOutput(longText, { maxLines: 200 });
// { text: "...", truncated: true, originalLines: 1500, keptLines: 200 }

// 快捷方式：返回 pi tool result 格式
return truncatedResult(text);  // 自动截断 + 返回 { content: [{ type: "text", text }] }
```

### 子代理发现 (`agents`)

扫描 `~/.pi/agent/agents/` 目录下的子代理定义文件。

```ts
import { discoverAgents, getAgentDescription, formatAgentsList } from "@pi-atelier/shared-utils";

// 发现所有可用子代理
const agents = await discoverAgents();
// [{ name: "pv-executor", description: "...", filePath: "..." }, ...]

// 获取单个描述
const desc = await getAgentDescription("pv-executor");

// 格式化为可读列表
const list = formatAgentsList(agents);
```

### 会话临时数据 (`ephemeral`)

当前会话的临时 hint/label 栈，会话结束即消失。用于跨工具调用的轻量状态传递。

```ts
import { pushHint, hasHints, peekHints, drainHints, peekLabels } from "@pi-atelier/shared-utils";

pushHint({ key: "recent-files", values: ["file1.ts", "file2.ts"] });
const has = hasHints("recent-files");
const hints = peekHints("recent-files");   // 查看不移除
const all = drainHints();                   // 取出并清空
```

## Best Practices

### ✅ Recommended
- Import only the modules you need to keep bundle size small
- Use `truncatedResult()` for all tool outputs — prevents context overflow
- Use `paths` constants instead of hardcoding `~/.pi/agent/...`
- Use `settings` module for any persistent configuration

### ❌ Not Recommended
- Don't hardcode pi paths — they may change between versions
- Don't return raw tool output without truncation
- Don't use `ephemeral` for persistent data — it's session-scoped only

## Limitations

| Limitation | Detail |
|------------|--------|
| Memory file format only | Only supports `topic--kw1,kw2.md` naming convention |
| No validation | Settings reads don't validate schema — caller must handle |
| Ephemeral is in-memory | Lost on process restart, not persisted to disk |
| Token estimation | `tool-output` truncates by lines, not by token count |

## Architecture

```
pi-shared-utils/
├── src/
│   ├── index.ts           # Re-exports all modules
│   ├── memory-parser.ts   # Memory file name parsing + directory scanning
│   ├── paths.ts           # Path constants (AGENT_DIR, SETTINGS_PATH, ...)
│   ├── settings.ts        # settings.json section read/write
│   ├── tool-output.ts     # Output truncation + truncatedResult helper
│   ├── agents.ts          # Sub-agent discovery from ~/.pi/agent/agents/
│   ├── ephemeral.ts       # Session-scoped hint/label stack
│   └── __tests__/         # Unit tests
├── package.json
└── tsconfig.json
```

**Dependencies**: Zero runtime dependencies (pure Node.js).

## License

MIT
