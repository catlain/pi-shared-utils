import { describe, expect, it } from "vitest";

import { estimateTokens } from "../tokens";

describe("estimateTokens — 全生态统一 token 估算口径", () => {
	it("4 字符 ≈ 1 token，向上取整", () => {
		expect(estimateTokens("")).toBe(0);
		expect(estimateTokens("abcd")).toBe(1);
		expect(estimateTokens("abcde")).toBe(2);
		expect(estimateTokens("a".repeat(4000))).toBe(1000);
	});

	it("中文与符号同口径（按字符数不区分）", () => {
		expect(estimateTokens("中文字符")).toBe(1); // 4 字符
		expect(estimateTokens("五个中文字")).toBe(2); // 5 字符向上取整
	});
});
