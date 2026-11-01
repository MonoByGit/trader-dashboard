import { NextResponse } from 'next/server';
import { productionHealthPayload } from '../../../../src/security/health-payload';

export async function GET() {
  return NextResponse.json(productionHealthPayload(), { status: 200 });
}
