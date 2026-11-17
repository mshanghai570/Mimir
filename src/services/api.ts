import { AIProvider, ModelInfo, FridaDevice, FridaProcess, FridaLogItem } from '../types';

export const api = {
  /**
   * Fetches available models from an OpenAI-compatible URL or Gemini
   */
  async fetchModels(url: string, apiKey: string, providerType?: string, providerId?: string): Promise<{ success: boolean; models: ModelInfo[]; error?: string; note?: string }> {
    try {
      const res = await fetch('/api/ai/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, apiKey, providerType, providerId }),
      });
      return await res.json();
    } catch (err: any) {
      return { success: false, models: [], error: err.message || 'Network error fetching models' };
    }
  },

  /**
   * Universal chat inference
   */
  async sendChat(params: {
    providerId?: string;
    providerType: string;
    providerUrl: string;
    apiKey: string;
    model: string;
    messages: Array<{ role: string; content: string }>;
    systemPrompt?: string;
    temperature?: number;
  }): Promise<{ success: boolean; message?: { role: string; content: string }; error?: string }> {
    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      return await res.json();
    } catch (err: any) {
      return { success: false, error: err.message || 'Chat inference error' };
    }
  },

  /**
   * Dispatch single role sub-task
   */
  async dispatchRole(params: {
    role: string;
    agentConfig: {
      providerId?: string;
      providerType?: string;
      providerUrl?: string;
      apiKey?: string;
      model?: string;
      customPrompt?: string;
      globalPrompt?: string;
      temperature?: number;
      skills?: string[];
    };
    objective: string;
    context: {
      binaryName: string;
      arch: string;
      functionName: string;
      address: string;
      hlil?: string;
      assembly?: string;
    };
  }): Promise<{ success: boolean; role: string; output: string; modelUsed?: string; error?: string }> {
    try {
      const res = await fetch('/api/ai/dispatch-role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      return await res.json();
    } catch (err: any) {
      return {
        success: false,
        role: params.role,
        output: '',
        error: err.message || 'Dispatch failed',
      };
    }
  },

  async listProviders(): Promise<{ success: boolean; providers: AIProvider[]; error?: string }> {
    try {
      const res = await fetch('/api/providers');
      return await res.json();
    } catch (err: any) {
      return { success: false, providers: [], error: err.message || 'Provider store unavailable' };
    }
  },

  async saveProvider(provider: AIProvider): Promise<{ success: boolean; provider?: AIProvider; error?: string }> {
    try {
      const res = await fetch(`/api/providers/${encodeURIComponent(provider.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(provider),
      });
      return await res.json();
    } catch (err: any) {
      return { success: false, error: err.message || 'Provider save failed' };
    }
  },

  async deleteProvider(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch(`/api/providers/${encodeURIComponent(id)}`, { method: 'DELETE' });
      return await res.json();
    } catch (err: any) {
      return { success: false, error: err.message || 'Provider delete failed' };
    }
  },

  /**
   * Fetch skill from URL (GitHub / raw) or parse markdown
   */
  async createAgentJob(params: {
    objective: string;
    context: Record<string, unknown>;
    agents: Array<Record<string, unknown>>;
  }): Promise<{ success: boolean; job?: any; error?: string }> {
    try {
      const res = await fetch('/api/ai/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      return await res.json();
    } catch (err: any) {
      return { success: false, error: err.message || 'Agent job failed to start' };
    }
  },

  async getAgentJob(id: string): Promise<{ success: boolean; job?: any; error?: string }> {
    try {
      const res = await fetch(`/api/ai/jobs/${encodeURIComponent(id)}`);
      return await res.json();
    } catch (err: any) {
      return { success: false, error: err.message || 'Agent job status failed' };
    }
  },

  async cancelAgentJob(id: string): Promise<{ success: boolean; job?: any; error?: string }> {
    try {
      const res = await fetch(`/api/ai/jobs/${encodeURIComponent(id)}/cancel`, { method: 'POST' });
      return await res.json();
    } catch (err: any) {
      return { success: false, error: err.message || 'Agent job cancellation failed' };
    }
  },

  async fetchSkill(source: string): Promise<{ success: boolean; skill?: any; error?: string }> {
    try {
      const res = await fetch('/api/skills/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source }),
      });
      return await res.json();
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to fetch skill' };
    }
  },

  /**
   * Frida device management
   */
  async getFridaDevices(): Promise<{ success: boolean; devices: FridaDevice[]; error?: string }> {
    try {
      const res = await fetch('/api/frida/devices');
      return await res.json();
    } catch (err: any) {
      return { success: false, devices: [], error: err.message };
    }
  },

  /**
   * Get processes on selected device
   */
  async getFridaProcesses(deviceId: string): Promise<{ success: boolean; processes: FridaProcess[]; error?: string }> {
    try {
      const res = await fetch('/api/frida/processes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId }),
      });
      return await res.json();
    } catch (err: any) {
      return { success: false, processes: [], error: err.message };
    }
  },

  /**
   * Spawn fresh application in suspended state
   */
  async spawnFridaApp(
    deviceId: string,
    bundleId: string
  ): Promise<{ success: boolean; process?: FridaProcess; logs: FridaLogItem[]; error?: string }> {
    try {
      const res = await fetch('/api/frida/spawn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId, bundleId }),
      });
      return await res.json();
    } catch (err: any) {
      return { success: false, logs: [], error: err.message };
    }
  },

  /**
   * Execute Frida script
   */
  async executeFridaScript(params: {
    deviceId: string;
    pid: number;
    script: string;
    scriptType: string;
  }): Promise<{ success: boolean; sessionId?: string; logs: FridaLogItem[]; error?: string }> {
    try {
      const res = await fetch('/api/frida/run-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      return await res.json();
    } catch (err: any) {
      return { success: false, logs: [], error: err.message };
    }
  },

  /**
   * Download Binary Ninja plugin bundle
   */
  async exportPluginBundle(endpoint?: string): Promise<{ success: boolean; files: Array<{ filename: string; content: string; type: string }> }> {
    try {
      const query = endpoint ? `?endpoint=${encodeURIComponent(endpoint)}` : '';
      const res = await fetch(`/api/plugin/export${query}`);
      return await res.json();
    } catch {
      return { success: false, files: [] };
    }
  },
};
