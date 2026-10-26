/**
 * 保护文档清单谓词（单一事实源）
 *
 * "保护文档" = 跨包共享的高价值长期在场文档清单：
 *   1. 技能入口文档   — 任意目录树下 skills/{name}/SKILL.md（.pi 全局/项目级、npm 包、.agents、git 包）
 *   2. openspec 变更决策 — 仅 openspec/changes/{change}/design.md（proposal/tasks/specs 不保护，旧快照负资产）
 *   3. 架构宪法文档   — docs/agent/ 前缀下的 adr/、adr-archive/、ADR.md、INVARIANTS.md、designs/
 *
 * 消费方：pi-context-manager（aging 豁免）、pi-shepherd（compact 回补）。
 * 清单匹配逻辑 SHALL 仅存在于此，下游引用而非复制正则。
 * 纯字符串函数、零依赖；兼容 / 与 \ 分隔符及绝对/相对路径。
 */

/** 技能入口文档：任意目录树下 `skills/{name}/SKILL.md`
 *  单一 skills 路径段 + 单一技能名段 + 精确入口文件名（大小写不敏感）。
 *  覆盖 .pi 全局（~/.pi/agent/skills/）、npm 包（.../node_modules/{pkg}/skills/）、
 *  项目级（{cwd}/.pi/skills/）、.agents 生态（~/.agents/skills/）、git 包等全部真实形态。
 *  无 skills/{name}/ 段结构的同名结尾文件（如 docs/some-skill/SKILL.md）不命中。 */
export function isSkillMdPath(path: string | undefined): boolean {
	if (!path) return false;
	return /(^|[\\/])skills[\\/][^\\/]+[\\/]SKILL\.md$/i.test(path);
}

/** openspec 变更设计文档：`openspec/changes/{change}/design.md`（仅此一个）
 *  {change} 为单一路径段，文件名精确匹配。
 *  proposal.md、tasks.md、specs 增量、openspec/specs/ 主规格均不保护——
 *  留在上下文的是旧快照（负资产），挥发逼着重读拿实况。 */
export function isOpenspecDesignDocPath(path: string | undefined): boolean {
	if (!path) return false;
	return /(^|[\\/])openspec[\\/]changes[\\/][^\\/]+[\\/]design\.md$/i.test(path);
}

/** 架构宪法文档：`docs/agent/` 前缀下的 adr/（含编号 ADR 与 INDEX）、adr-archive/、
 *  单文件 ADR.md、INVARIANTS.md、designs/（Design Note）。
 *  docs/agent/ 前缀约束防止业务文件误伤（如 results/designs/、根目录 ADR.md）。 */
export function isArchDocPath(path: string | undefined): boolean {
	if (!path) return false;
	return /(^|[\\/])docs[\\/]agent[\\/](?:adr(?:-archive)?[\\/]|ADR\.md$|INVARIANTS\.md$|designs[\\/])/i.test(
		path,
	);
}

/** 组合谓词：三类保护文档任一命中即 true（回补侧整体消费入口） */
export function isConstitutionalDocPath(path: string | undefined): boolean {
	return (
		isSkillMdPath(path) ||
		isOpenspecDesignDocPath(path) ||
		isArchDocPath(path)
	);
}
