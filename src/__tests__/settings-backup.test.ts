import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// 测试前先 mock paths 模块的 SETTINGS_PATH
const TEST_DIR = join(tmpdir(), "pi-settings-backup-test");
const TEST_SETTINGS = join(TEST_DIR, "settings.json");
const TEST_BACKUP_DIR = join(TEST_DIR, "settings-backup");

// 用 vi.mock 替代直接写全局文件
const { patchSettingsSectionWithBackup, rollbackSettings, listBackups } = await import(
	"../settings-backup"
);

// ── 测试辅助 ────────────────────────────────────────────

function writeTestSettings(content: Record<string, any>) {
	mkdirSync(TEST_DIR, { recursive: true });
	writeFileSync(TEST_SETTINGS, JSON.stringify(content, null, 2));
}

function readTestSettings(): Record<string, any> {
	if (!existsSync(TEST_SETTINGS)) return {};
	return JSON.parse(readFileSync(TEST_SETTINGS, "utf-8"));
}

function cleanupTestDir() {
	if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
}

function countBackups(): number {
	if (!existsSync(TEST_BACKUP_DIR)) return 0;
	return readdirSync(TEST_BACKUP_DIR).filter((f) => f.endsWith(".json")).length;
}

// ── 测试 ─────────────────────────────────────────────────

describe("settings-backup", () => {
	beforeEach(() => {
		cleanupTestDir();
		mkdirSync(TEST_DIR, { recursive: true });
	});
	afterEach(() => {
		cleanupTestDir();
	});

	describe("patchSettingsSectionWithBackup", () => {
		it("修改后自动创建备份", () => {
			writeTestSettings({ context: { distillThreshold: 5000 } });

			const result = patchSettingsSectionWithBackup(
				"context",
				{ distillThreshold: 8000 },
				{ distillThreshold: 5000, agingThreshold: 20 },
				{ settingsPath: TEST_SETTINGS, backupDir: TEST_BACKUP_DIR },
			);

			expect(result.config.distillThreshold).toBe(8000);
			expect(existsSync(TEST_BACKUP_DIR)).toBe(true);
			expect(countBackups()).toBe(1);

			// 备份内容应该是修改前的值
			const backupFiles = readdirSync(TEST_BACKUP_DIR).filter((f) => f.endsWith(".json"));
			const backupContent = JSON.parse(readFileSync(join(TEST_BACKUP_DIR, backupFiles[0]), "utf-8"));
			expect(backupContent.context.distillThreshold).toBe(5000);
		});

		it("多次修改产生多个备份", async () => {
			writeTestSettings({ context: { distillThreshold: 5000 } });

			patchSettingsSectionWithBackup(
				"context",
				{ distillThreshold: 6000 },
				{ distillThreshold: 5000 },
				{ settingsPath: TEST_SETTINGS, backupDir: TEST_BACKUP_DIR },
			);

			// 确保时间戳不同
			await new Promise((r) => setTimeout(r, 10));

			patchSettingsSectionWithBackup(
				"context",
				{ distillThreshold: 7000 },
				{ distillThreshold: 5000 },
				{ settingsPath: TEST_SETTINGS, backupDir: TEST_BACKUP_DIR },
			);

			expect(countBackups()).toBe(2);
		});

		it("超过 maxBackups 时清理旧备份", async () => {
			writeTestSettings({ context: { distillThreshold: 5000 } });

			for (let i = 0; i < 5; i++) {
				patchSettingsSectionWithBackup(
					"context",
					{ distillThreshold: 5000 + i },
					{ distillThreshold: 5000 },
					{ settingsPath: TEST_SETTINGS, backupDir: TEST_BACKUP_DIR, maxBackups: 3 },
				);
				await new Promise((r) => setTimeout(r, 10));
			}

			expect(countBackups()).toBe(3);
		});

		it("类型校验不通过时返回错误但不写入", () => {
			writeTestSettings({ context: { distillThreshold: 5000 } });

			const result = patchSettingsSectionWithBackup(
				"context",
				{ distillThreshold: "wrong-type" as any },
				{ distillThreshold: 5000 },
				{ settingsPath: TEST_SETTINGS, backupDir: TEST_BACKUP_DIR, validate: true },
			);

			expect(result.errors.length).toBeGreaterThan(0);
			expect(result.errors[0].key).toBe("distillThreshold");
			// settings.json 不应该被修改
			expect(readTestSettings().context.distillThreshold).toBe(5000);
		});

		it("validate: false 跳过类型校验", () => {
			writeTestSettings({ context: { distillThreshold: 5000 } });

			const result = patchSettingsSectionWithBackup(
				"context",
				{ distillThreshold: "skip-validation" as any },
				{ distillThreshold: 5000 },
				{ settingsPath: TEST_SETTINGS, backupDir: TEST_BACKUP_DIR, validate: false },
			);

			expect(result.errors).toEqual([]);
			expect(readTestSettings().context.distillThreshold).toBe("skip-validation");
		});

		it("备份目录不存在时自动创建", () => {
			writeTestSettings({ context: { distillThreshold: 5000 } });
			expect(existsSync(TEST_BACKUP_DIR)).toBe(false);

			patchSettingsSectionWithBackup(
				"context",
				{ distillThreshold: 8000 },
				{ distillThreshold: 5000 },
				{ settingsPath: TEST_SETTINGS, backupDir: TEST_BACKUP_DIR },
			);

			expect(existsSync(TEST_BACKUP_DIR)).toBe(true);
		});

		it("备份文件名包含时间戳", () => {
			writeTestSettings({ context: { distillThreshold: 5000 } });

			patchSettingsSectionWithBackup(
				"context",
				{ distillThreshold: 8000 },
				{ distillThreshold: 5000 },
				{ settingsPath: TEST_SETTINGS, backupDir: TEST_BACKUP_DIR },
			);

			const files = readdirSync(TEST_BACKUP_DIR).filter((f) => f.endsWith(".json"));
			expect(files.length).toBe(1);
			// 文件名格式：settings.{timestamp}.json
			expect(files[0]).toMatch(/^settings\.\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}/);
		});
	});

	describe("rollbackSettings", () => {
		it("恢复到最近一次备份", () => {
			writeTestSettings({ context: { distillThreshold: 5000 } });

			patchSettingsSectionWithBackup(
				"context",
				{ distillThreshold: 8000 },
				{ distillThreshold: 5000 },
				{ settingsPath: TEST_SETTINGS, backupDir: TEST_BACKUP_DIR },
			);
			expect(readTestSettings().context.distillThreshold).toBe(8000);

			rollbackSettings({ settingsPath: TEST_SETTINGS, backupDir: TEST_BACKUP_DIR });
			expect(readTestSettings().context.distillThreshold).toBe(5000);
		});

		it("无备份时抛错", () => {
			writeTestSettings({ context: { distillThreshold: 5000 } });
			expect(() => rollbackSettings({ settingsPath: TEST_SETTINGS, backupDir: TEST_BACKUP_DIR })).toThrow();
		});

		it("回滚后删除已恢复的备份", () => {
			writeTestSettings({ context: { distillThreshold: 5000 } });

			patchSettingsSectionWithBackup(
				"context",
				{ distillThreshold: 8000 },
				{ distillThreshold: 5000 },
				{ settingsPath: TEST_SETTINGS, backupDir: TEST_BACKUP_DIR },
			);
			expect(countBackups()).toBe(1);

			rollbackSettings({ settingsPath: TEST_SETTINGS, backupDir: TEST_BACKUP_DIR });
			expect(countBackups()).toBe(0);
		});
	});

	describe("listBackups", () => {
		it("返回备份列表（按时间倒序）", async () => {
			writeTestSettings({ context: { distillThreshold: 5000 } });

			patchSettingsSectionWithBackup(
				"context",
				{ distillThreshold: 6000 },
				{ distillThreshold: 5000 },
				{ settingsPath: TEST_SETTINGS, backupDir: TEST_BACKUP_DIR },
			);
			await new Promise((r) => setTimeout(r, 10));
			patchSettingsSectionWithBackup(
				"context",
				{ distillThreshold: 7000 },
				{ distillThreshold: 5000 },
				{ settingsPath: TEST_SETTINGS, backupDir: TEST_BACKUP_DIR },
			);

			const backups = listBackups({ backupDir: TEST_BACKUP_DIR });
			expect(backups.length).toBe(2);
			// 最新的在前
			expect(backups[0].timestamp > backups[1].timestamp).toBe(true);
		});

		it("无备份时返回空数组", () => {
			const backups = listBackups({ backupDir: TEST_BACKUP_DIR });
			expect(backups).toEqual([]);
		});
	});
});
