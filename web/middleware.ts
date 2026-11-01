import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { authEnabled, SESSION_COOKIE, verifySessionCookieValue } from '@/lib/auth';

function isPublicAsset(pathname: string): boolean {
  if (pathname.startsWith('/_next')) return true;
  if (pathname.startsWith('/icons/')) return true;
  if (pathname === '/manifest.webmanifest' || pathname === '/favicon.ico') return true;
  if (/\.(svg|png|woff2?)$/i.test(pathname)) return true;
  return false;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isPublicAsset(pathname)) return NextResponse.next();

  // Cron blijft alleen Bearer CRON_SECRET (geen app-cookie).
  if (pathname.startsWith('/api/cron')) return NextResponse.next();

  if (pathname.startsWith('/api/auth/')) return NextResponse.next();

  if (!authEnabled()) return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (await verifySessionCookieValue(token)) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });
  }

  if (pathname === '/login') return NextResponse.next();

  const login = req.nextUrl.clone();
  login.pathname = '/login';
  login.searchParams.set('next', pathname + req.nextUrl.search);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};
