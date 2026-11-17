import React, { useState, useEffect, useMemo } from 'react';
import {
  BinarySample,
  DisassemblyFunction,
  InstructionLine,
  AIProvider,
  AgentRoleConfig,
  AgentSkill,
  PatchRecord,
} from '../types';
import {
  Code2,
  FileCode,
  Network,
  Search,
  Sparkles,
  Zap,
  Send,
  Terminal,
  Cpu,
  Bot,
  Copy,
  Check,
  GitBranch,
} from 'lucide-react';
import { MimirFloatingChat } from './MimirFloatingChat';
import { executeNaturalLanguageIntent } from '../utils/agentIntent';
import { FormattedOutput } from './FormattedOutput';

interface DisassemblyWorkspaceProps {
  binaries: BinarySample[];
  selectedBinary: BinarySample;
  onSelectBinary: (b: BinarySample) => void;
  selectedFunction: DisassemblyFunction;
  onSelectFunction: (f: DisassemblyFunction) => void;
  onNavigateToPatcher: (targetAddress?: string) => void;
  onNavigateToFrida: (hookTarget?: string) => void;
  onApplyPatch?: (patch: PatchRecord) => void;
  patches?: PatchRecord[];
  providers: AIProvider[];
  roles: AgentRoleConfig[];
  skills?: AgentSkill[];
  globalPrompt?: string;
}

interface BasicBlock {
  id: string;
  startAddr: string;
  instructions: InstructionLine[];
  branchTarget?: string;
  fallthroughAddr?: string;
  endsWithReturn: boolean;
}

function buildControlFlowBlocks(instructions: InstructionLine[]): BasicBlock[] {
  if (instructions.length === 0) return [];

  // Identify block leaders (first instruction, branch targets, instructions after branches/returns)
  const leaderAddresses = new Set<string>([instructions[0].address]);
  for (let i = 0; i < instructions.length; i++) {
    const inst = instructions[i];
    if (inst.isBranch || inst.isReturn) {
      if (inst.isBranch && inst.operands) {
        const addrMatch = inst.operands.match(/0x[0-9a-fA-F]+/);
        if (addrMatch) leaderAddresses.add(addrMatch[0].toLowerCase());
      }
      if (i + 1 < instructions.length) {
        leaderAddresses.add(instructions[i + 1].address.toLowerCase());
      }
    }
  }

  const blocks: BasicBlock[] = [];
  let current: InstructionLine[] = [];

  for (let i = 0; i < instructions.length; i++) {
    const inst = instructions[i];
    const isLeader = i > 0 && leaderAddresses.has(inst.address.toLowerCase());
    if (isLeader && current.length > 0) {
      const last = current[current.length - 1];
      const addrMatch = last.isBranch ? last.operands.match(/0x[0-9a-fA-F]+/) : null;
      blocks.push({
        id: `bb_${current[0].address}`,
        startAddr: current[0].address,
        instructions: current,
        branchTarget: addrMatch ? addrMatch[0] : undefined,
        fallthroughAddr: !last.isReturn ? inst.address : undefined,
        endsWithReturn: Boolean(last.isReturn),
      });
      current = [];
    }
    current.push(inst);
  }

  if (current.length > 0) {
    const last = current[current.length - 1];
    const addrMatch = last.isBranch ? last.operands.match(/0x[0-9a-fA-F]+/) : null;
    blocks.push({
      id: `bb_${current[0].address}`,
      startAddr: current[0].address,
      instructions: current,
      branchTarget: addrMatch ? addrMatch[0] : undefined,
      endsWithReturn: Boolean(last.isReturn),
    });
  }

  return blocks;
}

export const DisassemblyWorkspace: React.FC<DisassemblyWorkspaceProps> = ({
  binaries,
  selectedBinary,
  onSelectBinary,
  selectedFunction,
  onSelectFunction,
  onNavigateToPatcher,
  onNavigateToFrida,
  onApplyPatch,
  patches = [],
  providers,
  roles,
  skills,
  globalPrompt,
}) => {
  const [viewMode, setViewMode] = useState<'disasm' | 'hlil' | 'cfg'>('disasm');
  const [functionSearch, setFunctionSearch] = useState('');
  const [activeLeftTab, setActiveLeftTab] = useState<'functions' | 'strings' | 'xrefs'>('functions');
  const [selectedInstruction, setSelectedInstruction] = useState<InstructionLine | null>(
    selectedFunction.instructions[0] || null
  );
  const [copiedHlil, setCopiedHlil] = useState(false);

  // Floating Mimir AI Agent Popup State (closed by default to keep disassembly unobstructed, toggleable from dock or header)
  const [isMimirPopupOpen, setIsMimirPopupOpen] = useState(false);

  // Mimir Agent Console State
  const [agentInput, setAgentInput] = useState('');
  const [consoleLogs, setConsoleLogs] = useState<Array<{ sender: string; text: string; time: string; type?: string }>>([
    {
      sender: 'Mimir Core',
      text: `Mimir autonomous Binary Ninja & Frida agent initialized for ${selectedBinary.filename} (${selectedBinary.arch}). Type queries like "find purchase related functions." or "patch this function to return true" to act.`,
      time: 'Ready',
      type: 'system',
    },
  ]);
  const [isProcessing, setIsProcessing] = useState(false);

  // Keep selectedInstruction synced when selectedFunction changes
  useEffect(() => {
    setSelectedInstruction(selectedFunction.instructions[0] || null);
  }, [selectedFunction.id]);

  // Index active patches by address for O(1) inline lookup
  const patchByAddress = useMemo(() => {
    const map = new Map<string, PatchRecord>();
    for (const p of patches) {
      if (p.binaryName === selectedBinary.filename) {
        map.set(p.address.toLowerCase(), p);
      }
    }
    return map;
  }, [patches, selectedBinary.filename]);

  const filteredFunctions = useMemo(() => {
    const q = functionSearch.toLowerCase().trim();
    if (!q) return selectedBinary.functions;
    return selectedBinary.functions.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        (f.demangledName && f.demangledName.toLowerCase().includes(q)) ||
        f.address.toLowerCase().includes(q) ||
        f.strings.some((s) => s.toLowerCase().includes(q))
    );
  }, [selectedBinary.functions, functionSearch]);

  const basicBlocks = useMemo(
    () => buildControlFlowBlocks(selectedFunction.instructions),
    [selectedFunction.instructions]
  );

  const handleAgentSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!agentInput.trim() || isProcessing) return;

    const query = agentInput.trim();
    setAgentInput('');
    const timeStr = new Date().toLocaleTimeString();

    setConsoleLogs((prev) => [...prev, { sender: 'User', text: query, time: timeStr, type: 'user' }]);
    setIsProcessing(true);

    try {
      const result = await executeNaturalLanguageIntent(query, {
        binaries,
        selectedBinary,
        selectedFunction,
        providers,
        roles,
        skills,
        globalPrompt,
        onSelectBinary,
        onSelectFunction,
        onSelectInstruction: setSelectedInstruction,
        onSetSearchFilter: setFunctionSearch,
        onApplyPatch,
        onNavigateToFrida,
      });

      setConsoleLogs((prev) => [
        ...prev,
        {
          sender: `Mimir Agent (${result.roleTitle})`,
          text: result.text,
          time: new Date().toLocaleTimeString(),
          type: result.isError ? 'error' : 'agent',
        },
      ]);
    } catch (err: any) {
      setConsoleLogs((prev) => [
        ...prev,
        {
          sender: 'System Error',
          text: err.message || 'Execution error in agent pipeline',
          time: new Date().toLocaleTimeString(),
          type: 'error',
        },
      ]);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-53px)] bg-[#090d14] text-slate-200">
      {/* Binary Meta Strip */}
      <div className="flex items-center justify-between px-6 py-2 bg-[#0d121c] border-b border-slate-800/80 text-xs">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-slate-400">Target Binary:</span>
            <select
              value={selectedBinary.id}
              onChange={(e) => {
                const found = binaries.find((b) => b.id === e.target.value);
                if (found) {
                  onSelectBinary(found);
                  if (found.functions[0]) onSelectFunction(found.functions[0]);
                }
              }}
              className="bg-slate-800/90 border border-slate-700 text-cyan-300 font-mono text-xs rounded px-2.5 py-1 focus:outline-none focus:border-cyan-500"
            >
              {binaries.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.filename}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-3 text-slate-400 font-mono">
            <span>{selectedBinary.arch}</span>
            <span aria-hidden="true" className="text-slate-600">·</span>
            <span>{selectedBinary.fileSize}</span>
            <span aria-hidden="true" className="text-slate-600">·</span>
            <span className="truncate max-w-[180px] text-slate-500" title={selectedBinary.sha256}>
              SHA-256: {selectedBinary.sha256.slice(0, 12)}...
            </span>
            {patchByAddress.size > 0 && (
              <>
                <span aria-hidden="true" className="text-slate-600">·</span>
                <span className="text-amber-400 font-semibold">{patchByAddress.size} Active Patch(es)</span>
              </>
            )}
          </div>
        </div>

        {/* View Mode Switcher and Mimir Floating Trigger */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsMimirPopupOpen(!isMimirPopupOpen)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all ${
              isMimirPopupOpen
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/60 shadow-sm'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
            }`}
          >
            <Bot className="w-3.5 h-3.5 text-cyan-400" />
            <span>Mimir AI Pop-up</span>
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
          </button>

          <div className="flex items-center gap-1 bg-slate-900/90 p-0.5 rounded-md border border-slate-800">
            <button
              onClick={() => setViewMode('disasm')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-all ${
                viewMode === 'disasm' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Code2 className="w-3.5 h-3.5" />
              <span>Disassembly</span>
            </button>
            <button
              onClick={() => setViewMode('hlil')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-all ${
                viewMode === 'hlil' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' : 'text-slate-400 hover:text-white'
              }`}
            >
              <FileCode className="w-3.5 h-3.5" />
              <span>HLIL Decompiler</span>
            </button>
            <button
              onClick={() => setViewMode('cfg')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-all ${
                viewMode === 'cfg' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Network className="w-3.5 h-3.5" />
              <span>Control Flow Graph</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Split Viewport */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Binary Ninja Left Activity Sidebar Dock */}
        <div className="w-12 bg-[#080b12] border-r border-slate-800/80 flex flex-col items-center py-3 justify-between shrink-0 select-none z-10">
          <div className="flex flex-col items-center gap-2.5">
            <button
              onClick={() => setIsMimirPopupOpen(!isMimirPopupOpen)}
              className={`relative p-2 rounded-xl transition-all ${
                isMimirPopupOpen
                  ? 'bg-cyan-500/25 text-cyan-300 border border-cyan-500/60 shadow-lg shadow-cyan-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
              }`}
              title="Mimir AI Assistant - Click to Open Floating Agent Pop-up"
            >
              <Bot className="w-5 h-5 text-cyan-400" />
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            </button>

            <div className="w-6 h-px bg-slate-800 my-1" />

            <button
              onClick={() => setActiveLeftTab('functions')}
              className={`p-2 rounded-lg transition-colors ${
                activeLeftTab === 'functions' ? 'bg-slate-800 text-cyan-400' : 'text-slate-500 hover:text-slate-300'
              }`}
              title="Functions & Symbols"
            >
              <Code2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setActiveLeftTab('strings')}
              className={`p-2 rounded-lg transition-colors ${
                activeLeftTab === 'strings' ? 'bg-slate-800 text-cyan-400' : 'text-slate-500 hover:text-slate-300'
              }`}
              title="Strings"
            >
              <FileCode className="w-4 h-4" />
            </button>
            <button
              onClick={() => setActiveLeftTab('xrefs')}
              className={`p-2 rounded-lg transition-colors ${
                activeLeftTab === 'xrefs' ? 'bg-slate-800 text-cyan-400' : 'text-slate-500 hover:text-slate-300'
              }`}
              title="Cross-References"
            >
              <Network className="w-4 h-4" />
            </button>
          </div>

          <div className="flex flex-col items-center">
            <span className="text-[9px] font-mono text-cyan-400/80 font-bold uppercase tracking-wider">BINJA</span>
          </div>
        </div>

        {/* Left Sub-Sidebar: Navigation & Symbols */}
        <div className="w-80 bg-[#0c1018] border-r border-slate-800/80 flex flex-col shrink-0">
          <div className="flex items-center border-b border-slate-800 text-xs font-medium bg-slate-900/50">
            <button
              onClick={() => setActiveLeftTab('functions')}
              className={`flex-1 py-2 text-center border-b-2 transition-colors ${
                activeLeftTab === 'functions'
                  ? 'border-cyan-400 text-cyan-300 font-semibold bg-cyan-950/20'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              Functions ({selectedBinary.functions.length})
            </button>
            <button
              onClick={() => setActiveLeftTab('strings')}
              className={`flex-1 py-2 text-center border-b-2 transition-colors ${
                activeLeftTab === 'strings'
                  ? 'border-cyan-400 text-cyan-300 font-semibold bg-cyan-950/20'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              Strings
            </button>
            <button
              onClick={() => setActiveLeftTab('xrefs')}
              className={`flex-1 py-2 text-center border-b-2 transition-colors ${
                activeLeftTab === 'xrefs'
                  ? 'border-cyan-400 text-cyan-300 font-semibold bg-cyan-950/20'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              XREFs
            </button>
          </div>

          <div className="p-2 border-b border-slate-800/80 bg-[#090d14]">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Filter symbols / addresses / strings..."
                value={functionSearch}
                onChange={(e) => setFunctionSearch(e.target.value)}
                className="w-full bg-slate-900/90 border border-slate-800 rounded pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-800/40 font-mono text-xs">
            {activeLeftTab === 'functions' && (
              <>
                {filteredFunctions.map((func) => {
                  const hasPatchedInst = func.instructions.some((i) => patchByAddress.has(i.address.toLowerCase()));
                  return (
                    <button
                      key={func.id}
                      onClick={() => {
                        onSelectFunction(func);
                      }}
                      className={`w-full text-left px-3 py-2.5 transition-colors flex flex-col gap-0.5 ${
                        selectedFunction.id === func.id
                          ? 'bg-cyan-950/40 text-cyan-300 border-l-2 border-cyan-400'
                          : 'text-slate-300 hover:bg-slate-900/60'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[11px] text-slate-500">
                        <span>{func.address}</span>
                        <div className="flex items-center gap-1.5">
                          {hasPatchedInst && <span className="text-[10px] text-amber-400 font-semibold">PATCHED</span>}
                          <span>{func.size} bytes</span>
                        </div>
                      </div>
                      <div className="font-semibold text-slate-100 truncate text-[12px]">
                        {func.demangledName || func.name}
                      </div>
                    </button>
                  );
                })}
              </>
            )}

            {activeLeftTab === 'strings' && (
              <div className="p-2 space-y-1.5">
                {selectedFunction.strings.map((str, idx) => (
                  <div
                    key={idx}
                    className="p-2 bg-slate-900/70 rounded border border-slate-800 hover:border-slate-700 cursor-pointer"
                    onClick={() => {
                      setAgentInput(`/analyze explain string reference "${str}"`);
                    }}
                  >
                    <div className="text-amber-300 truncate">"{str}"</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">Referenced in {selectedFunction.name}</div>
                  </div>
                ))}
              </div>
            )}

            {activeLeftTab === 'xrefs' && (
              <div className="p-2 space-y-1.5">
                {selectedFunction.xrefs.map((xref, idx) => (
                  <div key={idx} className="p-2 bg-slate-900/70 rounded border border-slate-800 flex items-center justify-between">
                    <div>
                      <div className="text-cyan-400 font-semibold">{xref.funcName}</div>
                      <div className="text-[10px] text-slate-500">
                        {xref.fromAddr} · {xref.type.toUpperCase()}
                      </div>
                    </div>
                    <span className="text-[10px] text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded">Callsite</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Center Canvas & Disassembly Viewport */}
        <div className="flex-1 flex flex-col bg-[#080b12] overflow-hidden">
          <div className="px-6 py-2.5 bg-[#0e131f] border-b border-slate-800/80 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-xs font-mono text-cyan-400 font-bold shrink-0">{selectedFunction.address}</span>
              <span className="text-slate-600 font-mono shrink-0">/</span>
              <span className="text-sm font-semibold text-white truncate">
                {selectedFunction.demangledName || selectedFunction.name}
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => onNavigateToPatcher(selectedInstruction?.address || selectedFunction.address)}
                className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-amber-300 bg-amber-950/40 border border-amber-800/60 rounded hover:bg-amber-900/60 transition-colors"
                title="Send current instruction to Smart Patcher"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>Patch Address</span>
              </button>
              <button
                onClick={() => onNavigateToFrida(selectedFunction.demangledName || selectedFunction.name)}
                className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-cyan-300 bg-cyan-950/40 border border-cyan-800/60 rounded hover:bg-cyan-900/60 transition-colors"
                title="Create real-time Frida interceptor for this function"
              >
                <Cpu className="w-3.5 h-3.5" />
                <span>Hook in Frida</span>
              </button>
            </div>
          </div>

          {/* Central Code / CFG area */}
          <div className="flex-1 overflow-auto p-4 font-mono text-xs bg-[#070a10]">
            {viewMode === 'disasm' && (
              <div className="divide-y divide-slate-800/30">
                {selectedFunction.instructions.map((inst) => {
                  const isSelected = selectedInstruction?.address === inst.address;
                  const activePatch = patchByAddress.get(inst.address.toLowerCase());
                  const isTargetCheck = inst.mnemonic === 'B.NE' || inst.mnemonic === 'CBZ';

                  return (
                    <div
                      key={inst.address}
                      onClick={() => setSelectedInstruction(inst)}
                      className={`flex items-start gap-4 py-1.5 px-3 rounded transition-colors group cursor-pointer ${
                        activePatch
                          ? 'bg-emerald-950/20 border-l-2 border-emerald-400 text-emerald-100'
                          : isSelected
                          ? 'bg-cyan-950/40 border-l-2 border-cyan-400 text-white'
                          : isTargetCheck
                          ? 'bg-amber-950/15 hover:bg-amber-950/30 text-amber-100'
                          : 'hover:bg-slate-900/60 text-slate-300'
                      }`}
                    >
                      <span className="w-24 shrink-0 text-slate-500 select-all font-mono">{inst.address}</span>

                      <span className="w-28 shrink-0 font-mono select-all tracking-wider">
                        {activePatch ? (
                          <span className="text-emerald-300 font-semibold">{activePatch.patchedBytes.slice(0, 11)}</span>
                        ) : (
                          <span className="text-slate-600">{inst.rawBytes}</span>
                        )}
                      </span>

                      <span
                        className={`w-16 shrink-0 font-bold ${
                          activePatch
                            ? 'text-emerald-400'
                            : inst.isBranch
                            ? 'text-amber-400'
                            : inst.isCall
                            ? 'text-cyan-400'
                            : inst.isReturn
                            ? 'text-rose-400'
                            : 'text-sky-300'
                        }`}
                      >
                        {activePatch ? activePatch.patchedMnemonic.split(' ')[0] : inst.mnemonic}
                      </span>

                      <span className="w-56 shrink-0 text-slate-200 truncate">
                        {activePatch
                          ? activePatch.patchedMnemonic.split(' ').slice(1).join(' ')
                          : inst.operands}
                      </span>

                      <div className="flex-1 flex items-center justify-between text-slate-400 min-w-0">
                        {activePatch ? (
                          <span className="text-emerald-400/90 italic truncate">
                            ; [PATCHED from {activePatch.originalMnemonic}] ({activePatch.strategy})
                          </span>
                        ) : inst.comment ? (
                          <span className="text-emerald-400/90 italic truncate">; {inst.comment}</span>
                        ) : (
                          <span />
                        )}

                        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5 ml-2 shrink-0">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onNavigateToPatcher(inst.address);
                            }}
                            className="px-1.5 py-0.5 text-[10px] font-sans bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 rounded border border-amber-500/40"
                          >
                            {activePatch ? 'Edit Patch' : 'Patch'}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {viewMode === 'hlil' && (
              <div className="p-4 bg-[#0a0e16] rounded-lg border border-slate-800 text-slate-200">
                <div className="text-xs text-slate-500 mb-3 pb-2 border-b border-slate-800 flex items-center justify-between font-sans">
                  <span>Binary Ninja High-Level Intermediate Language (HLIL)</span>
                  <div className="flex items-center gap-3">
                    <span className="text-cyan-400">Calling Conv: {selectedFunction.callingConv}</span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(selectedFunction.hlil);
                        setCopiedHlil(true);
                        setTimeout(() => setCopiedHlil(false), 1800);
                      }}
                      className="flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 text-slate-300 hover:text-white text-[11px]"
                    >
                      {copiedHlil ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedHlil ? 'Copied' : 'Copy HLIL'}</span>
                    </button>
                  </div>
                </div>
                <pre className="font-mono text-xs leading-relaxed text-slate-300 overflow-x-auto whitespace-pre">
                  {selectedFunction.hlil}
                </pre>
              </div>
            )}

            {viewMode === 'cfg' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between px-2 font-sans">
                  <div className="flex items-center gap-2 text-xs text-slate-300">
                    <GitBranch className="w-4 h-4 text-cyan-400" />
                    <span className="font-semibold">
                      Interactive Basic Block CFG ({basicBlocks.length} Basic Blocks)
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-slate-400">
                    Click any instruction to inspect or patch in Smart Patcher
                  </span>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {basicBlocks.map((bb, bbIdx) => (
                    <div
                      key={bb.id}
                      className="bg-[#0b1019] border border-slate-800 rounded-xl overflow-hidden shadow-lg flex flex-col"
                    >
                      <div className="px-3.5 py-2 bg-[#0e1522] border-b border-slate-800 flex items-center justify-between text-[11px]">
                        <span className="font-bold text-cyan-300">
                          Block #{bbIdx + 1} · {bb.startAddr}
                        </span>
                        <div className="flex items-center gap-2">
                          {bb.branchTarget && (
                            <span className="text-amber-300 bg-amber-950/40 border border-amber-800/50 px-1.5 py-0.5 rounded text-[10px]">
                              Branch &rarr; {bb.branchTarget}
                            </span>
                          )}
                          {bb.fallthroughAddr && (
                            <span className="text-emerald-300 bg-emerald-950/30 border border-emerald-800/50 px-1.5 py-0.5 rounded text-[10px]">
                              Next &rarr; {bb.fallthroughAddr}
                            </span>
                          )}
                          {bb.endsWithReturn && (
                            <span className="text-rose-300 bg-rose-950/30 border border-rose-800/50 px-1.5 py-0.5 rounded text-[10px]">
                              RET
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="p-2.5 space-y-1 text-[11px]">
                        {bb.instructions.map((inst) => {
                          const activePatch = patchByAddress.get(inst.address.toLowerCase());
                          return (
                            <div
                              key={inst.address}
                              onClick={() => {
                                setSelectedInstruction(inst);
                                if (inst.isBranch) onNavigateToPatcher(inst.address);
                              }}
                              className={`flex items-center justify-between gap-2 px-2 py-1 rounded cursor-pointer transition-colors ${
                                activePatch
                                  ? 'bg-emerald-950/30 text-emerald-200'
                                  : inst.isBranch
                                  ? 'bg-amber-950/20 hover:bg-amber-950/40 text-amber-200'
                                  : 'hover:bg-slate-900/70 text-slate-300'
                              }`}
                            >
                              <div className="flex items-center gap-2 truncate">
                                <span className="text-slate-500">{inst.address}</span>
                                <span className="font-bold text-cyan-300">
                                  {activePatch ? activePatch.patchedMnemonic : `${inst.mnemonic} ${inst.operands}`}
                                </span>
                              </div>
                              {inst.isBranch && (
                                <span className="text-[10px] text-amber-400 font-sans shrink-0">Patch &rarr;</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Bottom Mimir Agent Console */}
          <div className="h-64 bg-[#0a0d14] border-t border-slate-800/90 flex flex-col shrink-0">
            <div className="px-4 py-2 bg-[#0e131d] border-b border-slate-800 flex items-center justify-between text-xs gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Terminal className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <span className="font-semibold text-white shrink-0">Mimir Autonomous Agent Terminal</span>
                <span className="text-slate-600 font-mono hidden xl:inline">·</span>
                <span className="text-slate-400 font-mono truncate hidden xl:inline">
                  Natural Language: "find purchase related functions.", "patch this function to return true"
                </span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                <button
                  onClick={() => setAgentInput('find purchase related functions.')}
                  className="px-2 py-0.5 text-[11px] text-cyan-300 hover:text-white bg-cyan-950/40 rounded border border-cyan-800/60 transition-colors"
                >
                  find purchase
                </button>
                <button
                  onClick={() => setAgentInput('patch this function to return true')}
                  className="px-2 py-0.5 text-[11px] text-amber-300 hover:text-white bg-amber-950/30 rounded border border-amber-800/60 transition-colors"
                >
                  patch return true
                </button>
                <button
                  onClick={() => setAgentInput('/analyze explain algorithm and state transitions')}
                  className="px-2 py-0.5 text-[11px] text-slate-400 hover:text-white bg-slate-800/80 rounded border border-slate-700 transition-colors"
                >
                  /analyze
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2 font-mono text-xs">
              {consoleLogs.map((log, index) => (
                <div
                  key={index}
                  className={`p-2 rounded border ${
                    log.type === 'user'
                      ? 'bg-slate-800/40 border-slate-700/60 text-slate-200'
                      : log.type === 'agent'
                      ? 'bg-cyan-950/20 border-cyan-800/40 text-cyan-100'
                      : log.type === 'error'
                      ? 'bg-rose-950/30 border-rose-800/60 text-rose-200'
                      : 'bg-slate-900/60 border-slate-800 text-slate-400'
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
                    <span className={`font-semibold ${log.type === 'error' ? 'text-rose-400' : 'text-cyan-400'}`}>
                      {log.sender}
                    </span>
                    <span>{log.time}</span>
                  </div>
                  <FormattedOutput text={log.text} className="text-xs font-sans" />
                </div>
              ))}
              {isProcessing && (
                <div className="flex items-center gap-2 p-2 text-cyan-300 bg-cyan-950/20 rounded border border-cyan-800/40">
                  <Sparkles className="w-3.5 h-3.5 animate-spin" />
                  <span>Mimir agent is processing query and executing actions...</span>
                </div>
              )}
            </div>

            <form onSubmit={handleAgentSubmit} className="p-2.5 bg-[#090c13] border-t border-slate-800 flex items-center gap-2">
              <input
                type="text"
                placeholder='Type something like "find purchase related functions." or "patch this function to return true"'
                value={agentInput}
                onChange={(e) => setAgentInput(e.target.value)}
                disabled={isProcessing}
                className="flex-1 bg-slate-900/90 border border-slate-800 rounded-md px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={isProcessing || !agentInput.trim()}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-md transition-colors disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Act</span>
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Floating Mimir AI Agent Chat Pop-up */}
      <MimirFloatingChat
        isOpen={isMimirPopupOpen}
        onClose={() => setIsMimirPopupOpen(false)}
        binaries={binaries}
        selectedBinary={selectedBinary}
        onSelectBinary={onSelectBinary}
        selectedFunction={selectedFunction}
        onSelectFunction={onSelectFunction}
        onSelectInstruction={setSelectedInstruction}
        onNavigateToPatcher={onNavigateToPatcher}
        onNavigateToFrida={onNavigateToFrida}
        onApplyPatch={onApplyPatch}
        providers={providers}
        roles={roles}
        skills={skills}
        globalPrompt={globalPrompt}
      />
    </div>
  );
};
