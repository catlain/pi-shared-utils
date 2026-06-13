/**
 * @pi-atelier/shared-utils — barrel export
 */

export {
	type AgentDef,
	discoverAgents,
	formatAgentsList,
	getAgentDescription,
	loadAgentDef,
} from "./agents";
export {
	drainHints,
	hasHints,
	peekHints,
	peekLabels,
	pushHint,
} from "./ephemeral";
export {
	extractStringValues,
	matchFile,
	matchToolName,
} from "./filter-match";
export {
	buildFileName,
	type MemoryEntry,
	parseFileName,
	scanMemoryDir,
} from "./memory-parser";
export {
	AGENT_DIR,
	AGENTS_DIR,
	GLOBAL_RULES_PATH,
	MCP_CACHE_PATH,
	MCP_CONFIG_PATH,
	MEMORY_DIR,
	MEMORY_MD_PATH,
	MODELS_CONFIG_PATH,
	SETTINGS_PATH,
} from "./paths";
export {
	type ConfigConflict,
	clearProjectSettingsCache,
	detectConfigConflicts,
	type EffectiveConfigResult,
	getEffectiveConfig,
	type MergeOptions,
	type SchemaError,
	validateConfigSchema,
} from "./project-config";
export {
	getDisabledMcpServers,
	getDisabledTools,
	getEnabledTools,
	isToolDisabled,
	type ToolFilter,
} from "./project-tools";
export {
	getSettingsSection,
	getSettingsValue,
	patchSettingsSection,
	setSettingsValue,
} from "./settings";
export {
	type BackupEntry,
	listBackups,
	type PatchBackupOptions,
	type PatchBackupResult,
	patchSettingsSectionWithBackup,
	type RollbackOptions,
	rollbackSettings,
} from "./settings-backup";
