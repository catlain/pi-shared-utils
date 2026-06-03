/**
 * settings-backup 内部工具函数
 *
 * 备份目录管理、时间戳格式化、文件读写等。
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// ── 常量 ─────────────────────────────────────────────────

/** 默认备份子目录名 */
export const DEFAULT_BACKUP_DIR_SUFFIX = "settings-backup";

// ── 内部工具 ─────────────────────────────────────────────

/** 格式化时间戳为文件名安全字符串（与原版行为一致） */
export function formatTimestamp(date: Date): string {
	return date.toISOString().replace(/[.:]/g, "-");
}

/** 从备份文件名解析时间戳 */
export function parseTimestamp(filename: string): Date | null {
	const match = filename.match(/^settings\.(.+)\.json$/);
	if (!match) return null;
	const isoStr = match[1].replace(/-/g, (_m, offset) => {
		const _chars = match[1];
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
export function getDefaultBackupDir(settingsPath: string): string {
	return settingsPath ? join(settingsPath, "..", DEFAULT_BACKUP_DIR_SUFFIX) : "";
}

/** 创建备份 */
export function createBackup(settingsPath: string, backupDir: string): string {
	mkdirSync(backupDir, { recursive: true });
	const content = readFileSync(settingsPath, "utf-8");
	const backupPath = join(backupDir, `settings.${formatTimestamp(new Date())}.json`);
	writeFileSync(backupPath, content);
	return backupPath;
}

/** 清理超出 maxBackups 的旧备份 */
export function rotateBackups(backupDir: string, maxBackups: number, listBackupsFn: (opts: any) => any[]): void {
	if (!existsSync(backupDir)) return;
	const backups = listBackupsFn({ backupDir });
	while (backups.length > maxBackups) {
		const oldest = backups.pop();
		if (oldest) rmSync(oldest.path);
	}
}

/** 读取完整 settings.json */
export function readFull(settingsPath: string): Record<string, any> {
	try {
		if (!existsSync(settingsPath)) return {};
		return JSON.parse(readFileSync(settingsPath, "utf-8"));
	} catch {
		return {};
	}
}

/** 写入完整 settings.json */
export function writeFull(settingsPath: string, settings: Record<string, any>): void {
	writeFileSync(settingsPath, `${JSON.stringify(settings, null, "\t")}\n`);
}
