import { NextResponse } from "next/server";
import { explainFailure } from "@fiber-preflight/core";
import { getNodeInfo, IS_MOCK, jsonSafe } from "@/lib/fiber";

export const dynamic = "force-dynamic";

/** GET /api/health — node reachability + summary. */
export async function GET() {
  try {
    const info = await getNodeInfo();
    return NextResponse.json({
      ok: true,
      mock: IS_MOCK,
      node: jsonSafe({
        nodeId: info.node_id,
        nodeName: info.node_name,
        addresses: info.addresses,
        peersCount: info.peers_count,
        channelCount: info.channel_count,
        syncStatus: info.network_sync_status ?? null,
      }),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, mock: IS_MOCK, diagnostic: explainFailure(e) },
      { status: 503 },
    );
  }
}
