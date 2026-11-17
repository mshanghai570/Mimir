import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';

interface FormattedOutputProps {
  text: string;
  className?: string;
}

/**
 * Lightweight, zero-dependency markdown renderer for code blocks, inline code, and bold text.
 */
export const FormattedOutput: React.FC<FormattedOutputProps> = ({ text, className = '' }) => {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const segments = text.split(/(```[\s\S]*?```)/g);

  const handleCopyCode = (code: string, idx: number) => {
    navigator.clipboard.writeText(code);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 1500);
  };

  const renderInline = (line: string) => {
    const parts = line.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
    return parts.map((part, idx) => {
      if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
        return (
          <code
            key={idx}
            className="px-1 py-0.5 mx-0.5 rounded bg-slate-800/90 text-cyan-300 font-mono text-[11px]"
          >
            {part.slice(1, -1)}
          </code>
        );
      }
      if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
        return (
          <strong key={idx} className="font-semibold text-white">
            {part.slice(2, -2)}
          </strong>
        );
      }
      return <React.Fragment key={idx}>{part}</React.Fragment>;
    });
  };

  return (
    <div className={`space-y-2 leading-relaxed break-words ${className}`}>
      {segments.map((segment, idx) => {
        if (segment.startsWith('```') && segment.endsWith('```')) {
          const inner = segment.slice(3, -3);
          const firstNewline = inner.indexOf('\n');
          const lang = firstNewline !== -1 ? inner.slice(0, firstNewline).trim() : '';
          const code = firstNewline !== -1 ? inner.slice(firstNewline + 1) : inner;

          return (
            <div
              key={idx}
              className="rounded-lg border border-slate-800 bg-[#06090f] overflow-hidden my-1.5"
            >
              <div className="px-2.5 py-1 bg-[#0b1019] border-b border-slate-800 flex items-center justify-between text-[10px] font-mono text-slate-400">
                <span>{lang || 'code'}</span>
                <button
                  type="button"
                  onClick={() => handleCopyCode(code, idx)}
                  className="flex items-center gap-1 text-slate-400 hover:text-cyan-300 transition-colors"
                >
                  {copiedIdx === idx ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span className="text-emerald-400">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
              <pre className="p-2.5 font-mono text-[11px] text-cyan-100 overflow-x-auto whitespace-pre">
                {code}
              </pre>
            </div>
          );
        }

        if (!segment.trim()) return null;

        return (
          <div key={idx} className="whitespace-pre-wrap">
            {renderInline(segment)}
          </div>
        );
      })}
    </div>
  );
};
