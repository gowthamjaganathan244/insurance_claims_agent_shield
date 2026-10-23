import { NextRequest } from "next/server";
import { operationsApi } from "@/lib/operations-api";
import { authFailure, json, readMutation } from "@/lib/auth/http";
export const dynamic = "force-dynamic";
const actions = ["import", "draft", "approve", "reject"];
export async function GET() {
  try {
    return json(await operationsApi("/templates/versions"));
  } catch (error) {
    return authFailure(error);
  }
}
export async function POST(request: NextRequest) {
  try {
    // Template drafts carry HTML, so allow up to the backend's 64 KB limit.
    const body = await readMutation(request, 65536);
    if (!actions.includes(String(body.action)))
      return json({ error: "Unsupported template action." }, 400);
    return json(await operationsApi("/templates/versions", body));
  } catch (error) {
    return authFailure(error);
  }
}
