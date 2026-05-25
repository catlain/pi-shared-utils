/**
 * @pi-atelier/shared-utils — barrel export
 */
export {
	parseFileName,
	buildFileName,
	scanMemoryDir,
	type MemoryEntry,
} from "./memory-parser";

export {
	discoverAgents,
	getAgentDescription,
	formatAgentsList,
} from "./agents";

export {
	truncateToolOutput,
	truncatedResult,
	TOOL_OUTPUT_MAX_LINES,
	TOOL_OUTPUT_MAX_BYTES,
	type TruncationOptions,
	type ToolOutputResult,
} from "./tool-output";

export {
	getSettingsSection,
	patchSettingsSection,
	getSettingsValue,
	setSettingsValue,
} from "./settings";

export {
	AGENT_DIR,
	SETTINGS_PATH,
	MODELS_CONFIG_PATH,
	MEMORY_MD_PATH,
	MEMORY_DIR,
	MCP_CONFIG_PATH,
	MCP_CACHE_PATH,
	AGENTS_DIR,
	GLOBAL_RULES_PATH,
} from "./paths";

export {
	pushHint,
	hasHints,
	peekHints,
	drainHints,
	peekLabels,
} from "./ephemeral";
