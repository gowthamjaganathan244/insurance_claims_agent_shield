import { operationsApi } from "@/lib/operations-api";
import { authFailure, json } from "@/lib/auth/http";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return json(await operationsApi("/templates"));
  } catch (error) {
    return authFailure(error);
  }
}
