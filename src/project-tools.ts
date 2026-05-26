/**
 * Project-level Tool Filtering — 工具/MCP 过滤
 *
 * 根据项目 .pi/settings.json 中的 tools/mcp 段，过滤启用的工具和禁用的 MCP 服务器。
 *
 * 用法：
 *   import { getEnabledTools, getDisabledMcpServers } from "@pi-atelier/shared-utils";
 *
 *   const tools = getEnabledTools(allTools, cwd);
 *   const disabledServers = getDisabledMcpServers(cwd);
 */

import { readProjectSettings } from "./project-config";

// ── 类型 ─────────────────────────────────────────────────

export interface ToolFilter {
	/** 额外启用的工具 ID 列表 */
	enabled?: string[];
	/** 禁用的工具 ID 列表 */
	disabled?: string[];
}

// ── API ─────────────────────────────────────────────────

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
