import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  LayoutDashboard, FileText, Table, Users, Truck,
  Wallet, List, UserCog, ClipboardList, LogOut, ArrowLeftRight,
  PanelLeftClose, PanelLeft, Map, FileSpreadsheet, Menu, Library, Bot, BookOpen,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useTranslation } from 'react-i18next';
import i18n, { LANGUAGE_STORAGE_KEY } from '@/i18n';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';


interface MainLayoutProps {
  children: React.ReactNode;
}

const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, isAdmin } = useAuth();
  const { t } = useTranslation();
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);
  const [collapsed, setCollapsed] = React.useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('layout-sidebar-collapsed') === '1';
  });

  React.useEffect(() => {
    window.localStorage.setItem('layout-sidebar-collapsed', collapsed ? '1' : '0');
  }, [collapsed]);

  React.useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleLanguageToggle = () => {
    const nextLanguage = i18n.language === 'en' ? 'zh' : 'en';
    void i18n.changeLanguage(nextLanguage);
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguage);
  };

  const currentLanguageLabel = i18n.language === 'en' ? t('language.english') : t('language.chinese');

  const navGroups = [
    {
      label: t('nav.groups.workspace'),
      items: [
        { path: '/', label: t('nav.dashboard'), icon: LayoutDashboard },
        { path: '/summary', label: t('nav.summary'), icon: Table },
      ],
    },
    {
      label: t('nav.groups.operations'),
      items: [
        { path: '/expenses', label: t('nav.expenses'), icon: FileText },
        { path: '/advance-funds', label: t('nav.advanceFunds'), icon: Wallet },
      ],
    },
    {
      label: t('nav.groups.legal'),
      items: [
        { path: '/legal/agent', label: t('nav.legalAgent'), icon: Bot },
        { path: '/legal/contracts', label: t('nav.legalContracts'), icon: FileSpreadsheet },
        { path: '/legal/library', label: t('nav.legalLibrary'), icon: Library },
        ...(isAdmin ? [{ path: '/legal/playbook', label: t('nav.legalPlaybook'), icon: BookOpen }] : []),
      ],
    },
    {
      label: t('nav.groups.fleet'),
      items: [
        { path: '/drivers', label: t('nav.drivers'), icon: Users },
        { path: '/vehicles', label: t('nav.vehicles'), icon: Truck },
        { path: '/vehicle-tracking', label: t('nav.vehicleTracking'), icon: Map },
      ],
    },
    {
      label: t('nav.groups.system'),
      items: [
        { path: '/fee-types', label: t('nav.feeTypes'), icon: List },
        ...(isAdmin ? [{ path: '/staff', label: t('nav.staff'), icon: UserCog }] : []),
        { path: '/logs', label: t('nav.logs'), icon: ClipboardList },
      ],
    },
  ];

  const NavItem = ({ path, label, icon: Icon }: { path: string; label: string; icon: any }) => {
    const isActive = path === '/'
      ? location.pathname === path
      : location.pathname === path || location.pathname.startsWith(`${path}/`);
    const content = (
      <Link
        to={path}
        className={cn(
          'relative flex items-center py-2.5 rounded-lg text-sm transition-all',
          collapsed ? 'justify-center px-0 gap-0' : 'gap-3 px-2',
          isActive
            ? 'bg-white text-[#0f2a5e] font-semibold shadow-sm'
            : 'text-white/80 hover:bg-white/10 hover:text-white'
        )}
      >
        {isActive && !collapsed && <span className="absolute -left-1 top-1.5 bottom-1.5 w-0.5 rounded-full bg-white" />}
        <Icon className="h-4 w-4 shrink-0" />
        <span
          className="overflow-hidden whitespace-nowrap transition-all duration-300"
          style={{ opacity: collapsed ? 0 : 1, maxWidth: collapsed ? 0 : 200 }}
        >
          {label}
        </span>
      </Link>
    );

    if (collapsed) {
      return (
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>{content}</TooltipTrigger>
          <TooltipContent side="right">{label}</TooltipContent>
        </Tooltip>
      );
    }
    return content;
  };

  const MobileNavigation = () => (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-white/10 text-white">
          <Truck className="h-4 w-4" />
        </div>
        <div className="text-sm font-bold text-white">{t('brand.short')}</div>
      </div>
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {navGroups.map((group, groupIndex) => (
          <div key={group.label} className={cn(groupIndex > 0 && 'mt-4')}>
            <div className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-white/45">
              {group.label}
            </div>
            <div className="space-y-0.5">
              {group.items.map(({ path, label, icon: Icon }) => {
                const isActive = path === '/'
                  ? location.pathname === path
                  : location.pathname === path || location.pathname.startsWith(`${path}/`);
                return (
                  <Link
                    key={path}
                    to={path}
                    onClick={() => setMobileNavOpen(false)}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors',
                      isActive
                        ? 'bg-white font-semibold text-[#0f2a5e]'
                        : 'text-white/80 hover:bg-white/10 hover:text-white'
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="border-t border-white/10 p-3">
        <div className="mb-2 flex items-center gap-2 px-2 py-2">
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarFallback className="bg-white/15 text-xs font-semibold text-white">
              {user?.name?.charAt(0) || '?'}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="truncate text-xs font-medium text-white">{user?.name}</div>
            <div className="truncate text-xs text-white/60">
              {user?.role === 'admin' ? t('common.admin') : t('common.staff')}
            </div>
          </div>
        </div>
        <Button variant="ghost" className="w-full justify-between text-white/80 hover:bg-white/10 hover:text-white" onClick={handleLanguageToggle}>
          {currentLanguageLabel}
          <ArrowLeftRight className="h-4 w-4" />
        </Button>
        <Button variant="ghost" className="w-full justify-between text-white/80 hover:bg-white/10 hover:text-white" onClick={handleLogout}>
          {t('nav.logout')}
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background md:flex md:h-screen md:overflow-hidden">
        <aside
          className={cn("relative hidden h-screen shrink-0 flex-col overflow-visible transition-all duration-300 md:flex", collapsed ? "w-14" : "w-44")}
          style={{ background: 'linear-gradient(180deg, #0f2a5e 0%, #1a3f8f 60%, #1e4da8 100%)' }}
        >
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'absolute right-0 top-1/2 z-30 -translate-y-1/2 translate-x-full border-l-0 px-0 transition-all',
              collapsed
                ? 'h-10 w-5 rounded-r-full rounded-l-none border border-[#7fb0ff] bg-[#0f2a5e] text-white shadow-[0_4px_10px_rgba(15,42,94,0.3)] hover:bg-[#1a3f8f]'
                : 'h-9 w-4 rounded-r-full rounded-l-none border border-[#0f2a5e]/40 bg-white text-[#0f2a5e] shadow-[0_3px_8px_rgba(15,42,94,0.18)] hover:bg-[#eef3ff]'
            )}
            onClick={() => setCollapsed(!collapsed)}
            title={collapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')}
          >
            {collapsed ? <PanelLeft className="h-3.5 w-3.5" /> : <PanelLeftClose className="h-3 w-3" />}
          </Button>

          {/* Logo区域 */}
          <div className="flex items-center border-b border-white/10 px-3 py-3 gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-white/10 text-white shrink-0">
              <Truck className="h-4 w-4" />
            </div>
            <div
              className="overflow-hidden whitespace-nowrap transition-all duration-300 flex-1"
              style={{ width: collapsed ? 0 : 120, opacity: collapsed ? 0 : 1 }}
            >
              <div className="text-white font-bold text-sm leading-tight">{t('brand.short')}</div>
            </div>
          </div>

          {/* 导航菜单 */}
          <nav className="flex-1 overflow-y-auto px-1 py-2">
            {navGroups.map((group, groupIndex) => (
              <div
                key={group.label}
                className={cn(groupIndex > 0 && (collapsed ? 'mt-2 border-t border-white/10 pt-2' : 'mt-3'))}
              >
                {!collapsed && (
                  <div className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-white/45">
                    {group.label}
                  </div>
                )}
                <div className="space-y-0.5">
                  {group.items.map((item) => (
                    <NavItem key={item.path} {...item} />
                  ))}
                </div>
              </div>
            ))}
          </nav>

          {/* 底部用户信息 */}
          <div className="border-t border-white/10 px-2 py-3 shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    'flex w-full items-center gap-2 rounded-lg text-left transition-colors hover:bg-white/10',
                    collapsed ? 'justify-center p-1.5' : 'px-1 py-1.5'
                  )}
                >
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarFallback className="bg-white/15 text-white text-xs font-semibold">
                      {user?.name?.charAt(0) || '?'}
                    </AvatarFallback>
                  </Avatar>
                  {!collapsed && (
                    <div className="min-w-0 flex-1 overflow-hidden px-1">
                      <div className="truncate text-white text-xs font-medium">{user?.name}</div>
                      <div className="truncate text-white/60 text-xs">{user?.role === 'admin' ? t('common.admin') : t('common.staff')}</div>
                    </div>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="top"
                align={collapsed ? 'center' : 'start'}
                className="w-44"
              >
                <DropdownMenuItem onClick={handleLanguageToggle} className="justify-between">
                  <span>{currentLanguageLabel}</span>
                  <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleLogout} className="justify-between">
                  <span>{t('nav.logout')}</span>
                  <LogOut className="h-4 w-4 text-muted-foreground" />
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </aside>

        <main className="min-w-0 bg-background md:flex-1 md:overflow-auto">
          <div className="sticky top-0 z-40 flex h-14 items-center justify-between border-b bg-background/95 px-3 backdrop-blur md:hidden">
            <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" aria-label={t('nav.openMenu')}>
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent
                side="left"
                className="w-[18rem] max-w-[85vw] border-none p-0 [&>button]:text-white"
                style={{ background: 'linear-gradient(180deg, #0f2a5e 0%, #1a3f8f 60%, #1e4da8 100%)' }}
              >
                <SheetTitle className="sr-only">{t('nav.menu')}</SheetTitle>
                <MobileNavigation />
              </SheetContent>
            </Sheet>
            <div className="truncate px-3 text-sm font-semibold">{t('brand.short')}</div>
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                {user?.name?.charAt(0) || '?'}
              </AvatarFallback>
            </Avatar>
          </div>
          <div className="p-3 sm:p-4 md:p-6">{children}</div>
        </main>
      </div>
    </TooltipProvider>
  );
};

export default MainLayout;
