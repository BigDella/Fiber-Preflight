/**
 * Raw Fiber JSON-RPC wire types.
 *
 * Shapes follow the Fiber RPC documentation (github.com/nervosnetwork/fiber,
 * src/rpc/README.md). Fields are deliberately optional/tolerant because the RPC
 * surface is still evolving; the graph builder normalises defensively and any
 * unknown payloads are preserved for debug logging.
 */

/** CKB Script (used for UDT type scripts). */
export interface RawScript {
  code_hash: string;
  hash_type: string;
  args: string;
}

/** Node announcement from `graph_nodes`. */
export interface RawGraphNode {
  node_id?: string;
  /** Current Fiber RPC field name (v0.9.x). */
  pubkey?: string;
  node_name?: string;
  addresses?: string[];
  timestamp?: string | number;
  chain_hash?: string;
  auto_accept_min_ckb_funding_amount?: string;
  udt_cfg_infos?: unknown;
  // tolerated aliases seen across versions
  public_key?: string;
  [k: string]: unknown;
}

/** Per-direction channel update info from `graph_channels`. */
export interface RawChannelUpdateInfo {
  timestamp?: string | number;
  enabled?: boolean;
  outbound_liquidity?: string | null;
  tlc_expiry_delta?: string;
  tlc_minimum_value?: string;
  tlc_maximum_value?: string;
  fee_rate?: string;
  [k: string]: unknown;
}

/** Channel announcement from `graph_channels`. */
export interface RawGraphChannel {
  channel_outpoint?: string;
  node1?: string;
  node2?: string;
  capacity?: string;
  chain_hash?: string;
  udt_type_script?: RawScript | null;
  created_timestamp?: string | number;
  last_updated_timestamp?: string | number;
  update_info_of_node1?: RawChannelUpdateInfo | null;
  update_info_of_node2?: RawChannelUpdateInfo | null;
  // older/alternate field spellings, tolerated:
  update_of_node1?: RawChannelUpdateInfo | null;
  update_of_node2?: RawChannelUpdateInfo | null;
  fee_rate_of_node1?: string;
  fee_rate_of_node2?: string;
  last_updated_timestamp_of_node1?: string | number;
  last_updated_timestamp_of_node2?: string | number;
  [k: string]: unknown;
}

export interface RawGraphNodesResult {
  nodes: RawGraphNode[];
  last_cursor?: string;
}

export interface RawGraphChannelsResult {
  channels: RawGraphChannel[];
  last_cursor?: string;
}

export interface RawNodeInfo {
  /** Current Fiber RPC field name (v0.9.x). */
  pubkey?: string;
  node_name?: string;
  /** Legacy/local alias retained for backwards compatibility. */
  node_id?: string;
  addresses?: string[];
  chain_hash?: string;
  peers_count?: string | number;
  channel_count?: string | number;
  pending_channel_count?: string | number;
  network_sync_status?: string;
  [k: string]: unknown;
}

/** Resolve a Fiber node identity across current and legacy RPC field names. */
export function nodeIdOf(node: {
  pubkey?: string;
  node_id?: string;
  public_key?: string;
}): string | undefined {
  return node.pubkey ?? node.node_id ?? node.public_key;
}

export interface RawParsedInvoice {
  currency?: string;
  amount?: string;
  payment_hash?: string;
  data?: {
    timestamp?: string | number;
    payment_hash?: string;
    attrs?: unknown[];
    [k: string]: unknown;
  };
  [k: string]: unknown;
}

/** `parse_invoice` wraps the decoded invoice in current Fiber releases. */
export interface RawParseInvoiceResult {
  invoice: RawParsedInvoice;
  [k: string]: unknown;
}

export type PaymentStatus =
  | "Created"
  | "Inflight"
  | "Success"
  | "Failed"
  | string;

export interface RawPayment {
  payment_hash?: string;
  status?: PaymentStatus;
  created_at?: string | number;
  last_updated_at?: string | number;
  failed_error?: string | null;
  fee?: string;
  [k: string]: unknown;
}

export interface RawChannel {
  channel_id?: string;
  peer_id?: string;
  state?: unknown;
  local_balance?: string;
  remote_balance?: string;
  offered_tlc_balance?: string;
  received_tlc_balance?: string;
  udt_type_script?: RawScript | null;
  [k: string]: unknown;
}

export interface RawListChannelsResult {
  channels: RawChannel[];
}

/** JSON-RPC 2.0 error object. */
export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

/**
 * Minimal client surface the library needs. Implemented by FiberRpcClient
 * (live HTTP) and MockFiberClient (fixtures, zero infrastructure).
 */
export interface FiberClient {
  nodeInfo(): Promise<RawNodeInfo>;
  graphNodes(limit?: number, after?: string): Promise<RawGraphNodesResult>;
  graphChannels(limit?: number, after?: string): Promise<RawGraphChannelsResult>;
  parseInvoice(invoice: string): Promise<RawParsedInvoice>;
  sendPayment(params: Record<string, unknown>): Promise<RawPayment>;
  getPayment(paymentHash: string): Promise<RawPayment>;
  listChannels(): Promise<RawListChannelsResult>;
}
