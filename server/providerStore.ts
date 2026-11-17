import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export interface ProviderRecord {
  id: string;
  name: string;
  type: string;
  url: string;
  apiKey: string;
  availableModels: Array<{ id: string; name: string; provider?: string; contextWindow?: number }>;
  selectedModel: string;
  systemPrompt: string;
  isActive: boolean;
  lastFetchedAt?: string;
}

export type PublicProviderRecord = Omit<ProviderRecord, 'apiKey'> & { hasApiKey: boolean };

interface Envelope {
  iv: string;
  tag: string;
  data: string;
}

export class ProviderStore {
  private readonly directory = process.env.MIMIR_DATA_DIR || path.resolve(process.cwd(), '.mimir');
  private readonly keyPath = path.join(this.directory, 'providers.key');
  private readonly dataPath = path.join(this.directory, 'providers.enc');

  private ensureDirectory(): void {
    mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    try {
      chmodSync(this.directory, 0o700);
    } catch {
      // Windows does not expose POSIX permissions.
    }
  }

  private getKey(): Buffer {
    this.ensureDirectory();
    if (!existsSync(this.keyPath)) {
      writeFileSync(this.keyPath, randomBytes(32), { mode: 0o600 });
    }
    try {
      chmodSync(this.keyPath, 0o600);
    } catch {
      // Windows does not expose POSIX permissions.
    }
    const key = readFileSync(this.keyPath);
    if (key.length !== 32) throw new Error('Invalid Mimir provider-store key. Delete providers.key and restart.');
    return key;
  }

  private readAll(): ProviderRecord[] {
    if (!existsSync(this.dataPath)) return [];
    const envelope = JSON.parse(readFileSync(this.dataPath, 'utf8')) as Envelope;
    const decipher = createDecipheriv('aes-256-gcm', this.getKey(), Buffer.from(envelope.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(envelope.data, 'base64')),
      decipher.final(),
    ]).toString('utf8');
    return JSON.parse(plaintext) as ProviderRecord[];
  }

  private writeAll(records: ProviderRecord[]): void {
    this.ensureDirectory();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.getKey(), iv);
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(records), 'utf8'),
      cipher.final(),
    ]);
    const envelope: Envelope = {
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      data: encrypted.toString('base64'),
    };
    writeFileSync(this.dataPath, JSON.stringify(envelope), { mode: 0o600 });
    try {
      chmodSync(this.dataPath, 0o600);
    } catch {
      // Windows does not expose POSIX permissions.
    }
  }

  list(): ProviderRecord[] {
    return this.readAll();
  }

  get(id: string): ProviderRecord | undefined {
    return this.readAll().find((provider) => provider.id === id);
  }

  publicList(): PublicProviderRecord[] {
    return this.list().map(({ apiKey, ...provider }) => ({ ...provider, hasApiKey: Boolean(apiKey) }));
  }

  upsert(provider: Omit<ProviderRecord, 'apiKey'> & { apiKey?: string }): PublicProviderRecord {
    const records = this.readAll();
    const current = records.find((item) => item.id === provider.id);
    const next: ProviderRecord = {
      ...provider,
      apiKey: provider.apiKey?.trim() || current?.apiKey || '',
    };
    const index = records.findIndex((item) => item.id === provider.id);
    if (index >= 0) records[index] = next;
    else records.push(next);
    this.writeAll(records);
    const { apiKey, ...publicProvider } = next;
    return { ...publicProvider, hasApiKey: Boolean(apiKey) };
  }

  remove(id: string): boolean {
    const records = this.readAll();
    const next = records.filter((provider) => provider.id !== id);
    if (next.length === records.length) return false;
    this.writeAll(next);
    return true;
  }
}
