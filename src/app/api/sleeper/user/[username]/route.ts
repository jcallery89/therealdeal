import { getUser } from "@/lib/sleeper/client";
import { sourcedJson } from "@/lib/api";
import { NextResponse } from "next/server";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params;
  try {
    const result = await getUser(username);
    if (!result.data?.user_id) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    return sourcedJson(result);
  } catch {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
}
