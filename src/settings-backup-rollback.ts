/**
 * Settings 备份管理 — 回滚与列表
 *
 * 从 settings-backup.ts 拆分出的备份管理 API：
 *   - rollbackSettings: 回滚到最近备份
 *   - listBackups: 列出所有备份
 *   - rotateBackups: 清理旧备份（内部函数）
 */

import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { withFileLock } from "./file-lock";
import { parseTimestamp } from "./settings-backup-utils";

export interface BackupEntry {
	filename: string;
	path: string;
	timestamp: Date;
	size: number;
}

export interface RollbackOptions {
	settingsPath?: string;
	backupDir?: string;
}

/** 清理超出 maxBackups 的旧备份 */
export function rotateBackups(backupDir: string, maxBackups: number): void {
	if (!existsSync(backupDir)) return;
	const backups = listBackups({ backupDir });
	while (backups.length > maxBackups) {
		const oldest = backups.pop();
		if (oldest) rmSync(oldest.path);
	}
}

/**
 * 回滚 settings.json 到最近一次备份
 *
 * @param options - 路径选项
 * @throws 无备份时抛错
 */
export function rollbackSettings(options?: RollbackOptions): void {
	const settingsPath = options?.settingsPath ?? "";
	const backupDir = options?.backupDir ?? "";

	const backups = listBackups({ backupDir });
	if (backups.length === 0) {
		throw new Error(`无可用备份：${backupDir}`);
	}

	const latestBackup = backups[0];
	const content = readFileSync(latestBackup.path, "utf-8");

	if (settingsPath) {
		withFileLock(settingsPath, () => {
			writeFileSync(settingsPath, content);
		});
	} else {
		writeFileSync(settingsPath, content);
	}

	// 删除已恢复的备份
	rmSync(latestBackup.path);
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
