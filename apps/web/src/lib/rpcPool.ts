export const RPC_TIMEOUT_MS = 8_000;
export const RPC_STICKY_PREFIX = 'nether.rpc.sticky.';

export type StickyStore = {
  get(key: string): string | null;
  set(key: string, value: string): void;
};

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export class RpcUnavailableError extends Error {
  networkName: string;

  constructor(networkName: string) {
    super(`${networkName} RPC is currently unavailable.`);
    this.name = 'RpcUnavailableError';
    this.networkName = networkName;
  }
}

export class RpcTransportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RpcTransportError';
  }
}

export class ExecutionRevertedError extends Error {
  readonly code: number;
  readonly data: unknown;

  constructor(message: string, code: number, data: unknown) {
    super(message);
    this.name = 'ExecutionRevertedError';
    this.code = code;
    this.data = data;
  }
}

export function memoryStore(initial: Record<string, string> = {}): StickyStore {
  const data = { ...initial };
  return {
    get: (key) => (key in data ? data[key] : null),
    set: (key, value) => {
      data[key] = value;
    },
  };
}

export function sessionStickyStore(): StickyStore {
  try {
    if (typeof sessionStorage === 'undefined') {
      return memoryStore();
    }
    const probe = sessionStorage.getItem('nether.rpc.sticky.probe');
    void probe;
    return {
      get: (key) => sessionStorage.getItem(key),
      set: (key, value) => {
        sessionStorage.setItem(key, value);
      },
    };
  } catch {
    return memoryStore();
  }
}

export function isRpcUnavailable(error: unknown): boolean {
  let current: unknown = error;
  const seen = new Set<unknown>();
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current);
    if (current instanceof RpcUnavailableError) {
      return true;
    }
    if ('name' in current && (current as { name?: string }).name === 'RpcUnavailableError') {
      return true;
    }
    const walker = (current as { walk?: (fn: (value: unknown) => boolean) => unknown }).walk;
    if (typeof walker === 'function') {
      try {
        const found = walker.call(current, (value) => isRpcUnavailableLeaf(value));
        if (found) {
          return true;
        }
      } catch {
        // ignore walk implementations that throw
      }
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

function isRpcUnavailableLeaf(error: unknown): boolean {
  return error instanceof RpcUnavailableError || (error as { name?: string } | undefined)?.name === 'RpcUnavailableError';
}

export function rootErrorMessage(error: unknown, fallback: string): string {
  let current: unknown = error;
  const seen = new Set<unknown>();
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current);
    const cause = (current as { cause?: unknown }).cause;
    if (!cause) {
      break;
    }
    current = cause;
  }
  if (current instanceof Error && current.message.trim()) {
    return current.message;
  }
  return fallback;
}

type JsonRpcError = { code?: number; message?: string; data?: unknown };

function isExecutionRevert(error: JsonRpcError): boolean {
  if (error.code === 3) {
    return true;
  }
  const message = (error.message ?? '').toLowerCase();
  return message.includes('execution reverted');
}

function parseChainId(result: unknown): number {
  if (typeof result === 'string' || typeof result === 'number' || typeof result === 'bigint') {
    return Number(result);
  }
  throw new RpcTransportError('RPC returned an invalid chain id');
}

export type RpcRequestOptions = {
  retryStickyOnce?: boolean;
};

export class StickyRpcPool {
  private readonly verified = new Set<number>();
  private nextId = 1;
  private requestOptions: RpcRequestOptions = {};
  readonly urls: readonly string[];
  readonly expectedChainId: number;
  readonly networkName: string;
  private readonly store: StickyStore;
  private readonly storageKey: string;
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;

  constructor(
    urls: readonly string[],
    expectedChainId: number,
    networkName: string,
    store: StickyStore,
    storageKey: string,
    fetchImpl: FetchLike,
    timeoutMs = RPC_TIMEOUT_MS,
  ) {
    this.urls = urls;
    this.expectedChainId = expectedChainId;
    this.networkName = networkName;
    this.store = store;
    this.storageKey = storageKey;
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  get stickyIndex(): number {
    const raw = this.store.get(this.storageKey);
    const index = raw == null ? 0 : Number.parseInt(raw, 10);
    if (!Number.isInteger(index) || index < 0 || index >= this.urls.length) {
      return 0;
    }
    return index;
  }

  resetToStart(): void {
    this.store.set(this.storageKey, '0');
    this.verified.clear();
  }

  async withRetryStickyOnce<T>(fn: () => Promise<T>): Promise<T> {
    const previous = this.requestOptions;
    this.requestOptions = { retryStickyOnce: true };
    try {
      return await fn();
    } finally {
      this.requestOptions = previous;
    }
  }

  async request(method: string, params: unknown[] = [], options: RpcRequestOptions = {}): Promise<unknown> {
    if (this.urls.length === 0) {
      throw new RpcUnavailableError(this.networkName);
    }

    const retryStickyOnce = options.retryStickyOnce ?? this.requestOptions.retryStickyOnce;
    const start = this.stickyIndex;
    let lastError: unknown;

    const attempt = async (index: number): Promise<unknown> => {
      await this.ensureChain(index);
      return this.post(this.urls[index]!, method, params);
    };

    try {
      const result = await attempt(start);
      this.setSticky(start);
      return result;
    } catch (error) {
      if (error instanceof ExecutionRevertedError) {
        throw error;
      }
      lastError = error;
    }

    if (retryStickyOnce) {
      try {
        const result = await attempt(start);
        this.setSticky(start);
        return result;
      } catch (error) {
        if (error instanceof ExecutionRevertedError) {
          throw error;
        }
        lastError = error;
      }
    }

    for (let step = 1; step < this.urls.length; step += 1) {
      const index = (start + step) % this.urls.length;
      try {
        const result = await attempt(index);
        this.setSticky(index);
        return result;
      } catch (error) {
        if (error instanceof ExecutionRevertedError) {
          throw error;
        }
        lastError = error;
      }
    }

    void lastError;
    throw new RpcUnavailableError(this.networkName);
  }

  private setSticky(index: number): void {
    this.store.set(this.storageKey, String(index));
  }

  private async ensureChain(index: number): Promise<void> {
    if (this.verified.has(index)) {
      return;
    }
    const live = parseChainId(await this.post(this.urls[index]!, 'eth_chainId', []));
    if (live !== this.expectedChainId) {
      throw new RpcTransportError(
        `${this.urls[index]} chain id ${live} does not match ${this.expectedChainId}`,
      );
    }
    this.verified.add(index);
  }

  private async post(url: string, method: string, params: unknown[]): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify(
          { jsonrpc: '2.0', id: this.nextId++, method, params },
          (_key, value) => (typeof value === 'bigint' ? `0x${value.toString(16)}` : value),
        ),
        signal: controller.signal,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new RpcTransportError(`${url}: ${message}`);
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw new RpcTransportError(`${url}: HTTP ${response.status}`);
    }

    let json: { result?: unknown; error?: JsonRpcError };
    try {
      json = (await response.json()) as { result?: unknown; error?: JsonRpcError };
    } catch {
      throw new RpcTransportError(`${url}: invalid JSON`);
    }

    if (json.error) {
      if (isExecutionRevert(json.error)) {
        throw new ExecutionRevertedError(json.error.message ?? 'execution reverted', json.error.code ?? 3, json.error.data);
      }
      throw new RpcTransportError(`${url}: ${json.error.message ?? 'JSON-RPC error'}`);
    }

    return json.result;
  }
}
