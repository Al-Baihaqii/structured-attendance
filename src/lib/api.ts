import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthorizationError, GroupDeletedError } from "./authorization";
import { HttpError } from "./http-error";

export function apiError(error: unknown) {
  if (error instanceof GroupDeletedError) {
    return NextResponse.json({ error: error.message, code: "GROUP_DELETED" }, { status: 409 });
  }
  if (error instanceof ZodError) {
    return NextResponse.json({ error: error.issues[0]?.message || "Data tidak valid." }, { status: 400 });
  }
  if (error instanceof AuthorizationError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof HttpError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  return NextResponse.json({ error: "Terjadi kesalahan pada server." }, { status: 500 });
}

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}
