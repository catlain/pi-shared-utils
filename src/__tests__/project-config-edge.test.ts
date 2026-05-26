/**
 * 项目级配置边界情况测试
 * - 文件损坏/空配置/未知字段
 * - 不同项目目录隔离性
 * - 值相同时不报冲突
 * - 类型不匹配的各种情况
 */

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

const TEST_DIR = join(tmpdir(), "pi-shared-utils-edge-test");

function createProjectSettings(dir: string, content: Record<string, any>) {
	const piDir = join(dir, ".pi");
	mkdirSync(piDir, { recursive: true });
	writeFileSync(join(piDir, "settings.json"), JSON.stringify(content, null, 2));
}

function cleanupDir(dir: string) {
	if (existsSync(dir)) rmSync(dir, { recursive: true });
}

const SETTINGS_PATH = join(require("node:os").homedir(), ".pi/agent/settings.json");

function mockGlobalSettings(content: Record<string, any>) {
	const original = readFileSync(SETTINGS_PATH, "utf-8");
	writeFileSync(SETTINGS_PATH, JSON.stringify(content, null, 2));
	return () => writeFileSync(SETTINGS_PATH, original);
}

let restoreGlobal: (() => void) | undefined;

describe("边界情况与隔离性", () => {
	beforeEach(() => {
		cleanupDir(TEST_DIR);
		clearProjectSettingsCache();
		mkdirSync(TEST_DIR, { recursive: true });
		restoreGlobal = mockGlobalSettings({});
	});
	afterEach(() => {
		restoreGlobal?.();
		cleanupDir(TEST_DIR);
	});

	it("项目配置为空对象时不影响默认值", () => {
		createProjectSettings(TEST_DIR, {
			context: {},
		});

		const defaults = { distillThreshold: 5000, agingThreshold: 10 };
		const result = getEffectiveConfig("context", defaults, TEST_DIR);
		expect(typeof result.config.distillThreshold).toBe("number");
		expect(typeof result.config.agingThreshold).toBe("number");
	});

	it("项目配置文件损坏（无效 JSON）时回退到默认值", () => {
		const piDir = join(TEST_DIR, ".pi");
		mkdirSync(piDir, { recursive: true });
		writeFileSync(join(piDir, "settings.json"), "{ invalid json ");

		const defaults = { distillThreshold: 5000 };
		const result = getEffectiveConfig("context", defaults, TEST_DIR);
		expect(result.config.distillThreshold).toBe(5000);
	});

	it("项目配置含未知字段时保留（不丢弃）", () => {
		createProjectSettings(TEST_DIR, {
			context: { distillThreshold: 8000, unknownField: "hello" },
		});

		const defaults = { distillThreshold: 5000, agingThreshold: 10 };
		const result = getEffectiveConfig("context", defaults, TEST_DIR);
		expect(result.config.distillThreshold).toBe(8000);
		expect(typeof result.config.agingThreshold).toBe("number");
		expect((result.config as any).unknownField).toBe("hello");
	});

	it("不同项目目录的配置互不影响", () => {
		const dirA = join(TEST_DIR, "project-a");
		const dirB = join(TEST_DIR, "project-b");
		mkdirSync(dirA, { recursive: true });
		mkdirSync(dirB, { recursive: true });

		createProjectSettings(dirA, { context: { distillThreshold: 1000 } });
		createProjectSettings(dirB, { context: { distillThreshold: 2000 } });

		const defaults = { distillThreshold: 5000 };
		const resultA = getEffectiveConfig("context", defaults, dirA);
		const resultB = getEffectiveConfig("context", defaults, dirB);

		expect(resultA.config.distillThreshold).toBe(1000);
		expect(resultB.config.distillThreshold).toBe(2000);
	});

	it("项目值与全局值相同时不产生冲突", () => {
		const defaults = { distillThreshold: 5000 };
		const globalResult = getEffectiveConfig("context", defaults, TEST_DIR);

		createProjectSettings(TEST_DIR, {
			context: { distillThreshold: globalResult.config.distillThreshold },
		});

		const conflicts = detectConfigConflicts(TEST_DIR);
		const contextConflicts = conflicts.filter((c) => c.section === "context" && c.key === "distillThreshold");
		expect(contextConflicts).toHaveLength(0);
	});

	it("validateConfigSchema 忽略 defaults 中不存在的字段", () => {
		createProjectSettings(TEST_DIR, {
			context: { distillThreshold: 8000, extraField: "surprise" },
		});

		const errors = validateConfigSchema("context", { distillThreshold: 5000 }, TEST_DIR);
		expect(errors).toEqual([]);
	});

	it("数组字段类型不匹配时报错", () => {
		createProjectSettings(TEST_DIR, {
			context: { tags: "not-an-array" },
		});

		const defaults = { tags: ["default"] };
		const errors = validateConfigSchema("context", defaults, TEST_DIR);
		expect(errors.length).toBeGreaterThan(0);
		expect(errors[0].key).toBe("tags");
		expect(errors[0].expectedType).toBe("array");
		expect(errors[0].actualType).toBe("string");
	});
});
