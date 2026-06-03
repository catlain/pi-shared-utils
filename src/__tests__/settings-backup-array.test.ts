/**
 * patchSettingsSectionWithBackup 数组操作测试
 *
 * 测试 packages/extensions/skills 等数组类型 section 的增删改操作。
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const TEST_DIR = join(tmpdir(), `pi-settings-array-test-${process.pid}`);
const TEST_SETTINGS = join(TEST_DIR, "settings.json");
const TEST_BACKUP_DIR = join(TEST_DIR, "settings-backup");

const { patchSettingsSectionWithBackup } = await import("../settings-backup");

function writeTestSettings(content: Record<string, any>) {
	mkdirSync(TEST_DIR, { recursive: true });
	writeFileSync(TEST_SETTINGS, JSON.stringify(content, null, "\t"));
}

function readTestSettings(): Record<string, any> {
	return JSON.parse(readFileSync(TEST_SETTINGS, "utf-8"));
}

beforeEach(() => {
	mkdirSync(TEST_DIR, { recursive: true });
	mkdirSync(TEST_BACKUP_DIR, { recursive: true });
});

afterEach(() => {
	rmSync(TEST_DIR, { recursive: true, force: true });
});

// ── addItem：向数组添加元素 ─────────────────────────────

describe("patchSettingsSectionWithBackup — 数组 addItem", () => {
	it("应向空数组添加元素", () => {
		writeTestSettings({ packages: [] });

		const result = patchSettingsSectionWithBackup(
			"packages",
			{ addItem: { source: "git:github.com/catlain/pi-foo" } },
			[],
			{ settingsPath: TEST_SETTINGS, backupDir: TEST_BACKUP_DIR, validate: false },
		);

		expect(result.config).toEqual([{ source: "git:github.com/catlain/pi-foo" }]);
		const written = readTestSettings();
		expect(written.packages).toEqual([{ source: "git:github.com/catlain/pi-foo" }]);
	});

	it("应向已有数组追加元素", () => {
		writeTestSettings({
			packages: [{ source: "git:github.com/catlain/pi-shepherd" }],
		});

		patchSettingsSectionWithBackup("packages", { addItem: { source: "git:github.com/catlain/pi-foo" } }, [], {
			settingsPath: TEST_SETTINGS,
			backupDir: TEST_BACKUP_DIR,
			validate: false,
		});

		const written = readTestSettings();
		expect(written.packages).toHaveLength(2);
		expect(written.packages[1]).toEqual({ source: "git:github.com/catlain/pi-foo" });
	});

	it("addItem 为对象时用 source 字段去重，已存在则不重复添加", () => {
		writeTestSettings({
			packages: [{ source: "git:github.com/catlain/pi-shepherd" }],
		});

		const result = patchSettingsSectionWithBackup(
			"packages",
			{ addItem: { source: "git:github.com/catlain/pi-shepherd" } },
			[],
			{ settingsPath: TEST_SETTINGS, backupDir: TEST_BACKUP_DIR, validate: false },
		);

		expect(result.config).toHaveLength(1);
	});

	it("addItem 为字符串时精确去重", () => {
		writeTestSettings({
			packages: ["npm:pi-tool-display"],
		});

		const result = patchSettingsSectionWithBackup("packages", { addItem: "npm:pi-tool-display" }, [], {
			settingsPath: TEST_SETTINGS,
			backupDir: TEST_BACKUP_DIR,
			validate: false,
		});

		expect(result.config).toHaveLength(1);
	});
});

// ── removeItem：从数组删除元素 ─────────────────────────────

describe("patchSettingsSectionWithBackup — 数组 removeItem", () => {
	it("应按 source 字段匹配删除对象元素", () => {
		writeTestSettings({
			packages: [{ source: "git:github.com/catlain/pi-shepherd" }, { source: "git:github.com/catlain/pi-foo" }],
		});

		const result = patchSettingsSectionWithBackup(
			"packages",
			{ removeItem: { source: "git:github.com/catlain/pi-foo" } },
			[],
			{ settingsPath: TEST_SETTINGS, backupDir: TEST_BACKUP_DIR, validate: false },
		);

		expect(result.config).toEqual([{ source: "git:github.com/catlain/pi-shepherd" }]);
	});

	it("应按字符串精确匹配删除", () => {
		writeTestSettings({
			packages: ["npm:pi-tool-display", "npm:pi-foo"],
		});

		const result = patchSettingsSectionWithBackup("packages", { removeItem: "npm:pi-foo" }, [], {
			settingsPath: TEST_SETTINGS,
			backupDir: TEST_BACKUP_DIR,
			validate: false,
		});

		expect(result.config).toEqual(["npm:pi-tool-display"]);
	});

	it("removeItem 匹配不到时不应修改数组", () => {
		writeTestSettings({
			packages: [{ source: "git:github.com/catlain/pi-shepherd" }],
		});

		const result = patchSettingsSectionWithBackup(
			"packages",
			{ removeItem: { source: "git:github.com/catlain/nonexistent" } },
			[],
			{ settingsPath: TEST_SETTINGS, backupDir: TEST_BACKUP_DIR, validate: false },
		);

		expect(result.config).toHaveLength(1);
	});
});

// ── replaceItem：替换数组中匹配的元素 ─────────────────────────

describe("patchSettingsSectionWithBackup — 数组 replaceItem", () => {
	it("应按 source 匹配并替换整个对象元素", () => {
		writeTestSettings({
			packages: [
				{ source: "git:github.com/catlain/pi-usage-stats" }, // 旧格式（字符串被修前）
			],
		});

		const result = patchSettingsSectionWithBackup(
			"packages",
			{
				replaceItem: {
					match: { source: "git:github.com/catlain/pi-usage-stats" },
					replacement: { source: "git:github.com/catlain/pi-usage-stats", extensions: ["+index.ts"] },
				},
			},
			[],
			{ settingsPath: TEST_SETTINGS, backupDir: TEST_BACKUP_DIR, validate: false },
		);

		expect(result.config).toEqual([{ source: "git:github.com/catlain/pi-usage-stats", extensions: ["+index.ts"] }]);
	});

	it("应按字符串精确匹配并替换", () => {
		writeTestSettings({
			packages: ["npm:old-package"],
		});

		const result = patchSettingsSectionWithBackup(
			"packages",
			{
				replaceItem: {
					match: "npm:old-package",
					replacement: { source: "npm:new-package" },
				},
			},
			[],
			{ settingsPath: TEST_SETTINGS, backupDir: TEST_BACKUP_DIR, validate: false },
		);

		expect(result.config).toEqual([{ source: "npm:new-package" }]);
	});

	it("replaceItem 匹配不到时不应修改数组", () => {
		writeTestSettings({
			packages: [{ source: "git:github.com/catlain/pi-shepherd" }],
		});

		const result = patchSettingsSectionWithBackup(
			"packages",
			{
				replaceItem: {
					match: { source: "git:github.com/catlain/nonexistent" },
					replacement: { source: "git:github.com/catlain/something" },
				},
			},
			[],
			{ settingsPath: TEST_SETTINGS, backupDir: TEST_BACKUP_DIR, validate: false },
		);

		expect(result.config).toEqual([{ source: "git:github.com/catlain/pi-shepherd" }]);
	});
});

// ── 创建备份 ─────────────────────────────────────────

describe("patchSettingsSectionWithBackup — 数组操作应创建备份", () => {
	it("addItem 应创建备份", () => {
		writeTestSettings({ packages: [] });

		const result = patchSettingsSectionWithBackup(
			"packages",
			{ addItem: { source: "git:github.com/catlain/pi-foo" } },
			[],
			{ settingsPath: TEST_SETTINGS, backupDir: TEST_BACKUP_DIR },
		);

		expect(result.backupPath).toBeDefined();
		expect(existsSync(result.backupPath!)).toBe(true);
	});

	it("removeItem 应创建备份", () => {
		writeTestSettings({ packages: [{ source: "git:github.com/catlain/pi-foo" }] });

		const result = patchSettingsSectionWithBackup(
			"packages",
			{ removeItem: { source: "git:github.com/catlain/pi-foo" } },
			[],
			{ settingsPath: TEST_SETTINGS, backupDir: TEST_BACKUP_DIR },
		);

		expect(result.backupPath).toBeDefined();
	});
});

// ── 对象 section 保持不变 ─────────────────────────────────

describe("patchSettingsSectionWithBackup — 对象操作不受影响", () => {
	it("对象 merge 仍然正常工作", () => {
		writeTestSettings({ context: { distillThreshold: 5000 } });

		const result = patchSettingsSectionWithBackup(
			"context",
			{ processorThreshold: 3000 },
			{ distillThreshold: 8000, processorThreshold: 5000 },
			{ settingsPath: TEST_SETTINGS, backupDir: TEST_BACKUP_DIR, validate: false },
		);

		expect(result.config).toEqual({ distillThreshold: 5000, processorThreshold: 3000 });
	});
});
