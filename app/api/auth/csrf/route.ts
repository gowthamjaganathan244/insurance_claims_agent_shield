import { type NextRequest } from "next/server";
import { issueCsrf } from "@/lib/auth/http";
export const dynamic = "force-dynamic";
export function GET(request: NextRequest) {
  return issueCsrf(request);
}
