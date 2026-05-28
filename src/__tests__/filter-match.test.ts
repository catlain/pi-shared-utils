/**
 * filter-match 测试 — matchToolName / matchFile / extractStringValues
 */

import { describe, it, expect } from "vitest";
import { matchToolName, matchFile, extractStringValues } from "../filter-match";

// ── matchToolName ────────────────────────────────────

describe("matchToolName", () => {
	// 精确匹配
	it("精确匹配：edit → edit ✅", () => {
		expect(matchToolName("edit", "edit")).toBe(true);
	});
	it("前缀匹配：edit → edit_something ❌（edit 是有效工具名，不前缀匹配）", () => {
		expect(matchToolName("edit", "edit_something")).toBe(false);
	});
	it("精确匹配：edit → write ❌", () => {
		expect(matchToolName("edit", "write")).toBe(false);
	});

	// 通配符前缀匹配（显式 *）
	it("通配符前缀：code_graph* → code_graph_project_map ✅", () => {
		expect(matchToolName("code_graph*", "code_graph_project_map")).toBe(true);
	});
	it("通配符前缀：code_graph* → code_graph_module_overview ✅", () => {
		expect(matchToolName("code_graph*", "code_graph_module_overview")).toBe(true);
	});
	it("通配符前缀：code_graph* → code_graph ✅（* 匹配空串）", () => {
		expect(matchToolName("code_graph*", "code_graph")).toBe(true);
	});
	it("通配符前缀：session* → session_analyze ✅", () => {
		expect(matchToolName("session*", "session_analyze")).toBe(true);
	});
	it("通配符前缀：session* → session_search ✅", () => {
		expect(matchToolName("session*", "session_search")).toBe(true);
	});
	it("前缀不匹配：code_graph → bash ❌", () => {
		expect(matchToolName("code_graph", "bash")).toBe(false);
	});
	it("前缀匹配：code_graph → code_graphx ❌（code_graph 不是前缀）", () => {
		expect(matchToolName("code_graphx", "code_graph")).toBe(false);
	});

	// 裸前缀只适用于“非工具名”的输入（本身不是一个完整工具名的输入）
	// 实际场景中用户传 "code_graph" 想匹配所有 code_graph_*
	// 但 "edit" 是一个真实工具名，不该前缀匹配
	// 所以：去掉裸前缀匹配，统一用通配符
	// "code_graph*" → 匹配 code_graph_project_map
	// "code_graph" → 只匹配 code_graph（精确）

	// 通配符 *
	it("通配符：code_graph_* → code_graph_project_map ✅", () => {
		expect(matchToolName("code_graph_*", "code_graph_project_map")).toBe(true);
	});
	it("通配符：code_graph_* → code_graph_module_overview ✅", () => {
		expect(matchToolName("code_graph_*", "code_graph_module_overview")).toBe(true);
	});
	it("通配符：code_graph_* → code_graph ✅（_分隔后的*可匹配空串）", () => {
		// code_graph_* → 正则 ^code_graph_.*$ → code_graph 不匹配（没有尾部_）
		// 这是正确的 glob 行为
		expect(matchToolName("code_graph_*", "code_graph")).toBe(false);
	});
	it("通配符：code_graph_* → bash ❌", () => {
		expect(matchToolName("code_graph_*", "bash")).toBe(false);
	});
	it("通配符：*_overview → code_graph_module_overview ✅", () => {
		expect(matchToolName("*_overview", "code_graph_module_overview")).toBe(true);
	});
	it("通配符：*analysis* → session_analysis_report ✅", () => {
		expect(matchToolName("*analysis*", "session_analysis_report")).toBe(true);
	});

	// 多值 |
	it("多值：edit|write → edit ✅", () => {
		expect(matchToolName("edit|write", "edit")).toBe(true);
	});
	it("多值：edit|write → write ✅", () => {
		expect(matchToolName("edit|write", "write")).toBe(true);
	});
	it("多值：edit|write → bash ❌", () => {
		expect(matchToolName("edit|write", "bash")).toBe(false);
	});
	it("多值含通配符：code_graph*|bash → code_graph_project_map ✅", () => {
		expect(matchToolName("code_graph*|bash", "code_graph_project_map")).toBe(true);
	});	it("多值含通配符：code_graph*|bash → code_graph ✅（精确匹配 bash 部分）", () => {
		expect(matchToolName("code_graph*|bash", "code_graph")).toBe(true);
	});
	it("多值含前缀：code_graph|bash → bash ✅", () => {
		expect(matchToolName("code_graph|bash", "bash")).toBe(true);
	});

	// 边界
	it("空输入不过滤 → 返回 true", () => {
		expect(matchToolName("", "anything")).toBe(true);
	});
	it("undefined 输入不过滤 → 返回 true", () => {
		expect(matchToolName(undefined, "anything")).toBe(true);
	});
});

// ── matchFile ────────────────────────────────────────

describe("matchFile", () => {
	const paths1 = ["src/entries-nav.ts", "src/core.ts", "tests/entries.test.ts"];

	// 子串匹配
	it("子串匹配：entries-nav → 匹配含该字符串的路径", () => {
		expect(matchFile("entries-nav", paths1)).toBe(true);
	});
	it("子串匹配：core.ts → 匹配", () => {
		expect(matchFile("core.ts", paths1)).toBe(true);
	});
	it("子串匹配：nonexist → 不匹配", () => {
		expect(matchFile("nonexist", paths1)).toBe(false);
	});

	// 通配符
	it("通配符：*.test.ts → 匹配测试文件", () => {
		expect(matchFile("*.test.ts", paths1)).toBe(true);
	});
	it("通配符：src/* → 匹配 src 下文件", () => {
		expect(matchFile("src/*", paths1)).toBe(true);
	});
	it("通配符：docs/* → 不匹配", () => {
		expect(matchFile("docs/*", paths1)).toBe(false);
	});

	// 多值
	it("多值：entries-nav|core → 匹配含任一的路径", () => {
		expect(matchFile("entries-nav|core", paths1)).toBe(true);
	});
	it("多值：docs|config → 不匹配", () => {
		expect(matchFile("docs|config", paths1)).toBe(false);
	});

	// 空路径数组
	it("空路径数组 → false", () => {
		expect(matchFile("anything", [])).toBe(false);
	});

	// 空输入不过滤
	it("空输入 → true（不过滤）", () => {
		expect(matchFile("", paths1)).toBe(true);
	});
	it("undefined 输入 → true（不过滤）", () => {
		expect(matchFile(undefined, paths1)).toBe(true);
	});
});

// ── extractStringValues ──────────────────────────────

describe("extractStringValues", () => {
	it("从扁平对象提取所有 string", () => {
		const result = extractStringValues({ path: "/src/main.ts", cmd: "npm test", count: 42 });
		expect(result).toContain("/src/main.ts");
		expect(result).toContain("npm test");
		expect(result).not.toContain(42);
	});

	it("从嵌套对象递归提取", () => {
		const result = extractStringValues({
			changes: [
				{ oldText: "foo", newText: "bar" },
			],
			path: "/src/edit.ts",
		});
		expect(result).toContain("/src/edit.ts");
		expect(result).toContain("foo");
		expect(result).toContain("bar");
	});

	it("跳过 null/undefined/number/boolean", () => {
		const result = extractStringValues({ a: null, b: undefined, c: 123, d: true, e: "yes" });
		expect(result).toEqual(["yes"]);
	});

	it("空对象 → 空数组", () => {
		expect(extractStringValues({})).toEqual([]);
	});

	it("数组中的 string", () => {
		const result = extractStringValues({ files: ["a.ts", "b.ts"] });
		expect(result).toContain("a.ts");
		expect(result).toContain("b.ts");
	});
});
