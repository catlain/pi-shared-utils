import { describe, expect, it } from "vitest";

import {
	isArchDocPath,
	isConstitutionalDocPath,
	isOpenspecDesignDocPath,
	isSkillMdPath,
} from "../protected-docs";

describe("isSkillMdPath — 任意目录树 skills/{name}/SKILL.md", () => {
	it.each([
		// .pi 全局内联
		["C:/Users/u/.pi/agent/skills/code-graph/SKILL.md"],
		// npm 包
		[
			"C:/Users/u/.pi/agent/npm/node_modules/pi-worktree/skills/worktree-setup/SKILL.md",
		],
		// 项目级
		["C:/proj/.pi/skills/my-skill/SKILL.md"],
		// .agents 生态
		["C:/Users/u/.agents/skills/skill-creator/SKILL.md"],
		// git 包
		["C:/Users/u/.pi/agent/git/github.com/catlain/foo/skills/bar/SKILL.md"],
		// 相对路径（段边界 ^ 锚定）
		["skills/code-graph/SKILL.md"],
		// 反斜杠分隔
		["C:\\proj\\.pi\\skills\\my-skill\\SKILL.md"],
		// 大小写不敏感文件名
		["C:/proj/.pi/skills/x/skill.md"],
	])("%s → true", (p) => {
		expect(isSkillMdPath(p)).toBe(true);
	});

	it.each([
		// 无 skills/{name}/ 段结构（some-skill 是文件名前缀，非目录段）
		["C:/r/docs/some-skill/SKILL.md"],
		// 技能目录下非入口文件名
		["C:/r/.pi/skills/foo/templates/tpl.md"],
		["C:/Users/u/.pi/agent/skills/foo/GUIDE.md"],
		// my-skills 不是独立的 skills 段
		["C:/r/my-skills/x/SKILL.md"],
		// 嵌套多段技能名（{name} 须为单一路径段）
		["C:/r/skills/a/b/SKILL.md"],
		// 空值
		[undefined],
		[""],
	])("%s → false", (p) => {
		expect(isSkillMdPath(p)).toBe(false);
	});
});

describe("isOpenspecDesignDocPath — 仅 openspec/changes/{change}/design.md", () => {
	it.each([
		["C:/r/openspec/changes/add-x/design.md"],
		// 反斜杠
		["C:\\r\\openspec\\changes\\add-x\\design.md"],
		// 相对路径
		["openspec/changes/add-x/design.md"],
	])("%s → true", (p) => {
		expect(isOpenspecDesignDocPath(p)).toBe(true);
	});

	it.each([
		["C:/r/openspec/changes/add-x/proposal.md"],
		["C:/r/openspec/changes/add-x/tasks.md"],
		["C:/r/openspec/changes/add-x/specs/cap/spec.md"],
		// 主规格不保护
		["C:/r/openspec/specs/context-restore/spec.md"],
		// design.md 必须精确结尾
		["C:/r/openspec/changes/add-x/design.md.bak"],
		// 嵌套多段 change 名
		["C:/r/openspec/changes/a/b/design.md"],
		[undefined],
	])("%s → false", (p) => {
		expect(isOpenspecDesignDocPath(p)).toBe(false);
	});
});

describe("isArchDocPath — docs/agent/ 前缀四类", () => {
	it.each([
		["C:/r/docs/agent/adr/0001-layering.md"],
		["C:/r/docs/agent/adr/INDEX.md"],
		["C:/r/docs/agent/adr-archive/0000-old.md"],
		["C:/r/docs/agent/ADR.md"],
		["C:/r/docs/agent/INVARIANTS.md"],
		["C:/r/docs/agent/designs/subsystem.md"],
		// 反斜杠
		["C:\\r\\docs\\agent\\designs\\x.md"],
	])("%s → true", (p) => {
		expect(isArchDocPath(p)).toBe(true);
	});

	it.each([
		// 缺 agent 段
		["C:/r/docs/ADR.md"],
		["C:/r/docs/INVARIANTS.md"],
		// 非 docs/agent 前缀
		["C:/r/results/designs/x.md"],
		["C:/r/docs/designs/x.md"],
		// agent 段必须是独立路径段（docsagents 不命中）
		["C:/r/docsagents/ADR.md"],
		[undefined],
	])("%s → false", (p) => {
		expect(isArchDocPath(p)).toBe(false);
	});
});

describe("isConstitutionalDocPath — 组合 OR", () => {
	it("三类各一均命中", () => {
		expect(
			isConstitutionalDocPath("C:/Users/u/.pi/agent/skills/x/SKILL.md"),
		).toBe(true);
		expect(
			isConstitutionalDocPath("C:/r/openspec/changes/foo/design.md"),
		).toBe(true);
		expect(isConstitutionalDocPath("C:/r/docs/agent/INVARIANTS.md")).toBe(
			true,
		);
	});

	it.each([
		["C:/r/src/index.ts"],
		["C:/r/README.md"],
		["C:/r/openspec/changes/foo/tasks.md"],
		[undefined],
	])("%s → false", (p) => {
		expect(isConstitutionalDocPath(p)).toBe(false);
	});
});
