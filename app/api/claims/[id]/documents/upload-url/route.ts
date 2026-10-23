import { NextRequest } from "next/server";
import { documentsApi } from "@/lib/documents-api";
import { authFailure, json, readMutation, textField } from "@/lib/auth/http";
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const body = await readMutation(request);
    const fileName = textField(body, "fileName", 128);
    const contentType = textField(body, "contentType", 128);
    const types: Record<string, string> = {
      pdf: "application/pdf",
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
    };
    if (
      /[\\/]/.test(fileName) ||
      types[fileName.split(".").at(-1)?.toLowerCase() ?? ""] !== contentType ||
      !Number.isInteger(body.sizeBytes) ||
      typeof body.sizeBytes !== "number" ||
      body.sizeBytes < 1 ||
      body.sizeBytes >= 10469376
    )
      return json(
        { error: "Select a PDF, PNG or JPEG smaller than 10,469,376 bytes." },
        400,
      );
    return json(
      await documentsApi((await params).id, "upload", {
        fileName,
        contentType,
        sizeBytes: body.sizeBytes,
      }),
    );
  } catch (error) {
    return authFailure(error);
  }
}
