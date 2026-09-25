import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { getGroupAttendanceExport } from "@/lib/group-attendance-export";
import { apiError } from "@/lib/api";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth();
    const { id } = await params;
    const query = new URL(request.url).searchParams;
    // Preserve repeated values as arrays so validation rejects ambiguous filters.
    const parameter = (key: string) => query.getAll(key).length > 1 ? query.getAll(key) : query.get(key) ?? undefined;
    const format = z.enum(["summary", "detail"], { error: "Jenis ekspor tidak valid." }).parse(parameter("format"));
    const result = await getGroupAttendanceExport(user, id, format, { from: parameter("from"), to: parameter("to") });
    if (!result) return NextResponse.json({ error: "Kelompok tidak ditemukan." }, { status: 404 });
    return new Response(result.csv, { headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="presensi-kelompok.csv"; filename*=UTF-8''${encodeURIComponent(result.filename).replace(/['()*]/g, character => `%${character.charCodeAt(0).toString(16)}`)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) {
    return apiError(error);
  }
}
