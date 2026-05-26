import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
	getEnabledTools,
	getDisabledMcpServers,
	getEffectiveToolFilter,
} from "../project-tools";
import { clearProjectSettingsCache } from "../project-config";
import { SETTINGS_PATH } from "../paths";

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

/** 临时替换全局 settings.json 内容（用于测试三层合并） */
function mockGlobalSettings(content: Record<string, any>) {
	const original = readFileSync(SETTINGS_PATH, "utf-8");
	writeFileSync(SETTINGS_PATH, JSON.stringify(content, null, 2));
	return () => writeFileSync(SETTINGS_PATH, original);
}

// ── 测试 ─────────────────────────────────────────────────

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
		const result = getDisabledMcpServers(TEST_DIR);
		expect(result).toEqual([]);
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
		createProjectSettings(TEST_DIR, { mcp: { disabled: ["godot", "glm"] } });
		const result = getDisabledMcpServers(TEST_DIR);
		expect(result).toEqual(["godot", "glm"]);
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
