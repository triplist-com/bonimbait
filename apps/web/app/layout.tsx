import type { Metadata, Viewport } from 'next';
import { Heebo } from 'next/font/google';
import './globals.css';
import Header from '@/components/Layout/Header';
import Footer from '@/components/Layout/Footer';
import StructuredData from '@/components/StructuredData';
import Analytics from '@/components/Analytics';
import ConsultationCTA from '@/components/leads/ConsultationCTA';
import { SITE_URL, absoluteUrl } from '@/lib/site';
import { primary } from '@/lib/design/tokens';

const heebo = Heebo({
  subsets: ['hebrew', 'latin'],
  variable: '--font-heebo',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    template: '%s | בונים בית',
    default: 'בונים בית - מאגר הידע לבנייה פרטית בישראל',
  },
  description:
    'מאגר ידע מקיף לבנייה פרטית בישראל. חפשו בין מאות סרטונים וקבלו תשובות מבוססות AI לכל שאלה בנושא בנייה, עלויות, קבלנים, היתרים ועוד.',
  keywords: [
    'בנייה',
    'בית פרטי',
    'עלויות בנייה',
    'קבלנים',
    'היתר בנייה',
    'בנייה פרטית',
    'בניית בית',
    'מחירי בנייה',
    'שיפוץ',
    'אדריכלות',
    'תכנון בית',
    'ישראל',
  ],
  openGraph: {
    title: 'בונים בית - מאגר הידע לבנייה פרטית בישראל',
    description:
      'מאגר ידע מקיף לבנייה פרטית בישראל עם תשובות AI מבוססות מאות סרטונים',
    siteName: 'בונים בית',
    locale: 'he_IL',
    type: 'website',
    url: absoluteUrl(),
  },
  twitter: {
    card: 'summary_large_image',
    title: 'בונים בית - מאגר הידע לבנייה פרטית בישראל',
    description:
      'מאגר ידע מקיף לבנייה פרטית בישראל עם תשובות AI מבוססות מאות סרטונים',
  },
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: absoluteUrl(),
  },
  other: {
    dir: 'rtl',
  },
  manifest: '/manifest.json',
  icons: {
    apple: '/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  themeColor: primary[600],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl" className={heebo.variable}>
      <body className="font-heebo antialiased">
        {/* Skip to content link for accessibility */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:start-3 focus:top-3 focus:z-[100] focus:rounded-xl focus:bg-ink-900 focus:px-4 focus:py-3 focus:text-sm focus:font-semibold focus:text-white focus:shadow-lift"
        >
          דלגו לתוכן הראשי
        </a>
        <div className="min-h-screen flex flex-col">
          <Header />
          <main id="main-content" className="flex-1">
            {children}
          </main>
          <Footer />
        </div>
        {/* The site's single floating action (consultation, WhatsApp, ask). */}
        <ConsultationCTA variant="floating" source="site" />
        <StructuredData
          data={{
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: 'בונים בית',
            url: absoluteUrl(),
            description:
              'מאגר ידע מקיף לבנייה פרטית בישראל עם תשובות AI',
            inLanguage: 'he',
            potentialAction: {
              '@type': 'SearchAction',
              target:
                absoluteUrl('/search?q={search_term_string}'),
              'query-input': 'required name=search_term_string',
            },
          }}
        />
        <Analytics />
      </body>
    </html>
  );
}
