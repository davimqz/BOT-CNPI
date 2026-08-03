'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar';
import {
  IconeAlertas,
  IconeConsulta,
  IconeHistorico,
  IconeMarcas,
  IconePrazos,
  IconeRevistas,
} from '@/components/icones';

/**
 * Navegação agrupada pelo que o usuário está fazendo, não pela ordem em que as
 * telas foram construídas: primeiro a fonte de dados (revistas, histórico,
 * consulta), depois o que ele acompanha (marcas, prazos), por último o ajuste.
 */
const GRUPOS = [
  {
    titulo: 'Fontes',
    itens: [
      { href: '/revistas', nome: 'Revistas INPI', Icone: IconeRevistas },
      { href: '/historico', nome: 'Histórico RPI', Icone: IconeHistorico },
      { href: '/busca', nome: 'Consulta ao pePI', Icone: IconeConsulta },
    ],
  },
  {
    titulo: 'Acompanhamento',
    itens: [
      { href: '/marcas', nome: 'Marcas monitoradas', Icone: IconeMarcas },
      { href: '/prazos', nome: 'Prazos INPI', Icone: IconePrazos },
    ],
  },
  {
    titulo: 'Sistema',
    itens: [{ href: '/configuracoes', nome: 'Alertas', Icone: IconeAlertas }],
  },
] as const;

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();

  async function sair() {
    await fetch('/api/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link href="/" />}>
              <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                <IconeMarcas className="size-4" />
              </div>
              <div className="grid flex-1 text-left leading-tight">
                <span className="truncate font-semibold">Monitor de Marcas</span>
                <span className="truncate text-xs opacity-70">INPI</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {GRUPOS.map((grupo) => (
          <SidebarGroup key={grupo.titulo}>
            <SidebarGroupLabel>{grupo.titulo}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {grupo.itens.map(({ href, nome, Icone }) => (
                  <SidebarMenuItem key={href}>
                    <SidebarMenuButton
                      render={<Link href={href} />}
                      // Prefixo, não igualdade: /prazos?status=pendente e
                      // /historico?edicao=2899 continuam marcando o item certo.
                      isActive={pathname === href || pathname.startsWith(`${href}/`)}
                      tooltip={nome}
                    >
                      <Icone />
                      <span>{nome}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={sair} tooltip="Sair">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M9.5 20.5H6a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2h3.5" />
                <path d="M15.5 15.5 20 12l-4.5-3.5" />
                <path d="M20 12H9.5" />
              </svg>
              <span>Sair</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
