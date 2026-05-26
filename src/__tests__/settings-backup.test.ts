import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// 测试前先 mock paths 模块的 SETTINGS_PATH
const TEST_DIR = join(tmpdir(), `pi-settings-backup-test-${process.pid}`);
const TEST_SETTINGS = join(TEST_DIR, "settings.json");
const TEST_BACKUP_DIR = join(TEST_DIR, "settings-backup");

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

	// ── patchSettingsSectionWithBackup ──────────────────

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
			expect(result.config.agingThreshold).toBe(20); // defaults 填充
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
			expect(files[0]).toMatch(/^settings\.\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}/);
		});

		// ── 边缘情况 ─────────────────────────────

		it("settings.json 不存在时创建新文件", () => {
			// 不写 settings.json，让它不存在
			expect(existsSync(TEST_SETTINGS)).toBe(false);

			const result = patchSettingsSectionWithBackup(
				"context",
				{ distillThreshold: 8000 },
				{ distillThreshold: 5000 },
				{ settingsPath: TEST_SETTINGS, backupDir: TEST_BACKUP_DIR },
			);

			expect(result.config.distillThreshold).toBe(8000);
			expect(existsSync(TEST_SETTINGS)).toBe(true);
			expect(readTestSettings().context.distillThreshold).toBe(8000);
			// 不存在时不创建备份（没有东西可备份）
			expect(countBackups()).toBe(0);
		});

		it("settings.json 内容是非法 JSON 时当作空对象处理", () => {
			mkdirSync(TEST_DIR, { recursive: true });
			writeFileSync(TEST_SETTINGS, "{ broken json !!!");

			const result = patchSettingsSectionWithBackup(
				"context",
				{ distillThreshold: 8000 },
				{ distillThreshold: 5000 },
				{ settingsPath: TEST_SETTINGS, backupDir: TEST_BACKUP_DIR },
			);

			// 不崩溃，当作空对象处理
			expect(result.config.distillThreshold).toBe(8000);
		});

		it("section 不存在时新增 section", () => {
			writeTestSettings({ other: { foo: 1 } });

			const result = patchSettingsSectionWithBackup(
				"context",
				{ distillThreshold: 8000 },
				{ distillThreshold: 5000 },
				{ settingsPath: TEST_SETTINGS, backupDir: TEST_BACKUP_DIR },
			);

			expect(result.config.distillThreshold).toBe(8000);
			const settings = readTestSettings();
			expect(settings.context.distillThreshold).toBe(8000);
			expect(settings.other.foo).toBe(1); // 其他 section 不受影响
		});

		it("patch 值为 undefined 时跳过该 key", () => {
			writeTestSettings({ context: { distillThreshold: 5000, agingThreshold: 20 } });

			patchSettingsSectionWithBackup(
				"context",
				{ distillThreshold: undefined },
				{ distillThreshold: 5000, agingThreshold: 20 },
				{ settingsPath: TEST_SETTINGS, backupDir: TEST_BACKUP_DIR },
			);

			// undefined 不应该覆盖现有值
			const settings = readTestSettings();
			expect(settings.context.distillThreshold).toBe(5000);
			expect(settings.context.agingThreshold).toBe(20);
		});

		it("patch 值为 null 时被类型校验拦截（null !== number）", () => {
			writeTestSettings({ context: { distillThreshold: 5000 } });

			const result = patchSettingsSectionWithBackup(
				"context",
				{ distillThreshold: null as any },
				{ distillThreshold: 5000 },
				{ settingsPath: TEST_SETTINGS, backupDir: TEST_BACKUP_DIR },
			);

			// null 被校验拦截 — 类型不匹配（null vs number）
			expect(result.errors.length).toBeGreaterThan(0);
			expect(readTestSettings().context.distillThreshold).toBe(5000);
		});

		it("patch 值为 null 且 validate:false 时正常写入 null", () => {
			writeTestSettings({ context: { distillThreshold: 5000 } });

			patchSettingsSectionWithBackup(
				"context",
				{ distillThreshold: null as any },
				{ distillThreshold: 5000 },
				{ settingsPath: TEST_SETTINGS, backupDir: TEST_BACKUP_DIR, validate: false },
			);

			expect(readTestSettings().context.distillThreshold).toBeNull();
		});

		it("backup: false 跳过备份创建", () => {
			writeTestSettings({ context: { distillThreshold: 5000 } });

			patchSettingsSectionWithBackup(
				"context",
				{ distillThreshold: 8000 },
				{ distillThreshold: 5000 },
				{ settingsPath: TEST_SETTINGS, backupDir: TEST_BACKUP_DIR, backup: false },
			);

			expect(countBackups()).toBe(0);
			expect(readTestSettings().context.distillThreshold).toBe(8000);
		});

		it("空 patch 不修改配置值但正常写入", () => {
			writeTestSettings({ context: { distillThreshold: 5000 } });

			const result = patchSettingsSectionWithBackup(
				"context",
				{},
				{ distillThreshold: 5000 },
				{ settingsPath: TEST_SETTINGS, backupDir: TEST_BACKUP_DIR },
			);

			expect(result.config.distillThreshold).toBe(5000);
			expect(readTestSettings().context.distillThreshold).toBe(5000);
			// 空修改也会备份（安全起见）
			expect(countBackups()).toBe(1);
		});

		it("defaults 中有嵌套对象时不深度校验", () => {
			writeTestSettings({});

			const result = patchSettingsSectionWithBackup(
				"mcp",
				{ disabled: ["server-a"] },
				{ disabled: [] },
				{ settingsPath: TEST_SETTINGS, backupDir: TEST_BACKUP_DIR },
			);

			expect(result.errors).toEqual([]);
			expect(result.config.disabled).toEqual(["server-a"]);
		});

		it("保留其他 section 不受影响", () => {
			writeTestSettings({
				other: { foo: 1 },
				context: { distillThreshold: 5000 },
			});

			patchSettingsSectionWithBackup(
				"context",
				{ distillThreshold: 8000 },
				{ distillThreshold: 5000 },
				{ settingsPath: TEST_SETTINGS, backupDir: TEST_BACKUP_DIR },
			);

			expect(readTestSettings().other.foo).toBe(1);
		});
	});

	// ── rollbackSettings ──────────────────────────────

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
			expect(() => rollbackSettings({ settingsPath: TEST_SETTINGS, backupDir: TEST_BACKUP_DIR })).toThrow(
				/无可用备份/,
			);
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

		it("连续两次回滚（第二次无备份应抛错）", async () => {
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

			// 第一次回滚：7000 → 6000
			rollbackSettings({ settingsPath: TEST_SETTINGS, backupDir: TEST_BACKUP_DIR });
			expect(readTestSettings().context.distillThreshold).toBe(6000);
			expect(countBackups()).toBe(1);

			// 第二次回滚：6000 → 5000
			rollbackSettings({ settingsPath: TEST_SETTINGS, backupDir: TEST_BACKUP_DIR });
			expect(readTestSettings().context.distillThreshold).toBe(5000);
			expect(countBackups()).toBe(0);

			// 第三次回滚：无备份，抛错
			expect(() => rollbackSettings({ settingsPath: TEST_SETTINGS, backupDir: TEST_BACKUP_DIR })).toThrow();
		});

		it("回滚不影响备份目录外的文件", () => {
			writeTestSettings({ context: { distillThreshold: 5000 } });
			// 在备份目录外创建一个文件
			const extraFile = join(TEST_DIR, "other-file.json");
			writeFileSync(extraFile, '{"test": true}');

			patchSettingsSectionWithBackup(
				"context",
				{ distillThreshold: 8000 },
				{ distillThreshold: 5000 },
				{ settingsPath: TEST_SETTINGS, backupDir: TEST_BACKUP_DIR },
			);

			rollbackSettings({ settingsPath: TEST_SETTINGS, backupDir: TEST_BACKUP_DIR });

			expect(existsSync(extraFile)).toBe(true);
			expect(JSON.parse(readFileSync(extraFile, "utf-8")).test).toBe(true);
		});
	});

	// ── listBackups ──────────────────────────────────

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

		it("备份目录不存在时返回空数组", () => {
			const backups = listBackups({ backupDir: "/nonexistent/path" });
			expect(backups).toEqual([]);
		});
	});
});
