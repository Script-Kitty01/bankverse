import type { Metadata } from "next";
import { Inter, IBM_Plex_Serif } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
  fallback: ["system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
});

const ibmPlexSerif = IBM_Plex_Serif({
  variable: "--font-ibm-plex-serif",
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
  fallback: ["Georgia", "Times New Roman", "serif"],
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "https://bankverse.vercel.app"
  ),
  title: {
    default: "BankVerse — Modern Banking Platform",
    template: "%s | BankVerse",
  },
  description:
    "BankVerse is a modern banking platform that lets you manage multiple bank accounts, track transactions, transfer funds, and monitor your financial health — all in one place.",
  keywords: [
    "banking",
    "finance",
    "money management",
    "online banking",
    "transactions",
    "funds transfer",
  ],
  authors: [{ name: "BankVerse" }],
  creator: "BankVerse",
  icons: {
    icon: "/icons/logo.svg",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://bankverse.vercel.app",
    siteName: "BankVerse",
    title: "BankVerse — Modern Banking Platform",
    description:
      "Manage multiple bank accounts, track transactions, transfer funds, and monitor your financial health.",
    images: [
      {
        url: "/icons/logo.svg",
        width: 512,
        height: 512,
        alt: "BankVerse Logo",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "BankVerse — Modern Banking Platform",
    description:
      "Manage multiple bank accounts, track transactions, transfer funds, and monitor your financial health.",
    images: ["/icons/logo.svg"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${ibmPlexSerif.variable} ${inter.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
