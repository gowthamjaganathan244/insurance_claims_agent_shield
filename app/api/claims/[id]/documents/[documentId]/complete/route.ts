import { NextRequest } from "next/server";
import { documentsApi } from "@/lib/documents-api";
import { authFailure, json, readMutation } from "@/lib/auth/http";
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; documentId: string }> },
) {
  try {
    await readMutation(request);
    const { id, documentId } = await params;
    return json(await documentsApi(id, "complete", {}, undefined, documentId));
  } catch (error) {
    return authFailure(error);
  }
}
