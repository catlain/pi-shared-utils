/**
 * 通用 settings.json 读写工具
 *
 * 所有扩展共享同一份 ~/.pi/agent/settings.json，通过 namespace 区分各扩展的配置段。
 * 用法：
 *   import { getSettingsSection, patchSettingsSection } from "@pi-atelier/shared-utils";
 *   const cfg = getSettingsSection("context", defaults);
 *   patchSettingsSection("context", { distillThreshold: 3000 });
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const SETTINGS_PATH = join(homedir(), ".pi/agent/settings.json");

function readFull(): Record<string, any> {
	try {
		if (!existsSync(SETTINGS_PATH)) return {};
		return JSON.parse(readFileSync(SETTINGS_PATH, "utf-8"));
	} catch {
		return {};
	}
}

function writeFull(settings: Record<string, any>): void {
	writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, "\t") + "\n");
}

/**
 * 读取 settings.json 中某个命名空间的配置，与默认值合并
 *
 * @param section - settings.json 中的顶层 key，如 "context"、"smartContext"
 * @param defaults - 该段的默认值（完整对象）
 * @returns 合并后的配置（defaults 中存在的字段用 settings 覆盖，缺失则用 defaults 填充）
 */
export function getSettingsSection<T extends Record<string, any>>(section: string, defaults: T): T {
	const settings = readFull();
	const stored = settings?.[section] ?? {};
	const result: Record<string, any> = {};
	for (const key of Object.keys(defaults)) {
		result[key] = key in stored ? stored[key] : (defaults as Record<string, any>)[key];
	}
	return result as T;
}

/**
 * 增量更新 settings.json 中某个命名空间的配置
 *
 * 只修改 patch 中指定的字段，其余字段保持不变。写入后返回合并后的完整配置。
 *
 * @param section - settings.json 中的顶层 key
 * @param patch - 要修改的字段（部分对象）
 * @returns 更新后的完整配置
 */
export function patchSettingsSection<T extends Record<string, any>>(section: string, patch: Partial<T>, defaults: T): T {
	const settings = readFull();
	const current = settings[section] ?? {};
	for (const [key, value] of Object.entries(patch)) {
		if (value !== undefined) current[key] = value;
	}
	settings[section] = current;
	writeFull(settings);
	return getSettingsSection(section, defaults);
}

/**
 * 读取 settings.json 中某个叶子字段的值（如 recording.enabled）
 *
 * @param path - 点分隔的路径，如 "recording.enabled"
 * @param fallback - 字段不存在时的默认值
 */
export function getSettingsValue<T>(path: string, fallback: T): T {
	const settings = readFull();
	const keys = path.split(".");
	let current: any = settings;
	for (const key of keys) {
		if (current == null || typeof current !== "object") return fallback;
		current = current[key];
	}
	return current !== undefined ? (current as T) : fallback;
}

/**
 * 设置 settings.json 中某个叶子字段的值
 *
 * @param path - 点分隔的路径，如 "recording.enabled"
 * @param value - 要写入的值
 */
export function setSettingsValue<T>(path: string, value: T): void {
	const settings = readFull();
	const keys = path.split(".");
	let current: any = settings;
	for (let i = 0; i < keys.length - 1; i++) {
		const key = keys[i];
		if (current[key] == null || typeof current[key] !== "object") current[key] = {};
		current = current[key];
	}
	current[keys[keys.length - 1]] = value;
	writeFull(settings);
}
