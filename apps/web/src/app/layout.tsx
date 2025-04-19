import { Toaster } from '@/components/ui/sonner';
import { getLanguage } from '@/lib/utils/header-helpers';
import { cn } from '@/lib/utils/tailwind-helpers';
import { SWRProvider } from '@/providers/SwrProvider';
import { ThemeProvider } from '@/providers/ThemeProvider';
import '@/styles/globals.css';
import type { Metadata, Viewport } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages, getTranslations } from 'next-intl/server';
import PlausibleProvider from 'next-plausible';
import { Roboto } from 'next/font/google';
import NextTopLoader from 'nextjs-toploader';

const roboto = Roboto({
  weight: ['100', '300', '400', '500', '700', '900'],
  subsets: ['latin'],
  variable: '--font-roboto',
  display: 'swap',
});

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <PlausibleProvider
          customDomain={process.env.NEXT_PUBLIC_BASE_URL}
          domain={process.env.NEXT_PUBLIC_BASE_URL?.replace('https://', '')!}
          scriptProps={{
            src: `${process.env.NEXT_PUBLIC_BASE_URL}/js/nuuhkija.js`,

            // https://github.com/4lejandrito/next-plausible/issues/113
            // @ts-expect-error missing types
            'data-api': `${process.env.NEXT_PUBLIC_BASE_URL}/api/event`,
          }}
          selfHosted
        />
      </head>
      <body
        className={cn(
          'flex min-h-dvh w-full max-w-[100vw] bg-background font-sans antialiased',
          roboto.variable,
        )}
      >
        <SWRProvider>
          <NextTopLoader color="#4153af" showSpinner={false} />
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            disableTransitionOnChange
            enableSystem
          >
            <Toaster />
            <NextIntlClientProvider messages={messages}>
              {children}
            </NextIntlClientProvider>
          </ThemeProvider>
        </SWRProvider>
      </body>
    </html>
  );
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: await getLanguage() });

  return {
    title: t('seo.title'),
    description: t('seo.description'),
    metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL as string),
    openGraph: {
      title: t('seo.title'),
      description: t('seo.description'),
      type: 'website',
      locale: await getLanguage(),
      siteName: 'Lukittu',
    },
    referrer: 'no-referrer',
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#09090b' },
  ],
};
