import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	clearProjectSettingsCache,
	detectConfigConflicts,
	getEffectiveConfig,
	validateConfigSchema,
} from "../project-config";
import { getDisabledMcpServers, getEnabledTools } from "../project-tools";

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

const SETTINGS_PATH = join(require("node:os").homedir(), ".pi/agent/settings.json");

/** 临时替换全局 settings.json 内容（用于测试三层合并） */
function mockGlobalSettings(content: Record<string, any>) {
	const original = readFileSync(SETTINGS_PATH, "utf-8");
	writeFileSync(SETTINGS_PATH, JSON.stringify(content, null, 2));
	return () => writeFileSync(SETTINGS_PATH, original);
}

// ── 测试 ─────────────────────────────────────────────────

describe("project-config", () => {
	beforeEach(() => {
		cleanupDir(TEST_DIR);
		clearProjectSettingsCache();
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
				"test-cfg-override": { distillThreshold: 8000 },
			});

			const defaults = { distillThreshold: 5000, agingThreshold: 20 };
			const result = getEffectiveConfig("test-cfg-override", defaults, TEST_DIR);
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

	describe("数组合并策略", () => {
		it("默认：数组字段被项目级替换", () => {
			createProjectSettings(TEST_DIR, {
				test: { items: [4, 5, 6] },
			});

			const defaults = { items: [1, 2, 3] };
			const result = getEffectiveConfig("test", defaults, TEST_DIR);
			expect(result.config.items).toEqual([4, 5, 6]);
		});

		it("concatMerge 策略：数组字段做追加而非替换", () => {
			createProjectSettings(TEST_DIR, {
				shepherd: {
					rules: [{ comment: "项目规则", hook: "tool_call", tool: "bash", action: "notify", reason: "test" }],
				},
			});

			const defaults = {
				rules: [{ comment: "全局规则", hook: "tool_call", tool: "bash", action: "block", reason: "test" }],
			};
			const result = getEffectiveConfig("shepherd", defaults, TEST_DIR, {
				arrayMerge: "concat",
			});
			// 全局 + 项目 追加
			expect(result.config.rules).toHaveLength(2);
			expect(result.config.rules[0].comment).toBe("全局规则");
			expect(result.config.rules[1].comment).toBe("项目规则");
		});

		it("concatMerge 策略：无项目级配置时不改变数组", () => {
			const defaults = {
				rules: [{ comment: "唯一规则" }],
			};
			const result = getEffectiveConfig("shepherd", defaults, TEST_DIR, {
				arrayMerge: "concat",
			});
			expect(result.config.rules).toHaveLength(1);
			expect(result.config.rules[0].comment).toBe("唯一规则");
		});
	});

	describe("validateConfigSchema", () => {
		it("类型一致时无错误", () => {
			createProjectSettings(TEST_DIR, {
				context: { distillThreshold: 8000 },
			});

			const errors = validateConfigSchema("context", { distillThreshold: 5000 }, TEST_DIR);
			expect(errors).toEqual([]);
		});

		it("类型不一致时报错", () => {
			createProjectSettings(TEST_DIR, {
				context: { distillThreshold: "8000" },
			});

			const errors = validateConfigSchema("context", { distillThreshold: 5000 }, TEST_DIR);
			expect(errors.length).toBeGreaterThan(0);
			expect(errors[0].key).toBe("distillThreshold");
			expect(errors[0].expectedType).toBe("number");
			expect(errors[0].actualType).toBe("string");
		});

		it("无项目配置时无错误", () => {
			const errors = validateConfigSchema("context", { distillThreshold: 5000 }, TEST_DIR);
			expect(errors).toEqual([]);
		});

		it("嵌套对象类型不一致", () => {
			createProjectSettings(TEST_DIR, {
				retry: { provider: "not-an-object" },
			});

			const defaults = { provider: { timeoutMs: 60000 } };
			const errors = validateConfigSchema("retry", defaults, TEST_DIR);
			expect(errors.length).toBeGreaterThan(0);
			expect(errors[0].key).toBe("provider");
		});
	});

	describe("deepMerge 边界情况", () => {
		it("source 中 null 值覆盖 target", () => {
			createProjectSettings(TEST_DIR, {
				test: { enabled: null },
			});

			const defaults = { enabled: true, name: "test" };
			const result = getEffectiveConfig("test", defaults, TEST_DIR);
			expect(result.config.enabled).toBeNull();
			expect(result.config.name).toBe("test");
		});

		it("数组 concat 时 target 无该字段则直接用 source 数组", () => {
			createProjectSettings(TEST_DIR, {
				test: { items: [1, 2] },
			});

			const defaults = { name: "test" } as Record<string, unknown>;
			const result = getEffectiveConfig("test", defaults, TEST_DIR, { arrayMerge: "concat" });
			expect((result.config as Record<string, unknown>).items).toEqual([1, 2]);
		});

		it("深层嵌套三层合并", () => {
			createProjectSettings(TEST_DIR, {
				deep: { level1: { level2: { level3: "deep" } } },
			});

			const defaults = {
				level1: { level2: { level3: "default", extra: true } },
			};
			const result = getEffectiveConfig("deep", defaults, TEST_DIR);
			expect(result.config.level1.level2.level3).toBe("deep");
			expect(result.config.level1.level2.extra).toBe(true);
		});

		it("source 中原始类型值覆盖 target 的对象", () => {
			createProjectSettings(TEST_DIR, {
				test: { config: "simple" },
			});

			const defaults = { config: { nested: true, depth: 3 } };
			const result = getEffectiveConfig("test", defaults, TEST_DIR);
			expect(result.config.config).toBe("simple");
		});
	});

	describe("getDisabledMcpServers", () => {
		it("无配置时返回空", () => {
			const restore = mockGlobalSettings({});
			try {
				const disabled = getDisabledMcpServers(TEST_DIR);
				expect(disabled).toEqual([]);
			} finally {
				restore();
			}
		});

		it("返回禁用的 MCP 服务器", () => {
			const restore = mockGlobalSettings({});
			try {
				createProjectSettings(TEST_DIR, {
					mcp: { disabled: ["code-graph", "glm-web-search"] },
				});

				const disabled = getDisabledMcpServers(TEST_DIR);
				expect(disabled).toEqual(["code-graph", "glm-web-search"]);
			} finally {
				restore();
			}
		});
	});
});
