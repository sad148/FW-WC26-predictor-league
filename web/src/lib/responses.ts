import { NextResponse } from 'next/server';
import { HttpError } from './errors';

export function ok(data: object = {}, status = 200) {
  return NextResponse.json({ ok: true, ...data }, { status });
}

export function fail(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

export function handleError(err: unknown) {
  if (err instanceof HttpError) return fail(err.message, err.status);
  if (err instanceof Error) {
    console.error(err);
    return fail(err.message || 'Server error', 500);
  }
  return fail('Server error', 500);
}
