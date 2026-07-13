import { NextResponse } from "next/server";
import { explainFailure, graphSummary } from "@fiber-preflight/core";
import { getGraph, IS_MOCK, jsonSafe } from "@/lib/fiber";

export const dynamic = "force-dynamic";

/** GET /api/graph/summary — node/channel counts, per-asset capacity, snapshot age. */
export async function GET() {
  try {
    const graph = await getGraph();
    const summary = graphSummary(graph);
    return NextResponse.json({
      ok: true,
      mock: IS_MOCK,
      summary: jsonSafe({ ...summary, graphAgeMs: Date.now() - graph.syncedAt }),
    });
  } catch (e) {
    return NextResponse.json({ ok: false, mock: IS_MOCK, diagnostic: explainFailure(e) }, { status: 503 });
  }
}
