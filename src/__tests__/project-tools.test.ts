import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SETTINGS_PATH } from "../paths";

// ── 沙箱隔离（vi.hoisted 在模块 import 前执行）──────────
vi.hoisted(() => {
	process.env.PI_AGENT_DIR = require("node:path").join(require("node:os").tmpdir(), "pi-shared-utils-test-sandbox");
});
import { clearProjectSettingsCache } from "../project-config";
import { getDisabledMcpServers, getEffectiveToolFilter, getEnabledTools } from "../project-tools";

const TEST_DIR = join(tmpdir(), "pi-shared-utils-tools-test");

// ── 测试辅助 ────────────────────────────────────────────

function createProjectSettings(dir: string, content: Record<string, any>) {
	const piDir = join(dir, ".pi");
	mkdirSync(piDir, { recursive: true });
	writeFileSync(join(piDir, "settings.json"), JSON.stringify(content, null, 2));
}

function cleanupDir(dir: string) {
	if (existsSync(dir)) rmSync(dir, { recursive: true });
}


// ── 沙箱防护：确认所有路径都落在沙箱内，绝不触碰真身 ────
const SANDBOX_AGENT_DIR = join(process.env.PI_AGENT_DIR as string);
const REAL_AGENT_DIR = join(homedir(), ".pi", "agent");

function assertSandbox() {
	mkdirSync(SANDBOX_AGENT_DIR, { recursive: true });
	if (!SETTINGS_PATH.startsWith(SANDBOX_AGENT_DIR) || SETTINGS_PATH.startsWith(REAL_AGENT_DIR)) {
		throw new Error(
			`沙箱失效：SETTINGS_PATH=${SETTINGS_PATH} 未落在沙箱 ${SANDBOX_AGENT_DIR} 内（真实全局目录=${REAL_AGENT_DIR}）。测试已中止以防覆写真实 settings.json`,
		);
	}
}

function mockGlobalSettings(content: Record<string, any>) {
	assertSandbox();
	const original = existsSync(SETTINGS_PATH) ? readFileSync(SETTINGS_PATH, "utf-8") : "{}";
	writeFileSync(SETTINGS_PATH, JSON.stringify(content, null, 2));
	return () => writeFileSync(SETTINGS_PATH, original);
}

// ── 测试 ─────────────────────────────────────────────────

afterAll(() => {
	delete process.env.PI_AGENT_DIR;
});

describe("getDisabledMcpServers — 三层合并", () => {
	beforeEach(() => {
		cleanupDir(TEST_DIR);
		clearProjectSettingsCache();
		mkdirSync(TEST_DIR, { recursive: true });
	});
	afterEach(() => {
		cleanupDir(TEST_DIR);
	});

	it("无项目配置时，只返回全局禁用列表", () => {
		const restore = mockGlobalSettings({ mcp: { disabled: ["global-server"] } });
		try {
			const result = getDisabledMcpServers(TEST_DIR);
			expect(result).toEqual(["global-server"]);
		} finally {
			restore();
		}
	});

	it("无全局无项目配置时，返回空数组", () => {
		const restore = mockGlobalSettings({});
		try {
			const result = getDisabledMcpServers(TEST_DIR);
			expect(result).toEqual([]);
		} finally {
			restore();
		}
	});

	it("全局 + 项目 concat 合并", () => {
		const restore = mockGlobalSettings({ mcp: { disabled: ["unstable"] } });
		try {
			createProjectSettings(TEST_DIR, { mcp: { disabled: ["godot"] } });
			const result = getDisabledMcpServers(TEST_DIR);
			expect(result).toEqual(["unstable", "godot"]);
		} finally {
			restore();
		}
	});

	it("全局和项目有重复时去重", () => {
		const restore = mockGlobalSettings({ mcp: { disabled: ["shared-server"] } });
		try {
			createProjectSettings(TEST_DIR, { mcp: { disabled: ["shared-server", "extra"] } });
			const result = getDisabledMcpServers(TEST_DIR);
			expect(result).toEqual(["shared-server", "extra"]);
		} finally {
			restore();
		}
	});

	it("只有项目级配置时", () => {
		const restore = mockGlobalSettings({});
		try {
			createProjectSettings(TEST_DIR, { mcp: { disabled: ["godot", "glm"] } });
			const result = getDisabledMcpServers(TEST_DIR);
			expect(result).toEqual(["godot", "glm"]);
		} finally {
			restore();
		}
	});

	it("全局禁用 + 项目 enabled 白名单覆盖", () => {
		const restore = mockGlobalSettings({ mcp: { disabled: ["godot", "code-graph", "glm-web-search"] } });
		try {
			// 项目启用 godot，其他保持禁用
			createProjectSettings(TEST_DIR, { mcp: { enabled: ["godot"] } });
			const result = getDisabledMcpServers(TEST_DIR);
			expect(result).toEqual(["code-graph", "glm-web-search"]);
			expect(result).not.toContain("godot");
		} finally {
			restore();
		}
	});

	it("全局禁用 + 项目 enabled + 项目 disabled 同时生效", () => {
		const restore = mockGlobalSettings({ mcp: { disabled: ["godot", "code-graph"] } });
		try {
			createProjectSettings(TEST_DIR, {
				mcp: {
					enabled: ["godot"], // 启用 godot（从 disabled 中移除）
					disabled: ["glm-web-search"], // 额外禁用
				},
			});
			const result = getDisabledMcpServers(TEST_DIR);
			expect(result).toEqual(["code-graph", "glm-web-search"]);
			expect(result).not.toContain("godot");
		} finally {
			restore();
		}
	});
});

describe("getEffectiveToolFilter — 三层合并", () => {
	beforeEach(() => {
		cleanupDir(TEST_DIR);
		clearProjectSettingsCache();
		mkdirSync(TEST_DIR, { recursive: true });
	});
	afterEach(() => {
		cleanupDir(TEST_DIR);
	});

	it("无配置时返回空 filter", () => {
		const filter = getEffectiveToolFilter(TEST_DIR);
		expect(filter.disabled).toBeUndefined();
		expect(filter.enabled).toBeUndefined();
	});

	it("全局 + 项目 concat", () => {
		const restore = mockGlobalSettings({ tools: { disabled: ["global-tool"] } });
		try {
			createProjectSettings(TEST_DIR, { tools: { disabled: ["project-tool"] } });
			const filter = getEffectiveToolFilter(TEST_DIR);
			expect(filter.disabled).toEqual(["global-tool", "project-tool"]);
		} finally {
			restore();
		}
	});
});

describe("getEnabledTools — 三层合并", () => {
	beforeEach(() => {
		cleanupDir(TEST_DIR);
		clearProjectSettingsCache();
		mkdirSync(TEST_DIR, { recursive: true });
	});
	afterEach(() => {
		cleanupDir(TEST_DIR);
	});

	const ALL_TOOLS = ["read", "write", "edit", "bash", "grep", "find"];

	it("无过滤时返回全部工具", () => {
		const result = getEnabledTools(ALL_TOOLS, TEST_DIR);
		expect(result).toEqual(ALL_TOOLS);
	});

	it("全局禁用 + 项目禁用 concat", () => {
		const restore = mockGlobalSettings({ tools: { disabled: ["bash"] } });
		try {
			createProjectSettings(TEST_DIR, { tools: { disabled: ["grep"] } });
			const result = getEnabledTools(ALL_TOOLS, TEST_DIR);
			expect(result).toEqual(["read", "write", "edit", "find"]);
		} finally {
			restore();
		}
	});

	it("全局和项目都禁用同一个工具时去重", () => {
		const restore = mockGlobalSettings({ tools: { disabled: ["bash"] } });
		try {
			createProjectSettings(TEST_DIR, { tools: { disabled: ["bash", "edit"] } });
			const result = getEnabledTools(ALL_TOOLS, TEST_DIR);
			expect(result).toEqual(["read", "write", "grep", "find"]);
		} finally {
			restore();
		}
	});

	it("enabled 补充不在 allTools 里的工具", () => {
		createProjectSettings(TEST_DIR, { tools: { enabled: ["custom-tool"] } });
		const result = getEnabledTools(ALL_TOOLS, TEST_DIR);
		expect(result).toContain("custom-tool");
	});
});
