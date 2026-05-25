/**
 * 共享路径常量
 *
 * 统一管理 ~/.pi/agent 下所有路径，支持 PI_AGENT_DIR 环境变量覆盖。
 * 用 `||` 确保空字符串也会回退到默认值。
 */

import { homedir } from "node:os";
import { join } from "node:path";

/** 统一的 agent 目录路径 */
export const AGENT_DIR = process.env.PI_AGENT_DIR || join(homedir(), ".pi/agent");

// ── 常用路径常量 ──────────────────────────────────────────

export const SETTINGS_PATH = join(AGENT_DIR, "settings.json");
export const MODELS_CONFIG_PATH = join(AGENT_DIR, "models.json");
export const MEMORY_MD_PATH = join(AGENT_DIR, "MEMORY.md");
export const MEMORY_DIR = join(AGENT_DIR, "memory");
export const MCP_CONFIG_PATH = join(AGENT_DIR, "mcp.json");
export const MCP_CACHE_PATH = join(AGENT_DIR, "mcp-cache.json");
export const AGENTS_DIR = join(AGENT_DIR, "agents");
export const GLOBAL_RULES_PATH = join(AGENT_DIR, "extensions/shepherd/rules.json");
