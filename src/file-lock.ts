/**
 * 文件锁（与 pi 的 proper-lockfile 兼容）
 *
 * proper-lockfile 用 mkdir 创建 .lock 目录做互斥，我们复用同一机制。
 * 锁文件路径 = `${filePath}.lock`（目录），过时判断 = mtime > 10s。
 *
 * 这样 shared-utils 的写入和 pi 的 SettingsManager 不会竞态覆盖。
 */

import { mkdirSync, rmSync, statSync } from "node:fs";

const LOCK_STALE_MS = 10_000;
const LOCK_MAX_ATTEMPTS = 50;
const LOCK_RETRY_DELAY_MS = 20;

export function acquireLock(filePath: string): void {
	const lockDir = `${filePath}.lock`;
	for (let attempt = 0; attempt < LOCK_MAX_ATTEMPTS; attempt++) {
		try {
			mkdirSync(lockDir);
			return; // 获锁成功
		} catch (err: any) {
			if (err?.code !== "EEXIST") throw err;
			// 锁被占 — 检查是否过时
			try {
				const stat = statSync(lockDir);
				if (Date.now() - stat.mtimeMs > LOCK_STALE_MS) {
					// 过时锁，强制删除后重试
					rmSync(lockDir, { recursive: true });
					continue;
				}
			} catch {
				// 锁刚好被释放，重试
				continue;
			}
			// 锁仍有效，等待后重试
			const start = Date.now();
			while (Date.now() - start < LOCK_RETRY_DELAY_MS) {
				// 同步等待（和 pi 的 SettingsManager 一致）
			}
		}
	}
	throw new Error(`无法获取文件锁: ${lockDir}（尝试 ${LOCK_MAX_ATTEMPTS} 次后超时）`);
}

export function releaseLock(filePath: string): void {
	const lockDir = `${filePath}.lock`;
	try {
		rmSync(lockDir, { recursive: true });
	} catch {
		// 忽略 — 可能已被其他进程清理
	}
}

export function withFileLock<T>(filePath: string, fn: () => T): T {
	acquireLock(filePath);
	try {
		return fn();
	} finally {
		releaseLock(filePath);
	}
}
