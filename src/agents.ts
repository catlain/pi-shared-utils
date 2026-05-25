/**
 * Agent 发现 — 扫描 ~/.pi/agent/agents/*.md 获取可用子代理列表
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { AGENTS_DIR } from "./paths";

/** 扫描所有可用的 agent 名称 */
export function discoverAgents(): string[] {
	if (!fs.existsSync(AGENTS_DIR)) return [];
	return fs.readdirSync(AGENTS_DIR)
		.filter(f => f.endsWith(".md") && !f.startsWith("_"))
		.map(f => f.replace(/\.md$/, ""));
}

/** 获取 agent 的简短描述（从 frontmatter 的 description 字段） */
export function getAgentDescription(name: string): string {
	const filePath = path.join(AGENTS_DIR, `${name}.md`);
	try {
		const content = fs.readFileSync(filePath, "utf-8");
		const match = content.match(/^---\n([\s\S]*?)\n---/);
		if (match) {
			const descLine = match[1].split("\n").find(l => l.startsWith("description:"));
			if (descLine) return descLine.replace(/^description:\s*/, "").trim();
		}
	} catch { /* ignore */ }
	return "read, grep, find, ls";
}

/** 格式化为 description 中的子代理列表文本 */
export function formatAgentsList(): string {
	const agents = discoverAgents();
	if (agents.length === 0) return "(无可用子代理)";
	return agents.map(a => `- **${a}**: ${getAgentDescription(a)}`).join("\n");
}
