import { NextResponse } from "next/server";
import { DataSourceKind, Sourced } from "./datasource";

export interface ApiEnvelope<T> {
  data: T;
  meta: { source: DataSourceKind; fetchedAt: number };
}

export function sourcedJson<T>(result: Sourced<T>): NextResponse {
  return NextResponse.json({
    data: result.data,
    meta: { source: result.source, fetchedAt: result.fetchedAt },
  });
}
