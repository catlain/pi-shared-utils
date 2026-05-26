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

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { getSettingsSection } from "./settings";
import { SETTINGS_PATH } from "./paths";

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

export interface ToolFilter {
	/** 额外启用的工具 ID 列表 */
	enabled?: string[];
	/** 禁用的工具 ID 列表 */
	disabled?: string[];
}

// ── 内部工具 ─────────────────────────────────────────────

/** 深度合并两个对象，source 覆盖 target */
function deepMerge<T extends Record<string, any>>(target: T, source: Record<string, any>): T {
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
			result[key] = deepMerge(result[key], source[key]);
		} else {
			result[key] = source[key];
		}
	}
	return result as T;
}

/** 读取项目级 settings.json */
function readProjectSettings(cwd: string): Record<string, any> {
	const projectSettingsPath = join(cwd, ".pi", "settings.json");
	if (!existsSync(projectSettingsPath)) return {};
	try {
		return JSON.parse(readFileSync(projectSettingsPath, "utf-8"));
	} catch {
		return {};
	}
}

// ── 核心 API ─────────────────────────────────────────────

/**
 * 获取合并后的有效配置（defaults → 全局 → 项目级 deep merge）
 *
 * @param section - settings.json 中的顶层 key，如 "context"、"shepherd"
 * @param defaults - 该段的默认值（完整对象）
 * @param cwd - 当前项目目录（用于查找 .pi/settings.json）
 * @returns 合并后的配置 + 各字段来源
 */
export function getEffectiveConfig<T extends Record<string, any>>(
	section: string,
	defaults: T,
	cwd: string,
): EffectiveConfigResult<T> {
	// 1. 全局配置
	const globalConfig = getSettingsSection(section, defaults);

	// 2. 项目级配置
	const projectSettings = readProjectSettings(cwd);
	const projectSection = projectSettings?.[section] ?? {};

	// 3. Deep merge: defaults → global → project
	const merged = deepMerge(globalConfig, projectSection);

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
export function detectConfigConflicts(
	cwd: string,
	sensitiveKeys?: string[],
): ConfigConflict[] {
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
 * 获取当前项目启用的工具列表
 *
 * 合并全局 mcp.json 中的工具 + 项目级 .pi/settings.json 中的启用/禁用规则。
 *
 * @param allTools - 全部可用工具 ID 列表（从 MCP 注册结果获取）
 * @param cwd - 当前项目目录
 * @returns 过滤后的工具 ID 列表
 */
export function getEnabledTools(allTools: string[], cwd: string): string[] {
	const projectSettings = readProjectSettings(cwd);
	const toolFilter: ToolFilter = projectSettings?.tools ?? {};

	let tools = [...allTools];

	// 禁用优先
	if (toolFilter.disabled?.length) {
		const disabledSet = new Set(toolFilter.disabled);
		tools = tools.filter(t => !disabledSet.has(t));
	}

	// 额外启用（可能不在 allTools 里，给调用方自行处理）
	if (toolFilter.enabled?.length) {
		const existingSet = new Set(tools);
		for (const t of toolFilter.enabled) {
			if (!existingSet.has(t)) tools.push(t);
		}
	}

	return tools;
}

/**
 * 获取当前项目禁用的 MCP 服务器列表
 *
 * @param cwd - 当前项目目录
 * @returns 禁用的 MCP 服务器名称列表
 */
export function getDisabledMcpServers(cwd: string): string[] {
	const projectSettings = readProjectSettings(cwd);
	return projectSettings?.mcp?.disabled ?? [];
}
