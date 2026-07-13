import { NextResponse } from "next/server";
import { CKB_ASSET, mockNodeId, RUSD_ASSET_ID, MOCK_INVOICES } from "@fiber-preflight/core";
import { IS_MOCK } from "@/lib/fiber";

export const dynamic = "force-dynamic";

/**
 * GET /api/examples — demo scenarios for the UI quick-fill (mock mode only).
 * In live mode the judge/user supplies real node ids or invoices.
 */
export async function GET() {
  if (!IS_MOCK) return NextResponse.json({ ok: true, mock: false, examples: [] });

  const invoices = Object.keys(MOCK_INVOICES);
  return NextResponse.json({
    ok: true,
    mock: true,
    examples: [
      {
        label: "Healthy payment — 100 CKB to merchant-cafe",
        target: mockNodeId(3),
        amount: "100",
        asset: CKB_ASSET,
        expect: "likely",
      },
      {
        label: "Chokepoint — 100 CKB to remote-village (120 CKB bridge)",
        target: mockNodeId(9),
        amount: "100",
        asset: CKB_ASSET,
        expect: "unlikely",
      },
      {
        label: "Unreachable — island-node has no channels",
        target: mockNodeId(10),
        amount: "10",
        asset: CKB_ASSET,
        expect: "impossible",
      },
      {
        label: "Too large — 50,000 CKB to merchant-cafe",
        target: mockNodeId(3),
        amount: "50000",
        asset: CKB_ASSET,
        expect: "impossible",
      },
      {
        label: "Stablecoin — 50 RUSD to rusd-merchant",
        target: mockNodeId(12),
        amount: "50",
        asset: RUSD_ASSET_ID,
        expect: "likely",
      },
      {
        label: "Invoice — healthy 100 CKB (demo invoice)",
        target: invoices[0],
        amount: "",
        asset: CKB_ASSET,
        expect: "likely",
      },
    ],
  });
}
