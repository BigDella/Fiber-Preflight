import { NextResponse } from "next/server";
import { explainFailure, SAMPLE_ERRORS } from "@fiber-preflight/core";

export const dynamic = "force-dynamic";

/** GET /api/explain — list of sample raw errors for the demo dropdown. */
export async function GET() {
  return NextResponse.json({ ok: true, samples: SAMPLE_ERRORS });
}

/**
 * POST /api/explain — body: { error: string } -> { ok, diagnostic: DiagnosticResult }.
 * Pure translation; works with no Fiber node at all.
 */
export async function POST(req: Request) {
  let body: { error?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }
  if (body.error === undefined || body.error === null || body.error === "") {
    return NextResponse.json({ ok: false, error: "missing `error`" }, { status: 400 });
  }
  return NextResponse.json({ ok: true, diagnostic: explainFailure(body.error) });
}
