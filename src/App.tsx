import React, { useState } from 'react';
import { TopBar, ActiveTab } from './components/TopBar';
import { DisassemblyWorkspace } from './components/DisassemblyWorkspace';
import { FridaBridge } from './components/FridaBridge';
import { SmartPatcher } from './components/SmartPatcher';
import { MultiAgentBoard } from './components/MultiAgentBoard';
import { SettingsStudio } from './components/SettingsStudio';
import { PluginExportModal } from './components/PluginExportModal';

import { sampleBinaries } from './data/mockBinaries';
import {
  defaultAIProviders,
  defaultAgentRoles,
  defaultAgentSkills,
  defaultACPAgents,
} from './data/defaultProviders';
import {
  BinarySample,
  DisassemblyFunction,
  AIProvider,
  AgentRoleConfig,
  AgentSkill,
  ACPAgentConfig,
  PatchRecord,
} from './types';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('decompiler');
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  // Binary Explorer State
  const [binaries, setBinaries] = useState<BinarySample[]>(sampleBinaries);
  const [selectedBinary, setSelectedBinary] = useState<BinarySample>(sampleBinaries[0]);
  const [selectedFunction, setSelectedFunction] = useState<DisassemblyFunction>(
    sampleBinaries[0].functions[0]
  );

  // Targeted Navigation State
  const [patchTargetAddress, setPatchTargetAddress] = useState<string>('0x100003fd0');
  const [fridaHookTarget, setFridaHookTarget] = useState<string>('LicenseManager.verifyLicense');

  // AI & Multi-Agent State
  const [providers, setProviders] = useState<AIProvider[]>(defaultAIProviders);
  const [roles, setRoles] = useState<AgentRoleConfig[]>(defaultAgentRoles);
  const [skills, setSkills] = useState<AgentSkill[]>(defaultAgentSkills);
  const [acpAgents, setAcpAgents] = useState<ACPAgentConfig[]>(defaultACPAgents);
  const [patches, setPatches] = useState<PatchRecord[]>([]);

  // Global Prompt Directive
  const [globalPrompt, setGlobalPrompt] = useState<string>(
    `You are Mimir, an elite Binary Ninja and Frida autonomous reverse engineering agent.
- Prioritize high-level semantics and type reconstruction from HLIL.
- Automatically detect protection mechanisms (anti-debugging, jailbreak detection, SSL pinning, hardware enclave verification).
- When asked to /modify or /patch, calculate surgical ARM64 opcodes and verify 4-byte boundaries.
- For dynamic tasks, write robust, type-checked Frida hooks for iOS/macOS Swift & Objective-C runtimes.`
  );

  // Cross-Navigation Handlers
  const handleNavigateToPatcher = (addr?: string) => {
    if (addr) setPatchTargetAddress(addr);
    setActiveTab('patcher');
  };

  const handleNavigateToFrida = (hookTarget?: string) => {
    if (hookTarget) setFridaHookTarget(hookTarget);
    setActiveTab('frida');
  };

  const handleQuickDispatch = () => {
    setActiveTab('agents');
  };

  // Provider CRUD Handlers
  const handleAddProvider = (newProv: AIProvider) => {
    setProviders((prev) => [...prev, newProv]);
  };

  const handleUpdateProvider = (updated: AIProvider) => {
    setProviders((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  };

  const handleDeleteProvider = (id: string) => {
    setProviders((prev) => prev.filter((p) => p.id !== id));
  };

  // Role CRUD Handler
  const handleUpdateRole = (updatedRole: AgentRoleConfig) => {
    setRoles((prev) => prev.map((r) => (r.id === updatedRole.id ? updatedRole : r)));
  };

  // Skill Handlers
  const handleAddSkill = (skill: AgentSkill) => {
    setSkills((prev) => [skill, ...prev]);
  };

  const handleToggleSkill = (id: string) => {
    setSkills((prev) =>
      prev.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s))
    );
  };

  // ACP Handlers
  const handleAddACPAgent = (agent: ACPAgentConfig) => {
    setAcpAgents((prev) => [...prev, agent]);
  };

  const handleToggleACPAgent = (id: string) => {
    setAcpAgents((prev) =>
      prev.map((a) => (a.id === id ? { ...a, active: !a.active } : a))
    );
  };

  // Patch Handlers
  const handleApplyPatch = (patch: PatchRecord) => {
    setPatches((prev) => [patch, ...prev]);
  };

  const handleRevertPatch = (id: string) => {
    setPatches((prev) => prev.filter((p) => p.id !== id));
  };

  return (
    <div className="min-h-screen bg-[#090d14] text-slate-100 flex flex-col font-sans selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Top Navigation Bar adhering to the Top Bar Contract */}
      <TopBar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onOpenExport={() => setIsExportModalOpen(true)}
        onQuickDispatch={handleQuickDispatch}
      />

      {/* Main Viewport Content */}
      <main className="flex-1 overflow-hidden">
        {activeTab === 'decompiler' && (
          <DisassemblyWorkspace
            binaries={binaries}
            selectedBinary={selectedBinary}
            onSelectBinary={setSelectedBinary}
            selectedFunction={selectedFunction}
            onSelectFunction={setSelectedFunction}
            onNavigateToPatcher={handleNavigateToPatcher}
            onNavigateToFrida={handleNavigateToFrida}
            onApplyPatch={handleApplyPatch}
            providers={providers}
            roles={roles}
          />
        )}

        {activeTab === 'frida' && (
          <FridaBridge initialHookTarget={fridaHookTarget} />
        )}

        {activeTab === 'patcher' && (
          <SmartPatcher
            binaries={binaries}
            selectedBinary={selectedBinary}
            onSelectBinary={setSelectedBinary}
            targetAddress={patchTargetAddress}
            patches={patches}
            onApplyPatch={handleApplyPatch}
            onRevertPatch={handleRevertPatch}
          />
        )}

        {activeTab === 'agents' && (
          <MultiAgentBoard
            roles={roles}
            onUpdateRole={handleUpdateRole}
            providers={providers}
            skills={skills}
            selectedBinary={selectedBinary}
            selectedFunction={selectedFunction}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsStudio
            providers={providers}
            onAddProvider={handleAddProvider}
            onUpdateProvider={handleUpdateProvider}
            onDeleteProvider={handleDeleteProvider}
            skills={skills}
            onAddSkill={handleAddSkill}
            onToggleSkill={handleToggleSkill}
            acpAgents={acpAgents}
            onAddACPAgent={handleAddACPAgent}
            onToggleACPAgent={handleToggleACPAgent}
            globalPrompt={globalPrompt}
            onUpdateGlobalPrompt={setGlobalPrompt}
          />
        )}
      </main>

      {/* macOS Plugin Bundle Export Modal */}
      <PluginExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
      />
    </div>
  );
}
