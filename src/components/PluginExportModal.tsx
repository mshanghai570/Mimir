import React, { useState, useEffect } from 'react';
import { Download, X, Copy, Check, FileCode, Apple, Terminal } from 'lucide-react';
import { api } from '../services/api';

interface PluginExportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PluginExportModal: React.FC<PluginExportModalProps> = ({ isOpen, onClose }) => {
  const [files, setFiles] = useState<Array<{ filename: string; content: string; type: string }>>([]);
  const [activeFileIndex, setActiveFileIndex] = useState(0);
  const [hasCopied, setHasCopied] = useState(false);

  useEffect(() => {
    if (isOpen) {
      api.exportPluginBundle().then((res) => {
        if (res.success && res.files) {
          setFiles(res.files);
        }
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const activeFile = files[activeFileIndex];

  const handleCopy = () => {
    if (!activeFile) return;
    navigator.clipboard.writeText(activeFile.content);
    setHasCopied(true);
    setTimeout(() => setHasCopied(false), 2000);
  };

  const handleDownload = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-[#0c1018] border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-[#0e131d] border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-cyan-950/60 border border-cyan-800/60 rounded-lg text-cyan-400">
              <Apple className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Export macOS Binary Ninja Plugin Bundle</h3>
              <p className="text-xs text-slate-400">
                Install directly into <code className="text-cyan-300 font-mono">~/Library/Application Support/Binary Ninja/plugins/</code>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800/80 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 flex overflow-hidden">
          {/* File Selector Sidebar */}
          <div className="w-64 bg-[#090d14] border-r border-slate-800 p-3 space-y-2 shrink-0">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block px-2">
              Generated Files
            </span>
            {files.map((file, idx) => (
              <button
                key={file.filename}
                onClick={() => setActiveFileIndex(idx)}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs font-mono transition-colors flex items-center gap-2 ${
                  activeFileIndex === idx
                    ? 'bg-cyan-950/50 text-cyan-300 border border-cyan-800/60'
                    : 'text-slate-400 hover:bg-slate-900 hover:text-white'
                }`}
              >
                <FileCode className="w-4 h-4 shrink-0" />
                <span className="truncate">{file.filename}</span>
              </button>
            ))}

            <div className="mt-4 pt-4 border-t border-slate-800 px-2 space-y-2">
              <span className="text-[11px] font-semibold text-slate-400 block">Installation</span>
              <div className="text-[10px] text-slate-500 font-mono leading-relaxed">
                Copy files to your macOS Binary Ninja plugin directory:
                <pre className="mt-1 p-2 bg-slate-950 rounded border border-slate-850 text-cyan-300 text-[10px] select-all overflow-x-auto">
                  cp {activeFile?.filename || 'mimir_binja.py'} ~/Library/Application\ Support/Binary\ Ninja/plugins/
                </pre>
              </div>
            </div>
          </div>

          {/* Code Viewer */}
          <div className="flex-1 flex flex-col bg-[#070a10] overflow-hidden">
            {activeFile && (
              <>
                <div className="px-4 py-2.5 bg-[#0e131d] border-b border-slate-800 flex items-center justify-between text-xs">
                  <span className="font-mono text-cyan-400 font-semibold">{activeFile.filename}</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleCopy}
                      className="flex items-center gap-1.5 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs transition-colors"
                    >
                      {hasCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{hasCopied ? 'Copied' : 'Copy Code'}</span>
                    </button>
                    <button
                      onClick={() => handleDownload(activeFile.filename, activeFile.content)}
                      className="flex items-center gap-1.5 px-3 py-1 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-semibold rounded text-xs transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download</span>
                    </button>
                  </div>
                </div>

                <pre className="flex-1 p-4 font-mono text-xs text-slate-300 leading-relaxed overflow-auto select-all bg-[#080b12]">
                  {activeFile.content}
                </pre>
              </>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 bg-[#0e131d] border-t border-slate-800 flex items-center justify-between text-xs">
          <span className="text-slate-500 font-mono">
            Mimir v2.4 macOS Bundle · Universal Binary Ninja 3.5+
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                files.forEach((f) => handleDownload(f.filename, f.content));
              }}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-medium rounded-lg transition-colors"
            >
              Download All Files (.py & .swift)
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-semibold rounded-lg transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
