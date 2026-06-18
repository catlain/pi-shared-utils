import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock factory is hoisted, use vi.hoisted to declare variables at the hoisted position
const mockFs = vi.hoisted(() => ({
	existsSync: vi.fn(),
	readdirSync: vi.fn(),
	readFileSync: vi.fn(),
	statSync: vi.fn(),
}));

vi.mock("node:fs", () => mockFs);

import { discoverAgents, formatAgentsList, getAgentDescription, loadAgentDef } from "../agents";

beforeEach(() => {
	vi.clearAllMocks();
});

describe("discoverAgents", () => {
	it("returns empty array when AGENTS_DIR does not exist", () => {
		mockFs.existsSync.mockReturnValue(false);
		expect(discoverAgents()).toEqual([]);
	});

	it("filters .md files and strips leading underscore", () => {
		mockFs.existsSync.mockReturnValue(true);
		mockFs.readdirSync.mockReturnValue(["coder.md", "_private.md", "reviewer.md", "readme.txt", "notes.md"]);
		const result = discoverAgents();
		expect(result).toEqual(["coder", "reviewer", "notes"]);
	});

	it("returns empty when only non-md files exist", () => {
		mockFs.existsSync.mockReturnValue(true);
		mockFs.readdirSync.mockReturnValue(["file.txt", "file.json"]);
		expect(discoverAgents()).toEqual([]);
	});

	it("returns empty when only underscored md files exist", () => {
		mockFs.existsSync.mockReturnValue(true);
		mockFs.readdirSync.mockReturnValue(["_private.md", "_template.md"]);
		expect(discoverAgents()).toEqual([]);
	});
});

describe("getAgentDescription", () => {
	it("extracts description from frontmatter", () => {
		const content = ["---", "description: 代码审查助手", "version: 1.0", "---", "# Coder Agent", "Some content"].join(
			"\n",
		);
		mockFs.readFileSync.mockReturnValue(content);
		const result = getAgentDescription("coder");
		expect(result).toBe("代码审查助手");
	});

	it("uses default description when no frontmatter", () => {
		mockFs.readFileSync.mockReturnValue("plain content without frontmatter");
		const result = getAgentDescription("coder");
		expect(result).toBe("(未定义描述)");
	});

	it("uses default description when file read fails", () => {
		mockFs.readFileSync.mockImplementation(() => {
			throw new Error("ENOENT");
		});
		const result = getAgentDescription("nonexistent");
		expect(result).toBe("(未定义描述)");
	});

	it("uses default description when frontmatter has no description field", () => {
		const content = ["---", "title: Agent", "---", "# Content"].join("\n");
		mockFs.readFileSync.mockReturnValue(content);
		const result = getAgentDescription("agent");
		expect(result).toBe("(未定义描述)");
	});

	it("handles description with trailing whitespace", () => {
		const content = ["---", "description:  帮我写代码  ", "---"].join("\n");
		mockFs.readFileSync.mockReturnValue(content);
		const result = getAgentDescription("agent");
		expect(result).toBe("帮我写代码");
	});
});

describe("formatAgentsList", () => {
	it("returns placeholder when no agents", () => {
		mockFs.existsSync.mockReturnValue(false);
		expect(formatAgentsList()).toBe("(无可用子代理)");
	});

	it("formats agent list with descriptions", () => {
		mockFs.existsSync.mockReturnValue(true);
		mockFs.readdirSync.mockReturnValue(["coder.md", "reviewer.md"]);
		mockFs.readFileSync.mockImplementation((filePath: string) => {
			if (filePath.includes("coder")) return "---\ndescription: Coder助手\n---\n";
			if (filePath.includes("reviewer")) return "---\ndescription: Reviewer助手\n---\n";
			return "";
		});
		const result = formatAgentsList();
		expect(result).toBe("- **coder**: Coder助手\n- **reviewer**: Reviewer助手");
	});
});

// ── loadAgentDef ────────────────────────────────────────

describe("loadAgentDef", () => {
	beforeEach(() => {
		// statSync 默认值，防止 undefined.mtimeMs 报错
		mockFs.statSync.mockReturnValue({ mtimeMs: 1000 });
	});

	it("文件不存在时返回 null", () => {
		mockFs.existsSync.mockReturnValue(false);
		expect(loadAgentDef("nonexistent-xyz")).toBeNull();
	});

	it("无 frontmatter 时返回默认 tools 和全文 systemPrompt", () => {
		mockFs.existsSync.mockReturnValue(true);
		mockFs.readFileSync.mockReturnValue("这是一段没有 frontmatter 的纯文本提示");
		const def = loadAgentDef("plain-agent-unique");
		expect(def).not.toBeNull();
		expect(def!.name).toBe("plain-agent-unique");
		expect(def!.tools).toEqual(["read", "grep", "find", "ls"]);
		expect(def!.systemPrompt).toBe("这是一段没有 frontmatter 的纯文本提示");
		expect(def!.model).toBeUndefined();
	});

	it("解析 frontmatter 的 name/tools/model/thinking/systemPrompt", () => {
		mockFs.existsSync.mockReturnValue(true);
		const content = [
			"---",
			"name: full-agent",
			'tools: "read, write, edit"',
			'model: "deepseek-v4"',
			'thinking: "high"',
			"---",
			"你是全功能代理",
		].join("\n");
		mockFs.readFileSync.mockReturnValue(content);
		const def = loadAgentDef("full-agent-unique");
		expect(def).not.toBeNull();
		expect(def!.name).toBe("full-agent");
		expect(def!.tools).toEqual(["read", "write", "edit"]);
		expect(def!.model).toBe("deepseek-v4");
		expect(def!.thinking).toBe("high");
		expect(def!.systemPrompt).toBe("你是全功能代理");
	});

	it("tools 为空时回退到默认 tools", () => {
		mockFs.existsSync.mockReturnValue(true);
		const content = ["---", "tools:", "---", "body"].join("\n");
		mockFs.readFileSync.mockReturnValue(content);
		const def = loadAgentDef("empty-tools-unique");
		expect(def!.tools).toEqual(["read", "grep", "find", "ls"]);
	});

	it("mtime 缓存命中时不重新读取文件", () => {
		const name = "cache-hit-unique";
		mockFs.existsSync.mockReturnValue(true);
		mockFs.statSync.mockReturnValue({ mtimeMs: 5000 });
		mockFs.readFileSync.mockReturnValue("---\ndescription: cached\n---\ncached body");

		loadAgentDef(name);
		const readsAfterFirst = mockFs.readFileSync.mock.calls.length;

		// 同 mtime → 命中缓存
		loadAgentDef(name);
		const readsAfterSecond = mockFs.readFileSync.mock.calls.length;

		expect(readsAfterSecond).toBe(readsAfterFirst); // 无新增 readFileSync
	});

	it("mtime 变化后缓存失效，重新读取文件", () => {
		const name = "cache-invalidate-unique";
		mockFs.existsSync.mockReturnValue(true);
		mockFs.statSync.mockReturnValue({ mtimeMs: 7000 });
		mockFs.readFileSync.mockReturnValueOnce("---\nname: v1\n---\nversion1");

		loadAgentDef(name);
		expect(loadAgentDef(name)!.systemPrompt).toBe("version1");

		// mtime 变化 → 缓存失效
		mockFs.statSync.mockReturnValue({ mtimeMs: 8000 });
		mockFs.readFileSync.mockReturnValueOnce("---\nname: v2\n---\nversion2");
		expect(loadAgentDef(name)!.systemPrompt).toBe("version2");
	});

	it("项目级同名覆盖全局（cwd 提供时优先项目级内容）", () => {
		const name = "override-unique";
		mockFs.existsSync.mockImplementation((p: unknown) => {
			// 项目级和全局文件都存在
			return String(p).endsWith(`${name}.md`);
		});
		mockFs.statSync.mockReturnValue({ mtimeMs: 9000 });
		mockFs.readFileSync.mockImplementation((p: unknown) => {
			// 按路径子串区分：项目级路径含 .pi
			if (String(p).includes(".pi")) return "---\nname: proj\n---\nPROJECT-LEVEL";
			return "---\nname: global\n---\nGLOBAL-LEVEL";
		});

		const def = loadAgentDef(name, "/fake-cwd");
		expect(def).not.toBeNull();
		expect(def!.systemPrompt).toBe("PROJECT-LEVEL");
	});
});

// ── discoverAgents: 项目级合并 + 预存 bug 修复 ──────────

describe("discoverAgents — 项目级与多目录", () => {
	it("项目级同名覆盖全局（项目级优先，全局同名去重）", () => {
		mockFs.existsSync.mockReturnValue(true);
		let dirCall = 0;
		mockFs.readdirSync.mockImplementation(() => {
			dirCall++;
			// 第一个目录（项目级 .pi/agents）有一个文件
			if (dirCall === 1) return ["shared.md", "project-only.md"];
			// 后续目录（全局）有同名 shared + 其他
			return ["shared.md", "global-only.md"];
		});
		const result = discoverAgents("/fake-cwd");
		// shared 在项目级已收录 → 全局的 shared 去重；project-only 来自项目级，global-only 来自全局
		expect(result).toContain("shared");
		expect(result).toContain("project-only");
		expect(result).toContain("global-only");
		expect(result.filter((n) => n === "shared")).toHaveLength(1); // 去重
	});

	it("只传 cwd 但 .pi/agents/ 不存在时不报错（正常返回全局）", () => {
		mockFs.existsSync.mockImplementation((p: unknown) => {
			// 项目级目录不存在，全局目录存在
			return !String(p).includes(".pi");
		});
		mockFs.readdirSync.mockReturnValue(["global-agent.md"]);
		const result = discoverAgents("/fake-cwd-no-project");
		expect(result).toEqual(["global-agent"]);
	});

	it("~/.agents/agents/ 的子代理能被发现（预存 bug 修复）", () => {
		// AGENTS_DIR 为空，SECONDARY 目录有文件 — 验证新代码能扫到第二个目录
		mockFs.existsSync.mockImplementation((p: unknown) => {
			return String(p).includes(".agents"); // 仅 SECONDARY 目录存在
		});
		mockFs.readdirSync.mockReturnValue(["secondary-only.md"]);
		const result = discoverAgents();
		expect(result).toEqual(["secondary-only"]);
		// 旧代码只扫 AGENTS_DIR → 会返回 []，此测试验证修复
	});
});

// ── getAgentDescription: cwd 参数 ─────────────────────────

describe("getAgentDescription — cwd 参数", () => {
	it("项目级文件优先于全局", () => {
		mockFs.existsSync.mockImplementation((p: unknown) => String(p).endsWith("dual.md"));
		mockFs.readFileSync.mockImplementation((p: unknown) => {
			if (String(p).includes(".pi")) return "---\ndescription: 项目级描述\n---\n";
			return "---\ndescription: 全局描述\n---\n";
		});
		expect(getAgentDescription("dual", "/fake-cwd")).toBe("项目级描述");
	});
});
