'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
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
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
} from '@/components/ui/sidebar';
import {
  IconeAcompanhar,
  IconeAlertas,
  IconeCadastrar,
  IconeCaixaMensagem,
  IconeColidencia,
  IconeConsulta,
  IconeDesenhoIndustrial,
  IconeMarcas,
  IconePatentes,
  IconePrazos,
  IconeRevistas,
} from '@/components/icones';

interface ItemFilho {
  href: string;
  nome: string;
  Icone: typeof IconeMarcas;
  /** Sem `href` correspondente ainda — mostra o item, mas desabilitado, com o motivo no tooltip. */
  emBreve?: string;
}

interface GrupoPI {
  titulo: string;
  Icone: typeof IconeMarcas;
  /** Sem itens implementados ainda (Patentes, Desenho Industrial) — grupo inteiro fica desabilitado. */
  emBreve?: string;
  itens?: ItemFilho[];
}

/**
 * Um dropdown por tipo de propriedade industrial (Marcas hoje; Patentes e
 * Desenho Industrial entram como irmãos no mesmo nível quando forem
 * implementados, não aninhados dentro de Marcas — cada um terá seu próprio
 * modelo de despacho). "Análise Prévia de Viabilidade" é transversal aos três
 * tipos (é pesquisa ao vivo antes de decidir depositar, não acompanhamento de
 * um processo já existente), por isso fica como grupo irmão, não dentro de
 * Marcas. Revistas, Prazos e Caixa de Mensagem ficam FORA desses dropdowns
 * porque já são compartilhados entre os três tipos (mesma edição da RPI,
 * mesmo motor de prazo) — ver CLAUDE.md Seção 3.1.1.
 *
 * "Histórico RPI" (/historico) segue existindo como rota, só não tem mais
 * entrada de navegação — pedido explícito do usuário em 16/08/2026.
 */
const GRUPOS_PI: GrupoPI[] = [
  {
    titulo: 'Análise Prévia de Viabilidade',
    Icone: IconeConsulta,
    itens: [
      { href: '/busca', nome: 'Pesquisa da Propriedade Industrial (pePI)', Icone: IconeConsulta },
      {
        href: '/marcas/colidencias',
        nome: 'Colidências',
        Icone: IconeColidencia,
        emBreve:
          'Em breve — falta persistir o motivo do cruzamento (nome/similaridade) no despacho para dar uma tela própria a essa lista.',
      },
    ],
  },
  {
    titulo: 'Marcas',
    Icone: IconeMarcas,
    itens: [
      { href: '/marcas/cadastrar', nome: 'Cadastrar Processo', Icone: IconeCadastrar },
      { href: '/marcas', nome: 'Acompanhar Processo', Icone: IconeAcompanhar },
    ],
  },
  {
    titulo: 'Patentes',
    Icone: IconePatentes,
    itens: [
      {
        href: '/patentes/cadastrar',
        nome: 'Cadastrar Processo',
        Icone: IconeCadastrar,
        emBreve: 'Em breve — fase futura do roadmap.',
      },
      {
        href: '/patentes',
        nome: 'Acompanhar Processo',
        Icone: IconeAcompanhar,
        emBreve: 'Em breve — fase futura do roadmap.',
      },
    ],
  },
  {
    titulo: 'Desenho Industrial',
    Icone: IconeDesenhoIndustrial,
    emBreve: 'Em breve — fase futura do roadmap.',
  },
];

const ITENS_COMPARTILHADOS = [
  { href: '/revistas', nome: 'Revistas INPI', Icone: IconeRevistas },
  { href: '/prazos', nome: 'Prazos INPI', Icone: IconePrazos },
  { href: '/caixa-de-mensagens', nome: 'Caixa de Mensagem', Icone: IconeCaixaMensagem },
] as const;

function IconeChevron({ aberto }: { aberto: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`ml-auto size-4 shrink-0 transition-transform ${aberto ? 'rotate-90' : ''}`}
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const grupoAtivo = (grupo: GrupoPI) =>
    (grupo.itens ?? []).some(
      (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
    );

  const [abertos, setAbertos] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(GRUPOS_PI.map((g) => [g.titulo, grupoAtivo(g)])),
  );

  function alternar(titulo: string) {
    setAbertos((a) => ({ ...a, [titulo]: !a[titulo] }));
  }

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
        <SidebarGroup>
          <SidebarGroupLabel>Propriedade Industrial</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {GRUPOS_PI.map((grupo) => {
                if (grupo.emBreve) {
                  return (
                    <SidebarMenuItem key={grupo.titulo}>
                      <SidebarMenuButton aria-disabled="true" title={grupo.emBreve}>
                        <grupo.Icone />
                        <span>{grupo.titulo}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                }
                const aberto = abertos[grupo.titulo] ?? false;
                return (
                  <SidebarMenuItem key={grupo.titulo}>
                    <SidebarMenuButton
                      onClick={() => alternar(grupo.titulo)}
                      isActive={grupoAtivo(grupo)}
                      aria-expanded={aberto}
                    >
                      <grupo.Icone />
                      <span>{grupo.titulo}</span>
                      <IconeChevron aberto={aberto} />
                    </SidebarMenuButton>
                    {aberto && (
                      <SidebarMenuSub>
                        {grupo.itens?.map((item) => (
                          <SidebarMenuSubItem key={item.href}>
                            {item.emBreve ? (
                              <SidebarMenuSubButton aria-disabled="true" title={item.emBreve}>
                                <item.Icone />
                                <span>{item.nome}</span>
                              </SidebarMenuSubButton>
                            ) : (
                              <SidebarMenuSubButton
                                render={<Link href={item.href} />}
                                isActive={
                                  pathname === item.href || pathname.startsWith(`${item.href}/`)
                                }
                              >
                                <item.Icone />
                                <span>{item.nome}</span>
                              </SidebarMenuSubButton>
                            )}
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    )}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>INPI</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {ITENS_COMPARTILHADOS.map(({ href, nome, Icone }) => (
                <SidebarMenuItem key={href}>
                  <SidebarMenuButton
                    render={<Link href={href} />}
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

        <SidebarGroup>
          <SidebarGroupLabel>Sistema</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  render={<Link href="/configuracoes" />}
                  isActive={
                    pathname === '/configuracoes' || pathname.startsWith('/configuracoes/')
                  }
                  tooltip="Alertas"
                >
                  <IconeAlertas />
                  <span>Alertas</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
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
