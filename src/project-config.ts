/**
 * Project-level Configuration — 全局 + 项目级配置合并与冲突检测
 *
 * 配置解析优先级：defaults → 全局 settings.json → 项目 .pi/settings.json
 * 支持按项目启用/禁用工具、MCP 服务器，以及覆盖任意扩展配置。
 *
 * 用法：
 *   import { getEffectiveConfig, detectConfigConflicts, getEnabledTools } from "@pi-atelier/shared-utils";
 *
 *   const cfg = getEffectiveConfig("context", defaults, cwd);
 *   const conflicts = detectConfigConflicts(cwd);
 *   const tools = getEnabledTools(allTools, cwd);
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { SETTINGS_PATH } from "./paths";
import { getSettingsSection } from "./settings";

// ── 类型 ─────────────────────────────────────────────────

export interface ConfigConflict {
	section: string;
	key: string;
	globalValue: unknown;
	projectValue: unknown;
	description: string;
}

export interface EffectiveConfigResult<T extends Record<string, any>> {
	/** 合并后的配置 */
	config: T;
	/** 配置来源：'default' | 'global' | 'project' */
	sources: Record<string, "default" | "global" | "project">;
}

export interface MergeOptions {
	/** 数组合并策略：replace（项目级替换全局，默认）、concat（项目级追加到全局） */
	arrayMerge?: "replace" | "concat";
}

export interface SchemaError {
	/** 配置段名 */
	section: string;
	/** 字段名 */
	key: string;
	/** 期望类型 */
	expectedType: string;
	/** 实际类型 */
	actualType: string;
	/** 人类可读描述 */
	description: string;
}

export interface ToolFilter {
	/** 额外启用的工具 ID 列表 */
	enabled?: string[];
	/** 禁用的工具 ID 列表 */
	disabled?: string[];
}

// ── 内部工具 ─────────────────────────────────────────────

/** 深度合并两个对象，source 覆盖 target */
function deepMerge<T extends Record<string, any>>(target: T, source: Record<string, any>, options?: MergeOptions): T {
	const result = { ...target } as Record<string, any>;
	for (const key of Object.keys(source)) {
		if (
			source[key] !== null &&
			typeof source[key] === "object" &&
			!Array.isArray(source[key]) &&
			result[key] !== null &&
			typeof result[key] === "object" &&
			!Array.isArray(result[key])
		) {
			result[key] = deepMerge(result[key], source[key], options);
		} else if (Array.isArray(source[key]) && options?.arrayMerge === "concat" && Array.isArray(result[key])) {
			// concat 策略：项目级数组追加到全局数组末尾
			result[key] = [...result[key], ...source[key]];
		} else {
			result[key] = source[key];
		}
	}
	return result as T;
}

/** 读取项目级 settings.json */
export function readProjectSettings(cwd: string): Record<string, any> {
	const projectSettingsPath = join(cwd, ".pi", "settings.json");
	if (!existsSync(projectSettingsPath)) return {};
	try {
		return JSON.parse(readFileSync(projectSettingsPath, "utf-8"));
	} catch {
		return {};
	}
}

/** 清除项目级配置缓存（保留接口，当前为 no-op） */
export function clearProjectSettingsCache(): void {
	// 预留，当前无缓存
}

/**
 * 获取合并后的有效配置（defaults → 全局 → 项目级 deep merge）
 *
 * @param section - settings.json 中的顶层 key，如 "context"、"shepherd"
 * @param defaults - 该段的默认值（完整对象）
 * @param cwd - 当前项目目录（用于查找 .pi/settings.json）
 * @param options - 合并选项（如 arrayMerge 策略）
 * @returns 合并后的配置 + 各字段来源
 */
export function getEffectiveConfig<T extends Record<string, any>>(
	section: string,
	defaults: T,
	cwd: string,
	options?: MergeOptions,
): EffectiveConfigResult<T> {
	// 1. 全局配置
	const globalConfig = getSettingsSection(section, defaults);

	// 2. 项目级配置
	const projectSettings = readProjectSettings(cwd);
	const projectSection = projectSettings?.[section] ?? {};

	// 3. Deep merge: defaults → global → project
	const merged = deepMerge(globalConfig, projectSection, options);

	// 4. 追踪来源
	const sources: Record<string, "default" | "global" | "project"> = {};
	for (const key of Object.keys(defaults)) {
		if (projectSection && key in projectSection) {
			sources[key] = "project";
		} else {
			const globalSec = JSON.parse(readFileSync(SETTINGS_PATH, "utf-8"))?.[section] ?? {};
			sources[key] = key in globalSec ? "global" : "default";
		}
	}

	return { config: merged, sources };
}

/**
 * 检测全局配置与项目级配置之间的冲突
 *
 * 冲突定义：项目级配置覆盖了全局配置中可能导致行为不一致的值。
 * 例如：全局 distillThreshold=5000，项目设为 500，可能过于激进。
 *
 * @param cwd - 当前项目目录
 * @param sensitiveKeys - 需要检测冲突的 key 列表（可选，默认检查所有有差异的 key）
 * @returns 冲突列表
 */
export function detectConfigConflicts(cwd: string, sensitiveKeys?: string[]): ConfigConflict[] {
	const conflicts: ConfigConflict[] = [];
	const projectSettings = readProjectSettings(cwd);
	if (Object.keys(projectSettings).length === 0) return conflicts;

	// 读取全局 settings
	let globalSettings: Record<string, any> = {};
	try {
		globalSettings = JSON.parse(readFileSync(SETTINGS_PATH, "utf-8"));
	} catch {
		return conflicts;
	}

	for (const section of Object.keys(projectSettings)) {
		// 跳过非配置段（如 prompts、skills 等 pi 核心管理的字段）
		if (section === "prompts" || section === "skills") continue;

		const projectSection = projectSettings[section];
		const globalSection = globalSettings[section] ?? {};
		if (typeof projectSection !== "object" || projectSection === null) continue;

		for (const key of Object.keys(projectSection)) {
			if (sensitiveKeys && !sensitiveKeys.includes(key)) continue;

			const globalVal = globalSection[key];
			const projectVal = projectSection[key];

			// 只报告项目级与全局值不同的 key
			if (globalVal !== undefined && JSON.stringify(globalVal) !== JSON.stringify(projectVal)) {
				conflicts.push({
					section,
					key,
					globalValue: globalVal,
					projectValue: projectVal,
					description: `项目配置 "${section}.${key}" 覆盖了全局值`,
				});
			}
		}
	}

	return conflicts;
}

/**
 * 校验项目级配置与默认值的类型一致性
 *
 * 对比项目 .pi/settings.json 中指定 section 的字段类型与 defaults 定义的类型，
 * 类型不一致时返回错误列表。
 *
 * @param section - settings.json 中的顶层 key
 * @param defaults - 该段的默认值（定义了期望的类型结构）
 * @param cwd - 当前项目目录
 * @returns 格式错误列表
 */
export function validateConfigSchema(section: string, defaults: Record<string, any>, cwd: string): SchemaError[] {
	const errors: SchemaError[] = [];
	const projectSettings = readProjectSettings(cwd);
	const projectSection = projectSettings?.[section];
	if (!projectSection || typeof projectSection !== "object") return errors;

	function checkTypes(defaultObj: Record<string, any>, projectObj: Record<string, any>, prefix: string) {
		for (const key of Object.keys(projectObj)) {
			const fullKey = prefix ? `${prefix}.${key}` : key;
			const defaultVal = defaultObj[key];
			const projectVal = projectObj[key];

			// 只校验 defaults 中定义的字段（未知字段跳过）
			if (defaultVal === undefined) continue;

			const expectedType = Array.isArray(defaultVal) ? "array" : defaultVal === null ? "null" : typeof defaultVal;
			const actualType = Array.isArray(projectVal) ? "array" : projectVal === null ? "null" : typeof projectVal;

			if (expectedType === "object" && actualType === "object") {
				// 递归校验嵌套对象
				checkTypes(defaultVal, projectVal, fullKey);
			} else if (expectedType !== actualType) {
				errors.push({
					section,
					key: fullKey,
					expectedType,
					actualType,
					description: `配置 "${section}.${fullKey}" 类型错误：期望 ${expectedType}，实际 ${actualType}`,
				});
			}
		}
	}

	checkTypes(defaults, projectSection, "");
	return errors;
}
