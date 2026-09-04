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
import { getDisabledTools, isToolDisabled } from "../project-tools";

const TEST_DIR = join(tmpdir(), "pi-shared-utils-mcp-tools-test");

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

// ── getDisabledTools ────────────────────────────────────

afterAll(() => {
	delete process.env.PI_AGENT_DIR;
});

describe("getDisabledTools — 工具级禁用", () => {
	beforeEach(() => {
		cleanupDir(TEST_DIR);
		clearProjectSettingsCache();
		mkdirSync(TEST_DIR, { recursive: true });
	});
	afterEach(() => {
		cleanupDir(TEST_DIR);
	});

	it("无配置时返回空数组", () => {
		const restore = mockGlobalSettings({});
		try {
			const result = getDisabledTools(TEST_DIR);
			expect(result).toEqual([]);
		} finally {
			restore();
		}
	});

	it("全局工具级禁用", () => {
		const restore = mockGlobalSettings({ mcp: { tools: { disabled: ["godot_export_build"] } } });
		try {
			const result = getDisabledTools(TEST_DIR);
			expect(result).toEqual(["godot_export_build"]);
		} finally {
			restore();
		}
	});

	it("全局 + 项目 concat", () => {
		const restore = mockGlobalSettings({ mcp: { tools: { disabled: ["godot_export_build"] } } });
		try {
			createProjectSettings(TEST_DIR, { mcp: { tools: { disabled: ["godot_launch_editor"] } } });
			const result = getDisabledTools(TEST_DIR);
			expect(result).toEqual(["godot_export_build", "godot_launch_editor"]);
		} finally {
			restore();
		}
	});

	it("项目 enabled 白名单覆盖", () => {
		const restore = mockGlobalSettings({ mcp: { tools: { disabled: ["godot_export_build", "godot_launch_editor"] } } });
		try {
			createProjectSettings(TEST_DIR, { mcp: { tools: { enabled: ["godot_launch_editor"] } } });
			const result = getDisabledTools(TEST_DIR);
			expect(result).toEqual(["godot_export_build"]);
		} finally {
			restore();
		}
	});

	it("去重", () => {
		const restore = mockGlobalSettings({ mcp: { tools: { disabled: ["godot_export_build"] } } });
		try {
			createProjectSettings(TEST_DIR, { mcp: { tools: { disabled: ["godot_export_build"] } } });
			const result = getDisabledTools(TEST_DIR);
			expect(result).toEqual(["godot_export_build"]);
		} finally {
			restore();
		}
	});

	it("与 server 级 disabled 独立", () => {
		const restore = mockGlobalSettings({ mcp: { disabled: ["godot"], tools: { disabled: ["glm_web_search"] } } });
		try {
			const result = getDisabledTools(TEST_DIR);
			expect(result).toEqual(["glm_web_search"]);
		} finally {
			restore();
		}
	});
});

// ── isToolDisabled — glob 匹配 ──────────────────────────

describe("isToolDisabled — glob 匹配", () => {
	beforeEach(() => {
		cleanupDir(TEST_DIR);
		clearProjectSettingsCache();
		mkdirSync(TEST_DIR, { recursive: true });
	});
	afterEach(() => {
		cleanupDir(TEST_DIR);
	});

	it("精确匹配", () => {
		const restore = mockGlobalSettings({ mcp: { tools: { disabled: ["godot_launch_editor"] } } });
		try {
			expect(isToolDisabled("godot_launch_editor", TEST_DIR)).toBe(true);
			expect(isToolDisabled("godot_run_project", TEST_DIR)).toBe(false);
		} finally {
			restore();
		}
	});

	it("glob * 匹配", () => {
		const restore = mockGlobalSettings({ mcp: { tools: { disabled: ["godot_export_*"] } } });
		try {
			expect(isToolDisabled("godot_export_build", TEST_DIR)).toBe(true);
			expect(isToolDisabled("godot_export_list_presets", TEST_DIR)).toBe(true);
			expect(isToolDisabled("godot_run_project", TEST_DIR)).toBe(false);
		} finally {
			restore();
		}
	});

	it("多个 * 通配符", () => {
		const restore = mockGlobalSettings({ mcp: { tools: { disabled: ["godot_*_editor"] } } });
		try {
			expect(isToolDisabled("godot_launch_editor", TEST_DIR)).toBe(true);
			expect(isToolDisabled("godot_game_bridge_uninstall", TEST_DIR)).toBe(false);
		} finally {
			restore();
		}
	});

	it("混合精确和 glob", () => {
		const restore = mockGlobalSettings({ mcp: { tools: { disabled: ["godot_export_*", "godot_launch_editor"] } } });
		try {
			expect(isToolDisabled("godot_export_build", TEST_DIR)).toBe(true);
			expect(isToolDisabled("godot_launch_editor", TEST_DIR)).toBe(true);
			expect(isToolDisabled("godot_run_project", TEST_DIR)).toBe(false);
		} finally {
			restore();
		}
	});

	it("无禁用时全部通过", () => {
		const restore = mockGlobalSettings({});
		try {
			expect(isToolDisabled("godot_anything", TEST_DIR)).toBe(false);
		} finally {
			restore();
		}
	});

	it("项目级 enabled 覆盖全局 disabled", () => {
		const restore = mockGlobalSettings({ mcp: { tools: { disabled: ["godot_export_*"] } } });
		try {
			createProjectSettings(TEST_DIR, { mcp: { tools: { enabled: ["godot_export_*"] } } });
			expect(isToolDisabled("godot_export_build", TEST_DIR)).toBe(false);
		} finally {
			restore();
		}
	});

	it("特殊字符在模式中被正确转义", () => {
		const restore = mockGlobalSettings({ mcp: { tools: { disabled: ["code_graph_pi-core_*"] } } });
		try {
			// "-" 不是 glob 特殊字符，应该精确匹配
			expect(isToolDisabled("code_graph_pi-core_semantic_code_search", TEST_DIR)).toBe(true);
			expect(isToolDisabled("code_graph_pi_core_semantic_code_search", TEST_DIR)).toBe(false);
		} finally {
			restore();
		}
	});
});
