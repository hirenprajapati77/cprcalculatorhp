import { NextRequest, NextResponse } from 'next/server';
import { CPRInputSchema } from '@/utils/validate';
import { CalculationService } from '@/services/calculation.service';
import { cache } from '@/lib/redis';

async function checkRateLimit(request: NextRequest): Promise<boolean> {
  let ip = '127.0.0.1';
  // Only trust x-forwarded-for if explicitly enabled via environment variable
  // indicating we are behind a trusted proxy
  if (process.env.TRUST_PROXY === 'true') {
    const forwardedFor = request.headers.get('x-forwarded-for');
    if (forwardedFor) {
      ip = forwardedFor.split(',')[0].trim();
    } else {
      ip = request.headers.get('x-real-ip') || '127.0.0.1';
    }
  }

  // Fallback to socket IP if not trusting proxy, but Next.js App Router 
  // doesn't expose the raw socket directly on NextRequest easily,
  // so we default to a shared bucket or the server IP unless proxy is trusted.
  // In production, TRUST_PROXY should be set to true if behind NGINX/Cloudflare.

  const limit = Number(process.env.RATE_LIMIT_MAX) || 60;
  const windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS) || 60000;
  const ttlSeconds = Math.ceil(windowMs / 1000);
  const cacheKey = `rate_limit:${ip}`;

  const count = await cache.incr(cacheKey, ttlSeconds);
  return count <= limit;
}

export async function POST(request: NextRequest) {
  // 1. Rate Limiting Check
  const allowed = await checkRateLimit(request);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { 
        status: 429,
        headers: {
          'Retry-After': '60',
        }
      }
    );
  }

  // 2. Parse & Validate Payload
  try {
    const body = await request.json();
    const result = CPRInputSchema.safeParse(body);
    
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      result.error.issues.forEach((err) => {
        const path = err.path.join('.');
        if (!fieldErrors[path]) {
          fieldErrors[path] = [];
        }
        fieldErrors[path].push(err.message);
      });
      
      return NextResponse.json(
        { error: 'Validation failed', details: fieldErrors },
        { status: 400 }
      );
    }

    // 3. Process Calculation & Save
    const input = result.data;
    const calculation = await CalculationService.calculateAndSave(input);

    return NextResponse.json(calculation, { status: 200 });
  } catch (err) {
    console.error('Error in calculate API route:', err);
    return NextResponse.json(
      { error: 'Internal server error occurred while calculating' },
      { status: 500 }
    );
  }
}
