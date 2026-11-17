import React, { useState, useEffect } from 'react';
import {
  AgentRoleConfig,
  AIProvider,
  AgentSkill,
  BinarySample,
  DisassemblyFunction,
} from '../types';
import {
  Sparkles,
  Play,
  Layers,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
} from 'lucide-react';
import { api } from '../services/api';
import { resolveActiveSkillsText } from '../utils/agentIntent';
import { FormattedOutput } from './FormattedOutput';

interface MultiAgentBoardProps {
  roles: AgentRoleConfig[];
  onUpdateRole: (updated: AgentRoleConfig) => void;
  providers: AIProvider[];
  skills: AgentSkill[];
  selectedBinary: BinarySample;
  selectedFunction: DisassemblyFunction;
  globalPrompt?: string;
}

export const MultiAgentBoard: React.FC<MultiAgentBoardProps> = ({
  roles,
  onUpdateRole,
  providers,
  skills,
  selectedBinary,
  selectedFunction,
  globalPrompt,
}) => {
  const [objective, setObjective] = useState(
    `Analyze function ${selectedFunction.demangledName || selectedFunction.name} at ${selectedFunction.address}. Recover algorithm semantics, verify vulnerabilities, calculate an ARM64 patch, and produce an iOS Frida bypass hook.`
  );
  const [hasEditedObjective, setHasEditedObjective] = useState(false);
  const [isDispatchingAll, setIsDispatchingAll] = useState(false);
  const [copiedReport, setCopiedReport] = useState(false);
  const [outputs, setOutputs] = useState<
    Record<string, { output: string; modelUsed: string; timestamp: string; isError?: boolean }>
  >({});

  // Keep default objective synced when switching functions unless manually customized
  useEffect(() => {
    if (!hasEditedObjective) {
      setObjective(
        `Analyze function ${selectedFunction.demangledName || selectedFunction.name} at ${selectedFunction.address}. Recover algorithm semantics, verify vulnerabilities, calculate an ARM64 patch, and produce an iOS Frida bypass hook.`
      );
    }
  }, [selectedFunction.id, selectedBinary.id, hasEditedObjective]);

  const presetObjectives = [
    {
      label: 'Full Reverse Engineering & Bypass Pipeline',
      text: `Analyze function ${selectedFunction.demangledName || selectedFunction.name} at ${selectedFunction.address}. Recover algorithm semantics, verify vulnerabilities, calculate an ARM64 patch, and produce an iOS Frida bypass hook.`,
    },
    {
      label: 'Jailbreak & Anti-Debug Defense Analysis',
      text: `Scan binary ${selectedBinary.filename} for ptrace(PT_DENY_ATTACH), sysctl probes, and file access checks. Generate stealth Frida bypass scripts.`,
    },
    {
      label: 'Swift 5 Demangling & Witness Table Mapping',
      text: `Resolve all Swift mangled symbols, protocol witness tables, and nominal type descriptors in ${selectedBinary.filename}. Document object lifecycle.`,
    },
    {
      label: 'Surgical Binary Patching & Gatekeeper Re-sign',
      text: `Identify conditional jump at ${selectedFunction.address}. Synthesize safe ARM64 opcode replacements and produce Swift Mach-O re-sign script.`,
    },
  ];

  const runAgent = async (roleConfig: AgentRoleConfig) => {
    onUpdateRole({ ...roleConfig, status: 'running' });

    const assignedProvider = providers.find((p) => p.id === roleConfig.assignedProviderId) || providers[0];
    const activeSkills = resolveActiveSkillsText(roleConfig, skills);

    try {
      const res = await api.dispatchRole({
        role: roleConfig.id,
        agentConfig: {
          providerId: assignedProvider?.id,
          providerType: assignedProvider?.type,
          providerUrl: assignedProvider?.url,
          apiKey: assignedProvider?.apiKey,
          model: roleConfig.assignedModel,
          customPrompt: roleConfig.customPrompt,
          globalPrompt,
          temperature: roleConfig.temperature,
          skills: activeSkills,
        },
        objective,
        context: {
          binaryName: selectedBinary.filename,
          arch: selectedBinary.arch,
          functionName: selectedFunction.demangledName || selectedFunction.name,
          address: selectedFunction.address,
          hlil: selectedFunction.hlil,
          assembly: selectedFunction.instructions
            .map((i) => `${i.address}: ${i.rawBytes.padEnd(12)} ${i.mnemonic} ${i.operands}`)
            .join('\n'),
        },
      });

      if (res.success && res.output) {
        onUpdateRole({ ...roleConfig, status: 'completed', lastOutput: res.output });
        setOutputs((prev) => ({
          ...prev,
          [roleConfig.id]: {
            output: res.output,
            modelUsed: res.modelUsed || roleConfig.assignedModel,
            timestamp: new Date().toLocaleTimeString(),
          },
        }));
      } else {
        onUpdateRole({ ...roleConfig, status: 'error' });
        setOutputs((prev) => ({
          ...prev,
          [roleConfig.id]: {
            output: res.error || 'Agent dispatch failed. Verify AI provider credentials or model configuration.',
            modelUsed: roleConfig.assignedModel,
            timestamp: new Date().toLocaleTimeString(),
            isError: true,
          },
        }));
      }
    } catch (err: any) {
      onUpdateRole({ ...roleConfig, status: 'error' });
      setOutputs((prev) => ({
        ...prev,
        [roleConfig.id]: {
          output: err.message || 'Network failure dispatching role.',
          modelUsed: roleConfig.assignedModel,
          timestamp: new Date().toLocaleTimeString(),
          isError: true,
        },
      }));
    }
  };

  const handleDispatchAll = async () => {
    setIsDispatchingAll(true);
    try {
      await Promise.all(roles.map((role) => runAgent(role)));
    } finally {
      setIsDispatchingAll(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-53px)] bg-[#090d14] text-slate-200">
      {/* Top Objective Dispatch Toolbar */}
      <div className="p-5 bg-[#0d121c] border-b border-slate-800/80 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-semibold text-white">Multi-Agent Task Dispatcher</span>
            <span className="text-slate-600 font-mono">·</span>
            <span className="text-xs text-slate-400 font-mono">
              Target: {selectedBinary.filename} → {selectedFunction.demangledName || selectedFunction.name}
            </span>
          </div>

          <button
            onClick={handleDispatchAll}
            disabled={isDispatchingAll || !objective.trim()}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-md transition-all shadow-sm disabled:opacity-50"
          >
            <Play className="w-3.5 h-3.5 fill-slate-950" />
            <span>{isDispatchingAll ? 'Coordinating All Agents...' : `Dispatch All ${roles.length} Agents`}</span>
          </button>
        </div>

        <textarea
          value={objective}
          onChange={(e) => {
            setHasEditedObjective(true);
            setObjective(e.target.value);
          }}
          rows={2}
          placeholder="Describe overall reverse engineering objective for the team..."
          className="w-full bg-[#0a0d15] border border-slate-700/80 rounded-lg p-3 text-xs text-slate-100 placeholder-slate-500 font-mono focus:outline-none focus:border-cyan-500 leading-relaxed resize-none"
        />

        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pt-1">
          <span className="text-[11px] text-slate-500 shrink-0 font-medium">Quick Objective:</span>
          {presetObjectives.map((p, idx) => (
            <button
              key={idx}
              onClick={() => {
                setHasEditedObjective(true);
                setObjective(p.text);
              }}
              className="px-2.5 py-1 text-[11px] bg-slate-800/60 hover:bg-slate-800 text-slate-300 rounded border border-slate-700/60 transition-colors whitespace-nowrap shrink-0"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Container */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Column: Role Configuration Matrix */}
        <div className="w-[480px] bg-[#0c1018] border-r border-slate-800/80 flex flex-col shrink-0 overflow-y-auto">
          <div className="p-4 border-b border-slate-800 bg-[#0e131d] flex items-center justify-between">
            <div className="text-xs font-semibold text-white">Agent Roles & Provider Assignments</div>
            <span className="text-[11px] text-slate-400 font-mono">{roles.length} Roles Active</span>
          </div>

          <div className="p-4 space-y-4 divide-y divide-slate-800/60">
            {roles.map((role) => {
              const assignedProv = providers.find((p) => p.id === role.assignedProviderId) || providers[0];
              const availableModels = assignedProv?.availableModels || [];

              return (
                <div key={role.id} className="pt-4 first:pt-0 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-bold text-white text-xs flex items-center gap-2">
                        <span>{role.title}</span>
                        {role.status === 'completed' && (
                          <span className="text-[10px] text-emerald-400 flex items-center gap-0.5">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Done</span>
                          </span>
                        )}
                        {role.status === 'running' && (
                          <span className="text-[10px] text-cyan-400 flex items-center gap-0.5 animate-pulse">
                            <Sparkles className="w-3 h-3" />
                            <span>Running...</span>
                          </span>
                        )}
                        {role.status === 'error' && (
                          <span className="text-[10px] text-rose-400 flex items-center gap-0.5">
                            <AlertCircle className="w-3 h-3" />
                            <span>Error</span>
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5 leading-snug">{role.tagline}</div>
                    </div>

                    <button
                      onClick={() => runAgent(role)}
                      disabled={role.status === 'running'}
                      className="px-2.5 py-1 text-xs font-medium text-cyan-300 bg-cyan-950/40 hover:bg-cyan-900/60 rounded border border-cyan-800/60 transition-colors shrink-0 disabled:opacity-50"
                    >
                      Run Solo
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                    <div>
                      <label className="text-[10px] text-slate-500 block mb-1">AI Provider</label>
                      <select
                        value={role.assignedProviderId}
                        onChange={(e) => {
                          const newProv = providers.find((p) => p.id === e.target.value);
                          onUpdateRole({
                            ...role,
                            assignedProviderId: e.target.value,
                            assignedModel: newProv?.selectedModel || newProv?.availableModels[0]?.id || role.assignedModel,
                          });
                        }}
                        className="w-full bg-slate-900 border border-slate-700 text-slate-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-cyan-500"
                      >
                        {providers.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] text-slate-500 block mb-1">Model Selection</label>
                      <select
                        value={role.assignedModel}
                        onChange={(e) => {
                          onUpdateRole({ ...role, assignedModel: e.target.value });
                        }}
                        className="w-full bg-slate-900 border border-slate-700 text-cyan-300 rounded px-2 py-1 text-xs focus:outline-none focus:border-cyan-500"
                      >
                        {availableModels.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name || m.id}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] text-slate-500 block mb-1">Behavior & Prompt Directive</label>
                    <input
                      type="text"
                      value={role.customPrompt}
                      onChange={(e) => onUpdateRole({ ...role, customPrompt: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-xs text-slate-300 font-mono focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Execution Output Canvas & Synthesized Report */}
        <div className="flex-1 flex flex-col bg-[#070a10] overflow-hidden">
          <div className="p-3 bg-[#0d121c] border-b border-slate-800 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <Layers className="w-3.5 h-3.5 text-cyan-400" />
              <span className="font-semibold text-white">Agent Outputs & Synthesized Reverse Engineering Dossier</span>
            </div>

            <button
              onClick={() => {
                const fullText = Object.entries(outputs)
                  .map(([k, v]) => `=== [AGENT: ${k.toUpperCase()}] (Model: ${v.modelUsed}) ===\n${v.output}`)
                  .join('\n\n');
                navigator.clipboard.writeText(fullText);
                setCopiedReport(true);
                setTimeout(() => setCopiedReport(false), 1800);
              }}
              disabled={Object.keys(outputs).length === 0}
              className="flex items-center gap-1.5 px-3 py-1 text-slate-300 hover:text-white bg-slate-800 rounded border border-slate-700 text-xs disabled:opacity-50"
            >
              {copiedReport ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              <span>{copiedReport ? 'Copied' : 'Copy Full Report'}</span>
            </button>
          </div>

          <div className="flex-1 p-6 overflow-y-auto space-y-6">
            {Object.keys(outputs).length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-3">
                <div className="w-16 h-16 rounded-2xl overflow-hidden border border-slate-800 mb-2">
                  <img
                    src="/src/assets/images/agent_decompiler_icon_1794908643317.jpg"
                    alt="Agent Decompiler Icon"
                    className="w-full h-full object-cover"
                  />
                </div>
                <h3 className="text-base font-semibold text-white">Multi-Agent Reverse Engineering Team Ready</h3>
                <p className="text-xs text-slate-400 max-w-md leading-relaxed">
                  Assign each agent role to your preferred AI model from any OpenAI-compatible endpoint or Gemini, then click "Dispatch All {roles.length} Agents" to start parallel analysis.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {roles.map((role) => {
                  const out = outputs[role.id];
                  if (!out) return null;

                  return (
                    <div
                      key={role.id}
                      className={`rounded-xl overflow-hidden shadow-lg border ${
                        out.isError ? 'bg-rose-950/20 border-rose-800/60' : 'bg-[#0b0f17] border-slate-800'
                      }`}
                    >
                      <div className="p-3 bg-[#0e131f] border-b border-slate-800 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className={`font-bold ${out.isError ? 'text-rose-400' : 'text-cyan-400'}`}>
                            {role.title}
                          </span>
                          <span className="text-slate-600 font-mono">·</span>
                          <span className="text-slate-400 font-mono text-[11px]">{out.modelUsed}</span>
                        </div>
                        <span className="text-[10px] text-slate-500 font-mono">{out.timestamp}</span>
                      </div>
                      <div className="p-4 text-xs text-slate-200 bg-[#080b12]">
                        <FormattedOutput text={out.output} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
