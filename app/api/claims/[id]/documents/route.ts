import { NextRequest } from "next/server";
import { documentsApi } from "@/lib/documents-api";
import { authFailure, json } from "@/lib/auth/http";
export const dynamic = "force-dynamic";
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    return json(
      await documentsApi(
        (await params).id,
        "list",
        undefined,
        request.nextUrl.searchParams.get("nextToken") ?? undefined,
      ),
    );
  } catch (error) {
    return authFailure(error);
  }
}
