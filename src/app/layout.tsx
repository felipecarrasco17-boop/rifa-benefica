import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gran Rifa Benéfica",
  description: "Participa y apoya nuestra noble causa. Elige tus números de la rifa y realiza tu pago de forma segura online.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>
        {children}
      </body>
    </html>
  );
}
