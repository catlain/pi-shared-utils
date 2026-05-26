/**
 * Settings 备份与安全修改
 *
 * 提供带备份的 settings.json 修改能力：
 *   - 修改前自动备份
 *   - 类型校验（validateConfigSchema）
 *   - 备份轮转（maxBackups）
 *   - 回滚（rollbackSettings）
 *
 * 用法：
 *   import { patchSettingsSectionWithBackup, rollbackSettings, listBackups } from "@pi-atelier/shared-utils/settings-backup";
 *
 *   const result = patchSettingsSectionWithBackup("context", { distillThreshold: 8000 }, defaults, { settingsPath, backupDir });
 *   rollbackSettings({ settingsPath, backupDir });
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { validateConfigSchema, type SchemaError } from "./project-config";

// ── 类型 ─────────────────────────────────────────────────

export interface PatchBackupOptions {
	/** 要修改的 settings.json 路径（默认全局） */
	settingsPath?: string;
	/** 备份目录路径 */
	backupDir?: string;
	/** 是否创建备份（默认 true） */
	backup?: boolean;
	/** 最大保留备份数（默认 10） */
	maxBackups?: number;
	/** 是否校验类型（默认 true） */
	validate?: boolean;
}

export interface PatchBackupResult<T extends Record<string, any>> {
	/** 合并后的配置 */
	config: T;
	/** 类型校验错误 */
	errors: SchemaError[];
	/** 备份文件路径（如果创建了备份） */
	backupPath?: string;
}

export interface RollbackOptions {
	/** settings.json 路径 */
	settingsPath?: string;
	/** 备份目录路径 */
	backupDir?: string;
}

export interface BackupEntry {
	/** 备份文件名 */
	filename: string;
	/** 备份文件完整路径 */
	path: string;
	/** 备份时间 */
	timestamp: Date;
	/** 文件大小（字节） */
	size: number;
}

// ── 内部工具 ─────────────────────────────────────────────

const DEFAULT_BACKUP_DIR_SUFFIX = "settings-backup";

/** 格式化时间戳为文件名安全字符串 */
function formatTimestamp(date: Date): string {
	return date.toISOString().replace(/[.:]/g, "-");
}

/** 从备份文件名解析时间戳 */
function parseTimestamp(filename: string): Date | null {
	const match = filename.match(/^settings\.(.+)\.json$/);
	if (!match) return null;
	// 反转文件名安全字符
	const isoStr = match[1].replace(/-/g, (m, offset) => {
		// 位置 4,7 是日期分隔符保持不变，10 是 T 保持不变，13,16 是时间分隔符
		const chars = match[1];
		if (offset === 4 || offset === 7) return "-";
		if (offset === 10) return "T";
		if (offset === 13 || offset === 16) return ":";
		if (offset === 19) return ".";
		return "-";
	});
	const d = new Date(isoStr);
	return Number.isNaN(d.getTime()) ? null : d;
}

/** 获取默认备份目录 */
function getDefaultBackupDir(settingsPath: string): string {
	const dir = settingsPath ? join(settingsPath, "..", DEFAULT_BACKUP_DIR_SUFFIX) : "";
	return dir;
}

/** 创建备份 */
function createBackup(settingsPath: string, backupDir: string): string {
	mkdirSync(backupDir, { recursive: true });
	const content = readFileSync(settingsPath, "utf-8");
	const backupPath = join(backupDir, `settings.${formatTimestamp(new Date())}.json`);
	writeFileSync(backupPath, content);
	return backupPath;
}

/** 清理超出 maxBackups 的旧备份 */
function rotateBackups(backupDir: string, maxBackups: number): void {
	if (!existsSync(backupDir)) return;
	const backups = listBackups({ backupDir });
	while (backups.length > maxBackups) {
		const oldest = backups.pop();
		if (oldest) rmSync(oldest.path);
	}
}

/** 读取完整 settings.json */
function readFull(settingsPath: string): Record<string, any> {
	try {
		if (!existsSync(settingsPath)) return {};
		return JSON.parse(readFileSync(settingsPath, "utf-8"));
	} catch {
		return {};
	}
}

/** 写入完整 settings.json */
function writeFull(settingsPath: string, settings: Record<string, any>): void {
	writeFileSync(settingsPath, `${JSON.stringify(settings, null, "\t")}\n`);
}

// ── API ─────────────────────────────────────────────────

/**
 * 带备份的 settings.json 安全修改
 *
 * 执行流程：备份 → 校验 → 合并 → 写入
 *
 * @param section - settings.json 中的顶层 key
 * @param patch - 要修改的字段
 * @param defaults - 该段的默认值（用于校验）
 * @param options - 备份和校验选项
 * @returns 合并后的配置 + 校验错误
 */
export function patchSettingsSectionWithBackup<T extends Record<string, any>>(
	section: string,
	patch: Partial<T>,
	defaults: T,
	options?: PatchBackupOptions,
): PatchBackupResult<T> {
	const settingsPath = options?.settingsPath ?? "";
	const backupDir = options?.backupDir ?? getDefaultBackupDir(settingsPath);
	const shouldBackup = options?.backup !== false;
	const maxBackups = options?.maxBackups ?? 10;
	const shouldValidate = options?.validate !== false;

	// 1. 读取当前配置
	const settings = readFull(settingsPath);
	const current = settings[section] ?? {};

	// 2. 计算合并后的配置（用于校验）
	const merged: Record<string, any> = { ...current };
	for (const [key, value] of Object.entries(patch)) {
		if (value !== undefined) merged[key] = value;
	}

	// 3. 类型校验（校验合并后的结果 vs defaults）
	const errors: SchemaError[] = [];
	if (shouldValidate) {
		// 构造一个临时的"项目配置"用于校验
		for (const key of Object.keys(merged)) {
			if (key in defaults) {
				const defaultVal = (defaults as Record<string, any>)[key];
				const mergedVal = merged[key];
				const expectedType = Array.isArray(defaultVal) ? "array" : defaultVal === null ? "null" : typeof defaultVal;
				const actualType = Array.isArray(mergedVal) ? "array" : mergedVal === null ? "null" : typeof mergedVal;

				if (expectedType === "object" && actualType === "object") {
					// 嵌套对象暂不深度校验
				} else if (expectedType !== actualType) {
					errors.push({
						section,
						key,
						expectedType,
						actualType,
						description: `配置 "${section}.${key}" 类型错误：期望 ${expectedType}，实际 ${actualType}`,
					});
				}
			}
		}

		// 有类型错误 → 不写入
		if (errors.length > 0) {
			return { config: { ...defaults, ...current } as T, errors };
		}
	}

	// 4. 备份
	let backupPath: string | undefined;
	if (shouldBackup && backupDir && existsSync(settingsPath)) {
		backupPath = createBackup(settingsPath, backupDir);
		rotateBackups(backupDir, maxBackups);
	}

	// 5. 写入
	settings[section] = merged;
	writeFull(settingsPath, settings);

	// 6. 返回合并后的配置
	const finalConfig = { ...defaults, ...merged } as T;
	return { config: finalConfig, errors, backupPath };
}

/**
 * 回滚到最近一次备份
 *
 * @param options - 路径选项
 * @throws 无备份时抛错
 */
export function rollbackSettings(options?: RollbackOptions): void {
	const settingsPath = options?.settingsPath ?? "";
	const backupDir = options?.backupDir ?? getDefaultBackupDir(settingsPath);

	const backups = listBackups({ backupDir });
	if (backups.length === 0) {
		throw new Error(`无可用备份：${backupDir}`);
	}

	const latest = backups[0];
	const content = readFileSync(latest.path, "utf-8");
	writeFileSync(settingsPath, content);

	// 删除已恢复的备份
	rmSync(latest.path);
}

/**
 * 列出所有备份（按时间倒序，最新的在前）
 */
export function listBackups(options?: RollbackOptions): BackupEntry[] {
	const backupDir = options?.backupDir ?? "";

	if (!existsSync(backupDir)) return [];

	try {
		const files = readdirSync(backupDir)
			.filter((f) => f.startsWith("settings.") && f.endsWith(".json"))
			.map((f) => {
				const fullPath = join(backupDir, f);
				const stat = { size: 0 };
				try {
					const { statSync } = require("node:fs");
					const s = statSync(fullPath);
					return {
						filename: f,
						path: fullPath,
						timestamp: parseTimestamp(f) ?? new Date(0),
						size: s.size,
					};
				} catch {
					return {
						filename: f,
						path: fullPath,
						timestamp: parseTimestamp(f) ?? new Date(0),
						size: 0,
					};
				}
			})
			.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

		return files;
	} catch {
		return [];
	}
}
