import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '15mb' }));

// Initialize Google GenAI client if GEMINI_API_KEY is present
function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

let ai: GoogleGenAI | null = getGeminiClient();

function normalizeOpenAIEndpoint(url: string, suffix: 'models' | 'chat/completions'): string {
  const targetBase = url.trim().replace(/\/+$/, '');
  if (
    targetBase.endsWith('/v1') ||
    targetBase.endsWith('/api') ||
    targetBase.includes('/v1/') ||
    targetBase.endsWith('/openai/v1')
  ) {
    return `${targetBase}/${suffix}`;
  }
  return `${targetBase}/v1/${suffix}`;
}

async function callWithRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      const status = err?.status || err?.code;
      const isRetryable =
        status === 429 ||
        status === 503 ||
        status === 502 ||
        err?.name === 'AbortError' ||
        /timeout|rate limit|temporarily/i.test(err?.message || '');

      if (!isRetryable || attempt === maxRetries) {
        throw err;
      }
      const delayMs = 450 * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

function parseProviderError(err: any): { status: number; message: string } {
  const rawMessage = err?.message || 'Upstream AI provider error';
  const status = typeof err?.status === 'number' ? err.status : 500;

  if (status === 403 || /PERMISSION_DENIED|API_KEY_INVALID/i.test(rawMessage)) {
    return {
      status: 403,
      message: 'API key rejected or missing permissions. Verify your key in Settings > Secrets or provider configuration.',
    };
  }
  if (status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(rawMessage)) {
    return {
      status: 429,
      message: 'Rate limit or quota exceeded for selected model. Switch to gemini-4-hydrogen or verify billing tier.',
    };
  }
  if (status === 404 || /NOT_FOUND/i.test(rawMessage)) {
    return {
      status: 404,
      message: `Requested model was not found (${rawMessage}). Select a valid model in Settings.`,
    };
  }
  return { status: status >= 400 && status < 600 ? status : 500, message: rawMessage };
}

// Health check endpoint
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    timestamp: new Date().toISOString(),
  });
});

// ==========================================
// 1. AI Providers & Model Discovery Endpoint
// ==========================================
app.post('/api/ai/models', async (req, res) => {
  try {
    const { url, apiKey, providerType } = req.body;

    if (providerType === 'gemini' || (!url && !providerType)) {
      const geminiModels = [
        { id: 'gemini-4-hydrogen', name: 'Gemini 4 Hydrogen (Agentic & Fast)', provider: 'Google Gemini', contextWindow: 1048576 },
        { id: 'gemini-4-argon', name: 'Gemini 4 Argon (Advanced Code & RE Reasoning)', provider: 'Google Gemini', contextWindow: 2097152 },
        { id: 'gemini-4-carbon', name: 'Gemini 4 Carbon (Deep Binary Security Audit)', provider: 'Google Gemini', contextWindow: 2097152 },
        { id: 'gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash Lite (Ultra Low Latency)', provider: 'Google Gemini', contextWindow: 524288 },
      ];
      return res.json({ success: true, models: geminiModels });
    }

    if (!url) {
      return res.status(400).json({ success: false, error: 'Provider URL is required' });
    }

    const targetBase = url.trim().replace(/\/+$/, '');
    const modelsEndpoint = normalizeOpenAIEndpoint(targetBase, 'models');

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey.trim()}`;
    }

    let fetchResponse: Response | null = null;
    try {
      fetchResponse = await fetch(modelsEndpoint, { headers, signal: AbortSignal.timeout(9000) });
    } catch {
      try {
        if (targetBase.includes('11434') || targetBase.includes('ollama')) {
          const ollamaRes = await fetch(`${targetBase.replace(/\/v1$/, '')}/api/tags`, { signal: AbortSignal.timeout(6000) });
          if (ollamaRes.ok) {
            const ollamaData = (await ollamaRes.json()) as { models?: Array<{ name: string; size?: number }> };
            const models = (ollamaData.models || []).map((m) => ({
              id: m.name,
              name: `${m.name} (Ollama Local)`,
              provider: 'Ollama',
              contextWindow: 32768,
            }));
            return res.json({ success: true, models });
          }
        }
      } catch {
        // Ignore and fall through to standard catalog
      }
    }

    if (fetchResponse && fetchResponse.ok) {
      const data = (await fetchResponse.json()) as { data?: Array<{ id: string; owned_by?: string }> };
      if (Array.isArray(data.data)) {
        const models = data.data.map((m) => ({
          id: m.id,
          name: m.id,
          provider: m.owned_by || 'OpenAI Compatible',
          contextWindow: 128000,
        }));
        return res.json({ success: true, models });
      }
    }

    const fallbackList = [
      { id: 'gpt-4o', name: 'gpt-4o', provider: 'OpenAI Compatible' },
      { id: 'gpt-4o-mini', name: 'gpt-4o-mini', provider: 'OpenAI Compatible' },
      { id: 'claude-3-7-sonnet', name: 'claude-3-7-sonnet', provider: 'Anthropic / ACP' },
      { id: 'deepseek-chat', name: 'deepseek-chat (V3)', provider: 'DeepSeek' },
      { id: 'deepseek-reasoner', name: 'deepseek-reasoner (R1)', provider: 'DeepSeek' },
      { id: 'qwen2.5-coder-32b', name: 'qwen2.5-coder-32b', provider: 'Local / Ollama' },
    ];
    return res.json({
      success: true,
      models: fallbackList,
      note: 'Endpoint reachable or restricted; loaded standard compatible model catalog.',
    });
  } catch (error: any) {
    console.error('Error fetching models:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to connect to provider endpoint' });
  }
});

// ==========================================
// 2. Universal AI Chat / Inference Endpoint
// ==========================================
app.post('/api/ai/chat', async (req, res) => {
  try {
    const { providerType, providerUrl, apiKey, model, messages, systemPrompt, temperature } = req.body;

    // Route 1: Google Gemini via @google/genai server-side SDK
    if (providerType === 'gemini' || model?.startsWith('gemini') || (!providerUrl && process.env.GEMINI_API_KEY)) {
      if (!ai) ai = getGeminiClient();
      if (!ai) {
        return res.status(400).json({
          success: false,
          error: 'Gemini API Key is not configured in Settings > Secrets. Configure GEMINI_API_KEY or select an OpenAI-compatible provider.',
        });
      }

      const selectedModel = model || 'gemini-4-hydrogen';
      const structuredContents =
        Array.isArray(messages) && messages.length > 0
          ? messages.map((m: { role: string; content: string }) => ({
              role: m.role === 'assistant' || m.role === 'model' ? 'model' : 'user',
              parts: [{ text: m.content }],
            }))
          : [{ role: 'user', parts: [{ text: 'Analyze binary' }] }];

      const genResponse = await callWithRetry(() =>
        ai!.models.generateContent({
          model: selectedModel,
          contents: structuredContents,
          config: {
            systemInstruction:
              systemPrompt ||
              'You are Mimir, an elite Binary Ninja and Frida reverse engineering agent specialized in binary disassembly, HLIL decompiler analysis, ARM64/x86_64 safe patching, and mobile dynamic instrumentation.',
          },
        })
      );

      return res.json({
        success: true,
        message: {
          role: 'assistant',
          content: genResponse.text || 'No response generated.',
        },
      });
    }

    // Route 2: OpenAI-Compatible Endpoint
    if (!providerUrl) {
      return res.status(400).json({ success: false, error: 'Provider URL is missing for non-Gemini provider.' });
    }

    const chatEndpoint = normalizeOpenAIEndpoint(providerUrl, 'chat/completions');
    const outboundMessages = [];
    if (systemPrompt) {
      outboundMessages.push({ role: 'system', content: systemPrompt });
    }
    if (Array.isArray(messages)) {
      outboundMessages.push(...messages);
    }

    const payload = {
      model: model || 'gpt-4o',
      messages: outboundMessages,
      temperature: typeof temperature === 'number' ? temperature : 0.2,
      max_tokens: 3000,
    };

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey.trim()}`;
    }

    const aiRes = await callWithRetry(() =>
      fetch(chatEndpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(60000),
      })
    );

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      return res.status(aiRes.status).json({
        success: false,
        error: `Provider error (${aiRes.status}): ${errText.slice(0, 500)}`,
      });
    }

    const json = (await aiRes.json()) as any;
    const reply = json.choices?.[0]?.message?.content || 'No text output returned by provider.';

    return res.json({
      success: true,
      message: {
        role: 'assistant',
        content: reply,
      },
      usage: json.usage,
    });
  } catch (error: any) {
    console.error('Chat API Error:', error);
    const parsed = parseProviderError(error);
    return res.status(parsed.status).json({ success: false, error: parsed.message });
  }
});

// ==========================================
// 3. Multi-Agent Task Dispatcher
// ==========================================
app.post('/api/ai/dispatch-role', async (req, res) => {
  try {
    const { role, agentConfig, objective, context } = req.body;
    const safeRole = typeof role === 'string' ? role : 'decompiler';
    const safeContext = context || {};

    let roleSystem = '';
    let roleInstructions = '';

    switch (safeRole) {
      case 'decompiler':
        roleSystem =
          'You are the Lead Decompiler & Reverse Engineering Architect for Binary Ninja. Your goal is to analyze High-Level Intermediate Language (HLIL) and assembly, identify data structures, recover algorithm semantics, and document function interfaces.';
        roleInstructions =
          'Analyze the decompiled code and disassembly. Identify the purpose of the function, parameter types, state mutations, and key cryptographic or validation logic.';
        break;
      case 'patcher':
        roleSystem =
          'You are the Smart Binary Patcher Agent for Binary Ninja. Your goal is to synthesize safe, surgical ARM64 / x86_64 machine code patches, invert conditional branches, bypass checks, and verify instruction alignments and Mach-O code signatures.';
        roleInstructions =
          'Examine the target verification check. Provide exact original and patched instruction encodings (little-endian hex), describe the patch strategy, and provide Mach-O file offset & codesign commands.';
        break;
      case 'frida_tracer':
        roleSystem =
          'You are the Dynamic Frida Instrumentation Specialist. Your goal is to generate real-time Frida hooks for iOS and Android processes, trace function calls, inspect Objective-C/Swift method signatures, intercept arguments, and extract runtime keys.';
        roleInstructions =
          'Write a ready-to-inject Frida JavaScript script with Interceptor.attach onEnter/onLeave handlers, clean pointer/register formatting, and attach instructions.';
        break;
      case 'auditor':
        roleSystem =
          'You are the Binary Safety & Vulnerability Auditor. Your goal is to inspect binary functions for memory corruption, buffer overflows, format string bugs, insecure crypto primitives, and authorization logic flaws.';
        roleInstructions =
          'Audit the binary slice for vulnerabilities, unsafe API usage, and authorization bypass vectors. Provide severity ratings and concrete remediation advice.';
        break;
      case 'swift_demangler':
        roleSystem =
          'You are the Swift & Objective-C Metadata Demangler. You resolve Swift 5 mangled symbols, protocols, witness tables, class hierarchies, and Objective-C selector tables for Mach-O binaries.';
        roleInstructions =
          'Demangle any Swift symbols found in the disassembly slice. Map out class hierarchies, calling conventions (swiftcall/cdecl), and protocol conformance.';
        break;
      case 'acp_agent':
        roleSystem =
          'You are an autonomous Agent Client Protocol (ACP) agent. You execute structured reverse engineering sub-tasks, coordinate tool calls with the Binary Ninja host, and return structured atomic steps.';
        roleInstructions =
          'Process the objective using ACP standards, providing atomic execution steps, Binary Ninja API calls, and verification invariants.';
        break;
      default:
        roleSystem = 'You are an expert Binary Ninja and Frida reverse engineering agent.';
        roleInstructions = 'Complete the assigned reverse engineering objective.';
    }

    // Merge global prompt, role-specific prompt directive, and enabled agent skills
    const systemParts = [roleSystem];
    if (agentConfig?.globalPrompt) {
      systemParts.push(`[GLOBAL ORCHESTRATOR DIRECTIVES]\n${agentConfig.globalPrompt}`);
    }
    if (agentConfig?.customPrompt) {
      systemParts.push(`[ROLE SPECIFIC DIRECTIVE]\n${agentConfig.customPrompt}`);
    }
    if (Array.isArray(agentConfig?.skills) && agentConfig.skills.length > 0) {
      systemParts.push(`[ACTIVE SKILLS & TOOLS]\n${agentConfig.skills.map((s: string) => `- ${s}`).join('\n')}`);
    }
    const composedSystemInstruction = systemParts.join('\n\n');

    const prompt = `[ROLE: ${safeRole.toUpperCase()}]
${roleInstructions}

[OBJECTIVE]
${objective || 'Analyze selected function'}

[BINARY CONTEXT]
Binary Name: ${safeContext.binaryName || 'libSecureCryptoCore.dylib'}
Architecture: ${safeContext.arch || 'ARM64 (Mach-O)'}
Selected Function: ${safeContext.functionName || 'verifyLicense'}
Address: ${safeContext.address || '0x100003fa0'}

[HLIL DECOMPILATION]
${safeContext.hlil || '// No HLIL provided'}

[ASSEMBLY SLICE]
${safeContext.assembly || '// No assembly provided'}

Provide a concise, rigorous technical analysis and actionable output for your assigned role.`;

    const isGeminiRoute =
      agentConfig?.providerType === 'gemini' ||
      agentConfig?.model?.startsWith('gemini') ||
      !agentConfig?.providerUrl;

    if (isGeminiRoute) {
      if (!ai) ai = getGeminiClient();
      if (!ai) {
        return res.status(400).json({
          success: false,
          role: safeRole,
          output: '',
          error:
            'GEMINI_API_KEY is not configured in Settings > Secrets. Add a Gemini key or assign an OpenAI-compatible/Ollama provider to this role.',
        });
      }

      const selectedModel = agentConfig?.model || 'gemini-4-hydrogen';
      const response = await callWithRetry(() =>
        ai!.models.generateContent({
          model: selectedModel,
          contents: prompt,
          config: { systemInstruction: composedSystemInstruction },
        })
      );

      return res.json({
        success: true,
        role: safeRole,
        output: response.text || 'No response generated by Gemini.',
        modelUsed: selectedModel,
      });
    }

    // Route to configured OpenAI-compatible provider
    const chatEndpoint = normalizeOpenAIEndpoint(agentConfig.providerUrl, 'chat/completions');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (agentConfig.apiKey) {
      headers['Authorization'] = `Bearer ${agentConfig.apiKey.trim()}`;
    }

    const aiRes = await callWithRetry(() =>
      fetch(chatEndpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: agentConfig.model || 'gpt-4o',
          messages: [
            { role: 'system', content: composedSystemInstruction },
            { role: 'user', content: prompt },
          ],
          temperature: typeof agentConfig.temperature === 'number' ? agentConfig.temperature : 0.2,
          max_tokens: 3000,
        }),
        signal: AbortSignal.timeout(60000),
      })
    );

    if (!aiRes.ok) {
      const errBody = await aiRes.text();
      return res.status(aiRes.status).json({
        success: false,
        role: safeRole,
        output: '',
        error: `Provider (${agentConfig.providerUrl}) returned ${aiRes.status}: ${errBody.slice(0, 300)}`,
      });
    }

    const data = (await aiRes.json()) as any;
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      return res.status(502).json({
        success: false,
        role: safeRole,
        output: '',
        error: 'Upstream provider returned an empty completion response.',
      });
    }

    return res.json({
      success: true,
      role: safeRole,
      output: content,
      modelUsed: agentConfig.model || 'OpenAI Compatible',
    });
  } catch (error: any) {
    console.error('Dispatch error:', error);
    const parsed = parseProviderError(error);
    return res.status(parsed.status).json({
      success: false,
      role: req.body?.role || 'decompiler',
      output: '',
      error: parsed.message,
    });
  }
});

// ==========================================
// 4. Skills Importer (skills.md / GitHub)
// ==========================================
app.post('/api/skills/fetch', async (req, res) => {
  try {
    const { source } = req.body;
    if (!source) {
      return res.status(400).json({ success: false, error: 'Skill source URL or content is required' });
    }

    let content = source;

    if (source.startsWith('http://') || source.startsWith('https://')) {
      let fetchUrl = source;
      if (fetchUrl.includes('github.com') && !fetchUrl.includes('raw.githubusercontent.com')) {
        fetchUrl = fetchUrl
          .replace('github.com', 'raw.githubusercontent.com')
          .replace('/blob/', '/');
      }

      const resp = await fetch(fetchUrl, { signal: AbortSignal.timeout(8000) });
      if (!resp.ok) {
        return res.status(resp.status).json({ success: false, error: `Failed to fetch skill from URL: ${resp.statusText}` });
      }
      content = await resp.text();
    }

    const titleMatch = content.match(/^#\s+(.+)$/m) || content.match(/name:\s*["']?([^"'\n]+)["']?/);
    const skillName = titleMatch ? titleMatch[1].trim() : 'Imported Reverse Engineering Skill';

    const descMatch = content.match(/description:\s*>?-?\s*([^\n#]+)/) || content.match(/##\s+Overview\s*\n+([^\n#]+)/i);
    const skillDescription = descMatch ? descMatch[1].trim() : 'Custom skill loaded from external repository or markdown.';

    const tools: string[] = [];
    const toolRegex = /(?:###|##|`)\s*(?:Tool|function|method):\s*([a-zA-Z0-9_-]+)/gi;
    let match;
    while ((match = toolRegex.exec(content)) !== null) {
      tools.push(match[1]);
    }

    return res.json({
      success: true,
      skill: {
        id: `skill_${Date.now()}`,
        name: skillName,
        description: skillDescription,
        source: source.startsWith('http') ? source : 'Uploaded File / Custom',
        tools: tools.length > 0 ? tools : ['binja_disasm', 'patch_opcode', 'frida_hook'],
        rawMarkdown: content,
        isBuiltin: false,
        enabled: true,
        category: 'macho_analysis',
      },
    });
  } catch (error: any) {
    console.error('Skill fetch error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 5. Frida Device & Process Management
// ==========================================
const mockDevices = [
  {
    id: 'usb_ios_00008110-001248E90123801E',
    name: 'iPhone 15 Pro (A2848)',
    type: 'usb',
    platform: 'ios',
    os: 'iOS 17.4.1 (Darwin 23.4.0)',
    arch: 'arm64e',
    status: 'connected',
    battery: '88%',
    serverVersion: '16.5.6',
    transport: 'usbmuxd USB-C 10Gbps',
  },
  {
    id: 'usb_android_9A181FFAZ0014B',
    name: 'Google Pixel 8 Pro',
    type: 'usb',
    platform: 'android',
    os: 'Android 14 (API 34, Linux 6.1)',
    arch: 'aarch64',
    status: 'connected',
    battery: '94%',
    serverVersion: '16.5.6',
    transport: 'adb USB 3.2',
  },
  {
    id: 'local_darwin_host',
    name: 'Local Host (MacBook Pro M3 Max)',
    type: 'local',
    platform: 'macos',
    os: 'macOS 14.5 Sonoma (23F79)',
    arch: 'arm64',
    status: 'ready',
    battery: '100% AC',
    serverVersion: '16.5.6',
    transport: 'XPC / In-Process Mach Port',
  },
];

const mockProcesses: Record<string, Array<{ pid: number; name: string; bundleId: string; arch: string; state: string }>> = {
  'usb_ios_00008110-001248E90123801E': [
    { pid: 1482, name: 'SecureBankAuth', bundleId: 'com.fintech.securebank', arch: 'arm64e', state: 'running' },
    { pid: 2190, name: 'SignalApp', bundleId: 'org.whispersystems.signal', arch: 'arm64e', state: 'running' },
    { pid: 840, name: 'MobileSafari', bundleId: 'com.apple.mobilesafari', arch: 'arm64e', state: 'background' },
    { pid: 104, name: 'SpringBoard', bundleId: 'com.apple.springboard', arch: 'arm64e', state: 'system' },
    { pid: 3201, name: 'CryptoWalletX', bundleId: 'com.web3.cryptowalletx', arch: 'arm64e', state: 'running' },
  ],
  'usb_android_9A181FFAZ0014B': [
    { pid: 8940, name: 'SecureKeyPass', bundleId: 'com.security.authenticator', arch: 'aarch64', state: 'running' },
    { pid: 12040, name: 'Telegram', bundleId: 'org.telegram.messenger', arch: 'aarch64', state: 'running' },
    { pid: 489, name: 'system_server', bundleId: 'android.system.server', arch: 'aarch64', state: 'system' },
    { pid: 15420, name: 'EnterpriseVPN', bundleId: 'com.enterprise.vpnclient', arch: 'aarch64', state: 'running' },
  ],
  'local_darwin_host': [
    { pid: 4890, name: 'Binary Ninja', bundleId: 'com.vector35.binaryninja', arch: 'arm64', state: 'running' },
    { pid: 6712, name: 'SecureCoreDaemon', bundleId: 'com.apple.security.agent', arch: 'arm64', state: 'running' },
    { pid: 9140, name: 'Terminal', bundleId: 'com.apple.Terminal', arch: 'arm64', state: 'running' },
  ],
};

app.get('/api/frida/devices', (_req, res) => {
  return res.json({ success: true, devices: mockDevices });
});

app.post('/api/frida/processes', (req, res) => {
  const { deviceId } = req.body;
  const list = mockProcesses[deviceId] || mockProcesses['local_darwin_host'];
  return res.json({ success: true, processes: list });
});

app.post('/api/frida/spawn', (req, res) => {
  const { deviceId, bundleId } = req.body;
  if (!bundleId || typeof bundleId !== 'string') {
    return res.status(400).json({ success: false, error: 'Bundle ID is required to spawn application.' });
  }
  const cleanBundle = bundleId.trim();
  const device = mockDevices.find((d) => d.id === deviceId) || mockDevices[0];
  const spawnedPid = Math.floor(20000 + Math.random() * 10000);
  const newProc = {
    pid: spawnedPid,
    name: cleanBundle.split('.').pop() || cleanBundle,
    bundleId: cleanBundle,
    arch: device.arch,
    state: 'suspended',
  };

  if (!mockProcesses[device.id]) {
    mockProcesses[device.id] = [];
  }
  mockProcesses[device.id] = [newProc, ...mockProcesses[device.id].filter((p) => p.bundleId !== cleanBundle)];

  return res.json({
    success: true,
    process: newProc,
    logs: [
      {
        timestamp: new Date().toISOString(),
        level: 'info',
        message: `[Frida] Spawned ${cleanBundle} (PID ${spawnedPid}) on ${device.name} with suspended main thread.`,
      },
      {
        timestamp: new Date(Date.now() + 60).toISOString(),
        level: 'success',
        message: `[Frida] Ready for early-instrumentation hooks prior to Mach-O dyld/entrypoint resume.`,
      },
    ],
  });
});

app.post('/api/frida/run-script', (req, res) => {
  const { deviceId, pid, script, scriptType } = req.body;
  const scriptSource = typeof script === 'string' ? script : '';

  // Basic script brace validation
  const openBraces = (scriptSource.match(/\{/g) || []).length;
  const closeBraces = (scriptSource.match(/\}/g) || []).length;
  if (openBraces !== closeBraces) {
    return res.status(400).json({
      success: false,
      logs: [
        {
          timestamp: new Date().toISOString(),
          level: 'error',
          message: `[Frida] Script compilation failed: Unbalanced braces (${openBraces} '{' vs ${closeBraces} '}').`,
        },
      ],
      error: 'Unbalanced braces in Frida script',
    });
  }

  const now = Date.now();
  const device = mockDevices.find((d) => d.id === deviceId);
  const proc = (mockProcesses[deviceId] || []).find((p) => p.pid === pid);
  const hookCount = (scriptSource.match(/Interceptor\.attach/g) || []).length || 1;
  const classMatch = scriptSource.match(/targetClass\s*=\s*["']([^"']+)["']/);
  const methodMatch = scriptSource.match(/targetMethod\s*=\s*["']([^"']+)["']/);
  const exportMatches = Array.from(scriptSource.matchAll(/findExportByName\([^,]+,\s*["']([^"']+)["']\)/g)).map((m) => m[1]);

  const logs: Array<{ timestamp: string; level: string; message: string }> = [
    {
      timestamp: new Date(now).toISOString(),
      level: 'info',
      message: `[Frida] Attached to ${proc ? `${proc.name} (PID ${pid})` : `PID ${pid}`} on ${device?.name || deviceId}`,
    },
    {
      timestamp: new Date(now + 75).toISOString(),
      level: 'info',
      message: `[Frida] GumJS agent compiled (${scriptType || 'custom'}, ${scriptSource.split('\n').length} lines). Installing ${hookCount} Interceptor hook(s)...`,
    },
    {
      timestamp: new Date(now + 150).toISOString(),
      level: 'success',
      message: `[Frida] ${hookCount} hook(s) armed cleanly in target address space (${device?.arch || 'arm64e'}).`,
    },
  ];

  if (scriptType === 'jailbreak_bypass' || scriptSource.includes('ptrace')) {
    logs.push(
      {
        timestamp: new Date(now + 280).toISOString(),
        level: 'event',
        message: `[Hook] access("/Applications/Cydia.app", F_OK) intercepted -> Spoofing ENOENT (-1)`,
      },
      {
        timestamp: new Date(now + 360).toISOString(),
        level: 'patch',
        message: `[Hook] ptrace(PT_DENY_ATTACH, 0, 0, 0) neutralized -> Returning 0x0 (Debugger permitted)`,
      }
    );
  } else if (scriptType === 'ssl_pinning' || scriptSource.includes('SecTrustEvaluate')) {
    logs.push(
      {
        timestamp: new Date(now + 290).toISOString(),
        level: 'event',
        message: `[Hook] SecTrustEvaluateWithError(trust=0x16b0a1200) intercepted`,
      },
      {
        timestamp: new Date(now + 340).toISOString(),
        level: 'patch',
        message: `[Hook] Overriding trust evaluation status -> errSecSuccess (0x1). TLS pinning bypassed.`,
      }
    );
  } else if (scriptType === 'arm64_trace' || scriptSource.includes('this.context.x0')) {
    logs.push(
      {
        timestamp: new Date(now + 290).toISOString(),
        level: 'event',
        message: `[Trace] Hit offset 0x3fa0 | x0=0x1048a2010 x1=0x16fdff2c0 sp=0x16fdff280`,
      },
      {
        timestamp: new Date(now + 350).toISOString(),
        level: 'patch',
        message: `[Trace] Leave 0x3fa0 -> return x0=0x1 (elapsed 42µs)`,
      }
    );
  } else {
    const targetDesc =
      classMatch && methodMatch
        ? `${classMatch[1]} ${methodMatch[1]}`
        : exportMatches.length > 0
        ? exportMatches.join(', ')
        : 'target symbol';
    logs.push(
      {
        timestamp: new Date(now + 300).toISOString(),
        level: 'event',
        message: `[Hook] Intercepted ${targetDesc} | x0=0x16b420800 lr=0x1000058b4`,
      },
      {
        timestamp: new Date(now + 380).toISOString(),
        level: 'patch',
        message: `[Hook] onLeave executed for ${targetDesc} -> Return value overridden to 0x1 (TRUE)`,
      }
    );
  }

  return res.json({
    success: true,
    sessionId: `frida_sess_${now}`,
    logs,
  });
});

// ==========================================
// 6. Binary Ninja Plugin Bundle Exporter
// ==========================================
app.get('/api/plugin/export', (req, res) => {
  const rawEndpoint = typeof req.query.endpoint === 'string' ? req.query.endpoint.trim() : '';
  const safeEndpoint =
    rawEndpoint && /^https?:\/\/[a-zA-Z0-9._:/-]+$/.test(rawEndpoint)
      ? rawEndpoint.replace(/\/+$/, '')
      : `http://localhost:${PORT}/api`;

  const pluginJson = JSON.stringify(
    {
      pluginmetadataversion: 2,
      name: 'Mimir AI Orchestrator',
      author: 'Mimir Security',
      license: {
        name: 'MIT',
        text: 'MIT License',
      },
      platforms: ['Darwin', 'Linux', 'Windows'],
      installinstructions: {
        Darwin: 'Copy the mimir_plugin folder into ~/Library/Application Support/Binary Ninja/plugins/',
        Linux: 'Copy the mimir_plugin folder into ~/.binaryninja/plugins/',
        Windows: 'Copy the mimir_plugin folder into %APPDATA%\\Binary Ninja\\plugins\\',
      },
      dependencies: {},
      version: '2.5.0',
      minimumbinaryninjaversion: 3500,
      description:
        'Autonomous Binary Ninja AI reverse engineering plugin with HLIL semantic search, ARM64 smart patching, multi-agent role dispatch, and Frida hook generation.',
    },
    null,
    2
  );

  const initPyCode = `"""
Mimir Binary Ninja Plugin Entrypoint
"""
from .mimir_binja import register_mimir

register_mimir()
`;

  const pythonPluginCode = `"""
Mimir: Binary Ninja & Frida Autonomous Reverse Engineering Plugin (v2.5)
Compatible with Binary Ninja 3.5+ on macOS (Apple Silicon / Intel), Linux, Windows.
"""

import base64
import json
import re
import threading
import urllib.error
import urllib.request

from binaryninja import (
    PluginCommand,
    Settings,
    execute_on_main_thread,
    log_error,
    log_info,
    log_warn,
)

DEFAULT_SERVER_ENDPOINT = "${safeEndpoint}"
SETTINGS_KEY = "mimir.serverEndpoint"
PROVIDER_TYPE_KEY = "mimir.providerType"
PROVIDER_URL_KEY = "mimir.providerUrl"
MODEL_KEY = "mimir.model"
API_KEY_KEY = "mimir.apiKey"
MIMIR_ICON_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAADgAAAA4CAAAAACN7WTCAAADz0lEQVR42tWVb2hVdRjHv8/vd+4d3hautT9uWEGOkJiVhdLcAgUFV66iCHFEL1YgQgjCgnwRpMuG0R8iogVBZCnhiKIXQytRIica1qYrW0txmNqma+U27z33/H7Ptxe3oezeOKd39cB5cQ7nc77f8zzP73mA/3OInTe0GbZwY/Hkz5XGJALT2MpDIrPgZ3wNqSRcCg/k/HAKBVJw1PtHkI7nAjSNOT0EM6vYq9FUK4I4zuLBKYZ86to/rmVeow3xbpfPMOT7Yq85eJWh92viuPmnmOdMvTGAiAhgTPlF5nmuNgZ8jpFq2AhbSI7Aom5SfcRXYsDD6tSxfzEE6VSQgsFtfXTqdDgGPEWv6jnTLu+cGR7+5SNpnaBT9bwYA+5Xp6pZvoHTJDmJrcxR1fH7OS/ObaY+EQAWxyWjXjW48TsEAIh9MYoLJ+g15B8VK+jJiI+nzzPvvV5tjKvHXs06ajv20ZFOv8WaLH1OD8QejWdJHm5BJz1JRtyJpV+Q3B7bqw+P9ywDupl1JOlyfDuFJa9feCYWzFSg6vnfeF1Mdt2CTLnEWUXFh9N86/5VmwboVc9uXrm8k/m+RbCxp+pl8jgAZMai0C8DgF3kV0Xg3DoS9R5nAGB9VZA2bWUAfqSvhhYpzLU6bX1zy1TLo6tHul3HC+t6v778mNgQwjirXcyTJPVzYJsnGdHxQJG14vl1AYaAy8v8ILjJ5BwDAuOxIDEKEdDa/B7nP/k9bYVCjMaW0WBRlko6noQpw25GJB3b46eV2AH1pEbhDqD9z4ikMmyAiR+P3cyT3pMvrieppNN+kQReF4f5yEfs6Zzmjm1ZOp9jR2zjALDoIcmNqYaqhprqlZ7kD/OMJNg5Ur3xzfNP4wjbGicvVbWc3bvpPiTaOgYVC1ILDpL+Kjl8l7l5YRKjhYoMDpC/PlFZ1TxADp5uLSVY7F3YNFS5RU/ur92S6f1ydVPmg/6lJ3ySvYrBn+4GsGSUHG8DUL5nphZJkoNvOHU7AKmuBoAbBjhRXwyWSpfVMt75cce9ly81tu9al6vzcUdqVvEIo/o2ks23Krkd5zhZl0wRgIQux7SV0OUgYMnWLK3KgEKlDSz4D0UrDv59yeyOZELQEqIQiAIQKEp1qinxZEwKmkIIBI5XrhTntVQzvRQGLPRQwYB0TZsEit4c2zBFgLAEYGF3vmd9kqx6++nQ2D2zlTNYNSI+WTnUjiClBECqwYjRpOXwAWYMAcKbHNKJGm72e6l36dfW5Xm0JsnUuC6zRnbzoVqeqMG/4gArZX0rKo7dkXBq/KfjLxgJDdluqtU6AAAAAElFTkSuQmCC"


def register_settings():
    settings = Settings()
    if not settings.contains(SETTINGS_KEY):
        settings.register_group("mimir", "Mimir AI Orchestrator")
        settings.register_setting(
            SETTINGS_KEY,
            json.dumps({
                "title": "Mimir Orchestrator API Endpoint",
                "type": "string",
                "default": DEFAULT_SERVER_ENDPOINT,
                "description": "Base URL for Mimir backend (e.g. http://localhost:3000/api)",
            }),
        )
    new_settings = {
        PROVIDER_TYPE_KEY: {"title": "AI Provider Type", "type": "string", "default": "gemini"},
        PROVIDER_URL_KEY: {"title": "AI Provider URL", "type": "string", "default": ""},
        MODEL_KEY: {"title": "AI Model", "type": "string", "default": "gemini-4-hydrogen"},
        API_KEY_KEY: {"title": "AI Provider API Key", "type": "string", "default": ""},
    }
    for key, definition in new_settings.items():
        if not settings.contains(key):
            settings.register_setting(key, json.dumps(definition))


def get_server_endpoint():
    try:
        val = Settings().get_string(SETTINGS_KEY)
        if val:
            return val.rstrip("/")
    except Exception:
        pass
    return DEFAULT_SERVER_ENDPOINT


def get_ai_config():
    settings = Settings()
    return {
        "providerType": settings.get_string(PROVIDER_TYPE_KEY) or "gemini",
        "providerUrl": settings.get_string(PROVIDER_URL_KEY) or "",
        "model": settings.get_string(MODEL_KEY) or "gemini-4-hydrogen",
        "apiKey": settings.get_string(API_KEY_KEY) or "",
    }


def safe_extract_hlil(func, max_chars=4500):
    try:
        if func.hlil is not None and func.hlil.root is not None:
            return "\\n".join(str(line) for line in func.hlil.root.lines)[:max_chars]
    except Exception:
        pass
    try:
        if func.llil is not None:
            return "\\n".join(str(line) for line in func.llil.instructions)[:max_chars]
    except Exception:
        pass
    return ""


def safe_extract_disasm(bv, func, max_lines=60):
    lines = []
    try:
        for block in func.basic_blocks:
            for tokens, addr in block:
                raw = bv.read(addr, min(4, bv.get_instruction_length(addr) or 4))
                hex_str = " ".join(f"{b:02X}" for b in raw)
                text = "".join(t.text for t in tokens)
                lines.append(f"{hex(addr)}: {hex_str:<12} {text}")
                if len(lines) >= max_lines:
                    return "\\n".join(lines)
    except Exception:
        pass
    return "\\n".join(lines)


def parse_patch_request(text):
    """Extract an explicit patch action and optional address without guessing."""
    lower = text.lower()
    patch_words = ("patch", "nop", "invert", "flip", "branch", "return true", "return false")
    is_patch = any(word in lower for word in patch_words)
    address_match = re.search(r"\\b0x[0-9a-fA-F]+\\b", text)
    address = int(address_match.group(0), 16) if address_match else None

    if re.search(r"\\b(return|force).{0,12}\\b(true|1)\\b", lower):
        strategy = "force_return_true"
    elif re.search(r"\\b(return|force).{0,12}\\b(false|0)\\b", lower):
        strategy = "force_return_false"
    elif re.search(r"\\b(no[- ]?op|nop)\\b", lower):
        strategy = "nop_sled"
    elif re.search(r"\\b(invert|flip|reverse).{0,24}\\b(branch|condition|conditional)\\b", lower) or "invert branch" in lower:
        strategy = "invert_branch"
    else:
        strategy = None

    return {
        "is_patch": is_patch,
        "address": address,
        "strategy": strategy,
        "needs_clarification": is_patch and strategy is None,
    }


class MimirAgent:
    def __init__(self, bv):
        self.bv = bv

    def post_json(self, route, payload, timeout=45):
        endpoint = f"{get_server_endpoint()}{route}"
        req = urllib.request.Request(
            endpoint,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))

    def find_functions(self, query):
        cleaned = re.sub(
            r"\\b(find|search|locate|show|list|where|is|are|the|related|functions?|routines?|methods?|please)\\b",
            "",
            query.lower(),
        )
        terms = [t for t in re.split(r"\\W+", cleaned) if len(t) >= 2]
        if not terms:
            terms = [query.lower().strip()]

        matches = []
        for func in self.bv.functions:
            corpus = f"{func.name} {func.symbol.full_name if func.symbol else ''}".lower()
            hlil_snippet = safe_extract_hlil(func, max_chars=1200).lower()
            combined = f"{corpus} {hlil_snippet}"
            score = sum(2 if t in corpus else (1 if t in combined else 0) for t in terms)
            if score > 0:
                matches.append((score, func))

        matches.sort(key=lambda item: (-item[0], item[1].start))
        return [m[1] for m in matches[:15]]

    def dispatch_role(self, role, objective, func=None, addr=None, on_done=None):
        target_func = func or (self.bv.get_functions_containing(addr)[0] if addr is not None else None)
        if target_func is None and len(self.bv.functions) > 0:
            target_func = self.bv.functions[0]

        payload = {
            "role": role,
            "agentConfig": get_ai_config(),
            "objective": objective,
            "context": {
                "binaryName": self.bv.file.filename,
                "arch": self.bv.arch.name if self.bv.arch else "arm64",
                "functionName": target_func.symbol.full_name if (target_func and target_func.symbol) else (target_func.name if target_func else "unknown"),
                "address": hex(addr if addr is not None else (target_func.start if target_func else 0)),
                "hlil": safe_extract_hlil(target_func) if target_func else "",
                "assembly": safe_extract_disasm(self.bv, target_func) if target_func else "",
            },
        }

        def worker():
            try:
                res = self.post_json("/ai/dispatch-role", payload)
                if res.get("success"):
                    output = res.get("output", "")
                    if target_func is not None:
                        def apply_comment():
                            self.bv.begin_undo_actions()
                            target_func.set_comment_at(target_func.start, f"[Mimir {role}] {output[:140].replace(chr(10), ' ')}")
                            self.bv.commit_undo_actions()
                        execute_on_main_thread(apply_comment)
                    if on_done:
                        on_done(True, output)
                else:
                    err_msg = res.get("error", "Unknown Mimir server error")
                    if on_done:
                        on_done(False, err_msg)
            except urllib.error.HTTPError as e:
                body = e.read().decode("utf-8", errors="ignore")
                if on_done:
                    on_done(False, f"HTTP {e.code}: {body[:240]}")
            except Exception as e:
                if on_done:
                    on_done(False, f"Connection error: {e}")

        threading.Thread(target=worker, daemon=True).start()

    def analyze_function(self, func):
        log_info(f"[Mimir] Dispatching Decompiler Architect for {func.name} @ {hex(func.start)}")

        def handle_done(ok, msg):
            if ok:
                log_info(f"[Mimir Analysis - {func.name}]\\n{msg}")
            else:
                log_error(f"[Mimir Analysis Failed]: {msg}")

        self.dispatch_role(
            "decompiler",
            f"Explain algorithm, parameters, and protection logic in {func.name}",
            func=func,
            addr=func.start,
            on_done=handle_done,
        )

    def synthesize_arm64_patch(self, addr, strategy="invert_branch"):
        arch_name = self.bv.arch.name if self.bv.arch else ""
        if "aarch64" not in arch_name and "arm64" not in arch_name:
            return False, f"Smart ARM64 patcher requires ARM64/AArch64 binary (detected: {arch_name})"

        try:
            instruction_len = self.bv.get_instruction_length(addr) or 0
            raw = bytearray(self.bv.read(addr, instruction_len) or b"")
        except Exception as exc:
            return False, f"Unable to read an ARM64 instruction at {hex(addr)}: {exc}; no bytes were written"
        if instruction_len != 4:
            return False, f"Address {hex(addr)} is not a readable 4-byte ARM64 instruction (length={instruction_len})"
        if len(raw) != 4:
            return False, f"Unable to read the complete ARM64 instruction at {hex(addr)}; no bytes were written"

        orig_hex = " ".join(f"{b:02X}" for b in raw)

        if strategy == "force_return_true":
            patch_bytes = bytes([0x20, 0x00, 0x80, 0xD2, 0xC0, 0x03, 0x5F, 0xD6])
            desc = "MOV X0, #1; RET"
        elif strategy == "force_return_false":
            patch_bytes = bytes([0x00, 0x00, 0x80, 0xD2, 0xC0, 0x03, 0x5F, 0xD6])
            desc = "MOV X0, #0; RET"
        elif strategy == "nop_sled":
            patch_bytes = bytes([0x1F, 0x20, 0x03, 0xD5])
            desc = "NOP"
        else:
            # Invert ARM64 B.cond (bit 0 of byte 0) or CBZ/CBNZ/TBZ/TBNZ (bit 0 of byte 3)
            disasm_text = (self.bv.get_disassembly(addr) or "").upper()
            if disasm_text.startswith("B.") and (raw[3] & 0xFE) == 0x54:
                raw[0] ^= 0x01
                patch_bytes = bytes(raw)
                desc = f"Inverted {disasm_text}"
            elif (disasm_text.startswith("CBZ") or disasm_text.startswith("CBNZ") or disasm_text.startswith("TBZ") or disasm_text.startswith("TBNZ")):
                raw[3] ^= 0x01
                patch_bytes = bytes(raw)
                desc = f"Inverted {disasm_text}"
            else:
                return False, f"{hex(addr)} is not a conditional branch; choose NOP or a return patch explicitly"

        if len(patch_bytes) > 4:
            try:
                second_len = self.bv.get_instruction_length(addr + 4) or 0
                available = self.bv.read(addr, len(patch_bytes)) or b""
            except Exception as exc:
                return False, f"Unable to validate the complete {len(patch_bytes)}-byte patch at {hex(addr)}: {exc}; no bytes were written"
            if second_len != 4 or len(available) != len(patch_bytes):
                return False, f"Patch needs {len(patch_bytes)} bytes at {hex(addr)}, but the complete patch range is not readable; no bytes were written"

        patch_hex = " ".join(f"{b:02X}" for b in patch_bytes)

        def write_patch():
            self.bv.begin_undo_actions()
            self.bv.write(addr, patch_bytes)
            self.bv.set_comment_at(addr, f"[Mimir Patched] {orig_hex} -> {patch_hex} ({desc})")
            self.bv.commit_undo_actions()

        execute_on_main_thread(write_patch)
        return True, f"Patched {hex(addr)}: {orig_hex} -> {patch_hex} ({desc})"

    def generate_patch(self, func, addr=None, strategy="invert_branch"):
        if func is None and addr is None:
            return False, "Select a function or provide an address before patching"
        target_addr = addr if addr is not None else func.start
        if addr is None:
            for block in func.basic_blocks:
                for tokens, inst_addr in block:
                    text = "".join(t.text for t in tokens).upper()
                    if any(op in text for op in ("B.", "CBZ", "CBNZ", "TBZ", "TBNZ")):
                        target_addr = inst_addr
                        break

        ok, summary = self.synthesize_arm64_patch(target_addr, strategy=strategy)
        if ok:
            log_info(f"[Mimir Patcher] {summary}")
        else:
            log_warn(f"[Mimir Patcher] {summary}")
        return ok, summary


def register_mimir():
    register_settings()

    def cmd_analyze(bv, func):
        MimirAgent(bv).analyze_function(func)

    def cmd_patch_addr(bv, addr):
        funcs = bv.get_functions_containing(addr)
        agent = MimirAgent(bv)
        if funcs:
            agent.generate_patch(funcs[0], addr=addr, strategy="invert_branch")
        else:
            agent.synthesize_arm64_patch(addr, strategy="invert_branch")

    def cmd_patch_func_true(bv, func):
        MimirAgent(bv).generate_patch(func, addr=func.start, strategy="force_return_true")

    PluginCommand.register_for_function(
        "Mimir\\\\1. Analyze Function with AI",
        "Dispatches configured Mimir AI role to analyze HLIL & assembly",
        cmd_analyze,
    )
    PluginCommand.register_for_function(
        "Mimir\\\\2. Patch Function to Return True (ARM64)",
        "Writes MOV X0, #1; RET at function entry with undo support",
        cmd_patch_func_true,
    )
    PluginCommand.register_for_address(
        "Mimir\\\\3. Smart Invert Branch / NOP at Address",
        "Inverts conditional ARM64 branch or inserts NOP at selected address",
        cmd_patch_addr,
    )

    try:
        from binaryninjaui import Sidebar, SidebarWidget, SidebarWidgetType
        from PySide6.QtCore import QObject, Signal
        from PySide6.QtGui import QImage
        from PySide6.QtWidgets import (
            QComboBox,
            QDialog,
            QFormLayout,
            QHBoxLayout,
            QLabel,
            QLineEdit,
            QPushButton,
            QTextEdit,
            QVBoxLayout,
        )

        class _SignalBridge(QObject):
            message_ready = Signal(str, str)

        class MimirFloatingDialog(QDialog):
            def __init__(self, bv, current_func=None, parent=None):
                super().__init__(parent)
                self.bv = bv
                self.current_func = current_func
                self.agent = MimirAgent(bv) if bv else None
                self.bridge = _SignalBridge()
                self.bridge.message_ready.connect(self._append_message)

                self.setWindowTitle("Mimir AI Agent - Floating Pop-up")
                self.resize(520, 640)
                layout = QVBoxLayout(self)

                self.status_label = QLabel(
                    f"Target: {bv.file.filename if bv else 'No binary loaded'}", self
                )
                layout.addWidget(self.status_label)

                self.history = QTextEdit(self)
                self.history.setReadOnly(True)
                self.history.append("<b>Mimir AI Assistant</b> ready. Talk in plain English:")
                self.history.append("• <i>'find purchase related functions'</i>")
                self.history.append("• <i>'patch this function to return true'</i>")
                self.history.append("• <i>'explain this function'</i>")
                layout.addWidget(self.history)

                quick_row = QHBoxLayout()
                btn_find = QPushButton("Find Purchase", self)
                btn_patch = QPushButton("Smart Patch", self)
                btn_analyze = QPushButton("Analyze Current", self)
                btn_find.clicked.connect(lambda: self._run_query("find purchase related functions"))
                btn_patch.clicked.connect(lambda: self._run_query("I want to patch the current function"))
                btn_analyze.clicked.connect(lambda: self._run_query("explain algorithm and security checks"))
                quick_row.addWidget(btn_find)
                quick_row.addWidget(btn_patch)
                quick_row.addWidget(btn_analyze)
                layout.addLayout(quick_row)

                input_row = QHBoxLayout()
                self.input_box = QLineEdit(self)
                self.input_box.setPlaceholderText("Ask Mimir in plain language...")
                self.input_box.returnPressed.connect(self._on_submit)
                self.btn = QPushButton("Act", self)
                self.btn.clicked.connect(self._on_submit)
                input_row.addWidget(self.input_box)
                input_row.addWidget(self.btn)
                layout.addLayout(input_row)

            def set_context(self, bv, func=None):
                self.bv = bv
                self.current_func = func
                self.agent = MimirAgent(bv) if bv else None
                if bv:
                    fname = func.name if func else "None"
                    self.status_label.setText(f"Target: {bv.file.filename} · Function: {fname}")

            def prompt_for_patch(self):
                self.history.append("<p><b>Mimir Patcher:</b><br/>Describe the patch in plain language. For example: <i>invert the branch at 0x100003FA0</i>, <i>write a NOP at 0x100003FA0</i>, or <i>make this function return false</i>.</p>")
                self.input_box.setPlaceholderText("Describe the patch and optional address...")
                self.input_box.setFocus()

            def _append_message(self, sender, text):
                safe = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\\n", "<br/>")
                self.history.append(f"<p><b>{sender}:</b><br/>{safe}</p>")
                self.btn.setEnabled(True)

            def _on_submit(self):
                query = self.input_box.text().strip()
                if not query:
                    return
                self.input_box.clear()
                self._run_query(query)

            def _run_query(self, query):
                self._append_message("You", query)
                if not self.agent or not self.bv:
                    self._append_message("System", "No active BinaryView open in Binary Ninja.")
                    return

                lower = query.lower()
                if any(k in lower for k in ("find", "search", "locate")) and "function" in lower:
                    matches = self.agent.find_functions(query)
                    if matches:
                        top = matches[0]
                        execute_on_main_thread(lambda: self.bv.navigate(self.bv.view, top.start))
                        self.current_func = top
                        summary = "\\n".join(f"• {m.name} @ {hex(m.start)}" for m in matches[:8])
                        self._append_message("Mimir Search", f"Navigated to {top.name} ({hex(top.start)}):\\n{summary}")
                    else:
                        self._append_message("Mimir Search", "No matching functions found in current BinaryView.")
                    return

                patch_intent = parse_patch_request(query)
                if patch_intent["is_patch"]:
                    if patch_intent["needs_clarification"]:
                        self._append_message("Mimir Patcher", "Tell me exactly what to do: invert the conditional branch, write a NOP, return true, or return false. You can include an address such as 0x100003FA0.")
                        return
                    func = self.current_func or (self.bv.functions[0] if len(self.bv.functions) > 0 else None)
                    ok, msg = self.agent.generate_patch(func, addr=patch_intent["address"], strategy=patch_intent["strategy"])
                    self._append_message("Mimir Patcher" if ok else "Patch Error", msg)
                    return

                self.btn.setEnabled(False)
                self.history.append("<i>Dispatching to Mimir AI backend...</i>")
                role = "frida_tracer" if ("frida" in lower or "hook" in lower) else ("auditor" if "audit" in lower else "decompiler")

                def on_done(ok, output):
                    self.bridge.message_ready.emit("Mimir AI" if ok else "Mimir Error", output)

                self.agent.dispatch_role(role, query, func=self.current_func, on_done=on_done)

        class MimirSettingsDialog(QDialog):
            def __init__(self, parent=None):
                super().__init__(parent)
                self.setWindowTitle("Mimir AI Provider Settings")
                self.resize(520, 300)
                settings = Settings()
                form = QFormLayout(self)

                self.provider_type = QComboBox(self)
                self.provider_type.addItem("Google Gemini", "gemini")
                self.provider_type.addItem("OpenAI-compatible", "openai-compatible")
                current_type = settings.get_string(PROVIDER_TYPE_KEY) or "gemini"
                index = self.provider_type.findData(current_type)
                self.provider_type.setCurrentIndex(index if index >= 0 else 0)
                form.addRow("Provider", self.provider_type)

                self.provider_url = QLineEdit(settings.get_string(PROVIDER_URL_KEY) or "", self)
                self.provider_url.setPlaceholderText("https://api.openai.com or http://localhost:11434")
                form.addRow("Provider URL", self.provider_url)

                self.model = QLineEdit(settings.get_string(MODEL_KEY) or "gemini-4-hydrogen", self)
                form.addRow("Model", self.model)

                self.api_key = QLineEdit(settings.get_string(API_KEY_KEY) or "", self)
                self.api_key.setEchoMode(QLineEdit.Password)
                self.api_key.setPlaceholderText("Stored in Binary Ninja settings")
                form.addRow("API key", self.api_key)

                self.endpoint = QLineEdit(settings.get_string(SETTINGS_KEY) or DEFAULT_SERVER_ENDPOINT, self)
                form.addRow("Mimir backend", self.endpoint)

                note = QLabel("Gemini uses GEMINI_API_KEY on the backend. OpenAI-compatible providers use the URL and key above.", self)
                note.setWordWrap(True)
                form.addRow("", note)

                buttons = QHBoxLayout()
                save = QPushButton("Save", self)
                cancel = QPushButton("Cancel", self)
                save.clicked.connect(self.save)
                cancel.clicked.connect(self.reject)
                buttons.addWidget(save)
                buttons.addWidget(cancel)
                form.addRow("", buttons)

            def save(self):
                settings = Settings()
                settings.set_string(PROVIDER_TYPE_KEY, self.provider_type.currentData())
                settings.set_string(PROVIDER_URL_KEY, self.provider_url.text().strip())
                settings.set_string(MODEL_KEY, self.model.text().strip())
                settings.set_string(API_KEY_KEY, self.api_key.text())
                settings.set_string(SETTINGS_KEY, self.endpoint.text().strip().rstrip("/"))
                self.accept()

        class MimirSidebarWidget(SidebarWidget):
            def __init__(self, name, frame, data):
                super().__init__(name)
                self.frame = frame
                self.bv = data
                self.dialog = None
                self.settings_dialog = None
                layout = QVBoxLayout(self)
                self.info_label = QLabel("Mimir AI Assistant", self)
                layout.addWidget(self.info_label)

                btn_popup = QPushButton("Open Mimir Floating Chat", self)
                btn_popup.clicked.connect(self.show_floating_popup)
                layout.addWidget(btn_popup)

                btn_analyze = QPushButton("Analyze Current Function", self)
                btn_analyze.clicked.connect(self.analyze_current)
                layout.addWidget(btn_analyze)

                btn_patch = QPushButton("Smart Invert Branch / Patch", self)
                btn_patch.clicked.connect(self.patch_current)
                layout.addWidget(btn_patch)

                btn_settings = QPushButton("AI Provider Settings", self)
                btn_settings.clicked.connect(self.show_settings)
                layout.addWidget(btn_settings)
                layout.addStretch(1)

            def notifyViewChanged(self, view_frame):
                self.frame = view_frame
                if view_frame is not None:
                    view = view_frame.getCurrentViewInterface()
                    if view is not None:
                        self.bv = view.getData()
                        if self.dialog is not None:
                            self.dialog.set_context(self.bv, self._get_current_func())

            def _get_current_func(self):
                if self.frame is not None:
                    view = self.frame.getCurrentViewInterface()
                    if view is not None:
                        func = view.getCurrentFunction()
                        if func is not None:
                            return func
                if self.bv and len(self.bv.functions) > 0:
                    return self.bv.functions[0]
                return None

            def analyze_current(self):
                func = self._get_current_func()
                if self.bv and func:
                    MimirAgent(self.bv).analyze_function(func)

            def patch_current(self):
                self.show_floating_popup(patch_prompt=True)

            def show_floating_popup(self, patch_prompt=False):
                func = self._get_current_func()
                if self.dialog is None:
                    self.dialog = MimirFloatingDialog(self.bv, current_func=func, parent=self)
                else:
                    self.dialog.set_context(self.bv, func)
                self.dialog.show()
                self.dialog.raise_()
                if patch_prompt:
                    self.dialog.prompt_for_patch()

            def show_settings(self):
                if self.settings_dialog is None:
                    self.settings_dialog = MimirSettingsDialog(self)
                self.settings_dialog.show()
                self.settings_dialog.raise_()
                self.settings_dialog.activateWindow()

        def make_sidebar_icon():
            icon = QImage()
            icon.loadFromData(base64.b64decode(MIMIR_ICON_PNG_BASE64), "PNG")
            return icon

        class MimirSidebarWidgetType(SidebarWidgetType):
            def __init__(self):
                SidebarWidgetType.__init__(self, make_sidebar_icon(), "Mimir AI")

            def createWidget(self, frame, data):
                return MimirSidebarWidget("Mimir AI", frame, data)

        Sidebar.addSidebarWidgetType(MimirSidebarWidgetType())
    except Exception as e:
        log_error(f"[Mimir] UI Sidebar/Dialog registration failed: {e}")
`;

  const swiftBridgeCode = `//
// MimirCompanion.swift
// macOS native helper, Mach-O VA->Offset translator, codesigner & Mimir IPC Bridge
//

import Foundation
import MachO

public enum MimirPatchError: Error, LocalizedError {
    case invalidBinary
    case segmentNotFound
    case unalignedArm64Address(UInt64)
    case codesignFailed(Int32)

    public var errorDescription: String? {
        switch self {
        case .invalidBinary: return "Not a valid 64-bit Mach-O binary."
        case .segmentNotFound: return "Could not locate __TEXT segment to translate virtual address."
        case .unalignedArm64Address(let addr): return String(format: "Address 0x%llX is not 4-byte ARM64 aligned.", addr)
        case .codesignFailed(let code): return "codesign exited with status \\(code)."
        }
    }
}

public final class MimirBridge {
    public static let shared = MimirBridge()
    private let sessionEndpoint = URL(string: "${safeEndpoint}")!

    /// Translates a 64-bit Mach-O virtual address (e.g. 0x100003fd0) into a physical file offset.
    public func virtualAddressToFileOffset(binaryData: Data, virtualAddress: UInt64) throws -> UInt64 {
        guard binaryData.count >= MemoryLayout<mach_header_64>.size else {
            throw MimirPatchError.invalidBinary
        }

        return try binaryData.withUnsafeBytes { rawBuffer -> UInt64 in
            guard let basePtr = rawBuffer.baseAddress else { throw MimirPatchError.invalidBinary }
            let header = basePtr.assumingMemoryBound(to: mach_header_64.self).pointee
            guard header.magic == MH_MAGIC_64 else {
                throw MimirPatchError.invalidBinary
            }

            var cmdOffset = MemoryLayout<mach_header_64>.size
            for _ in 0..<header.ncmds {
                guard cmdOffset + MemoryLayout<load_command>.size <= binaryData.count else { break }
                let lc = basePtr.advanced(by: cmdOffset).assumingMemoryBound(to: load_command.self).pointee
                if lc.cmd == LC_SEGMENT_64 {
                    let seg = basePtr.advanced(by: cmdOffset).assumingMemoryBound(to: segment_command_64.self).pointee
                    if virtualAddress >= seg.vmaddr && virtualAddress < (seg.vmaddr + seg.vmsize) {
                        return (virtualAddress - seg.vmaddr) + seg.fileoff
                    }
                }
                cmdOffset += Int(lc.cmdsize)
            }
            throw MimirPatchError.segmentNotFound
        }
    }

    public func dispatchMachOPatch(binaryPath: String, virtualAddress: UInt64, patchBytes: [UInt8]) throws {
        guard virtualAddress % 4 == 0, patchBytes.count % 4 == 0 else {
            throw MimirPatchError.unalignedArm64Address(virtualAddress)
        }

        let fileURL = URL(fileURLWithPath: binaryPath)
        let data = try Data(contentsOf: fileURL)
        let fileOffset = try virtualAddressToFileOffset(binaryData: data, virtualAddress: virtualAddress)

        // Create automatic backup prior to patching
        let backupURL = URL(fileURLWithPath: binaryPath + ".mimir.bak")
        if !FileManager.default.fileExists(atPath: backupURL.path) {
            try data.write(to: backupURL)
        }

        let fileHandle = try FileHandle(forUpdating: fileURL)
        try fileHandle.seek(toOffset: fileOffset)
        fileHandle.write(Data(patchBytes))
        try fileHandle.close()

        // Re-sign Mach-O binary for macOS Gatekeeper & ARM64e
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/codesign")
        process.arguments = ["--force", "--deep", "-s", "-", binaryPath]
        try process.run()
        process.waitUntilExit()

        if process.terminationStatus != 0 {
            throw MimirPatchError.codesignFailed(process.terminationStatus)
        }
    }

    public func queryAgent(role: String, objective: String, functionName: String, address: String, hlil: String) async throws -> String {
        var request = URLRequest(url: sessionEndpoint.appendingPathComponent("ai/dispatch-role"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let payload: [String: Any] = [
            "role": role,
            "agentConfig": ["providerType": "gemini", "model": "gemini-4-hydrogen"],
            "objective": objective,
            "context": [
                "binaryName": "MachOTarget",
                "arch": "ARM64",
                "functionName": functionName,
                "address": address,
                "hlil": hlil,
            ],
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: payload)

        let (data, _) = try await URLSession.shared.data(for: request)
        if let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
           let output = json["output"] as? String {
            return output
        }
        return "No response from Mimir backend."
    }
}
`;

  return res.json({
    success: true,
    files: [
      { filename: 'mimir_binja.py', content: pythonPluginCode, type: 'python' },
      { filename: '__init__.py', content: initPyCode, type: 'python' },
      { filename: 'plugin.json', content: pluginJson, type: 'json' },
      { filename: 'MimirCompanion.swift', content: swiftBridgeCode, type: 'swift' },
    ],
  });
});

// ==========================================
// Vite Middleware / Static Serving
// ==========================================
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Mimir Binary Ninja & Frida Studio running on port ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
