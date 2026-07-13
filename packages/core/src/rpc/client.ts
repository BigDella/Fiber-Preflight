import type {
  FiberClient,
  JsonRpcError,
  RawGraphChannelsResult,
  RawGraphNodesResult,
  RawListChannelsResult,
  RawNodeInfo,
  RawParsedInvoice,
  RawPayment,
} from "./types.js";
import { bigIntToHex } from "../hex.js";

export class FiberRpcError extends Error {
  constructor(
    message: string,
    public readonly rpcError?: JsonRpcError,
  ) {
    super(message);
    this.name = "FiberRpcError";
  }
}

export interface FiberRpcClientOptions {
  url: string;
  timeoutMs?: number;
  /** set true (or FIBER_DEBUG=1) to log raw request/response payloads */
  debug?: boolean;
  fetchImpl?: typeof fetch;
}

/**
 * Live JSON-RPC 2.0 client for a Fiber node (default endpoint http://127.0.0.1:8227).
 * Tolerant parsing: response shapes are typed loosely and normalised downstream.
 */
export class FiberRpcClient implements FiberClient {
  private id = 0;
  private readonly url: string;
  private readonly timeoutMs: number;
  private readonly debug: boolean;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: FiberRpcClientOptions) {
    this.url = opts.url;
    this.timeoutMs = opts.timeoutMs ?? 15_000;
    this.debug = opts.debug ?? process.env.FIBER_DEBUG === "1";
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async call<T>(method: string, params: unknown[] = []): Promise<T> {
    const body = JSON.stringify({ jsonrpc: "2.0", id: ++this.id, method, params });
    if (this.debug) console.debug(`[fiber-rpc] -> ${method}`, body);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await this.fetchImpl(this.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        signal: controller.signal,
      });
    } catch (e) {
      throw new FiberRpcError(`Fiber RPC request failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      throw new FiberRpcError(`Fiber RPC HTTP ${res.status} for ${method}`);
    }
    const json = (await res.json()) as { result?: T; error?: JsonRpcError };
    if (this.debug) console.debug(`[fiber-rpc] <- ${method}`, JSON.stringify(json).slice(0, 2000));
    if (json.error) {
      throw new FiberRpcError(json.error.message, json.error);
    }
    return json.result as T;
  }

  nodeInfo(): Promise<RawNodeInfo> {
    return this.call<RawNodeInfo>("node_info", []);
  }

  graphNodes(limit = 500, after?: string): Promise<RawGraphNodesResult> {
    return this.call<RawGraphNodesResult>("graph_nodes", [
      { limit: bigIntToHex(limit), after: after ?? null },
    ]);
  }

  graphChannels(limit = 500, after?: string): Promise<RawGraphChannelsResult> {
    return this.call<RawGraphChannelsResult>("graph_channels", [
      { limit: bigIntToHex(limit), after: after ?? null },
    ]);
  }

  parseInvoice(invoice: string): Promise<RawParsedInvoice> {
    return this.call<RawParsedInvoice>("parse_invoice", [{ invoice }]);
  }

  sendPayment(params: Record<string, unknown>): Promise<RawPayment> {
    return this.call<RawPayment>("send_payment", [params]);
  }

  getPayment(paymentHash: string): Promise<RawPayment> {
    return this.call<RawPayment>("get_payment", [{ payment_hash: paymentHash }]);
  }

  listChannels(): Promise<RawListChannelsResult> {
    return this.call<RawListChannelsResult>("list_channels", [{}]);
  }
}
