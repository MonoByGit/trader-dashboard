import { NextResponse, type NextRequest } from 'next/server';

const MOBILE_RE = /Android|iPhone|iPod|Windows Phone|BlackBerry|webOS|Opera Mini|IEMobile/i;

export function middleware(req: NextRequest) {
  if (req.nextUrl.pathname !== '/') return NextResponse.next();

  // Escape-hatch: forceer desktop en onthoud het.
  if (req.nextUrl.searchParams.get('desktop') === '1') {
    const res = NextResponse.next();
    res.cookies.set('view', 'desktop', { path: '/', maxAge: 60 * 60 * 24 * 365 });
    return res;
  }

  if (req.cookies.get('view')?.value === 'desktop') return NextResponse.next();

  const ua = req.headers.get('user-agent') ?? '';
  if (MOBILE_RE.test(ua)) {
    const url = req.nextUrl.clone();
    url.pathname = '/m';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: '/' };
