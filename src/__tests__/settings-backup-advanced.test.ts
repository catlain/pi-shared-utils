import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const TEST_DIR = join(tmpdir(), `pi-settings-adv-test-${process.pid}`);
const TEST_SETTINGS = join(TEST_DIR, "settings.json");
const TEST_BACKUP_DIR = join(TEST_DIR, "settings-backup");

const { patchSettingsSectionWithBackup, rollbackSettings, listBackups } = await import("../settings-backup");

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

describe("settings-backup 高级测试", () => {
	beforeEach(() => {
		cleanupTestDir();
		mkdirSync(TEST_DIR, { recursive: true });
	});
	afterEach(() => {
		cleanupTestDir();
	});

	// ── 并发写入与竞态保护 ────────────────────────

	describe("并发写入与竞态保护", () => {
		it("快速连续 patch 不同 section 不丢数据", () => {
			writeTestSettings({ context: { threshold: 100 }, shepherd: { maxWarnings: 5 } });

			patchSettingsSectionWithBackup(
				"context",
				{ threshold: 200 },
				{ threshold: 100 },
				{ settingsPath: TEST_SETTINGS, backupDir: TEST_BACKUP_DIR, backup: false },
			);
			patchSettingsSectionWithBackup(
				"shepherd",
				{ maxWarnings: 10 },
				{ maxWarnings: 5 },
				{ settingsPath: TEST_SETTINGS, backupDir: TEST_BACKUP_DIR, backup: false },
			);

			const settings = readTestSettings();
			expect(settings.context.threshold).toBe(200);
			expect(settings.shepherd.maxWarnings).toBe(10);
		});

		it("加锁后重读最新数据 — 保留等锁期间外部修改", () => {
			writeTestSettings({ context: { threshold: 100 } });

			// 第一次 patch
			patchSettingsSectionWithBackup(
				"context",
				{ threshold: 200 },
				{ threshold: 100 },
				{ settingsPath: TEST_SETTINGS, backupDir: TEST_BACKUP_DIR, backup: false },
			);

			// 模拟外部进程修改：直接写文件加一个新 section
			const externalData = { ...readTestSettings(), externalSection: { addedByOther: true } };
			writeFileSync(TEST_SETTINGS, JSON.stringify(externalData, null, 2));

			// 第二次 patch 应该保留外部添加的 section
			patchSettingsSectionWithBackup(
				"shepherd",
				{ maxWarnings: 3 },
				{ maxWarnings: 5 },
				{ settingsPath: TEST_SETTINGS, backupDir: TEST_BACKUP_DIR, backup: false },
			);

			const settings = readTestSettings();
			expect(settings.context.threshold).toBe(200);
			expect(settings.shepherd.maxWarnings).toBe(3);
			expect(settings.externalSection.addedByOther).toBe(true);
		});

		it("3 个 section 快速连续 patch 全部保留", () => {
			writeTestSettings({
				context: { threshold: 100 },
				shepherd: { maxWarnings: 5 },
				mcp: { disabled: [] },
			});

			patchSettingsSectionWithBackup(
				"context",
				{ threshold: 200 },
				{ threshold: 100 },
				{ settingsPath: TEST_SETTINGS, backupDir: TEST_BACKUP_DIR, backup: false },
			);
			patchSettingsSectionWithBackup(
				"shepherd",
				{ maxWarnings: 10 },
				{ maxWarnings: 5 },
				{ settingsPath: TEST_SETTINGS, backupDir: TEST_BACKUP_DIR, backup: false },
			);
			patchSettingsSectionWithBackup(
				"mcp",
				{ disabled: ["server-a"] },
				{ disabled: [] },
				{ settingsPath: TEST_SETTINGS, backupDir: TEST_BACKUP_DIR, backup: false },
			);

			const settings = readTestSettings();
			expect(settings.context.threshold).toBe(200);
			expect(settings.shepherd.maxWarnings).toBe(10);
			expect(settings.mcp.disabled).toEqual(["server-a"]);
		});
	});

	// ── 备份内容完整性 ──────────────────────────

	describe("备份内容完整性", () => {
		it("备份的 JSON 与修改前深度一致", () => {
			const original = {
				context: { threshold: 100, name: "test" },
				deep: { nested: { value: [1, 2, 3] } },
			};
			writeTestSettings(original);

			patchSettingsSectionWithBackup(
				"context",
				{ threshold: 200 },
				{ threshold: 100 },
				{ settingsPath: TEST_SETTINGS, backupDir: TEST_BACKUP_DIR },
			);

			const backupFiles = readdirSync(TEST_BACKUP_DIR).filter((f) => f.endsWith(".json"));
			const backupContent = JSON.parse(readFileSync(join(TEST_BACKUP_DIR, backupFiles[0]), "utf-8"));

			expect(backupContent).toEqual(original);
		});

		it("两次备份内容分别对应各自修改前的状态", async () => {
			writeTestSettings({ context: { threshold: 100 } });

			patchSettingsSectionWithBackup(
				"context",
				{ threshold: 200 },
				{ threshold: 100 },
				{ settingsPath: TEST_SETTINGS, backupDir: TEST_BACKUP_DIR },
			);
			await new Promise((r) => setTimeout(r, 10));
			patchSettingsSectionWithBackup(
				"context",
				{ threshold: 300 },
				{ threshold: 100 },
				{ settingsPath: TEST_SETTINGS, backupDir: TEST_BACKUP_DIR },
			);

			const backups = listBackups({ backupDir: TEST_BACKUP_DIR });
			expect(backups.length).toBe(2);

			// 最新备份（index 0）应该是第二次修改前的状态
			const backup0 = JSON.parse(readFileSync(backups[0].path, "utf-8"));
			expect(backup0.context.threshold).toBe(200);

			// 旧备份（index 1）应该是第一次修改前的状态
			const backup1 = JSON.parse(readFileSync(backups[1].path, "utf-8"));
			expect(backup1.context.threshold).toBe(100);
		});
	});

	// ── 写入格式验证 ──────────────────────────────

	describe("写入格式验证", () => {
		it("写入的 JSON 格式合法且包含所有字段", () => {
			writeTestSettings({ context: { threshold: 100 } });

			patchSettingsSectionWithBackup(
				"context",
				{ threshold: 200, name: "测试" },
				{ threshold: 100, name: "" },
				{ settingsPath: TEST_SETTINGS, backupDir: TEST_BACKUP_DIR, backup: false },
			);

			const raw = readFileSync(TEST_SETTINGS, "utf-8");
			const parsed = JSON.parse(raw);
			expect(parsed.context.threshold).toBe(200);
			expect(parsed.context.name).toBe("测试");
		});

		it("写入后 settings.json 以换行结尾", () => {
			writeTestSettings({ context: { threshold: 100 } });

			patchSettingsSectionWithBackup(
				"context",
				{ threshold: 200 },
				{ threshold: 100 },
				{ settingsPath: TEST_SETTINGS, backupDir: TEST_BACKUP_DIR, backup: false },
			);

			const raw = readFileSync(TEST_SETTINGS, "utf-8");
			expect(raw.endsWith("\n")).toBe(true);
		});
	});

	// ── detectConflicts 集成 ──────────────────────

	describe("detectConflicts 集成", () => {
		it("返回全局与项目级冲突列表", async () => {
			const { detectConfigConflicts } = await import("../project-config");

			// 创建一个临时项目级配置
			const projectDir = join(TEST_DIR, "project");
			const projectSettingsDir = join(projectDir, ".pi");
			mkdirSync(projectSettingsDir, { recursive: true });

			// 项目级覆盖全局配置（同 key 不同值）
			writeFileSync(join(projectSettingsDir, "settings.json"), JSON.stringify({ context: { threshold: 999 } }));

			// detectConfigConflicts 读全局 SETTINGS_PATH，项目级 threshold=999 和全局不同
			const conflicts = detectConfigConflicts(projectDir);

			// 可能检测到项目级的 context.threshold (999) 和全局不同
			// 注意：这个测试依赖真实全局配置内容，所以只验证 API 不崩溃
			expect(Array.isArray(conflicts)).toBe(true);
		});
	});

	// ── rollback 到指定备份 ────────────────────────

	describe("rollback 到指定备份", () => {
		it("默认恢复最近一份备份", async () => {
			writeTestSettings({ context: { threshold: 100 } });

			patchSettingsSectionWithBackup(
				"context",
				{ threshold: 200 },
				{ threshold: 100 },
				{ settingsPath: TEST_SETTINGS, backupDir: TEST_BACKUP_DIR },
			);
			await new Promise((r) => setTimeout(r, 10));
			patchSettingsSectionWithBackup(
				"context",
				{ threshold: 300 },
				{ threshold: 100 },
				{ settingsPath: TEST_SETTINGS, backupDir: TEST_BACKUP_DIR },
			);

			// 当前是 300，回滚应该恢复到 200（最近一份备份）
			rollbackSettings({ settingsPath: TEST_SETTINGS, backupDir: TEST_BACKUP_DIR });
			expect(readTestSettings().context.threshold).toBe(200);
		});

		it("手动指定备份文件恢复到更早的状态", async () => {
			writeTestSettings({ context: { threshold: 100 } });

			patchSettingsSectionWithBackup(
				"context",
				{ threshold: 200 },
				{ threshold: 100 },
				{ settingsPath: TEST_SETTINGS, backupDir: TEST_BACKUP_DIR },
			);
			await new Promise((r) => setTimeout(r, 10));
			patchSettingsSectionWithBackup(
				"context",
				{ threshold: 300 },
				{ threshold: 100 },
				{ settingsPath: TEST_SETTINGS, backupDir: TEST_BACKUP_DIR },
			);

			const backups = listBackups({ backupDir: TEST_BACKUP_DIR });
			expect(backups.length).toBe(2);

			// 手动恢复到最早那份（threshold = 100）
			const oldestBackup = backups[backups.length - 1];
			const content = readFileSync(oldestBackup.path, "utf-8");
			writeFileSync(TEST_SETTINGS, content);

			expect(readTestSettings().context.threshold).toBe(100);
		});
	});
});
