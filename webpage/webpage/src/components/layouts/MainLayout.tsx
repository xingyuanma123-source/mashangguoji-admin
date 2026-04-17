import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  LayoutDashboard, FileText, Table, Users, Truck,
  Wallet, List, UserCog, ClipboardList, LogOut,
  PanelLeftClose, PanelLeft,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';


interface MainLayoutProps {
  children: React.ReactNode;
}

const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, isAdmin } = useAuth();
  const [collapsed, setCollapsed] = React.useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    { path: '/', label: '数据看板', icon: LayoutDashboard },
    { path: '/expenses', label: '报账管理', icon: FileText },
    { path: '/summary', label: '总表', icon: Table },
    { path: '/drivers', label: '司机管理', icon: Users },
    { path: '/vehicles', label: '车辆管理', icon: Truck },
    { path: '/advance-funds', label: '备用金', icon: Wallet },
    { path: '/fee-types', label: '费用类型管理', icon: List },
    ...(isAdmin ? [{ path: '/staff', label: '客服账号管理', icon: UserCog }] : []),
    { path: '/logs', label: '操作日志', icon: ClipboardList },
  ];

  const NavItem = ({ path, label, icon: Icon }: { path: string; label: string; icon: any }) => {
    const isActive = location.pathname === path;
    const content = (
      <Link
        to={path}
        className={cn(
          "flex items-center gap-3 px-2 py-2.5 rounded-lg text-sm transition-all",
          isActive
            ? "bg-white text-[#0f2a5e] font-semibold shadow"
            : "text-white/80 hover:bg-white/10 hover:text-white"
        )}
      >
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

  return (
    <TooltipProvider>
      <div className="h-screen flex overflow-hidden">
        <aside
          className={cn("h-screen flex flex-col shrink-0 transition-all duration-300", collapsed ? "w-14" : "w-52")}
          style={{ background: 'linear-gradient(180deg, #0f2a5e 0%, #1a3f8f 60%, #1e4da8 100%)' }}
        >
          {/* Logo区域 */}
          <div className="flex items-center border-b border-white/10 px-3 py-3 gap-2">
            <div
              className="overflow-hidden whitespace-nowrap transition-all duration-300 flex-1"
              style={{ width: collapsed ? 0 : 120, opacity: collapsed ? 0 : 1 }}
            >
              <div className="text-white font-bold text-sm leading-tight">马上国际货运</div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-white/60 hover:text-white hover:bg-white/10 shrink-0 ml-auto"
              onClick={() => setCollapsed(!collapsed)}
            >
              {collapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </Button>
          </div>

          {/* 导航菜单 */}
          <nav className="flex-1 py-2 px-1 space-y-0.5 overflow-y-auto">
            {navItems.map((item) => (
              <NavItem key={item.path} {...item} />
            ))}
          </nav>

          {/* 底部用户信息 */}
          <div className="border-t border-white/10 px-2 py-3 shrink-0">
            <div className="flex items-center gap-2">
              <div
                className="flex-1 overflow-hidden transition-all duration-300 px-1"
                style={{ opacity: collapsed ? 0 : 1, maxWidth: collapsed ? 0 : 200 }}
              >
                <div className="text-white text-xs font-medium whitespace-nowrap">{user?.name}</div>
                <div className="text-white/60 text-xs whitespace-nowrap">{user?.role === 'admin' ? '管理员' : '普通客服'}</div>
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-white/70 hover:text-white hover:bg-white/10 shrink-0" onClick={handleLogout} title="退出登录">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </aside>

        <main className="flex-1 bg-background overflow-auto">
          <div className="p-6">{children}</div>
        </main>
      </div>
    </TooltipProvider>
  );
};

export default MainLayout;
