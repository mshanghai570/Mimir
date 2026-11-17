import React from 'react';
import { Download, Sparkles } from 'lucide-react';

export type ActiveTab = 'decompiler' | 'frida' | 'patcher' | 'agents' | 'settings';

interface TopBarProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  onOpenExport: () => void;
  onQuickDispatch: () => void;
  isDispatching?: boolean;
}

export const TopBar: React.FC<TopBarProps> = ({
  activeTab,
  onTabChange,
  onOpenExport,
  onQuickDispatch,
  isDispatching = false,
}) => {
  return (
    <header className="flex items-center justify-between gap-8 px-6 py-3.5 bg-[#0b0f17] border-b border-slate-800/80 sticky top-0 z-40 select-none">
      {/* Zone 1: Brand Wordmark (Single text element in display face, no subtitle or pill badges) */}
      <div className="flex items-center gap-3 shrink-0">
        <button
          onClick={() => onTabChange('decompiler')}
          className="text-lg font-bold tracking-tight text-white hover:text-cyan-400 transition-colors whitespace-nowrap"
        >
          Mimir
        </button>
        <span className="text-xs text-slate-500 font-mono hidden sm:inline" aria-hidden="true">·</span>
        <span className="text-xs text-slate-400 font-mono hidden sm:inline">Binary Ninja & Frida Assistant</span>
      </div>

      {/* Zone 2: 4-5 concise single-line nav links */}
      <nav className="flex items-center gap-1 sm:gap-6 text-sm font-medium text-slate-400 overflow-x-auto no-scrollbar">
        <button
          onClick={() => onTabChange('decompiler')}
          className={`px-2.5 py-1.5 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
            activeTab === 'decompiler'
              ? 'text-cyan-400 border-cyan-400 font-semibold'
              : 'border-transparent hover:text-slate-200'
          }`}
        >
          Decompiler
        </button>
        <button
          onClick={() => onTabChange('frida')}
          className={`px-2.5 py-1.5 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
            activeTab === 'frida'
              ? 'text-cyan-400 border-cyan-400 font-semibold'
              : 'border-transparent hover:text-slate-200'
          }`}
        >
          Frida Bridge
        </button>
        <button
          onClick={() => onTabChange('patcher')}
          className={`px-2.5 py-1.5 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
            activeTab === 'patcher'
              ? 'text-cyan-400 border-cyan-400 font-semibold'
              : 'border-transparent hover:text-slate-200'
          }`}
        >
          Smart Patcher
        </button>
        <button
          onClick={() => onTabChange('agents')}
          className={`px-2.5 py-1.5 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
            activeTab === 'agents'
              ? 'text-cyan-400 border-cyan-400 font-semibold'
              : 'border-transparent hover:text-slate-200'
          }`}
        >
          Multi-Agent
        </button>
        <button
          onClick={() => onTabChange('settings')}
          className={`px-2.5 py-1.5 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
            activeTab === 'settings'
              ? 'text-cyan-400 border-cyan-400 font-semibold'
              : 'border-transparent hover:text-slate-200'
          }`}
        >
          AI Settings
        </button>
      </nav>

      {/* Zone 3: 1 Primary Action */}
      <div className="flex items-center gap-3 shrink-0">
        <button
          onClick={onQuickDispatch}
          disabled={isDispatching}
          className="hidden md:flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-cyan-300 bg-cyan-950/70 border border-cyan-700/60 rounded-md hover:bg-cyan-900/60 hover:text-white transition-all whitespace-nowrap shrink-0 disabled:opacity-50"
        >
          <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
          <span>{isDispatching ? 'Dispatching...' : 'Dispatch Agents'}</span>
        </button>
        <button
          onClick={onOpenExport}
          className="flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold text-white bg-slate-800 hover:bg-slate-700 border border-slate-700/80 rounded-md transition-all whitespace-nowrap shrink-0 shadow-sm"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export Plugin</span>
        </button>
      </div>
    </header>
  );
};
