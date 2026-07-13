import type { Metadata } from "next";
import { ErrorDecoder } from "@/components/ErrorDecoder";

export const metadata: Metadata = {
  title: "Error decoder — Fiber Preflight",
};

export default function DecoderPage() {
  return <ErrorDecoder />;
}
