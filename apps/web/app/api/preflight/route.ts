import { NextResponse } from "next/server";
import {
  CKB_ASSET,
  explainFailure,
  extractInvoiceTarget,
  looksLikeInvoice,
  parseCkb,
  preflight,
} from "@fiber-preflight/core";
import { ASSET_LABELS, getClient, getGraph, getSelfNodeId, IS_MOCK, jsonSafe } from "@/lib/fiber";

export const dynamic = "force-dynamic";

/**
 * POST /api/preflight
 * body: { target: nodeId | fiber invoice, amount?: decimal string (display units, 8 decimals), asset?: AssetId }
 * -> { ok, report: PreflightReport }
 * When `target` is an invoice, amount/asset/target are taken from the invoice.
 */
export async function POST(req: Request) {
  let body: { target?: string; amount?: string; asset?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const rawTarget = (body.target ?? "").trim();
  if (!rawTarget) {
    return NextResponse.json({ ok: false, error: "missing `target` (node id or invoice)" }, { status: 400 });
  }

  try {
    let target = rawTarget;
    let asset = body.asset || CKB_ASSET;
    let amount: bigint;

    if (looksLikeInvoice(rawTarget)) {
      const parsed = await getClient().parseInvoice(rawTarget);
      const inv = extractInvoiceTarget(parsed);
      if (!inv.target) {
        return NextResponse.json({ ok: false, error: "invoice does not contain a payee node id" }, { status: 422 });
      }
      target = inv.target;
      asset = inv.asset;
      amount = inv.amount;
      if (amount === 0n && body.amount) amount = parseCkb(body.amount);
    } else {
      if (!body.amount) {
        return NextResponse.json({ ok: false, error: "missing `amount`" }, { status: 400 });
      }
      amount = parseCkb(body.amount);
    }

    if (amount <= 0n) {
      return NextResponse.json({ ok: false, error: "amount must be positive" }, { status: 400 });
    }

    const [graph, source] = await Promise.all([getGraph(), getSelfNodeId()]);
    const report = preflight(graph, { source, target, amount, asset, assetLabels: ASSET_LABELS });
    return NextResponse.json({ ok: true, mock: IS_MOCK, report: jsonSafe(report) });
  } catch (e) {
    return NextResponse.json({ ok: false, mock: IS_MOCK, diagnostic: explainFailure(e) }, { status: 502 });
  }
}
