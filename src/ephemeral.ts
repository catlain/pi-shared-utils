/**
 * 临时提示注入机制（单扩展内使用）
 *
 * 提供提示缓冲区（pushHint/drainHints/peekHints）。
 *
 * 跨扩展传递提示请用 pi.events.emit("ephemeral:hint")，
 * 不要依赖本模块的内存变量（jiti 多实例问题）。
 *
 * payload 持久化/录制已移到 shepherd 扩展内联处理。
 */

const MAX_HINTS = 100;

const _hints: string[] = [];
const _labels: (string | undefined)[] = [];

/**
 * 推入一条临时提示（超出上限时丢弃最旧的）
 * label 为占位式存储：无 label 时 push undefined 以保持与 _hints 长度一一对应，
 * 使 drainHintsWithLabels 能正确配对 text 与 label。
 */
export function pushHint(hint: string, label?: string): void {
	_hints.push(hint);
	_labels.push(label);
	// 超出上限时丢弃最旧的（两者同步）
	if (_hints.length > MAX_HINTS) {
		const excess = _hints.length - MAX_HINTS;
		_hints.splice(0, excess);
		_labels.splice(0, excess);
	}
}

/** 查看待发送的标签（不消费）。仅返回有值的 label（过滤 undefined 占位）。 */
export function peekLabels(): string[] {
	return _labels.filter((l): l is string => l !== undefined);
}

/** 缓冲区是否有待发送的提示 */
export function hasHints(): boolean {
	return _hints.length > 0;
}

/** 查看待发送的提示内容（不消费） */
export function peekHints(): string | null {
	if (_hints.length === 0) return null;
	return _hints.join("\n\n");
}

/** 取出所有待发送的提示，拼接为单条 user message（同时清空 labels） */
export function drainHints(): string | null {
	if (_hints.length === 0) return null;
	_labels.splice(0);
	return _hints.splice(0).join("\n\n");
}

/**
 * 取出所有待发送的提示及其 label（一一对应），清空缓冲区。
 * 与 drainHints 不同：保留每条 hint 与其 label 的配对关系，
 * 供 notifySummary 生成基于规则标签的气泡摘要。
 */
export function drainHintsWithLabels(): { text: string; label?: string }[] {
	if (_hints.length === 0) return [];
	const texts = _hints.splice(0);
	const labels = _labels.splice(0);
	return texts.map((text, i) => ({ text, label: labels[i] }));
}
