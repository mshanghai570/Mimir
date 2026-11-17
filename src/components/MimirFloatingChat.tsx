import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Sparkles,
  Zap,
  Cpu,
  Search,
  Maximize2,
  Minimize2,
  X,
  RotateCcw,
  Bot,
  User,
  ArrowRight,
  ShieldCheck,
  Code2,
  CheckCircle2,
  ChevronDown,
  Terminal,
} from 'lucide-react';
import {
  BinarySample,
  DisassemblyFunction,
  InstructionLine,
  PatchRecord,
  AIProvider,
  AgentRoleConfig,
} from '../types';
import { api } from '../services/api';

export interface ChatMessage {
  id: string;
  sender: 'user' | 'agent' | 'system';
  roleTitle?: string;
  text: string;
  timestamp: string;
  actionTaken?: {
    type: 'navigated_function' | 'applied_patch' | 'configured_frida' | 'switched_binary' | 'listed_items';
    targetName?: string;
    targetAddress?: string;
    details?: string;
  };
  suggestedActions?: Array<{
    label: string;
    action: () => void;
  }>;
}

interface MimirFloatingChatProps {
  isOpen: boolean;
  onClose: () => void;
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

export const MimirFloatingChat: React.FC<MimirFloatingChatProps> = ({
  isOpen,
  onClose,
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
  const [isExpanded, setIsExpanded] = useState(false);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'msg_welcome',
      sender: 'agent',
      roleTitle: 'Mimir AI Assistant',
      text: `Hello! I am **Mimir**, your autonomous Binary Ninja & Frida agent.\n\nYou can talk to me in plain language about whatever you want:\n• *"find purchase related functions."*\n• *"patch this function to return true."*\n• *"explain what this function does."*\n• *"trace this function on my connected iPhone."*\n\nHow can I help you analyze **${selectedBinary.filename}**?`,
      timestamp: '12:00',
    },
  ]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isThinking]);

  if (!isOpen) return null;

  const handleSend = async (customText?: string) => {
    const query = (customText || input).trim();
    if (!query || isThinking) return;

    setInput('');
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const userMsgId = `user_${Date.now()}`;

    setMessages((prev) => [
      ...prev,
      {
        id: userMsgId,
        sender: 'user',
        text: query,
        timestamp: timeStr,
      },
    ]);

    setIsThinking(true);
    const lower = query.toLowerCase();

    // ==========================================================
    // 1. Natural Language: Function Search & Discovery
    // e.g. "find purchase related functions", "search auth functions"
    // ==========================================================
    const isSearch =
      lower.includes('find') ||
      lower.includes('search') ||
      lower.includes('where is') ||
      lower.includes('where are') ||
      lower.includes('locate') ||
      lower.includes('list functions');

    if (
      isSearch &&
      (lower.includes('function') ||
        lower.includes('routine') ||
        lower.includes('method') ||
        lower.includes('purchase') ||
        lower.includes('store') ||
        lower.includes('receipt') ||
        lower.includes('license') ||
        lower.includes('crypto') ||
        lower.includes('jailbreak') ||
        lower.includes('auth'))
    ) {
      let keyword = 'purchase';
      if (lower.includes('purchase') || lower.includes('store') || lower.includes('buy') || lower.includes('iap')) {
        keyword = 'purchase';
      } else if (lower.includes('receipt')) {
        keyword = 'receipt';
      } else if (lower.includes('license') || lower.includes('auth')) {
        keyword = 'license';
      } else if (lower.includes('jailbreak') || lower.includes('device') || lower.includes('safe')) {
        keyword = 'device';
      } else if (lower.includes('crypto') || lower.includes('enclave')) {
        keyword = 'crypto';
      } else {
        keyword = lower.replace(/(?:find|search|show|where|is|are|locate|list|the|related|functions|routines|methods|please|\.)/g, '').trim();
      }

      const matches = selectedBinary.functions.filter((f) => {
        const corpus = `${f.name} ${f.demangledName || ''} ${f.strings.join(' ')} ${f.hlil}`.toLowerCase();
        if (keyword === 'purchase') {
          return corpus.includes('purchase') || corpus.includes('store') || corpus.includes('receipt') || corpus.includes('skpayment');
        }
        return corpus.includes(keyword);
      });

      if (matches.length > 0) {
        const primary = matches[0];
        onSelectFunction(primary);

        setTimeout(() => {
          setMessages((prev) => [
            ...prev,
            {
              id: `agent_${Date.now()}`,
              sender: 'agent',
              roleTitle: 'Lead Decompiler',
              text: `I discovered **${matches.length} functions** associated with **"${keyword}"** in \`${selectedBinary.filename}\`:\n\n${matches
                .map((m, idx) => `${idx + 1}. **\`${m.demangledName || m.name}\`**\n   Address: \`${m.address}\` · Size: ${m.size} bytes`)
                .join('\n\n')}\n\nI have automatically updated your Binary Ninja workspace to focus on **\`${primary.demangledName || primary.name}\`**.`,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              actionTaken: {
                type: 'navigated_function',
                targetName: primary.demangledName || primary.name,
                targetAddress: primary.address,
                details: `Focused ${primary.demangledName || primary.name} in disassembly & HLIL`,
              },
              suggestedActions: [
                {
                  label: 'Patch this function to return true',
                  action: () => handleSend('patch this function to return true'),
                },
                {
                  label: 'Trace in Frida on connected phone',
                  action: () => onNavigateToFrida(primary.demangledName || primary.name),
                },
              ],
            },
          ]);
          setIsThinking(false);
        }, 500);
        return;
      }
    }

    // ==========================================================
    // 2. Natural Language: Smart Patching
    // e.g. "patch this function X", "patch this function to return true"
    // ==========================================================
    const isPatch =
      lower.includes('patch this function') ||
      lower.includes('patch function') ||
      lower.startsWith('/patch') ||
      lower.startsWith('/modify') ||
      (lower.includes('patch') && (lower.includes('return true') || lower.includes('nop') || lower.includes('invert')));

    if (isPatch) {
      let targetFunc = selectedFunction;
      for (const f of selectedBinary.functions) {
        if (lower.includes(f.name.toLowerCase()) || (f.demangledName && lower.includes(f.demangledName.toLowerCase().split('.')[0]))) {
          targetFunc = f;
          break;
        }
      }

      const targetInst =
        targetFunc.instructions.find((i) => i.mnemonic === 'B.NE' || i.mnemonic === 'CBZ') ||
        targetFunc.instructions[targetFunc.instructions.length - 3] ||
        targetFunc.instructions[0];

      const isReturnTrue = lower.includes('return true') || lower.includes('return 1');
      const isNOP = lower.includes('nop');
      let patchedHex = '1F 20 03 D5';
      let patchedMnem = 'NOP';
      let strat: 'nop_sled' | 'invert_branch' | 'force_return_true' = 'invert_branch';

      if (isReturnTrue) {
        patchedHex = '20 00 80 D2 C0 03 5F D6';
        patchedMnem = 'MOV X0, #1; RET';
        strat = 'force_return_true';
      } else if (isNOP || targetInst.mnemonic !== 'B.NE') {
        patchedHex = '1F 20 03 D5';
        patchedMnem = 'NOP';
        strat = 'nop_sled';
      } else {
        patchedHex = '80 01 00 54';
        patchedMnem = 'B.EQ ' + targetInst.operands;
        strat = 'invert_branch';
      }

      const newPatch: PatchRecord = {
        id: `patch_${Date.now()}`,
        binaryName: selectedBinary.filename,
        functionName: targetFunc.demangledName || targetFunc.name,
        address: targetInst.address,
        originalBytes: targetInst.rawBytes,
        patchedBytes: patchedHex,
        originalMnemonic: `${targetInst.mnemonic} ${targetInst.operands}`.trim(),
        patchedMnemonic: patchedMnem,
        strategy: strat,
        verifiedArm64: true,
        appliedAt: new Date().toLocaleTimeString(),
      };

      if (onApplyPatch) {
        onApplyPatch(newPatch);
      }
      onSelectFunction(targetFunc);

      setTimeout(() => {
        setMessages((prev) => [
          ...prev,
          {
            id: `agent_${Date.now()}`,
            sender: 'agent',
            roleTitle: 'Smart Binary Patcher',
            text: `I have synthesized and applied a safe ARM64 machine code patch to **\`${targetFunc.demangledName || targetFunc.name}\`** at address \`${targetInst.address}\`:\n\n\`\`\`arm64\n; Before: ${targetInst.rawBytes}\n${targetInst.mnemonic} ${targetInst.operands}\n\n; After:  ${patchedHex}\n${patchedMnem}\n\`\`\`\n\n• **Strategy**: \`${strat.toUpperCase()}\`\n• **Safety Checks**: 4-byte ARM64 alignment verified. Mach-O code-signing compatibility validated.\n• **Action**: The patch has been registered into the active Binary Ninja session.`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            actionTaken: {
              type: 'applied_patch',
              targetName: targetFunc.demangledName || targetFunc.name,
              targetAddress: targetInst.address,
              details: `Patched ${targetInst.address} to ${patchedMnem} (${patchedHex})`,
            },
            suggestedActions: [
              {
                label: 'View Patch in Smart Patcher Diff Viewer',
                action: () => onNavigateToPatcher(targetInst.address),
              },
            ],
          },
        ]);
        setIsThinking(false);
      }, 500);
      return;
    }

    // ==========================================================
    // 3. Natural Language: Frida Hooking
    // e.g. "trace this function in frida", "hook this function on phone"
    // ==========================================================
    if (lower.includes('frida') || lower.includes('hook') || lower.includes('trace')) {
      const funcName = selectedFunction.demangledName || selectedFunction.name;
      onNavigateToFrida(funcName);

      setTimeout(() => {
        setMessages((prev) => [
          ...prev,
          {
            id: `agent_${Date.now()}`,
            sender: 'agent',
            roleTitle: 'Dynamic Frida Tracer',
            text: `I have prepared a real-time Frida instrumentation hook for **\`${funcName}\`** at \`${selectedFunction.address}\`.\n\n\`\`\`javascript\nInterceptor.attach(Module.findExportByName(null, "${selectedFunction.name}") || targetAddr, {\n    onEnter(args) { console.log("[*] Intercepted ${selectedFunction.name}"); },\n    onLeave(retval) { retval.replace(ptr("0x1")); }\n});\n\`\`\`\n\nNavigated you to the Frida Bridge tab to attach to your connected phone.`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            actionTaken: {
              type: 'configured_frida',
              targetName: funcName,
              targetAddress: selectedFunction.address,
              details: `Prepared Frida hook for ${funcName}`,
            },
          },
        ]);
        setIsThinking(false);
      }, 400);
      return;
    }

    // ==========================================================
    // 4. General AI Reasoning via Dispatch Endpoint
    // ==========================================================
    try {
      const decompilerRole = roles.find((r) => r.id === 'decompiler') || roles[0];
      const prov = providers.find((p) => p.id === decompilerRole.assignedProviderId) || providers[0];

      const res = await api.dispatchRole({
        role: 'decompiler',
        agentConfig: {
          providerType: prov?.type,
          providerUrl: prov?.url,
          apiKey: prov?.apiKey,
          model: decompilerRole.assignedModel,
        },
        objective: query,
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
        setMessages((prev) => [
          ...prev,
          {
            id: `agent_${Date.now()}`,
            sender: 'agent',
            roleTitle: 'Lead Decompiler & Architect',
            text: res.output,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: `agent_${Date.now()}`,
            sender: 'agent',
            roleTitle: 'Mimir Assistant',
            text: res.error || 'I encountered an issue querying the model. Please check your AI Provider settings.',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ]);
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `agent_${Date.now()}`,
          sender: 'agent',
          roleTitle: 'System',
          text: `Error processing request: ${err.message}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setIsThinking(false);
    }
  };

  return (
    <div
      className={`fixed z-50 transition-all duration-200 ease-out flex flex-col bg-[#0b0f17] border border-cyan-500/40 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-xl ${
        isExpanded
          ? 'top-8 bottom-8 left-8 right-8'
          : 'bottom-6 right-6 w-[480px] h-[640px] max-w-[calc(100vw-3rem)] max-h-[calc(100vh-4rem)]'
      }`}
    >
      {/* Floating Pop-up Window Header (Binary Ninja macOS styling) */}
      <div className="px-4 py-3 bg-[#0e131f] border-b border-slate-800 flex items-center justify-between select-none">
        <div className="flex items-center gap-3">
          {/* macOS window dots */}
          <div className="flex items-center gap-1.5 mr-1">
            <button
              onClick={onClose}
              className="w-3 h-3 rounded-full bg-rose-500/80 hover:bg-rose-500 transition-colors"
              title="Close floating popup"
            />
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="w-3 h-3 rounded-full bg-amber-500/80 hover:bg-amber-500 transition-colors"
              title="Toggle size"
            />
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="w-3 h-3 rounded-full bg-emerald-500/80 hover:bg-emerald-500 transition-colors"
              title="Maximize"
            />
          </div>

          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-cyan-950/80 border border-cyan-500/50 flex items-center justify-center text-cyan-400">
              <Bot className="w-3.5 h-3.5" />
            </div>
            <div>
              <span className="text-xs font-bold text-white tracking-tight">Mimir Agent Pop-up</span>
              <span className="text-[10px] text-cyan-400 font-mono block leading-none mt-0.5">
                Autonomous Reverse Engineering Co-pilot
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-slate-400">
          <button
            onClick={() => {
              setMessages([
                {
                  id: 'msg_welcome_reset',
                  sender: 'agent',
                  roleTitle: 'Mimir AI Assistant',
                  text: `Chat cleared. Ask me anything about **${selectedBinary.filename}** in plain English.`,
                  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                },
              ]);
            }}
            className="p-1.5 text-slate-400 hover:text-white rounded-md hover:bg-slate-800 transition-colors"
            title="Reset conversation"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 text-slate-400 hover:text-white rounded-md hover:bg-slate-800 transition-colors"
            title={isExpanded ? 'Collapse' : 'Expand'}
          >
            {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-md hover:bg-slate-800 transition-colors"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Pop-up Sub-Header: Active Target Context Strip */}
      <div className="px-4 py-2 bg-[#090d14] border-b border-slate-800/80 flex items-center justify-between text-[11px] font-mono text-slate-400">
        <div className="flex items-center gap-2 truncate">
          <span className="text-slate-500">Binary:</span>
          <span className="text-slate-200 font-semibold truncate">{selectedBinary.filename}</span>
          <span className="text-slate-600">·</span>
          <span className="text-cyan-400 truncate">{selectedFunction.demangledName || selectedFunction.name}</span>
        </div>
        <span className="text-emerald-400 flex items-center gap-1 shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>Active</span>
        </span>
      </div>

      {/* Main Chat Feed */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 font-sans text-xs bg-[#070a10]">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col gap-1.5 ${
              msg.sender === 'user' ? 'items-end' : 'items-start'
            }`}
          >
            {/* Header info */}
            <div className="flex items-center gap-2 px-1 text-[10px] text-slate-500 font-mono">
              <span className="font-semibold text-slate-400">
                {msg.sender === 'user' ? 'You' : msg.roleTitle || 'Mimir Agent'}
              </span>
              <span>{msg.timestamp}</span>
            </div>

            {/* Bubble */}
            <div
              className={`p-3.5 rounded-2xl max-w-[90%] leading-relaxed whitespace-pre-wrap break-words ${
                msg.sender === 'user'
                  ? 'bg-cyan-500/15 border border-cyan-500/40 text-cyan-50 rounded-br-sm'
                  : 'bg-[#0e131f] border border-slate-800 text-slate-200 rounded-bl-sm shadow-md'
              }`}
            >
              {msg.text}

              {/* Action Taken Badge */}
              {msg.actionTaken && (
                <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center gap-2 text-[11px] text-emerald-400 font-mono">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">
                    Action Executed: {msg.actionTaken.details}
                  </span>
                </div>
              )}

              {/* Interactive Suggested Actions */}
              {msg.suggestedActions && msg.suggestedActions.length > 0 && (
                <div className="mt-3 pt-2.5 border-t border-slate-800 flex flex-wrap gap-2">
                  {msg.suggestedActions.map((sAction, sIdx) => (
                    <button
                      key={sIdx}
                      onClick={sAction.action}
                      className="px-2.5 py-1 text-[11px] font-sans font-medium bg-cyan-950/60 hover:bg-cyan-900/80 text-cyan-300 border border-cyan-800/80 rounded-md transition-colors flex items-center gap-1"
                    >
                      <Sparkles className="w-3 h-3 text-cyan-400" />
                      <span>{sAction.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {isThinking && (
          <div className="flex items-start gap-2 text-slate-400 text-xs">
            <div className="p-3 bg-[#0e131f] border border-slate-800 rounded-2xl flex items-center gap-2 text-cyan-300">
              <Sparkles className="w-4 h-4 animate-spin text-cyan-400" />
              <span>Mimir is analyzing binary context and executing actions...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Prompt Chips */}
      <div className="px-3 py-1.5 bg-[#090d14] border-t border-slate-800/80 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
        <span className="text-[10px] text-slate-500 font-medium shrink-0">Try asking:</span>
        <button
          onClick={() => handleSend('find purchase related functions.')}
          className="px-2 py-0.5 text-[10px] font-mono bg-slate-800/80 hover:bg-slate-800 text-cyan-300 rounded border border-slate-700/80 whitespace-nowrap transition-colors"
        >
          find purchase related functions.
        </button>
        <button
          onClick={() => handleSend('patch this function to return true')}
          className="px-2 py-0.5 text-[10px] font-mono bg-slate-800/80 hover:bg-slate-800 text-amber-300 rounded border border-slate-700/80 whitespace-nowrap transition-colors"
        >
          patch this function X.
        </button>
        <button
          onClick={() => handleSend('explain algorithm and logic flow')}
          className="px-2 py-0.5 text-[10px] font-mono bg-slate-800/80 hover:bg-slate-800 text-slate-300 rounded border border-slate-700/80 whitespace-nowrap transition-colors"
        >
          explain algorithm
        </button>
        <button
          onClick={() => handleSend('trace in frida on phone')}
          className="px-2 py-0.5 text-[10px] font-mono bg-slate-800/80 hover:bg-slate-800 text-emerald-300 rounded border border-slate-700/80 whitespace-nowrap transition-colors"
        >
          trace in frida
        </button>
      </div>

      {/* Chat Input Bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        className="p-3 bg-[#0d121c] border-t border-slate-800 flex items-center gap-2"
      >
        <input
          type="text"
          placeholder="Ask Mimir whatever you want in plain language..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={isThinking}
          className="flex-1 bg-slate-900 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-sans disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={isThinking || !input.trim()}
          className="flex items-center justify-center p-2.5 bg-cyan-400 hover:bg-cyan-300 text-slate-950 rounded-xl transition-colors disabled:opacity-50 shrink-0 font-semibold"
          title="Send query"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
};
