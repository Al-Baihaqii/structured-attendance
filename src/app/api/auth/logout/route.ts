import { NextResponse } from "next/server";
import { clearSession } from "@/lib/auth";
import { apiError } from "@/lib/api";
import { assertUnsafeRequest } from "@/lib/request-security";

export async function POST(request: Request) {
  try {
    assertUnsafeRequest(request, false);
    await clearSession();
    return NextResponse.json({ success: true });
  } catch (error) { return apiError(error); }
}
