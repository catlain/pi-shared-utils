/**
 * Token 估算 — 全生态统一口径（单一事实源）
 *
 * 估算规则：4 字符 ≈ 1 token（英文粗估口径，对结构化文本偏低，
 * 消费方如 tool-result-processor 另有字符数硬限制兜底）。
 *
 * 消费方：pi-context-manager（distill/processor/collect/payload）、
 * pi-shepherd（context-restore 预算）等。SHALL 直接 import 本函数，
 * SHALL NOT 在各自包内复制实现或另起别名（est / estTokens 等历史
 * 名字已废弃 —— unify-protected-doc-list 归档审计 S5 收敛）。
 */

/** 轻量 token 估算：字符数 / 4 向上取整 */
export function estimateTokens(text: string): number {
	return Math.ceil(text.length / 4);
}
