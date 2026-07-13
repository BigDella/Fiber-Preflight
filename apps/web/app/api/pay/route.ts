import { NextResponse } from "next/server";
import {
  bigIntToHex,
  CKB_ASSET,
  explainFailure,
  extractInvoiceTarget,
  looksLikeInvoice,
  parseCkb,
  preflight,
} from "@fiber-preflight/core";
import { ASSET_LABELS, getClient, getGraph, getSelfNodeId, IS_MOCK, jsonSafe } from "@/lib/fiber";

export const dynamic = "force-dynamic";

const POLL_INTERVAL_MS = 700;
const MAX_POLLS = 20;

/**
 * POST /api/pay — DEMO ONLY (testnet). Runs a preflight, attempts the payment,
 * polls to a terminal status and, on failure, returns the raw error alongside
 * its translated diagnostic — preflight prediction vs actual outcome.
 *
 * body: { target: nodeId | invoice, amount?: decimal string, asset?: AssetId }
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
    return NextResponse.json({ ok: false, error: "missing `target`" }, { status: 400 });
  }

  try {
    const client = getClient();
    const isInvoice = looksLikeInvoice(rawTarget);

    // resolve routing details for the preflight comparison
    let target = rawTarget;
    let asset = body.asset || CKB_ASSET;
    let amount = 0n;
    if (isInvoice) {
      const inv = extractInvoiceTarget(await client.parseInvoice(rawTarget));
      target = inv.target ?? "";
      asset = inv.asset;
      amount = inv.amount;
    } else if (body.amount) {
      amount = parseCkb(body.amount);
    }
    if (!isInvoice && amount <= 0n) {
      return NextResponse.json({ ok: false, error: "missing or invalid `amount`" }, { status: 400 });
    }

    const [graph, source] = await Promise.all([getGraph(), getSelfNodeId()]);
    const report =
      target !== ""
        ? preflight(graph, { source, target, amount, asset, assetLabels: ASSET_LABELS })
        : null;

    // attempt the payment
    const params: Record<string, unknown> = isInvoice
      ? { invoice: rawTarget }
      : { target_pubkey: target, amount: bigIntToHex(amount), keysend: true };

    let payment = await client.sendPayment(params);
    const hash = payment.payment_hash;

    // poll to a terminal state
    let polls = 0;
    while (hash && payment.status !== "Success" && payment.status !== "Failed" && polls < MAX_POLLS) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      payment = await client.getPayment(hash);
      polls++;
    }

    const failed = payment.status === "Failed";
    return NextResponse.json({
      ok: true,
      mock: IS_MOCK,
      preflight: report ? jsonSafe(report) : null,
      payment: jsonSafe({
        paymentHash: payment.payment_hash,
        status: payment.status,
        fee: payment.fee ?? null,
        rawError: payment.failed_error ?? null,
      }),
      diagnostic: failed ? explainFailure(payment.failed_error ?? "payment failed") : null,
    });
  } catch (e) {
    // send_payment itself rejected (e.g. no route, bad invoice) — still translate
    return NextResponse.json(
      { ok: false, mock: IS_MOCK, diagnostic: explainFailure(e) },
      { status: 502 },
    );
  }
}
