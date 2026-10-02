import { NextResponse } from 'next/server';

// Optional password gate. Set DASHBOARD_PASSWORD to turn it on.
export function middleware(req) {
  const pw = process.env.DASHBOARD_PASSWORD;
  if (!pw) return NextResponse.next();
  const auth = req.headers.get('authorization') || '';
  const [scheme, encoded] = auth.split(' ');
  if (scheme === 'Basic' && encoded) {
    const [, pass] = atob(encoded).split(':');
    if (pass === pw) return NextResponse.next();
  }
  return new NextResponse('Password required', { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="Kargo hiring"' } });
}

export const config = { matcher: ['/((?!_next|favicon.ico).*)'] };
