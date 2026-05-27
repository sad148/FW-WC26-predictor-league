import { ok } from '@/lib/responses';

export async function GET() {
  return ok({ status: 'WC26 Predictor API online', time: new Date().toISOString() });
}
