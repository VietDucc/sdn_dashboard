// app/layout.tsx (hoặc pages/layout.tsx nếu bạn đang ở Pages Router)

import "./globals.css"; // nếu bạn có file CSS global

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
