import { type NextRequest } from "next/server";
import { claimsApi } from "@/lib/claims-api";
import { authFailure, json } from "@/lib/auth/http";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    return json(
      await claimsApi(
        "GET",
        undefined,
        request.nextUrl.searchParams.get("nextToken") ?? undefined,
      ),
    );
  } catch (error) {
    return authFailure(error);
  }
}
