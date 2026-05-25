/**
 * paths — 共享路径常量 — 单元测试
 *
 * 测试场景：
 * 1) 默认 AGENT_DIR = ~/.pi/agent
 * 2) PI_AGENT_DIR 环境变量覆盖（动态 import）
 * 3) 所有路径常量正确拼接
 * 4) 边界：环境变量含尾部斜杠
 * 5) 边界：环境变量为空字符串
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// 默认情况下的静态导入（无环境变量）
import {
	AGENT_DIR,
	MODELS_CONFIG_PATH,
	MEMORY_MD_PATH,
	MEMORY_DIR,
	MCP_CONFIG_PATH,
	MCP_CACHE_PATH,
	AGENTS_DIR,
	GLOBAL_RULES_PATH,
	SETTINGS_PATH,
} from "../paths";

const ORIG_ENV = process.env.PI_AGENT_DIR;

beforeEach(() => {
	delete process.env.PI_AGENT_DIR;
});

afterEach(() => {
	if (ORIG_ENV !== undefined) {
		process.env.PI_AGENT_DIR = ORIG_ENV;
	} else {
		delete process.env.PI_AGENT_DIR;
	}
});

// ── AGENT_DIR ─────────────────────────────────────────────

describe("AGENT_DIR", () => {
	it("默认值为 ~/.pi/agent（无环境变量时）", () => {
		const expected = require("node:os").homedir() + "/.pi/agent";
		expect(AGENT_DIR).toBe(expected);
	});

	it("PI_AGENT_DIR 环境变量覆盖默认值", async () => {
		process.env.PI_AGENT_DIR = "/custom/pi-agent";
		vi.resetModules();
		const { AGENT_DIR: customDir } = await import("../paths");
		expect(customDir).toBe("/custom/pi-agent");
		delete process.env.PI_AGENT_DIR;
		vi.resetModules();
	});

	it("PI_AGENT_DIR 设为空字符串时回退到默认值", async () => {
		process.env.PI_AGENT_DIR = "";
		vi.resetModules();
		const { AGENT_DIR: emptyDir } = await import("../paths");
		const expected = require("node:os").homedir() + "/.pi/agent";
		expect(emptyDir).toBe(expected);
		delete process.env.PI_AGENT_DIR;
		vi.resetModules();
	});

	it("PI_AGENT_DIR 含尾部斜杠时不产生双斜杠", async () => {
		process.env.PI_AGENT_DIR = "/custom/pi-agent/";
		vi.resetModules();
		const { MODELS_CONFIG_PATH: modelPath } = await import("../paths");
		expect(modelPath).not.toContain("//");
		expect(modelPath).toBe("/custom/pi-agent/models.json");
		delete process.env.PI_AGENT_DIR;
		vi.resetModules();
	});
});

// ── 路径常量拼接正确性 ──────────────────────────────────

describe("路径常量拼接", () => {
	const homeDir = require("node:os").homedir();
	const defaultAgentDir = homeDir + "/.pi/agent";

	it("MODELS_CONFIG_PATH = AGENT_DIR/models.json", () => {
		expect(MODELS_CONFIG_PATH).toBe(defaultAgentDir + "/models.json");
	});

	it("MEMORY_MD_PATH = AGENT_DIR/MEMORY.md", () => {
		expect(MEMORY_MD_PATH).toBe(defaultAgentDir + "/MEMORY.md");
	});

	it("MEMORY_DIR = AGENT_DIR/memory", () => {
		expect(MEMORY_DIR).toBe(defaultAgentDir + "/memory");
	});

	it("MCP_CONFIG_PATH = AGENT_DIR/mcp.json", () => {
		expect(MCP_CONFIG_PATH).toBe(defaultAgentDir + "/mcp.json");
	});

	it("MCP_CACHE_PATH = AGENT_DIR/mcp-cache.json", () => {
		expect(MCP_CACHE_PATH).toBe(defaultAgentDir + "/mcp-cache.json");
	});

	it("AGENTS_DIR = AGENT_DIR/agents", () => {
		expect(AGENTS_DIR).toBe(defaultAgentDir + "/agents");
	});

	it("GLOBAL_RULES_PATH = AGENT_DIR/extensions/shepherd/rules.json", () => {
		expect(GLOBAL_RULES_PATH).toBe(defaultAgentDir + "/extensions/shepherd/rules.json");
	});
});

// ── 所有路径基于相同的 AGENT_DIR ────────────────────────

describe("路径一致性", () => {
	it("所有路径共享同一个 AGENT_DIR 前缀", () => {
		const based = AGENT_DIR;
		expect(MODELS_CONFIG_PATH.startsWith(based)).toBe(true);
		expect(MEMORY_MD_PATH.startsWith(based)).toBe(true);
		expect(MEMORY_DIR.startsWith(based)).toBe(true);
		expect(MCP_CONFIG_PATH.startsWith(based)).toBe(true);
		expect(MCP_CACHE_PATH.startsWith(based)).toBe(true);
		expect(AGENTS_DIR.startsWith(based)).toBe(true);
		expect(GLOBAL_RULES_PATH.startsWith(based)).toBe(true);
	});
});
