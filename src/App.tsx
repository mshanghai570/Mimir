import React, { useState, useEffect } from 'react';
import { TopBar, ActiveTab } from './components/TopBar';
import { DisassemblyWorkspace } from './components/DisassemblyWorkspace';
import { FridaBridge } from './components/FridaBridge';
import { SmartPatcher } from './components/SmartPatcher';
import { MultiAgentBoard } from './components/MultiAgentBoard';
import { SettingsStudio } from './components/SettingsStudio';
import { PluginExportModal } from './components/PluginExportModal';
import { api } from './services/api';

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

const DEFAULT_GLOBAL_PROMPT = `You are Mimir, an elite Binary Ninja and Frida autonomous reverse engineering agent.
- Prioritize high-level semantics and type reconstruction from HLIL.
- Automatically detect protection mechanisms (anti-debugging, jailbreak detection, SSL pinning, hardware enclave verification).
- When asked to /modify or /patch, calculate surgical ARM64 opcodes and verify 4-byte boundaries.
- For dynamic tasks, write robust, type-checked Frida hooks for iOS/macOS Swift & Objective-C runtimes.`;

function loadPersisted<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('decompiler');
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  // Binary Explorer State
  const [binaries] = useState<BinarySample[]>(sampleBinaries);
  const [selectedBinary, setSelectedBinary] = useState<BinarySample>(sampleBinaries[0]);
  const [selectedFunction, setSelectedFunction] = useState<DisassemblyFunction>(
    sampleBinaries[0].functions[0]
  );

  // Targeted Navigation State
  const [patchTargetAddress, setPatchTargetAddress] = useState<string>('0x100003fd0');
  const [fridaHookTarget, setFridaHookTarget] = useState<string>('LicenseManager.verifyLicense');

  // Persisted AI & Multi-Agent State
  const [providers, setProviders] = useState<AIProvider[]>(() =>
    loadPersisted('mimir_providers_v1', defaultAIProviders)
  );
  const [roles, setRoles] = useState<AgentRoleConfig[]>(() =>
    loadPersisted('mimir_roles_v1', defaultAgentRoles)
  );
  const [skills, setSkills] = useState<AgentSkill[]>(() =>
    loadPersisted('mimir_skills_v1', defaultAgentSkills)
  );
  const [acpAgents, setAcpAgents] = useState<ACPAgentConfig[]>(() =>
    loadPersisted('mimir_acp_v1', defaultACPAgents)
  );
  const [patches, setPatches] = useState<PatchRecord[]>(() =>
    loadPersisted('mimir_patches_v1', [])
  );
  const [globalPrompt, setGlobalPrompt] = useState<string>(() =>
    loadPersisted('mimir_global_prompt_v1', DEFAULT_GLOBAL_PROMPT)
  );

  useEffect(() => {
    let mounted = true;
    api.listProviders().then((result) => {
      if (!mounted) return;
      if (result.success && result.providers.length > 0) {
        setProviders(result.providers);
      } else if (result.success) {
        providers.forEach((provider) => void api.saveProvider(provider));
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        'mimir_providers_v1',
        JSON.stringify(providers.map(({ apiKey, ...provider }) => ({ ...provider, apiKey: '' })))
      );
    } catch {}
  }, [providers]);

  useEffect(() => {
    try {
      localStorage.setItem('mimir_roles_v1', JSON.stringify(roles));
    } catch {}
  }, [roles]);

  useEffect(() => {
    try {
      localStorage.setItem('mimir_skills_v1', JSON.stringify(skills));
    } catch {}
  }, [skills]);

  useEffect(() => {
    try {
      localStorage.setItem('mimir_acp_v1', JSON.stringify(acpAgents));
    } catch {}
  }, [acpAgents]);

  useEffect(() => {
    try {
      localStorage.setItem('mimir_patches_v1', JSON.stringify(patches));
    } catch {}
  }, [patches]);

  useEffect(() => {
    try {
      localStorage.setItem('mimir_global_prompt_v1', JSON.stringify(globalPrompt));
    } catch {}
  }, [globalPrompt]);

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
    void api.saveProvider(newProv);
  };

  const handleUpdateProvider = (updated: AIProvider) => {
    setProviders((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    void api.saveProvider(updated);
  };

  const handleDeleteProvider = (id: string) => {
    setProviders((prev) => prev.filter((p) => p.id !== id));
    void api.deleteProvider(id);
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
    setSkills((prev) => prev.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s)));
  };

  // ACP Handlers
  const handleAddACPAgent = (agent: ACPAgentConfig) => {
    setAcpAgents((prev) => [...prev, agent]);
  };

  const handleToggleACPAgent = (id: string) => {
    setAcpAgents((prev) => prev.map((a) => (a.id === id ? { ...a, active: !a.active } : a)));
  };

  // Patch Handlers (replace existing patch at same binary+address so disassembly stays clean)
  const handleApplyPatch = (patch: PatchRecord) => {
    setPatches((prev) => [
      patch,
      ...prev.filter(
        (p) =>
          !(
            p.binaryName === patch.binaryName &&
            p.address.toLowerCase() === patch.address.toLowerCase()
          )
      ),
    ]);
  };

  const handleRevertPatch = (id: string) => {
    setPatches((prev) => prev.filter((p) => p.id !== id));
  };

  const handleResetDefaults = () => {
    setProviders(defaultAIProviders);
    setRoles(defaultAgentRoles);
    setSkills(defaultAgentSkills);
    setAcpAgents(defaultACPAgents);
    setGlobalPrompt(DEFAULT_GLOBAL_PROMPT);
    setPatches([]);
  };

  return (
    <div className="min-h-screen bg-[#090d14] text-slate-100 flex flex-col font-sans selection:bg-cyan-500/30 selection:text-cyan-200">
      <TopBar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onOpenExport={() => setIsExportModalOpen(true)}
        onQuickDispatch={handleQuickDispatch}
      />

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
            patches={patches}
            providers={providers}
            roles={roles}
            skills={skills}
            globalPrompt={globalPrompt}
          />
        )}

        {activeTab === 'frida' && <FridaBridge initialHookTarget={fridaHookTarget} />}

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
            globalPrompt={globalPrompt}
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
            onResetDefaults={handleResetDefaults}
          />
        )}
      </main>

      <PluginExportModal isOpen={isExportModalOpen} onClose={() => setIsExportModalOpen(false)} />
    </div>
  );
}
