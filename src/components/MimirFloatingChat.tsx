import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Sparkles,
  Maximize2,
  Minimize2,
  X,
  RotateCcw,
  Bot,
  CheckCircle2,
} from 'lucide-react';
import {
  BinarySample,
  DisassemblyFunction,
  InstructionLine,
  PatchRecord,
  AIProvider,
  AgentRoleConfig,
  AgentSkill,
} from '../types';
import { executeNaturalLanguageIntent } from '../utils/agentIntent';
import { FormattedOutput } from './FormattedOutput';

export interface ChatMessage {
  id: string;
  sender: 'user' | 'agent' | 'system';
  roleTitle?: string;
  text: string;
  timestamp: string;
  isError?: boolean;
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
  onSelectInstruction?: (inst: InstructionLine) => void;
  onNavigateToPatcher: (targetAddress?: string) => void;
  onNavigateToFrida: (hookTarget?: string) => void;
  onApplyPatch?: (patch: PatchRecord) => void;
  providers: AIProvider[];
  roles: AgentRoleConfig[];
  skills?: AgentSkill[];
  globalPrompt?: string;
}

export const MimirFloatingChat: React.FC<MimirFloatingChatProps> = ({
  isOpen,
  onClose,
  binaries,
  selectedBinary,
  onSelectBinary,
  selectedFunction,
  onSelectFunction,
  onSelectInstruction,
  onNavigateToPatcher,
  onNavigateToFrida,
  onApplyPatch,
  providers,
  roles,
  skills,
  globalPrompt,
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
      text: `Hello! I am **Mimir**, your autonomous Binary Ninja & Frida agent.\n\nYou can ask in plain language:\n• *"find purchase related functions"*\n• *"patch this function to return true"*\n• *"explain what this function does"*\n• *"trace this function on my connected iPhone"*\n\nTarget loaded: **${selectedBinary.filename}**`,
      timestamp: 'Ready',
    },
  ]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isThinking]);

  if (!isOpen) return null;

  const handleSend = async (customText?: string) => {
    const query = (customText || input).trim();
    if (!query || isThinking) return;

    setInput('');
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    setMessages((prev) => [
      ...prev,
      {
        id: `user_${Date.now()}`,
        sender: 'user',
        text: query,
        timestamp: timeStr,
      },
    ]);

    setIsThinking(true);
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
        onSelectInstruction,
        onApplyPatch,
        onNavigateToFrida,
        chatHistory: messages
          .filter((message) => message.sender === 'user' || message.sender === 'agent')
          .map((message) => ({
            role: message.sender === 'user' ? 'user' : 'assistant',
            content: message.text,
          })),
        onProgress: (text) => {
          setMessages((prev) => [
            ...prev,
            {
              id: `progress_${Date.now()}_${Math.random()}`,
              sender: 'system',
              text,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            },
          ]);
        },
      });

      const suggestedActions: ChatMessage['suggestedActions'] = [];
      if (result.primaryMatch) {
        const primary = result.primaryMatch;
        suggestedActions.push(
          {
            label: 'Patch this function to return true',
            action: () => handleSend('patch this function to return true'),
          },
          {
            label: 'Trace in Frida on phone',
            action: () => onNavigateToFrida(primary.demangledName || primary.name),
          }
        );
      } else if (result.patchedInstruction) {
        const addr = result.patchedInstruction.address;
        suggestedActions.push({
          label: 'View Patch in Smart Patcher Diff Viewer',
          action: () => onNavigateToPatcher(addr),
        });
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `agent_${Date.now()}`,
          sender: 'agent',
          roleTitle: result.roleTitle,
          text: result.text,
          isError: result.isError,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          actionTaken: result.actionTaken,
          suggestedActions: suggestedActions.length > 0 ? suggestedActions : undefined,
        },
      ]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `agent_${Date.now()}`,
          sender: 'agent',
          roleTitle: 'System Error',
          isError: true,
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
          : 'bottom-6 right-6 w-[460px] h-[580px] max-w-[calc(100vw-3rem)] max-h-[calc(100vh-4rem)]'
      }`}
    >
      {/* Floating Pop-up Window Header */}
      <div className="px-4 py-3 bg-[#0e131f] border-b border-slate-800 flex items-center justify-between select-none">
        <div className="flex items-center gap-3">
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
            className={`flex flex-col gap-1.5 ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div className="flex items-center gap-2 px-1 text-[10px] text-slate-500 font-mono">
              <span className={`font-semibold ${msg.isError ? 'text-rose-400' : 'text-slate-400'}`}>
                {msg.sender === 'user' ? 'You' : msg.sender === 'system' ? 'Mimir Activity' : msg.roleTitle || 'Mimir Agent'}
              </span>
              <span>{msg.timestamp}</span>
            </div>

          <div
              className={`p-3.5 rounded-2xl max-w-[92%] leading-relaxed ${
                msg.sender === 'user'
                  ? 'bg-cyan-500/15 border border-cyan-500/40 text-cyan-50 rounded-br-sm'
                  : msg.sender === 'system'
                  ? 'bg-amber-950/20 border border-amber-700/40 text-amber-200 rounded-bl-sm font-mono text-[11px]'
                  : msg.isError
                  ? 'bg-rose-950/30 border border-rose-800/60 text-rose-200 rounded-bl-sm'
                  : 'bg-[#0e131f] border border-slate-800 text-slate-200 rounded-bl-sm shadow-md'
              }`}
            >
              <FormattedOutput text={msg.text} />

              {msg.actionTaken && (
                <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center gap-2 text-[11px] text-emerald-400 font-mono">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">Action Executed: {msg.actionTaken.details}</span>
                </div>
              )}

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
          patch this function to return true
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
