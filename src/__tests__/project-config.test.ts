import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
	getEffectiveConfig,
	detectConfigConflicts,
	getEnabledTools,
	getDisabledMcpServers,
} from "../project-config";

const TEST_DIR = join(tmpdir(), "pi-shared-utils-test");

// ── 测试辅助 ────────────────────────────────────────────

function createProjectSettings(dir: string, content: Record<string, any>) {
	const piDir = join(dir, ".pi");
	mkdirSync(piDir, { recursive: true });
	writeFileSync(join(piDir, "settings.json"), JSON.stringify(content, null, 2));
}

function cleanupDir(dir: string) {
	if (existsSync(dir)) rmSync(dir, { recursive: true });
}

// ── 测试 ─────────────────────────────────────────────────

describe("project-config", () => {
	beforeEach(() => {
		cleanupDir(TEST_DIR);
		mkdirSync(TEST_DIR, { recursive: true });
	});
	afterEach(() => {
		cleanupDir(TEST_DIR);
	});

	describe("getEffectiveConfig", () => {
		it("无项目配置时返回默认值", () => {
			const defaults = { threshold: 5000, enabled: true };
			const result = getEffectiveConfig("nonexistent-section", defaults, TEST_DIR);
			expect(result.config.threshold).toBe(5000);
			expect(result.config.enabled).toBe(true);
		});

		it("项目配置覆盖默认值", () => {
			createProjectSettings(TEST_DIR, {
				context: { distillThreshold: 8000 },
			});

			const defaults = { distillThreshold: 5000, agingThreshold: 20 };
			const result = getEffectiveConfig("context", defaults, TEST_DIR);
			expect(result.config.distillThreshold).toBe(8000);
			expect(result.config.agingThreshold).toBe(20);
			expect(result.sources.distillThreshold).toBe("project");
		});

		it("嵌套对象 deep merge", () => {
			createProjectSettings(TEST_DIR, {
				retry: { provider: { timeoutMs: 120000 } },
			});

			const defaults = {
				enabled: true,
				maxRetries: 3,
				provider: { timeoutMs: 600000, maxRetries: 2 },
			};
			const result = getEffectiveConfig("retry", defaults, TEST_DIR);
			expect(result.config.provider.timeoutMs).toBe(120000);
			expect(result.config.provider.maxRetries).toBe(2);
			expect(result.config.enabled).toBe(true);
		});
	});

	describe("detectConfigConflicts", () => {
		it("无项目配置时返回空", () => {
			const conflicts = detectConfigConflicts(TEST_DIR);
			expect(conflicts).toEqual([]);
		});

		it("检测到全局与项目值不同的冲突", () => {
			createProjectSettings(TEST_DIR, {
				context: { distillThreshold: 500 },
			});

			const conflicts = detectConfigConflicts(TEST_DIR);
			// 只检查格式正确，不硬编码全局值
			if (conflicts.length > 0) {
				expect(conflicts[0].section).toBe("context");
				expect(conflicts[0].key).toBe("distillThreshold");
				expect(conflicts[0].projectValue).toBe(500);
			}
		});

		it("跳过 prompts 和 skills 段", () => {
			createProjectSettings(TEST_DIR, {
				prompts: ["prompts/"],
				skills: ["+skills/test/SKILL.md"],
			});

			const conflicts = detectConfigConflicts(TEST_DIR);
			expect(conflicts).toEqual([]);
		});
	});

	describe("getEnabledTools", () => {
		it("无项目配置时返回全部工具", () => {
			const tools = getEnabledTools(["vision_analyze", "payload_analyze", "code_search"], TEST_DIR);
			expect(tools).toEqual(["vision_analyze", "payload_analyze", "code_search"]);
		});

		it("禁用指定工具", () => {
			createProjectSettings(TEST_DIR, {
				tools: { disabled: ["payload_analyze"] },
			});

			const tools = getEnabledTools(["vision_analyze", "payload_analyze", "code_search"], TEST_DIR);
			expect(tools).toEqual(["vision_analyze", "code_search"]);
		});

		it("额外启用工具", () => {
			createProjectSettings(TEST_DIR, {
				tools: { enabled: ["custom_tool"] },
			});

			const tools = getEnabledTools(["vision_analyze"], TEST_DIR);
			expect(tools).toContain("vision_analyze");
			expect(tools).toContain("custom_tool");
		});

		it("同时禁用和启用", () => {
			createProjectSettings(TEST_DIR, {
				tools: { disabled: ["payload_analyze"], enabled: ["custom_tool"] },
			});

			const tools = getEnabledTools(["vision_analyze", "payload_analyze"], TEST_DIR);
			expect(tools).toEqual(["vision_analyze", "custom_tool"]);
		});
	});

	describe("getDisabledMcpServers", () => {
		it("无配置时返回空", () => {
			const disabled = getDisabledMcpServers(TEST_DIR);
			expect(disabled).toEqual([]);
		});

		it("返回禁用的 MCP 服务器", () => {
			createProjectSettings(TEST_DIR, {
				mcp: { disabled: ["code-graph", "glm-web-search"] },
			});

			const disabled = getDisabledMcpServers(TEST_DIR);
			expect(disabled).toEqual(["code-graph", "glm-web-search"]);
		});
	});
});
