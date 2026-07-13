import { describe, expect, it } from "vitest";
import {
  buildGraphFromRaw,
  extractInvoiceTarget,
  FiberRpcClient,
  nodeIdOf,
} from "../src/index.js";

const PUBKEY = `02${"11".repeat(32)}`;

function rpcFetch(result: unknown): typeof fetch {
  return async () =>
    new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
}

describe("Fiber v0.9 RPC wire shapes", () => {
  it("uses pubkey identities from node_info and graph_nodes", async () => {
    const client = new FiberRpcClient({
      url: "http://fiber.invalid",
      fetchImpl: rpcFetch({ pubkey: PUBKEY, node_name: "live-node" }),
    });

    const info = await client.nodeInfo();
    expect(nodeIdOf(info)).toBe(PUBKEY);

    const graph = buildGraphFromRaw(
      [{ pubkey: PUBKEY, node_name: "live-node", addresses: ["/ip4/127.0.0.1/tcp/8228"] }],
      [],
    );
    expect(graph.nodes.get(PUBKEY)).toMatchObject({
      nodeId: PUBKEY,
      name: "live-node",
      addresses: ["/ip4/127.0.0.1/tcp/8228"],
    });
  });

  it("unwraps current parse_invoice responses without changing the client API", async () => {
    const client = new FiberRpcClient({
      url: "http://fiber.invalid",
      fetchImpl: rpcFetch({
        invoice: {
          currency: "Fibt",
          amount: "0x5f5e100",
          data: {
            payment_hash: `0x${"22".repeat(32)}`,
            attrs: [{ payee_public_key: PUBKEY }],
          },
        },
      }),
    });

    const parsed = await client.parseInvoice("fibt1example");
    expect(parsed.currency).toBe("Fibt");
    expect(extractInvoiceTarget(parsed)).toMatchObject({
      target: PUBKEY,
      amount: 100_000_000n,
      paymentHash: `0x${"22".repeat(32)}`,
    });
  });

  it("still accepts legacy direct parse_invoice responses", async () => {
    const direct = { currency: "Fibt", amount: "0x1", data: { attrs: [] } };
    const client = new FiberRpcClient({
      url: "http://fiber.invalid",
      fetchImpl: rpcFetch(direct),
    });

    await expect(client.parseInvoice("fibt1legacy")).resolves.toEqual(direct);
  });
});
