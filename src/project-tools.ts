/**
 * Tool/MCP Filtering — 三层合并的工具和 MCP 服务器过滤
 *
 * 配置优先级：defaults → 全局 settings.json → 项目 .pi/settings.json
 * 数组策略：concat（项目级追加到全局，不是替换）
 *
 * 用法：
 *   import { getEnabledTools, getDisabledMcpServers } from "@pi-atelier/shared-utils";
 *
 *   const disabledServers = getDisabledMcpServers(cwd);  // 全局 + 项目 concat
 *   const tools = getEnabledTools(allTools, cwd);        // 三层合并后过滤
 */

import { existsSync, readFileSync } from "node:fs";
import { SETTINGS_PATH } from "./paths";
import { globToRegex } from "./glob.js";
import { readProjectSettings } from "./project-config";

// ── 类型 ─────────────────────────────────────────────────

export interface ToolFilter {
	/** 额外启用的工具 ID 列表 */
	enabled?: string[];
	/** 禁用的工具 ID 列表 */
	disabled?: string[];
}

// ── 内部工具 ─────────────────────────────────────────────

/** 读取全局 settings.json 中的指定 section（直接读文件，不走 schema merge） */
function readGlobalSection(section: string): Record<string, any> {
	try {
		if (!existsSync(SETTINGS_PATH)) return {};
		const raw = readFileSync(SETTINGS_PATH, "utf-8");
		const settings = JSON.parse(raw);
		return settings?.[section] ?? {};
	} catch {
		return {};
	}
}

/**
 * 获取有效工具过滤规则（三层合并：全局 → 项目，concat 策略）
 */
export function getEffectiveToolFilter(cwd: string): ToolFilter {
	const globalFilter: ToolFilter = readGlobalSection("tools");
	const projectSettings = readProjectSettings(cwd);
	const projectFilter: ToolFilter = projectSettings?.tools ?? {};

	// concat 策略：项目级追加到全局
	const disabled = [...(globalFilter.disabled ?? []), ...(projectFilter.disabled ?? [])];
	const enabled = [...(globalFilter.enabled ?? []), ...(projectFilter.enabled ?? [])];

	return {
		disabled: disabled.length > 0 ? disabled : undefined,
		enabled: enabled.length > 0 ? enabled : undefined,
	};
}

// ── API ─────────────────────────────────────────────────

/**
 * 获取过滤后的工具列表
 *
 * 三层合并全局 + 项目的 enabled/disabled 规则，对 allTools 进行过滤。
 *
 * @param allTools - 全部可用工具 ID 列表
 * @param cwd - 当前项目目录
 * @returns 过滤后的工具 ID 列表
 */
export function getEnabledTools(allTools: string[], cwd: string): string[] {
	const filter = getEffectiveToolFilter(cwd);

	let tools = [...allTools];

	// 禁用优先
	if (filter.disabled?.length) {
		const disabledSet = new Set(filter.disabled);
		tools = tools.filter((t) => !disabledSet.has(t));
	}

	// 额外启用（可能不在 allTools 里，给调用方自行处理）
	if (filter.enabled?.length) {
		const existingSet = new Set(tools);
		for (const t of filter.enabled) {
			if (!existingSet.has(t)) tools.push(t);
		}
	}

	return tools;
}

/**
 * 获取禁用的 MCP 服务器列表（三层合并：全局 + 项目 concat，enabled 白名单覆盖）
 *
 * 配置优先级：
 *   1. 全局 settings.json 的 mcp.disabled — 全局禁用
 *   2. 项目 .pi/settings.json 的 mcp.disabled — 项目级追加禁用
 *   3. 项目 .pi/settings.json 的 mcp.enabled — 白名单，从 disabled 中移除
 *
 * 场景：全局禁用 godot/code-graph 等项目专用工具，
 *       需要的项目在 .pi/settings.json 的 mcp.enabled 里显式启用。
 *
 * @param cwd - 当前项目目录
 * @returns 去重后的禁用 MCP 服务器名称列表
 */

/**
 * 检查工具名是否匹配某个模式（精确匹配或 glob）
 */
function matchesPattern(toolName: string, patterns: string[]): boolean {
	for (const pattern of patterns) {
		if (pattern.includes("*")) {
			if (globToRegex(pattern).test(toolName)) return true;
		} else if (toolName === pattern) {
			return true;
		}
	}
	return false;
}

/**
 * 获取禁用的 MCP 工具列表（三层合并：全局 + 项目 concat，enabled 白名单覆盖）
 *
 * 支持精确匹配和 glob 模式（* 通配符）：
 *   - "godot_launch_editor" — 精确匹配
 *   - "godot_export_*" — 匹配所有 godot_export_ 开头的工具
 *
 * @param cwd - 当前项目目录
 * @returns 去重后的禁用工具名称模式列表
 */
export function getDisabledTools(cwd: string): string[] {
	const globalMcp = readGlobalSection("mcp");
	const globalTools: string[] = globalMcp?.tools?.disabled ?? [];

	const projectSettings = readProjectSettings(cwd);
	const projectMcp: Record<string, any> = (projectSettings?.mcp as Record<string, any>) ?? {};
	const projectTools: string[] = projectMcp?.tools?.disabled ?? [];
	const projectEnabled: string[] = projectMcp?.tools?.enabled ?? [];

	// concat 全局 + 项目 disabled
	const merged = [...globalTools, ...projectTools];

	// 项目级 enabled 白名单覆盖
	if (projectEnabled.length > 0) {
		return [...new Set(merged.filter((p) => !projectEnabled.includes(p)))];
	}

	return [...new Set(merged)];
}

/**
 * 检查工具是否应该被禁用
 *
 * @param toolName - 工具全名（如 "godot_launch_editor"）
 * @param cwd - 当前项目目录
 * @returns true 表示该工具应该被禁用
 */
export function isToolDisabled(toolName: string, cwd: string): boolean {
	const patterns = getDisabledTools(cwd);
	return matchesPattern(toolName, patterns);
}

export function getDisabledMcpServers(cwd: string): string[] {
	const globalMcp = readGlobalSection("mcp");
	const globalDisabled: string[] = globalMcp.disabled ?? [];

	const projectSettings = readProjectSettings(cwd);
	const projectMcp: Record<string, any> = (projectSettings?.mcp as Record<string, any>) ?? {};
	const projectDisabled: string[] = projectMcp.disabled ?? [];
	const projectEnabled: string[] = projectMcp.enabled ?? [];

	// concat 全局 + 项目 disabled
	const merged = [...globalDisabled, ...projectDisabled];

	// 项目级 enabled 白名单覆盖：从 disabled 中移除
	if (projectEnabled.length > 0) {
		const enabledSet = new Set(projectEnabled);
		return [...new Set(merged.filter((s) => !enabledSet.has(s)))];
	}

	return [...new Set(merged)];
}
