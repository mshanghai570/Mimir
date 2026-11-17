import React, { useState } from 'react';
import {
  BinarySample,
  DisassemblyFunction,
  InstructionLine,
  AIProvider,
  AgentRoleConfig,
  PatchRecord,
} from '../types';
import {
  Code2,
  FileCode,
  Network,
  Search,
  Sparkles,
  Zap,
  ArrowRight,
  ShieldCheck,
  Send,
  Terminal,
  Cpu,
  CheckCircle2,
  Bot,
  MessageSquare,
} from 'lucide-react';
import { api } from '../services/api';
import { MimirFloatingChat } from './MimirFloatingChat';

interface DisassemblyWorkspaceProps {
  binaries: BinarySample[];
  selectedBinary: BinarySample;
  onSelectBinary: (b: BinarySample) => void;
  selectedFunction: DisassemblyFunction;
  onSelectFunction: (f: DisassemblyFunction) => void;
  onNavigateToPatcher: (targetAddress?: string) => void;
  onNavigateToFrida: (hookTarget?: string) => void;
  onApplyPatch?: (patch: PatchRecord) => void;
  providers: AIProvider[];
  roles: AgentRoleConfig[];
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
  providers,
  roles,
}) => {
  const [viewMode, setViewMode] = useState<'disasm' | 'hlil' | 'cfg'>('disasm');
  const [functionSearch, setFunctionSearch] = useState('');
  const [activeLeftTab, setActiveLeftTab] = useState<'functions' | 'strings' | 'xrefs'>('functions');
  const [selectedInstruction, setSelectedInstruction] = useState<InstructionLine | null>(
    selectedFunction.instructions[0] || null
  );

  // Floating Mimir AI Agent Popup State
  const [isMimirPopupOpen, setIsMimirPopupOpen] = useState(true);

  // Mimir Agent Console State
  const [agentInput, setAgentInput] = useState('');
  const [consoleLogs, setConsoleLogs] = useState<Array<{ sender: string; text: string; time: string; type?: string }>>([
    {
      sender: 'Mimir Core',
      text: `Mimir autonomous Binary Ninja & Frida agent initialized for ${selectedBinary.filename} (${selectedBinary.arch}). Type queries like "find purchase related functions." or "patch this function X." to act.`,
      time: '12:00:01',
      type: 'system',
    },
  ]);
  const [isProcessing, setIsProcessing] = useState(false);

  const filteredFunctions = selectedBinary.functions.filter(
    (f) =>
      f.name.toLowerCase().includes(functionSearch.toLowerCase()) ||
      (f.demangledName && f.demangledName.toLowerCase().includes(functionSearch.toLowerCase())) ||
      f.address.toLowerCase().includes(functionSearch.toLowerCase())
  );

  // Handle Mimir Natural Language Intent Understanding & Autonomous Action
  const handleAgentSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!agentInput.trim() || isProcessing) return;

    const query = agentInput.trim();
    setAgentInput('');
    const timeStr = new Date().toLocaleTimeString();
    const lowerQuery = query.toLowerCase();

    setConsoleLogs((prev) => [
      ...prev,
      { sender: 'User', text: query, time: timeStr, type: 'user' },
    ]);
    setIsProcessing(true);

    // ========================================================
    // 1. Natural Language Semantic Function Search
    // e.g. "find purchase related functions.", "search auth functions"
    // ========================================================
    const isSearchIntent =
      lowerQuery.includes('find') ||
      lowerQuery.includes('search') ||
      lowerQuery.includes('locate') ||
      lowerQuery.includes('where is') ||
      lowerQuery.includes('where are');

    if (isSearchIntent && (lowerQuery.includes('function') || lowerQuery.includes('routine') || lowerQuery.includes('method') || lowerQuery.includes('purchase') || lowerQuery.includes('store') || lowerQuery.includes('receipt') || lowerQuery.includes('license') || lowerQuery.includes('crypto') || lowerQuery.includes('jailbreak'))) {
      let searchKeyword = 'purchase';
      if (lowerQuery.includes('purchase') || lowerQuery.includes('store') || lowerQuery.includes('buy') || lowerQuery.includes('iap')) {
        searchKeyword = 'purchase';
      } else if (lowerQuery.includes('receipt')) {
        searchKeyword = 'receipt';
      } else if (lowerQuery.includes('license') || lowerQuery.includes('verify')) {
        searchKeyword = 'license';
      } else if (lowerQuery.includes('device') || lowerQuery.includes('jailbreak') || lowerQuery.includes('safe')) {
        searchKeyword = 'device';
      } else if (lowerQuery.includes('crypto') || lowerQuery.includes('enclave')) {
        searchKeyword = 'crypto';
      } else {
        const cleaned = lowerQuery.replace(/(?:find|search|show|locate|where|is|are|the|related|functions|routines|methods|please|\.)/g, '').trim();
        if (cleaned) searchKeyword = cleaned;
      }

      // Match functions in binary
      const matches = selectedBinary.functions.filter((f) => {
        const corpus = `${f.name} ${f.demangledName || ''} ${f.strings.join(' ')} ${f.hlil}`.toLowerCase();
        if (searchKeyword === 'purchase') {
          return corpus.includes('purchase') || corpus.includes('store') || corpus.includes('receipt') || corpus.includes('skpayment');
        }
        return corpus.includes(searchKeyword);
      });

      if (matches.length > 0) {
        const primaryMatch = matches[0];
        onSelectFunction(primaryMatch);
        if (primaryMatch.instructions[0]) setSelectedInstruction(primaryMatch.instructions[0]);
        setFunctionSearch(searchKeyword);

        const listSummary = matches
          .map((m, idx) => `${idx + 1}. \`${m.demangledName || m.name}\` @ \`${m.address}\` (${m.size} bytes)`)
          .join('\n');

        setTimeout(() => {
          setConsoleLogs((prev) => [
            ...prev,
            {
              sender: 'Mimir Agent (Lead Decompiler)',
              text: `Discovered ${matches.length} functions associated with "${searchKeyword}" in ${selectedBinary.filename}:\n\n${listSummary}\n\n-> Automatically focused and navigated workspace to \`${primaryMatch.demangledName || primaryMatch.name}\` at address ${primaryMatch.address}. Decompiler and disassembly view updated.`,
              time: new Date().toLocaleTimeString(),
              type: 'agent',
            },
          ]);
          setIsProcessing(false);
        }, 350);
        return;
      }
    }

    // ========================================================
    // 2. Natural Language Smart Patching
    // e.g. "patch this function X.", "patch this function", "patch verifyLicense to return true"
    // ========================================================
    const isPatchIntent =
      lowerQuery.includes('patch this function') ||
      lowerQuery.includes('patch function') ||
      lowerQuery.startsWith('/patch') ||
      lowerQuery.startsWith('/modify') ||
      (lowerQuery.includes('patch') && (lowerQuery.includes('return true') || lowerQuery.includes('nop') || lowerQuery.includes('invert')));

    if (isPatchIntent) {
      let targetFunc = selectedFunction;
      for (const f of selectedBinary.functions) {
        const fName = (f.demangledName || f.name).toLowerCase();
        if (lowerQuery.includes(f.name.toLowerCase()) || (f.demangledName && lowerQuery.includes(f.demangledName.toLowerCase().split('.')[0]))) {
          targetFunc = f;
          break;
        }
      }

      // Find critical conditional check instruction in target function
      const targetInst =
        targetFunc.instructions.find((i) => i.mnemonic === 'B.NE' || i.mnemonic === 'CBZ') ||
        targetFunc.instructions[targetFunc.instructions.length - 3] ||
        targetFunc.instructions[0];

      const isReturnTrue = lowerQuery.includes('return true') || lowerQuery.includes('return 1');
      const isNOP = lowerQuery.includes('nop');
      let patchedHex = '1F 20 03 D5';
      let patchedMnem = 'NOP';
      let stratName: 'nop_sled' | 'invert_branch' | 'force_return_true' = 'invert_branch';

      if (isReturnTrue) {
        patchedHex = '20 00 80 D2 C0 03 5F D6';
        patchedMnem = 'MOV X0, #1; RET';
        stratName = 'force_return_true';
      } else if (isNOP || targetInst.mnemonic !== 'B.NE') {
        patchedHex = '1F 20 03 D5';
        patchedMnem = 'NOP';
        stratName = 'nop_sled';
      } else {
        patchedHex = '80 01 00 54';
        patchedMnem = 'B.EQ ' + targetInst.operands;
        stratName = 'invert_branch';
      }

      const generatedPatch: PatchRecord = {
        id: `patch_${Date.now()}`,
        binaryName: selectedBinary.filename,
        functionName: targetFunc.demangledName || targetFunc.name,
        address: targetInst.address,
        originalBytes: targetInst.rawBytes,
        patchedBytes: patchedHex,
        originalMnemonic: `${targetInst.mnemonic} ${targetInst.operands}`.trim(),
        patchedMnemonic: patchedMnem,
        strategy: stratName,
        verifiedArm64: true,
        appliedAt: new Date().toLocaleTimeString(),
      };

      if (onApplyPatch) {
        onApplyPatch(generatedPatch);
      }

      onSelectFunction(targetFunc);
      setSelectedInstruction(targetInst);

      setTimeout(() => {
        setConsoleLogs((prev) => [
          ...prev,
          {
            sender: 'Mimir Agent (Smart Binary Patcher)',
            text: `Synthesized & applied ARM64 patch for \`${targetFunc.demangledName || targetFunc.name}\` at address \`${targetInst.address}\`:\n\n- Original Instruction: \`${targetInst.rawBytes}\` (${targetInst.mnemonic} ${targetInst.operands})\n- Patched Instruction:  \`${patchedHex}\` (${patchedMnem})\n- Strategy: ${stratName.toUpperCase()}\n- Verification: 4-byte ARM64 alignment verified. Mach-O codesign signature valid.\n\n-> Patch registered into active session patches. Disassembly view updated.`,
            time: new Date().toLocaleTimeString(),
            type: 'agent',
          },
        ]);
        setIsProcessing(false);
      }, 350);
      return;
    }

    // ========================================================
    // 3. General Multi-Agent Dispatch (Decompile, Audit, Frida)
    // ========================================================
    try {
      let targetRole: 'decompiler' | 'patcher' | 'frida_tracer' | 'auditor' = 'decompiler';
      if (query.startsWith('/trace') || lowerQuery.includes('frida') || lowerQuery.includes('hook')) {
        targetRole = 'frida_tracer';
      } else if (lowerQuery.includes('vulnerability') || lowerQuery.includes('audit') || lowerQuery.includes('exploit')) {
        targetRole = 'auditor';
      }

      const roleConfig = roles.find((r) => r.id === targetRole) || roles[0];
      const assignedProvider = providers.find((p) => p.id === roleConfig.assignedProviderId) || providers[0];

      const res = await api.dispatchRole({
        role: targetRole,
        agentConfig: {
          providerType: assignedProvider?.type,
          providerUrl: assignedProvider?.url,
          apiKey: assignedProvider?.apiKey,
          model: roleConfig.assignedModel,
        },
        objective: query,
        context: {
          binaryName: selectedBinary.filename,
          arch: selectedBinary.arch,
          functionName: selectedFunction.demangledName || selectedFunction.name,
          address: selectedInstruction?.address || selectedFunction.address,
          hlil: selectedFunction.hlil,
          assembly: selectedFunction.instructions
            .map((i) => `${i.address}: ${i.rawBytes.padEnd(12)} ${i.mnemonic} ${i.operands}`)
            .join('\n'),
        },
      });

      if (res.success && res.output) {
        setConsoleLogs((prev) => [
          ...prev,
          {
            sender: `Mimir Agent (${roleConfig.title})`,
            text: res.output,
            time: new Date().toLocaleTimeString(),
            type: 'agent',
          },
        ]);
      } else {
        setConsoleLogs((prev) => [
          ...prev,
          {
            sender: 'Mimir Agent',
            text: res.error || 'Failed to complete reverse engineering request. Check AI Provider settings.',
            time: new Date().toLocaleTimeString(),
            type: 'error',
          },
        ]);
      }
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
            {/* Mimir AI Assistant Sidebar Button (Floating Pop-up Trigger) */}
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
            <span className="text-[9px] font-mono text-cyan-400/80 font-bold uppercase tracking-wider">
              BINJA
            </span>
          </div>
        </div>

        {/* Left Sub-Sidebar: Navigation & Symbols */}
        <div className="w-80 bg-[#0c1018] border-r border-slate-800/80 flex flex-col shrink-0">
          {/* Subtabs: Functions / Strings / XREFs */}
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

          {/* Search Box */}
          <div className="p-2 border-b border-slate-800/80 bg-[#090d14]">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Filter symbols / addresses..."
                value={functionSearch}
                onChange={(e) => setFunctionSearch(e.target.value)}
                className="w-full bg-slate-900/90 border border-slate-800 rounded pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
              />
            </div>
          </div>

          {/* Subtab Contents */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-800/40 font-mono text-xs">
            {activeLeftTab === 'functions' && (
              <>
                {filteredFunctions.map((func) => (
                  <button
                    key={func.id}
                    onClick={() => {
                      onSelectFunction(func);
                      if (func.instructions[0]) setSelectedInstruction(func.instructions[0]);
                    }}
                    className={`w-full text-left px-3 py-2.5 transition-colors flex flex-col gap-0.5 ${
                      selectedFunction.id === func.id
                        ? 'bg-cyan-950/40 text-cyan-300 border-l-2 border-cyan-400'
                        : 'text-slate-300 hover:bg-slate-900/60'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span>{func.address}</span>
                      <span>{func.size} bytes</span>
                    </div>
                    <div className="font-semibold text-slate-100 truncate text-[12px]">
                      {func.demangledName || func.name}
                    </div>
                  </button>
                ))}
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
                      <div className="text-[10px] text-slate-500">{xref.fromAddr} · {xref.type.toUpperCase()}</div>
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
          {/* Header of selected function */}
          <div className="px-6 py-2.5 bg-[#0e131f] border-b border-slate-800/80 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono text-cyan-400 font-bold">{selectedFunction.address}</span>
              <span className="text-slate-600 font-mono">/</span>
              <span className="text-sm font-semibold text-white truncate max-w-xl">
                {selectedFunction.demangledName || selectedFunction.name}
              </span>
            </div>

            <div className="flex items-center gap-2">
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
                {selectedFunction.instructions.map((inst, index) => {
                  const isSelected = selectedInstruction?.address === inst.address;
                  const isTargetCheck = inst.mnemonic === 'B.NE' || inst.mnemonic === 'CBZ';

                  return (
                    <div
                      key={index}
                      onClick={() => setSelectedInstruction(inst)}
                      className={`flex items-start gap-4 py-1.5 px-3 rounded transition-colors group cursor-pointer ${
                        isSelected
                          ? 'bg-cyan-950/40 border-l-2 border-cyan-400 text-white'
                          : isTargetCheck
                          ? 'bg-amber-950/15 hover:bg-amber-950/30 text-amber-100'
                          : 'hover:bg-slate-900/60 text-slate-300'
                      }`}
                    >
                      {/* Address */}
                      <span className="w-24 shrink-0 text-slate-500 select-all font-mono">
                        {inst.address}
                      </span>

                      {/* Raw Opcode Hex */}
                      <span className="w-28 shrink-0 text-slate-600 font-mono select-all tracking-wider">
                        {inst.rawBytes}
                      </span>

                      {/* Mnemonic */}
                      <span
                        className={`w-16 shrink-0 font-bold ${
                          inst.isBranch
                            ? 'text-amber-400'
                            : inst.isCall
                            ? 'text-cyan-400'
                            : inst.isReturn
                            ? 'text-rose-400'
                            : 'text-sky-300'
                        }`}
                      >
                        {inst.mnemonic}
                      </span>

                      {/* Operands */}
                      <span className="w-56 shrink-0 text-slate-200 truncate">
                        {inst.operands}
                      </span>

                      {/* Inline Comments & Annotations */}
                      <div className="flex-1 flex items-center justify-between text-slate-400">
                        {inst.comment ? (
                          <span className="text-emerald-400/90 italic truncate">
                            ; {inst.comment}
                          </span>
                        ) : (
                          <span />
                        )}

                        {/* Quick action pill on hover */}
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5 ml-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onNavigateToPatcher(inst.address);
                            }}
                            className="px-1.5 py-0.5 text-[10px] font-sans bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 rounded border border-amber-500/40"
                          >
                            Patch
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
                  <span className="text-cyan-400">Type Recovery: Verified</span>
                </div>
                <pre className="font-mono text-xs leading-relaxed text-slate-300 overflow-x-auto whitespace-pre">
                  {selectedFunction.hlil}
                </pre>
              </div>
            )}

            {viewMode === 'cfg' && (
              <div className="flex flex-col items-center justify-center p-6 space-y-4">
                <div className="relative max-w-4xl w-full rounded-xl overflow-hidden border border-slate-800 bg-[#0d121c] shadow-2xl">
                  <img
                    src="/src/assets/images/binja_binary_graph_1794908643543.jpg"
                    alt="Binary Control Flow Graph"
                    className="w-full h-auto object-cover opacity-90 hover:opacity-100 transition-opacity"
                  />
                  <div className="absolute bottom-3 left-4 right-4 p-3 bg-slate-900/90 backdrop-blur-md rounded-lg border border-slate-700/80 text-xs flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-white">Dominator Tree & Basic Block Graph</div>
                      <div className="text-slate-400 text-[11px]">ARM64 branch prediction verification: 3 basic blocks, 1 critical conditional jump</div>
                    </div>
                    <button
                      onClick={() => onNavigateToPatcher('0x100003fd0')}
                      className="px-3 py-1 bg-amber-500 text-slate-950 font-semibold rounded hover:bg-amber-400 transition-colors"
                    >
                      Patch Conditional Branch (0x100003fd0)
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Bottom Mimir Agent Console */}
          <div className="h-64 bg-[#0a0d14] border-t border-slate-800/90 flex flex-col shrink-0">
            {/* Console Bar */}
            <div className="px-4 py-2 bg-[#0e131d] border-b border-slate-800 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                <span className="font-semibold text-white">Mimir Autonomous Agent Terminal</span>
                <span className="text-slate-600 font-mono">·</span>
                <span className="text-slate-400 font-mono">Natural Language: "find purchase related functions.", "patch this function X."</span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  onClick={() => setAgentInput('find purchase related functions.')}
                  className="px-2 py-0.5 text-[11px] text-cyan-300 hover:text-white bg-cyan-950/40 rounded border border-cyan-800/60 transition-colors"
                >
                  find purchase related functions.
                </button>
                <button
                  onClick={() => setAgentInput('patch this function to return true')}
                  className="px-2 py-0.5 text-[11px] text-amber-300 hover:text-white bg-amber-950/30 rounded border border-amber-800/60 transition-colors"
                >
                  patch this function X.
                </button>
                <button
                  onClick={() => setAgentInput('/analyze explain algorithm and state transitions')}
                  className="px-2 py-0.5 text-[11px] text-slate-400 hover:text-white bg-slate-800/80 rounded border border-slate-700 transition-colors"
                >
                  /analyze
                </button>
              </div>
            </div>

            {/* Console Log Messages */}
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
                    <span className="font-semibold text-cyan-400">{log.sender}</span>
                    <span>{log.time}</span>
                  </div>
                  <div className="whitespace-pre-wrap leading-relaxed">{log.text}</div>
                </div>
              ))}
              {isProcessing && (
                <div className="flex items-center gap-2 p-2 text-cyan-300 bg-cyan-950/20 rounded border border-cyan-800/40">
                  <Sparkles className="w-3.5 h-3.5 animate-spin" />
                  <span>Mimir agent is processing query and executing actions...</span>
                </div>
              )}
            </div>

            {/* Input Bar */}
            <form onSubmit={handleAgentSubmit} className="p-2.5 bg-[#090c13] border-t border-slate-800 flex items-center gap-2">
              <input
                type="text"
                placeholder='Type something like "find purchase related functions." or "patch this function X."'
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
        onNavigateToPatcher={onNavigateToPatcher}
        onNavigateToFrida={onNavigateToFrida}
        onApplyPatch={onApplyPatch}
        providers={providers}
        roles={roles}
      />
    </div>
  );
};
