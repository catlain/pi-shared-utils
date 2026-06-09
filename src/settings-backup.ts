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

import { existsSync } from "node:fs";
import { withFileLock } from "./file-lock";
import type { SchemaError } from "./project-config";
import { applyArrayPatch, isArrayPatch } from "./settings-array";
import { rotateBackups } from "./settings-backup-rollback";
import { createBackup, getDefaultBackupDir, readFull, writeFull } from "./settings-backup-utils";

export type { BackupEntry, RollbackOptions } from "./settings-backup-rollback";
export { listBackups, rollbackSettings } from "./settings-backup-rollback";

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

export interface PatchBackupResult<T extends Record<string, unknown>> {
	/** 合并后的配置 */
	config: T;
	/** 类型校验错误 */
	errors: SchemaError[];
	/** 备份文件路径（如果创建了备份） */
	backupPath?: string;
}

// rotateBackups / rollbackSettings / listBackups 已拆分到 settings-backup-rollback.ts

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
export function patchSettingsSectionWithBackup<T extends Record<string, unknown>>(
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

	// ── 数组 patch 分支 ──
	if (isArrayPatch(patch)) {
		const currentArr: any[] = Array.isArray(settings[section])
			? settings[section]
			: Array.isArray(defaults)
				? defaults
				: [];
		const mergedArr = applyArrayPatch(currentArr, patch);

		// 备份
		let backupPath: string | undefined;
		if (shouldBackup && backupDir && existsSync(settingsPath)) {
			backupPath = createBackup(settingsPath, backupDir);
			rotateBackups(backupDir, maxBackups);
		}

		// 加锁写入
		if (settingsPath) {
			withFileLock(settingsPath, () => {
				const latest = readFull(settingsPath);
				latest[section] = mergedArr;
				writeFull(settingsPath, latest);
			});
		} else {
			settings[section] = mergedArr;
			writeFull(settingsPath, settings);
		}

		return { config: mergedArr as any as T, errors: [], backupPath };
	}

	// ── 对象 merge 分支（原有逻辑） ──
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

	// 5. 加锁写入（与 pi SettingsManager 互斥）
	if (settingsPath) {
		withFileLock(settingsPath, () => {
			// 重新读取（可能在等锁期间被其他进程修改）
			const latest = readFull(settingsPath);
			latest[section] = merged;
			writeFull(settingsPath, latest);
		});
	} else {
		settings[section] = merged;
		writeFull(settingsPath, settings);
	}

	// 6. 返回合并后的配置
	const finalConfig = { ...defaults, ...merged } as T;
	return { config: finalConfig, errors, backupPath };
}

// rollbackSettings / listBackups 已拆分到 settings-backup-rollback.ts，通过 re-export 暴露
