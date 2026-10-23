import { type NextRequest } from "next/server";
import { claimsApi } from "@/lib/claims-api";
import { authFailure, json, readMutation, textField } from "@/lib/auth/http";
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

export async function POST(request: NextRequest) {
  try {
    const body = await readMutation(request);
    if (body.confirmEmail !== true)
      return json(
        {
          error:
            "Confirm that creating this claim may send a real confirmation email.",
        },
        400,
      );
    return json(
      await claimsApi("POST", undefined, undefined, {
        policyNumber: textField(body, "policyNumber", 128),
        claimType: textField(body, "claimType", 128),
        description: textField(body, "description", 8000),
      }),
      201,
    );
  } catch (error) {
    return authFailure(error);
  }
}
