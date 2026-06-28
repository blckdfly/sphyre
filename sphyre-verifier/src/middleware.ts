import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const publicRoutes = [
  '/onboarding',
  '/seed-phrase-setup',
  '/setup-pin',
  '/login',
  '/recovery',
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  if (publicRoutes.some(route => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  if (pathname === '/' || pathname.startsWith('/dashboard') || pathname.startsWith('/presentations')) {
    return NextResponse.next();
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
