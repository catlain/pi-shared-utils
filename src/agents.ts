/**
 * Agent 发现与加载 — 子代理定义的列表发现与加载解析
 *
 * 搜索目录优先级（三级，同名高优先覆盖低优先）：
 *   1. {cwd}/.pi/agents/   （项目级，cwd 提供且存在时）
 *   2. ~/.pi/agent/agents/ （AGENTS_DIR，全局）
 *   3. ~/.agents/agents/   （全局备用）
 */

import * as fs from "node:fs";
import { homedir } from "node:os";
import * as path from "node:path";
import { AGENTS_DIR } from "./paths";

// ── 类型 ──────────────────────────────────────────────────

export interface AgentDef {
	name: string;
	tools: string[];
	model?: string;
	thinking?: string;
	systemPrompt: string;
}

// ── 目录搜索 ──────────────────────────────────────────────

const SECONDARY_AGENTS_DIR = path.join(homedir(), ".agents", "agents");

/**
 * 构建三级搜索目录（高优先在前）。
 * 项目级目录仅当 cwd 提供时加入（不校验存在，由调用方按需 existsSync）。
 */
function searchDirs(cwd?: string): string[] {
	const dirs = [AGENTS_DIR];
	if (SECONDARY_AGENTS_DIR !== AGENTS_DIR) dirs.push(SECONDARY_AGENTS_DIR);
	if (cwd) {
		const projectAgents = path.join(cwd, ".pi", "agents");
		dirs.unshift(projectAgents); // 项目级最高优先
	}
	return dirs;
}

// ── 列表发现 ──────────────────────────────────────────────

/**
 * 扫描所有可用的 agent 名称（项目级 + 全局合并，同名项目级优先去重）。
 */
export function discoverAgents(cwd?: string): string[] {
	const dirs = searchDirs(cwd);
	const seen = new Set<string>();
	const result: string[] = [];
	for (const dir of dirs) {
		if (!fs.existsSync(dir)) continue;
		for (const f of fs.readdirSync(dir)) {
			if (!f.endsWith(".md") || f.startsWith("_")) continue;
			const name = f.replace(/\.md$/, "");
			if (seen.has(name)) continue; // 高优先目录已收录，跳过同名
			seen.add(name);
			result.push(name);
		}
	}
	return result;
}

/**
 * 获取 agent 的简短描述（从 frontmatter 的 description 字段）。
 * 按三级优先级查找第一个存在的文件。
 */
export function getAgentDescription(name: string, cwd?: string): string {
	for (const dir of searchDirs(cwd)) {
		const filePath = path.join(dir, `${name}.md`);
		if (!fs.existsSync(filePath)) continue;
		try {
			const content = fs.readFileSync(filePath, "utf-8");
			const match = content.match(/^---\n([\s\S]*?)\n---/);
			if (match) {
				const descLine = match[1].split("\n").find((l) => l.startsWith("description:"));
				if (descLine) return descLine.replace(/^description:\s*/, "").trim();
			}
		} catch {
			/* ignore */
		}
	}
	return "(未定义描述)";
}

/** 格式化为 description 中的子代理列表文本 */
export function formatAgentsList(cwd?: string): string {
	const agents = discoverAgents(cwd);
	if (agents.length === 0) return "(无可用子代理)";
	return agents.map((a) => `- **${a}**: ${getAgentDescription(a, cwd)}`).join("\n");
}

// ── 加载解析 ──────────────────────────────────────────────

interface CacheEntry {
	mtime: number;
	def: AgentDef;
}

const agentCache = new Map<string, CacheEntry>();

/**
 * 加载指定 agent 的完整定义（按三级优先级查找，带 mtime 缓存）。
 * 项目级同名覆盖全局。
 */
export function loadAgentDef(agentName: string, cwd?: string): AgentDef | null {
	for (const searchDir of searchDirs(cwd)) {
		const filePath = path.join(searchDir, `${agentName}.md`);
		if (!fs.existsSync(filePath)) continue;

		const stat = fs.statSync(filePath);
		const cacheKey = filePath; // 完整路径做 key，三级目录天然不冲突

		const cached = agentCache.get(cacheKey);
		if (cached && cached.mtime === stat.mtimeMs) {
			return cached.def;
		}

		const content = fs.readFileSync(filePath, "utf-8");
		const def = parseAgentFile(content, agentName);
		if (def) {
			agentCache.set(cacheKey, { mtime: stat.mtimeMs, def });
			return def;
		}
	}
	return null;
}

/**
 * 解析 agent 定义文件（frontmatter + body）。
 * 私有，不导出。
 */
function parseAgentFile(content: string, agentName: string): AgentDef {
	const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
	if (!fmMatch) {
		return {
			name: agentName,
			tools: ["read", "grep", "find", "ls"],
			systemPrompt: content.trim(),
		};
	}

	const fm = fmMatch[1];
	const body = content.slice(fmMatch[0].length).trim();
	const fields: Record<string, string> = {};

	for (const line of fm.split("\n")) {
		const idx = line.indexOf(":");
		if (idx > 0) {
			let val = line.slice(idx + 1).trim();
			if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
				val = val.slice(1, -1);
			}
			fields[line.slice(0, idx).trim()] = val;
		}
	}

	return {
		name: fields.name || agentName,
		tools: fields.tools
			? fields.tools
					.split(",")
					.map((t) => t.trim())
					.filter(Boolean)
			: ["read", "grep", "find", "ls"],
		model: fields.model || undefined,
		thinking: fields.thinking || undefined,
		systemPrompt: body || content.trim(),
	};
}
