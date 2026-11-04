/**
 * createLLMCaller 测试
 *
 * 验证：模型解析回退、auth 错误、stopReason 错误、多文本块拼接、
 * label 前缀、AbortSignal 传递。
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@earendil-works/pi-ai/compat", () => ({
	completeSimple: vi.fn(),
}));

import { completeSimple } from "@earendil-works/pi-ai/compat";
import { createLLMCaller } from "../llm.js";

const mockCompleteSimple = vi.mocked(completeSimple);

function makeCtx(overrides?: {
	find?: ReturnType<typeof vi.fn>;
	auth?: ReturnType<typeof vi.fn>;
}) {
	return {
		model: { id: "default-model", provider: "session" },
		modelRegistry: {
			find: overrides?.find ?? vi.fn(),
			getApiKeyAndHeaders:
				overrides?.auth ?? vi.fn().mockResolvedValue({ ok: true, apiKey: "test-key" }),
		},
	} as unknown as Parameters<typeof createLLMCaller>[0];
}

function textResult(...texts: string[]) {
	return {
		content: texts.map((t) => ({ type: "text", text: t })),
		stopReason: "stop",
	} as never;;
}

beforeEach(() => {
	mockCompleteSimple.mockReset();
});

describe("createLLMCaller", () => {
	it("指定 modelId 解析成功时用该模型调用", async () => {
		const resolved = { id: "flash", provider: "google" };
		const find = vi.fn().mockReturnValue(resolved);
		const ctx = makeCtx({ find });
		mockCompleteSimple.mockResolvedValue(textResult("hello"));

		const call = createLLMCaller(ctx, "google/gemini-flash");
		const out = await call("sys", "user");

		expect(find).toHaveBeenCalledWith("google", "gemini-flash");
		expect(mockCompleteSimple).toHaveBeenCalledWith(
			resolved,
			expect.anything(),
			expect.objectContaining({ apiKey: "test-key" }),
		);
		expect(out).toBe("hello");
	});

	it("modelId 找不到时回退 session 默认模型", async () => {
		const find = vi.fn().mockReturnValue(undefined);
		const ctx = makeCtx({ find });
		mockCompleteSimple.mockResolvedValue(textResult("fallback"));

		const call = createLLMCaller(ctx, "nope/model");
		const out = await call("sys", "user");

		expect(mockCompleteSimple.mock.calls[0][0]).toBe(ctx.model);
		expect(out).toBe("fallback");
	});

	it("未指定 modelId 时直接用 session 默认模型", async () => {
		const find = vi.fn();
		const ctx = makeCtx({ find });
		mockCompleteSimple.mockResolvedValue(textResult("ok"));

		const call = createLLMCaller(ctx);
		await call("sys", "user");

		expect(find).not.toHaveBeenCalled();
		expect(mockCompleteSimple.mock.calls[0][0]).toBe(ctx.model);
	});

	it("auth 失败时抛出带 label 前缀的错误", async () => {
		const auth = vi.fn().mockResolvedValue({ ok: false, error: "no key" });
		const ctx = makeCtx({ auth });

		const call = createLLMCaller(ctx, undefined, { label: "[smart-compact]" });
		await expect(call("sys", "user")).rejects.toThrow(
			"[smart-compact] API key 不可用: no key",
		);
	});

	it("stopReason 为 error 时抛错", async () => {
		mockCompleteSimple.mockResolvedValue({
			content: [],
			stopReason: "error",
			errorMessage: "rate limited",
		} as never);

		const call = createLLMCaller(makeCtx());
		await expect(call("sys", "user")).rejects.toThrow("rate limited");
	});

	it("多个文本块以换行拼接为一个字符串", async () => {
		mockCompleteSimple.mockResolvedValue(textResult("a", "b", "c"));

		const call = createLLMCaller(makeCtx());
		const out = await call("sys", "user");

		expect(out).toBe("a\nb\nc");
	});

	it("AbortSignal 透传给 completeSimple", async () => {
		mockCompleteSimple.mockResolvedValue(textResult("x"));
		const ctx = makeCtx();
		const call = createLLMCaller(ctx);

		const ac = new AbortController();
		await call("sys", "user", ac.signal);

		expect(mockCompleteSimple.mock.calls[0][2]).toMatchObject({
			signal: ac.signal,
		});
	});
});
