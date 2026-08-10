import { Xray } from '@stevenmckinnon/xray/next/client';
import './globals.css';

export const metadata = { title: 'xray next fixture' };

/**
 * `axisMinTokens={2}` because the mode axis here moves exactly two tokens, and the
 * default floor is three. Lowering it globally is wrong — the default exists to keep
 * a two-token coincidence from being announced as an axis — so the option exists,
 * and this fixture is what proves it works.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Xray axisMinTokens={2} />
      </body>
    </html>
  );
}
