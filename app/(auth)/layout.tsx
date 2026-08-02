export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <main className="bg-animated-gradient min-h-screen">{children}</main>;
}
