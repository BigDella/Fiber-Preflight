/**
 * @fiber-preflight/core
 *
 * Route confidence scoring and payment failure diagnostics for Fiber Network.
 *
 * ```ts
 * import { FiberRpcClient, buildGraph, preflight, explainFailure } from "@fiber-preflight/core";
 *
 * const client = new FiberRpcClient({ url: "http://127.0.0.1:8227" });
 * const graph = await buildGraph(client);
 * const report = preflight(graph, { source: myNodeId, target, amount: 100_00000000n });
 * // report.verdict: 'likely' | 'uncertain' | 'unlikely' | 'impossible'
 *
 * const diag = explainFailure("no route found to destination node");
 * // diag.userMessage: wallet-ready copy
 * ```
 */

export * from "./types.js";
export * from "./hex.js";
export * from "./graph.js";
export * from "./pathfinding.js";
export * from "./scoring.js";
export * from "./errors.js";
export * from "./invoice.js";
export * from "./rpc/types.js";
export { FiberRpcClient, FiberRpcError, type FiberRpcClientOptions } from "./rpc/client.js";
export { MockFiberClient } from "./rpc/mock.js";
export {
  MOCK_SELF_ID,
  MOCK_INVOICES,
  MOCK_ASSET_LABELS,
  RUSD_ASSET_ID,
  RUSD_SCRIPT,
  mockNodeId,
  mockGraphNodes,
  mockGraphChannels,
} from "./mock/fixture.js";
