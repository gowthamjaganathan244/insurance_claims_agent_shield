import { type NextRequest } from "next/server";
import { claimsApi } from "@/lib/claims-api";
import { AuthError } from "@/lib/auth/cognito";
import { authFailure, json, readMutation } from "@/lib/auth/http";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: NextRequest, context: Context) {
  try {
    return json(await claimsApi("GET", (await context.params).id));
  } catch (error) {
    return authFailure(error);
  }
}
async function mutate(
  request: NextRequest,
  context: Context,
  method: "PATCH" | "DELETE",
) {
  try {
    const body = await readMutation(request);
    if (
      method === "PATCH" &&
      (Object.keys(body).join() !== "description" ||
        typeof body.description !== "string" ||
        !body.description.trim())
    )
      throw new AuthError(
        "Enter a description. Only description can be edited.",
      );
    if (method === "DELETE" && Object.keys(body).length)
      throw new AuthError("Invalid cancellation request.");
    return json(
      await claimsApi(
        method,
        (await context.params).id,
        undefined,
        method === "PATCH"
          ? { description: (body.description as string).trim() }
          : undefined,
      ),
    );
  } catch (error) {
    return authFailure(error);
  }
}
export const PATCH = (request: NextRequest, context: Context) =>
  mutate(request, context, "PATCH");
export const DELETE = (request: NextRequest, context: Context) =>
  mutate(request, context, "DELETE");
