import { NextRequest } from "next/server";
import { operationsApi } from "@/lib/operations-api";
import { authFailure, json, readMutation } from "@/lib/auth/http";
export const dynamic = "force-dynamic";
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    return json(
      await operationsApi(
        `/claims/${(await params).id}/operations`,
        undefined,
        request.nextUrl.searchParams.get("nextToken") ?? undefined,
      ),
    );
  } catch (error) {
    return authFailure(error);
  }
}
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const body = await readMutation(request);
    return json(
      await operationsApi(`/claims/${(await params).id}/operations`, body),
    );
  } catch (error) {
    return authFailure(error);
  }
}
