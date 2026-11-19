/**
 * LLM 调用共享模块 — 从 ExtensionContext 构建统一的 LLM 调用接口
 *
 * 消费方（子路径导入 `@pi-atelier/shared-utils/llm`，不进主 barrel 以隔离 pi-ai 依赖）：
 * - pi-shepherd：规则 llmJudge 二级判定（是/否语义精判）
 * - pi-smart-compact：两阶段压缩的意图总结与工具去留判断
 *
 * 模型解析行为：modelId 可解析（"provider/model"）时用指定模型；
 * 未传或不可解析时回退 ctx.model（当前会话模型）。
 */
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { completeSimple } from "@earendil-works/pi-ai/compat";

/** LLM caller 函数签名 */
export type LLMCaller = (
	system: string,
	user: string,
	signal?: AbortSignal,
) => Promise<string>;

/** createLLMCaller 选项 */
export interface CreateLLMCallerOptions {
	/** 错误信息前缀（如 "[smart-compact]"），默认 "[llm-caller]" */
	label?: string;
}

/**
 * 从 ExtensionContext 创建 LLM 调用函数。
 * 每次调用时解析模型与凭据，支持指定模型 ID（用于用便宜模型做判断类任务）。
 * modelId 格式: "provider/model-name"，不可解析时回退 ctx.model。
 */
export function createLLMCaller(
	ctx: ExtensionContext,
	modelId?: string,
	options?: CreateLLMCallerOptions,
): LLMCaller {
	const label = options?.label ?? "[llm-caller]";
	return async (
		system: string,
		user: string,
		signal?: AbortSignal,
	): Promise<string> => {
		let model = ctx.model;
		let fellBack = false;
		if (modelId) {
			const sepIdx = modelId.indexOf("/");
			if (sepIdx > 0) {
				const provider = modelId.slice(0, sepIdx);
				const id = modelId.slice(sepIdx + 1);
				model = ctx.modelRegistry.find(provider, id) ?? ctx.model;
				fellBack = model === ctx.model;
			} else {
				fellBack = true;
			}
		}
		if (fellBack) {
			console.warn(`${label} 指定模型 "${modelId}" 不可解析/未找到，回退会话模型 ${ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : "(无)"}`);
		}
		if (!model) {
			throw new Error(`${label} 模型不可用: ${modelId ?? "session model"}`);
		}

		const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
		if (!auth.ok) {
			throw new Error(`${label} API key 不可用: ${auth.error}`);
		}

		const result = await completeSimple(
			model,
			{
				systemPrompt: system,
				messages: [
					{
						role: "user" as const,
						content: [{ type: "text" as const, text: user }],
						timestamp: Date.now(),
					},
				],
			},
			{ maxTokens: 4096, apiKey: auth.apiKey, headers: auth.headers, signal },
		);

		if (result.stopReason === "error") {
			throw new Error(
				`${label} LLM 调用失败: ${result.errorMessage ?? "unknown"}`,
			);
		}

		return result.content
			.filter(
				(c: { type: string }): c is { type: "text"; text: string } =>
					c.type === "text",
			)
			.map((c) => c.text)
			.join("\n");
	};
}
