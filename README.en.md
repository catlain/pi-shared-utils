[中文文档](README.md) | English

# pi-shared-utils

Shared utility library for the [pi](https://github.com/earendil-works/pi-coding-agent) extension ecosystem — memory file parsing, path constants, settings management, tool output truncation, and more. Used by 7+ pi extensions.

## Why You Need It

If you're building a pi extension, you'll inevitably need the same building blocks: reading settings, parsing memory files, truncating tool output, finding agent directories. pi-shared-utils provides these as a single dependency so every extension doesn't reinvent the wheel.

**Used by**: pi-memory, pi-context, pi-shepherd, pi-roadmap, pi-session-analyzer, pi-workflow, and more.

## How It Works

```
pi-shared-utils provides 6 independent modules:

┌─────────────────────────────────────────────────┐
│  memory-parser  ── parse topic--kw1,kw2.md file names
│  paths         ── standard pi agent path constants
│  settings      ── read/write extension config sections in settings.json
│  tool-output   ── truncate tool output (prevent context overflow)
│  agents        ── discover sub-agent definition files
│  ephemeral     ── session-scoped hint/label stack
└─────────────────────────────────────────────────┘
```

Each module is independently importable — use only what you need.

## Installation

```bash
pi install git:github.com/catlain/pi-atelier
```

> This is a workspace package inside the pi-atelier monorepo and typically doesn't need to be installed standalone. Other independent extensions include it automatically via `bundledDependencies`.

## Exported Modules

### Memory File Parsing (`memory-parser`)

Parses `topic--kw1,kw2,kw3.md`-format memory file names and scans directories to generate an index.

```ts
import { parseFileName, buildFileName, scanMemoryDir } from "@pi-atelier/shared-utils";

// Parse file name → { topic, keywords }
const { topic, keywords } = parseFileName("coding_standards--编码,git,lint.md");
// topic = "coding_standards", keywords = ["编码", "git", "lint"]

// Build file name from parts
const name = buildFileName("coding_standards", ["编码", "git", "lint"]);
// "coding_standards--编码,git,lint.md"

// Scan directory, returns MemoryEntry[]
const entries = await scanMemoryDir("/path/to/memory");
```

### Path Constants (`paths`)

Standard pi agent paths, so you never hardcode them.

| Constant | Path | Description |
|------|------|------|
| `AGENT_DIR` | `~/.pi/agent/` | Agent root directory |
| `SETTINGS_PATH` | `~/.pi/agent/settings.json` | Global settings |
| `MODELS_CONFIG_PATH` | `~/.pi/agent/models.json` | Model configuration |
| `MCP_CONFIG_PATH` | `~/.pi/agent/mcp.json` | MCP server configuration |
| `MCP_CACHE_PATH` | `~/.pi/agent/mcp-cache/` | MCP tool cache |
| `AGENTS_DIR` | `~/.pi/agent/agents/` | Sub-agent definitions |
| `GLOBAL_RULES_PATH` | `~/.pi/agent/rules.md` | Global rules |
| `MEMORY_DIR` | `~/.pi/agent/memory/` | Global memory |
| `MEMORY_MD_PATH` | `MEMORY.md` | Memory index file name |

### Settings Management (`settings`)

Read and write extension-specific config sections in `settings.json`.

```ts
import { getSettingsSection, patchSettingsSection, getSettingsValue, setSettingsValue } from "@pi-atelier/shared-utils";

// Read extension config section
const config = await getSettingsSection("my-extension");

// Update config incrementally
await patchSettingsSection("my-extension", { enabled: true });

// Read/write a single value
const val = await getSettingsValue("my-extension", "key", "default");
await setSettingsValue("my-extension", "key", "new-value");
```

### Tool Output Truncation (`tool-output`)

Prevent large tool results from overflowing the LLM context.

```ts
import { truncateToolOutput, truncatedResult, TOOL_OUTPUT_MAX_LINES } from "@pi-atelier/shared-utils";

// Truncate overly long output
const result = truncateToolOutput(longText, { maxLines: 200 });
// { text: "...", truncated: true, originalLines: 1500, keptLines: 200 }

// Shortcut: returns pi tool result format
return truncatedResult(text);  // auto-truncates + returns { content: [{ type: "text", text }] }
```

### Sub-Agent Discovery (`agents`)

Scan the `~/.pi/agent/agents/` directory for sub-agent definition files.

```ts
import { discoverAgents, getAgentDescription, formatAgentsList } from "@pi-atelier/shared-utils";

// Discover all available sub-agents
const agents = await discoverAgents();
// [{ name: "pv-executor", description: "...", filePath: "..." }, ...]

// Get description for a single agent
const desc = await getAgentDescription("pv-executor");

// Format as a readable list
const list = formatAgentsList(agents);
```

### Session-Scoped Data (`ephemeral`)

A hint/label stack for the current session that vanishes when the session ends. Useful for lightweight state passing across tool calls.

```ts
import { pushHint, hasHints, peekHints, drainHints, peekLabels } from "@pi-atelier/shared-utils";

pushHint({ key: "recent-files", values: ["file1.ts", "file2.ts"] });
const has = hasHints("recent-files");
const hints = peekHints("recent-files");   // peek without removing
const all = drainHints();                   // retrieve and clear
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
