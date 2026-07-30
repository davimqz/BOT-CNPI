import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
import { AvisoNovidades } from "./aviso-novidades";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";
import { getUsuarioUnico } from "@/lib/usuario";
import { carregarNovidades, paraUI, type NovidadesUI } from "@/lib/novidades";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Monitor de Marcas — INPI",
  description: "Monitoramento de marcas registradas/depositadas no INPI",
};

/**
 * Novidades para o aviso da Fase 6. Fora da sessão (tela de login) devolve null:
 * o aviso não pode mostrar movimentação de marca a quem ainda não entrou.
 *
 * Falha de banco também vira null, de propósito. Este aviso é um canal
 * secundário; deixá-lo derrubar o layout tiraria do ar todas as telas do
 * sistema — inclusive a de prazos, que é a que realmente importa.
 */
async function novidadesDaSessao(): Promise<NovidadesUI | null> {
  try {
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    if (!(await verifySessionToken(token))) return null;
    const usuario = await getUsuarioUnico();
    return paraUI(await carregarNovidades(usuario.id));
  } catch {
    return null;
  }
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const novidades = await novidadesDaSessao();

  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        {/* Em toda tela: a movimentação chega quando chega, não quando o
            usuário está justamente na página de prazos. */}
        <AvisoNovidades inicial={novidades} />
      </body>
    </html>
  );
}
