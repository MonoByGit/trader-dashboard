import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'Momentum-1',
  description: 'Glanceable mobiele weergave van het Momentum-1 dashboard',
  appleWebApp: {
    capable: true,
    title: 'Momentum-1',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    apple: '/icons/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#1a1a1a' },
    { media: '(prefers-color-scheme: light)', color: '#faf8f3' },
  ],
};

const themeScript = `(function(){try{var m=window.matchMedia('(prefers-color-scheme: light)');var apply=function(){document.documentElement.setAttribute('data-theme', m.matches?'light':'dark');};apply();m.addEventListener('change',apply);}catch(e){}})();`;

export default function MobileLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      <div className="m-root">{children}</div>
    </>
  );
}
