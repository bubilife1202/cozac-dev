import { Metadata } from "next";
import { ThemeProvider } from "@/components/theme-provider";
import { siteConfig } from "@/config/site";
import "./globals.css";
import { SystemSettingsProvider } from "@/lib/system-settings-context";
import { AudioProvider } from "@/lib/music/audio-context";
import { AuthProvider } from "@/lib/auth-context";

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: siteConfig.title,
    template: `%s | ${siteConfig.title}`,
  },
  description:
    "Jinbae Park's interactive macOS and iOS inspired portfolio at cozac.dev.",
  applicationName: "cozac.dev",
  alternates: {
    canonical: "/",
  },
  keywords: [
    "jinbae park",
    "cozac.dev",
    "portfolio",
    "virtual office",
    "macOS inspired",
    "iOS inspired",
  ],
  authors: [
    {
      name: "Jinbae Park",
      url: "https://www.linkedin.com/in/jinbae-park-658587178/",
    },
  ],
  creator: "Jinbae Park",
  publisher: "cozac.dev",
  icons: {
    icon: "/lobby.svg",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteConfig.url,
    title: "jinbae park - cozac.dev",
    description:
      "Explore Jinbae Park's interactive portfolio with macOS desktop and iOS mobile experiences.",
    siteName: "cozac.dev",
    images: [
      {
        url: "/api/og",
        width: 1200,
        height: 630,
        alt: "cozac.dev portfolio preview",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "jinbae park - cozac.dev",
    description:
      "Explore Jinbae Park's interactive portfolio with macOS desktop and iOS mobile experiences.",
    images: ["/api/og"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0, maximum-scale=1.0, interactive-widget=resizes-content"
        />
      </head>
      <body className="h-dvh">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <SystemSettingsProvider>
            <AuthProvider>
              <AudioProvider>{children}</AudioProvider>
            </AuthProvider>
          </SystemSettingsProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
