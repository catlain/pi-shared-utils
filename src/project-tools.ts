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

import { readFileSync, existsSync } from "node:fs";
import { readProjectSettings } from "./project-config";
import { getSettingsSection } from "./settings";
import { SETTINGS_PATH } from "./paths";

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
		tools = tools.filter(t => !disabledSet.has(t));
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
 * 获取禁用的 MCP 服务器列表（三层合并：全局 + 项目 concat）
 *
 * 场景：全局禁用不稳定的 server，项目级额外禁用不需要的 server。
 *
 * @param cwd - 当前项目目录
 * @returns 去重后的禁用 MCP 服务器名称列表
 */
export function getDisabledMcpServers(cwd: string): string[] {
	const globalMcp = readGlobalSection("mcp");
	const globalDisabled: string[] = globalMcp.disabled ?? [];

	const projectSettings = readProjectSettings(cwd);
	const projectDisabled: string[] = projectSettings?.mcp?.disabled ?? [];

	// concat + 去重
	const merged = [...globalDisabled, ...projectDisabled];
	return [...new Set(merged)];
}
