import React, { useState } from 'react';
import {
  AIProvider,
  AgentSkill,
  ACPAgentConfig,
  ModelInfo,
} from '../types';
import {
  Settings,
  Plus,
  RefreshCw,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Github,
  FileCode,
  Sparkles,
  Layers,
  Key,
  Globe,
  Sliders,
  Terminal,
  ExternalLink,
  Shield,
  Zap,
} from 'lucide-react';
import { api } from '../services/api';

interface SettingsStudioProps {
  providers: AIProvider[];
  onAddProvider: (p: AIProvider) => void;
  onUpdateProvider: (p: AIProvider) => void;
  onDeleteProvider: (id: string) => void;
  skills: AgentSkill[];
  onAddSkill: (s: AgentSkill) => void;
  onToggleSkill: (id: string) => void;
  acpAgents: ACPAgentConfig[];
  onAddACPAgent: (a: ACPAgentConfig) => void;
  onToggleACPAgent: (id: string) => void;
  globalPrompt: string;
  onUpdateGlobalPrompt: (prompt: string) => void;
}

export const SettingsStudio: React.FC<SettingsStudioProps> = ({
  providers,
  onAddProvider,
  onUpdateProvider,
  onDeleteProvider,
  skills,
  onAddSkill,
  onToggleSkill,
  acpAgents,
  onAddACPAgent,
  onToggleACPAgent,
  globalPrompt,
  onUpdateGlobalPrompt,
}) => {
  const [activeTab, setActiveTab] = useState<'providers' | 'prompts' | 'skills' | 'acp'>('providers');

  // New Provider Form State
  const [newProvName, setNewProvName] = useState('');
  const [newProvType, setNewProvType] = useState<AIProvider['type']>('openai_compatible');
  const [newProvUrl, setNewProvUrl] = useState('');
  const [newProvApiKey, setNewProvApiKey] = useState('');
  const [discoveredModels, setDiscoveredModels] = useState<ModelInfo[]>([]);
  const [selectedDiscoveredModel, setSelectedDiscoveredModel] = useState('');
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);

  // New Skill Form State
  const [skillSourceInput, setSkillSourceInput] = useState('');
  const [isFetchingSkill, setIsFetchingSkill] = useState(false);
  const [skillFetchError, setSkillFetchError] = useState<string | null>(null);

  // New ACP Agent Form State
  const [acpName, setAcpName] = useState('');
  const [acpUrl, setAcpUrl] = useState('http://localhost:8080/acp');
  const [acpTransport, setAcpTransport] = useState<'sse' | 'stdio' | 'websocket'>('sse');

  // Trigger dynamic model discovery when user enters url & key
  const handleDiscoverModels = async (url: string, apiKey: string, type: string) => {
    setIsDiscovering(true);
    setDiscoveryError(null);
    setDiscoveredModels([]);

    try {
      const res = await api.fetchModels(url, apiKey, type);
      if (res.success && res.models.length > 0) {
        setDiscoveredModels(res.models);
        setSelectedDiscoveredModel(res.models[0].id);
      } else {
        setDiscoveryError(res.error || 'No models returned from provider endpoint');
      }
    } catch (err: any) {
      setDiscoveryError(err.message || 'Connection failed');
    } finally {
      setIsDiscovering(false);
    }
  };

  // Add new provider to list
  const handleCreateProvider = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProvName.trim()) return;

    const created: AIProvider = {
      id: `prov_${Date.now()}`,
      name: newProvName.trim(),
      type: newProvType,
      url: newProvUrl.trim(),
      apiKey: newProvApiKey.trim(),
      availableModels: discoveredModels.length > 0 ? discoveredModels : [
        { id: selectedDiscoveredModel || 'default-model', name: selectedDiscoveredModel || 'Default Model' }
      ],
      selectedModel: selectedDiscoveredModel || (discoveredModels[0]?.id || 'default-model'),
      systemPrompt: globalPrompt,
      isActive: true,
      lastFetchedAt: new Date().toLocaleTimeString(),
    };

    onAddProvider(created);
    setNewProvName('');
    setNewProvUrl('');
    setNewProvApiKey('');
    setDiscoveredModels([]);
    setSelectedDiscoveredModel('');
  };

  // Install Skill from GitHub or markdown
  const handleInstallSkill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!skillSourceInput.trim()) return;

    setIsFetchingSkill(true);
    setSkillFetchError(null);

    try {
      const res = await api.fetchSkill(skillSourceInput.trim());
      if (res.success && res.skill) {
        onAddSkill(res.skill);
        setSkillSourceInput('');
      } else {
        setSkillFetchError(res.error || 'Failed to parse skill markdown');
      }
    } catch (err: any) {
      setSkillFetchError(err.message || 'Error importing skill');
    } finally {
      setIsFetchingSkill(false);
    }
  };

  // Add ACP Agent
  const handleCreateACPAgent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!acpName.trim()) return;

    const agent: ACPAgentConfig = {
      id: `acp_${Date.now()}`,
      name: acpName.trim(),
      serverUrl: acpUrl.trim(),
      transport: acpTransport,
      capabilities: ['read_disasm', 'write_patch', 'query_xrefs', 'modify_hlil'],
      active: true,
      status: 'connected',
    };
    onAddACPAgent(agent);
    setAcpName('');
    setAcpUrl('http://localhost:8080/acp');
  };

  // Prompt Presets
  const promptPresets = [
    {
      title: 'Mimir Autonomous Reverse Engineer',
      description: 'Aggressive decompilation, in-depth control-flow flattening recovery, and autonomous patch calculation.',
      prompt: `You are Mimir, an elite Binary Ninja and Frida autonomous reverse engineering agent.
- Prioritize high-level semantics and type reconstruction from HLIL.
- Automatically detect protection mechanisms (anti-debugging, jailbreak detection, SSL pinning, hardware enclave verification).
- When asked to /modify or /patch, calculate surgical ARM64 opcodes and verify 4-byte boundaries.
- For dynamic tasks, write robust, type-checked Frida hooks for iOS/macOS Swift & Objective-C runtimes.`,
    },
    {
      title: 'Stealth Frida & Anti-Anti-Hooking',
      description: 'Zero-footprint instrumentation, cloaking Frida threads, and bypassing runtime integrity checkers.',
      prompt: `You are a stealth mobile instrumentation specialist for iOS and Android.
- Never trigger integrity alerts or thread enumeration scans.
- Use low-level Interceptor.attach with safe pointer dereferencing.
- Neutralize ptrace(PT_DENY_ATTACH), sysctl probes, and jailbreak file access.
- Demangle Swift method calls and safely hook Swift metadata tables.`,
    },
    {
      title: 'Zero-Crash Surgical Patcher',
      description: 'Strict adherence to ARM64 instruction displacement boundaries and macOS Gatekeeper code-signing.',
      prompt: `You are the Smart Binary Patcher engine for Mach-O ARM64 binaries.
- Ensure every patch strictly preserves register invariants (x19-x28, sp).
- Output exact hex opcodes with no alignment violations.
- Always provide codesign commands (--force --deep -s -) for macOS gatekeeper compliance.`,
    },
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-53px)] bg-[#090d14] text-slate-200">
      {/* Settings Navigation Tabs */}
      <div className="px-6 py-3 bg-[#0d121c] border-b border-slate-800/80 flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-2">
          <Settings className="w-4 h-4 text-cyan-400" />
          <span className="text-xs font-semibold text-white">Mimir Orchestrator Settings</span>
          <span className="text-slate-600 font-mono">·</span>
          <span className="text-xs text-slate-400 font-mono">OpenAI Endpoints, Prompts, ACP & Skills</span>
        </div>

        <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded border border-slate-800">
          <button
            onClick={() => setActiveTab('providers')}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
              activeTab === 'providers' ? 'bg-cyan-500/20 text-cyan-300 font-semibold' : 'text-slate-400 hover:text-white'
            }`}
          >
            AI Providers ({providers.length})
          </button>
          <button
            onClick={() => setActiveTab('prompts')}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
              activeTab === 'prompts' ? 'bg-cyan-500/20 text-cyan-300 font-semibold' : 'text-slate-400 hover:text-white'
            }`}
          >
            Prompt & Behavior
          </button>
          <button
            onClick={() => setActiveTab('acp')}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
              activeTab === 'acp' ? 'bg-cyan-500/20 text-cyan-300 font-semibold' : 'text-slate-400 hover:text-white'
            }`}
          >
            ACP Agents ({acpAgents.length})
          </button>
          <button
            onClick={() => setActiveTab('skills')}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
              activeTab === 'skills' ? 'bg-cyan-500/20 text-cyan-300 font-semibold' : 'text-slate-400 hover:text-white'
            }`}
          >
            Agent Skills ({skills.length})
          </button>
        </div>
      </div>

      {/* Main Settings Content Area */}
      <div className="flex-1 overflow-y-auto p-6 max-w-6xl w-full mx-auto space-y-6">
        {/* ======================================================== */}
        {/* TAB 1: AI PROVIDERS & DYNAMIC MODEL DISCOVERY */}
        {/* ======================================================== */}
        {activeTab === 'providers' && (
          <div className="space-y-6">
            {/* Add New Provider Card */}
            <div className="bg-[#0c1018] rounded-xl border border-slate-800 p-6 space-y-4 shadow-lg">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Globe className="w-4 h-4 text-cyan-400" />
                    <span>Connect AI Provider (OpenAI Compatible Endpoint)</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Enter any OpenAI-compatible API URL and your API Key. Available models will automatically appear in the dropdown.
                  </p>
                </div>
              </div>

              <form onSubmit={handleCreateProvider} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1 font-medium">Provider Name</label>
                    <input
                      type="text"
                      placeholder="e.g. My Local Ollama / OpenRouter"
                      value={newProvName}
                      onChange={(e) => setNewProvName(e.target.value)}
                      required
                      className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-slate-400 block mb-1 font-medium">Endpoint Format</label>
                    <select
                      value={newProvType}
                      onChange={(e) => {
                        const val = e.target.value as any;
                        setNewProvType(val);
                        if (val === 'ollama') setNewProvUrl('http://localhost:11434/v1');
                        if (val === 'deepseek') setNewProvUrl('https://api.deepseek.com/v1');
                        if (val === 'groq') setNewProvUrl('https://api.groq.com/openai/v1');
                        if (val === 'openrouter') setNewProvUrl('https://openrouter.ai/api/v1');
                        if (val === 'gemini') setNewProvUrl('');
                      }}
                      className="w-full bg-slate-900 border border-slate-700 text-slate-200 rounded px-3 py-2 text-xs focus:outline-none focus:border-cyan-500"
                    >
                      <option value="openai_compatible">OpenAI Compatible (Any URL)</option>
                      <option value="ollama">Ollama Local (Mac M-Series)</option>
                      <option value="gemini">Google Gemini Engine</option>
                      <option value="deepseek">DeepSeek API</option>
                      <option value="groq">Groq Fast Inference</option>
                      <option value="openrouter">OpenRouter API</option>
                      <option value="custom">Custom Proxy / vLLM</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs text-slate-400 block mb-1 font-medium">API Base URL</label>
                    <input
                      type="text"
                      placeholder="https://api.openai.com/v1 or http://localhost:11434/v1"
                      value={newProvUrl}
                      onChange={(e) => setNewProvUrl(e.target.value)}
                      disabled={newProvType === 'gemini'}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-xs text-cyan-300 font-mono focus:outline-none focus:border-cyan-500 disabled:opacity-50"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1 font-medium">API Key (Optional for Local Ollama)</label>
                    <input
                      type="password"
                      placeholder="sk-..."
                      value={newProvApiKey}
                      onChange={(e) => setNewProvApiKey(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  {/* Dynamic Model Discovery Trigger & Dropdown */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs text-slate-400 font-medium">Available Models</label>
                      <button
                        type="button"
                        onClick={() => handleDiscoverModels(newProvUrl, newProvApiKey, newProvType)}
                        disabled={isDiscovering || (newProvType !== 'gemini' && !newProvUrl.trim())}
                        className="text-[11px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-mono disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3 h-3 ${isDiscovering ? 'animate-spin' : ''}`} />
                        <span>Discover Models</span>
                      </button>
                    </div>

                    {discoveredModels.length > 0 ? (
                      <select
                        value={selectedDiscoveredModel}
                        onChange={(e) => setSelectedDiscoveredModel(e.target.value)}
                        className="w-full bg-slate-900 border border-cyan-500/80 text-cyan-300 rounded px-3 py-2 text-xs font-mono focus:outline-none"
                      >
                        {discoveredModels.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name || m.id}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          placeholder="Click 'Discover Models' or type model ID manually..."
                          value={selectedDiscoveredModel}
                          onChange={(e) => setSelectedDiscoveredModel(e.target.value)}
                          className="flex-1 bg-slate-900 border border-slate-700 rounded px-3 py-2 text-xs text-slate-300 font-mono focus:outline-none focus:border-cyan-500"
                        />
                      </div>
                    )}
                  </div>
                </div>

                {discoveryError && (
                  <div className="p-3 bg-rose-950/30 border border-rose-800/60 rounded text-xs text-rose-300 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>Discovery Notice: {discoveryError}</span>
                  </div>
                )}

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={!newProvName.trim()}
                    className="flex items-center gap-2 px-5 py-2 text-xs font-semibold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-md transition-all shadow-sm disabled:opacity-50"
                  >
                    <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>Save AI Provider</span>
                  </button>
                </div>
              </form>
            </div>

            {/* Configured Providers List */}
            <div className="bg-[#0c1018] rounded-xl border border-slate-800 p-6 space-y-4 shadow-lg">
              <h3 className="text-sm font-bold text-white flex items-center justify-between">
                <span>Configured AI Providers ({providers.length})</span>
                <span className="text-xs text-slate-400 font-normal">Mix and match in Multi-Agent Board</span>
              </h3>

              <div className="divide-y divide-slate-800 font-mono text-xs">
                {providers.map((prov) => (
                  <div key={prov.id} className="py-4 first:pt-0 flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-sm font-sans">{prov.name}</span>
                        <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-mono uppercase">
                          {prov.type}
                        </span>
                        {prov.isActive && (
                          <span className="text-[11px] text-emerald-400 flex items-center gap-1 font-sans">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Active</span>
                          </span>
                        )}
                      </div>

                      <div className="text-slate-400 text-xs">
                        {prov.url ? (
                          <span className="text-cyan-400/90">{prov.url}</span>
                        ) : (
                          <span className="text-slate-500">Injected AI Studio Server Key</span>
                        )}
                      </div>

                      <div className="text-slate-400 text-xs flex items-center gap-2 mt-1">
                        <span>Selected Model:</span>
                        <select
                          value={prov.selectedModel}
                          onChange={(e) => {
                            onUpdateProvider({ ...prov, selectedModel: e.target.value });
                          }}
                          className="bg-slate-900 border border-slate-700 text-cyan-300 rounded px-2 py-0.5 text-xs focus:outline-none"
                        >
                          {prov.availableModels.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name || m.id}
                            </option>
                          ))}
                        </select>
                        <span className="text-slate-600">·</span>
                        <span className="text-slate-500">{prov.availableModels.length} models available</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleDiscoverModels(prov.url, prov.apiKey, prov.type)}
                        className="p-1.5 text-slate-400 hover:text-cyan-300 rounded bg-slate-800/60 border border-slate-700"
                        title="Re-query /v1/models"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => onDeleteProvider(prov.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-400 rounded bg-slate-800/60 border border-slate-700"
                        title="Remove provider"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 2: PROMPT SECTION (AGENT BEHAVIOR SPECIFICATION) */}
        {/* ======================================================== */}
        {activeTab === 'prompts' && (
          <div className="space-y-6">
            <div className="bg-[#0c1018] rounded-xl border border-slate-800 p-6 space-y-4 shadow-lg">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-cyan-400" />
                  <span>Agent Behavior & System Directives</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Specify how the AI reverse engineering agents reason, format opcodes, generate Frida hooks, and handle binary protections.
                </p>
              </div>

              {/* Behavior Presets */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
                {promptPresets.map((preset, idx) => (
                  <div
                    key={idx}
                    onClick={() => onUpdateGlobalPrompt(preset.prompt)}
                    className="p-3.5 rounded-lg border border-slate-800 bg-slate-900/60 hover:border-cyan-500/60 cursor-pointer transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="text-xs font-bold text-white mb-1">{preset.title}</div>
                      <div className="text-[11px] text-slate-400 leading-snug">{preset.description}</div>
                    </div>
                    <span className="text-[10px] text-cyan-400 mt-3 font-semibold">Apply Preset &rarr;</span>
                  </div>
                ))}
              </div>

              {/* System Prompt Textarea */}
              <div className="space-y-2 pt-2">
                <label className="text-xs text-slate-400 font-medium block">
                  Active System Prompt Directive
                </label>
                <textarea
                  value={globalPrompt}
                  onChange={(e) => onUpdateGlobalPrompt(e.target.value)}
                  rows={8}
                  className="w-full bg-[#080b12] border border-slate-700/80 rounded-lg p-3.5 text-xs text-slate-200 font-mono leading-relaxed focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="flex justify-between items-center text-xs text-slate-500 pt-2 border-t border-slate-800 font-mono">
                <span>Prompt Length: {globalPrompt.length} chars</span>
                <span className="text-emerald-400">Auto-saved to Agent Pipeline</span>
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 3: ACP (AGENT CLIENT PROTOCOL) AGENTS */}
        {/* ======================================================== */}
        {activeTab === 'acp' && (
          <div className="space-y-6">
            <div className="bg-[#0c1018] rounded-xl border border-slate-800 p-6 space-y-4 shadow-lg">
              <div className="border-b border-slate-800/80 pb-3">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Zap className="w-4 h-4 text-cyan-400" />
                  <span>Agent Client Protocol (ACP) Agents</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Connect autonomous external reverse engineering agents via ACP. Enables bi-directional tool execution and intermediate language modification.
                </p>
              </div>

              {/* Add ACP Form */}
              <form onSubmit={handleCreateACPAgent} className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">ACP Agent Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Local Binary Ninja ACP Worker"
                    value={acpName}
                    onChange={(e) => setAcpName(e.target.value)}
                    required
                    className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">ACP Server Endpoint (URL / Port)</label>
                  <input
                    type="text"
                    value={acpUrl}
                    onChange={(e) => setAcpUrl(e.target.value)}
                    required
                    className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-xs text-cyan-300 font-mono focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Client Transport</label>
                  <div className="flex items-center gap-2">
                    <select
                      value={acpTransport}
                      onChange={(e) => setAcpTransport(e.target.value as any)}
                      className="w-full bg-slate-900 border border-slate-700 text-slate-200 rounded px-3 py-2 text-xs focus:outline-none"
                    >
                      <option value="sse">Server-Sent Events (SSE)</option>
                      <option value="websocket">WebSocket Bridge</option>
                      <option value="stdio">Stdio Process</option>
                    </select>
                    <button
                      type="submit"
                      disabled={!acpName.trim()}
                      className="px-4 py-2 bg-cyan-400 text-slate-950 font-semibold rounded text-xs whitespace-nowrap hover:bg-cyan-300 disabled:opacity-50"
                    >
                      Add ACP
                    </button>
                  </div>
                </div>
              </form>
            </div>

            {/* Installed ACP Agents */}
            <div className="bg-[#0c1018] rounded-xl border border-slate-800 p-6 space-y-4 shadow-lg">
              <h3 className="text-sm font-bold text-white">Configured ACP Agents ({acpAgents.length})</h3>

              <div className="divide-y divide-slate-800 font-mono text-xs">
                {acpAgents.map((agent) => (
                  <div key={agent.id} className="py-3.5 first:pt-0 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-xs font-sans">{agent.name}</span>
                        <span className="text-[10px] bg-cyan-950 text-cyan-300 border border-cyan-800 px-1.5 py-0.5 rounded">
                          {agent.transport.toUpperCase()}
                        </span>
                        <span className="text-[11px] text-emerald-400 flex items-center gap-1 font-sans">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Ready</span>
                        </span>
                      </div>
                      <div className="text-slate-500 text-[11px] mt-0.5">{agent.serverUrl}</div>
                      <div className="text-slate-400 text-[10px] mt-1">
                        Capabilities: {agent.capabilities.join(', ')}
                      </div>
                    </div>

                    <button
                      onClick={() => onToggleACPAgent(agent.id)}
                      className={`px-3 py-1 rounded text-xs font-sans font-medium transition-colors ${
                        agent.active
                          ? 'bg-emerald-950/40 text-emerald-300 border border-emerald-800/60'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {agent.active ? 'Active' : 'Disabled'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 4: AGENT SKILLS (skills.md / GitHub) */}
        {/* ======================================================== */}
        {activeTab === 'skills' && (
          <div className="space-y-6">
            <div className="bg-[#0c1018] rounded-xl border border-slate-800 p-6 space-y-4 shadow-lg">
              <div className="border-b border-slate-800/80 pb-3">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <FileCode className="w-4 h-4 text-cyan-400" />
                  <span>Install Agent Skills (skills.md or GitHub Link)</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Add domain-specific reverse engineering capabilities, opcode recipes, or Frida bypass routines by providing a GitHub repo or raw skills.md markdown.
                </p>
              </div>

              <form onSubmit={handleInstallSkill} className="space-y-3 pt-2">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="e.g. https://github.com/buzzer-re/Rikugan/blob/main/skills.md or raw markdown URL"
                    value={skillSourceInput}
                    onChange={(e) => setSkillSourceInput(e.target.value)}
                    required
                    className="flex-1 bg-slate-900 border border-slate-700 rounded px-3 py-2 text-xs text-cyan-300 font-mono focus:outline-none focus:border-cyan-500"
                  />
                  <button
                    type="submit"
                    disabled={isFetchingSkill || !skillSourceInput.trim()}
                    className="flex items-center gap-1.5 px-4 py-2 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-semibold rounded text-xs transition-colors disabled:opacity-50"
                  >
                    <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>{isFetchingSkill ? 'Fetching...' : 'Install Skill'}</span>
                  </button>
                </div>

                {skillFetchError && (
                  <div className="p-3 bg-rose-950/30 border border-rose-800/60 rounded text-xs text-rose-300 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{skillFetchError}</span>
                  </div>
                )}
              </form>
            </div>

            {/* Installed Skills Library */}
            <div className="bg-[#0c1018] rounded-xl border border-slate-800 p-6 space-y-4 shadow-lg">
              <h3 className="text-sm font-bold text-white flex items-center justify-between">
                <span>Installed Reverse Engineering Skills ({skills.length})</span>
                <span className="text-xs text-slate-400 font-normal">Available across all agent roles</span>
              </h3>

              <div className="divide-y divide-slate-800 text-xs">
                {skills.map((skill) => (
                  <div key={skill.id} className="py-4 first:pt-0 flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-sm">{skill.name}</span>
                        {skill.isBuiltin && (
                          <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-mono">
                            Built-in
                          </span>
                        )}
                        <span className="text-[10px] text-cyan-400 font-mono">
                          Source: {skill.source}
                        </span>
                      </div>
                      <div className="text-slate-400 text-xs leading-relaxed max-w-2xl">
                        {skill.description}
                      </div>
                      <div className="flex items-center gap-1.5 pt-1 font-mono text-[11px] text-slate-500">
                        <span>Exported Tools:</span>
                        {skill.tools.map((t, idx) => (
                          <span key={idx} className="bg-slate-900 border border-slate-800 px-1.5 py-0.5 rounded text-cyan-300">
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>

                    <button
                      onClick={() => onToggleSkill(skill.id)}
                      className={`px-3 py-1 rounded text-xs font-medium transition-colors shrink-0 ${
                        skill.enabled
                          ? 'bg-emerald-950/40 text-emerald-300 border border-emerald-800/60'
                          : 'bg-slate-800 text-slate-400 border border-slate-700'
                      }`}
                    >
                      {skill.enabled ? 'Enabled' : 'Disabled'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
