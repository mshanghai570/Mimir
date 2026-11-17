export type ProviderType =
  | 'openai_compatible'
  | 'ollama'
  | 'gemini'
  | 'deepseek'
  | 'groq'
  | 'openrouter'
  | 'anthropic_acp'
  | 'custom';

export interface ModelInfo {
  id: string;
  name: string;
  provider?: string;
  contextWindow?: number;
}

export interface AIProvider {
  id: string;
  name: string;
  type: ProviderType;
  url: string;
  apiKey: string;
  hasApiKey?: boolean;
  availableModels: ModelInfo[];
  selectedModel: string;
  systemPrompt: string;
  isActive: boolean;
  isFetchingModels?: boolean;
  lastFetchedAt?: string;
}

export type AgentRoleType =
  | 'decompiler'
  | 'patcher'
  | 'frida_tracer'
  | 'auditor'
  | 'swift_demangler'
  | 'acp_agent';

export interface AgentRoleConfig {
  id: AgentRoleType;
  title: string;
  tagline: string;
  assignedProviderId: string;
  assignedModel: string;
  customPrompt: string;
  enabledSkills: string[];
  temperature: number;
  status: 'idle' | 'running' | 'completed' | 'error';
  lastOutput?: string;
}

export interface ACPAgentConfig {
  id: string;
  name: string;
  serverUrl: string;
  transport: 'sse' | 'stdio' | 'websocket';
  capabilities: string[];
  active: boolean;
  status: 'connected' | 'idle' | 'error';
}

export interface AgentSkill {
  id: string;
  name: string;
  description: string;
  source: string;
  tools: string[];
  rawMarkdown: string;
  isBuiltin: boolean;
  enabled: boolean;
  category: 'macho_analysis' | 'frida_hooking' | 'patching' | 'crypto';
}

export interface InstructionLine {
  address: string;
  rawBytes: string;
  mnemonic: string;
  operands: string;
  comment?: string;
  isBranch?: boolean;
  isCall?: boolean;
  isReturn?: boolean;
  patch?: {
    patchedBytes: string;
    patchType: string;
    status: 'pending' | 'applied';
  };
}

export interface XrefItem {
  fromAddr: string;
  funcName: string;
  type: 'call' | 'read' | 'write' | 'jump';
}

export interface DisassemblyFunction {
  id: string;
  address: string;
  name: string;
  demangledName?: string;
  size: number;
  arch: string;
  callingConv: string;
  hlil: string;
  instructions: InstructionLine[];
  xrefs: XrefItem[];
  strings: string[];
}

export interface BinarySample {
  id: string;
  filename: string;
  arch: string;
  format: string; // e.g., Mach-O 64-bit (ARM64), ELF64
  fileSize: string;
  sha256: string;
  functions: DisassemblyFunction[];
}

export interface FridaDevice {
  id: string;
  name: string;
  type: 'usb' | 'local' | 'remote';
  platform: 'ios' | 'android' | 'macos' | 'linux';
  os: string;
  arch: string;
  status: 'connected' | 'busy' | 'disconnected';
  battery: string;
  serverVersion: string;
  transport: string;
}

export interface FridaProcess {
  pid: number;
  name: string;
  bundleId: string;
  arch: string;
  state: string;
}

export interface FridaLogItem {
  id: string;
  timestamp: string;
  level: 'info' | 'success' | 'warn' | 'error' | 'patch' | 'event';
  message: string;
}

export interface PatchRecord {
  id: string;
  binaryName: string;
  functionName: string;
  address: string;
  originalBytes: string;
  patchedBytes: string;
  originalMnemonic: string;
  patchedMnemonic: string;
  strategy: 'nop_sled' | 'invert_branch' | 'force_return_true' | 'force_return_false' | 'custom_hex';
  verifiedArm64: boolean;
  appliedAt: string;
}
