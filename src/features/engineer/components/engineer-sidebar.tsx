import { LayoutDashboard, FolderOpen, CircleCheck, FileText, TriangleAlert, CalendarDays } from "lucide-react";
import type { EngineerTab } from "../engineer-view";
interface Props { tab: EngineerTab; onTabChange: (tab: EngineerTab) => void; tabOptions: {key: EngineerTab; label: string; count?: number}[]; }
export function EngineerSidebar({tab, onTabChange, tabOptions}: Props): JSX.Element { return (<aside id="engineer-navigation" className="engineer-sidebar">
        <p className="engineer-nav-label">ESPACIO DE TRABAJO</p>
        <nav aria-label="Navegación del ingeniero">
          {tabOptions.map((option, index) => {
            const Icon = [LayoutDashboard, FolderOpen, FolderOpen, CircleCheck, FileText, TriangleAlert, CalendarDays][index];
            return (
              <button key={option.key} type="button" aria-current={tab === option.key ? "page" : undefined}
                onClick={() => onTabChange(option.key)} className={tab === option.key ? "is-active" : ""}>
                <Icon size={18} /><span>{option.label}</span><b>{option.count}</b>
              </button>
            );
          })}
        </nav>
        <div className="engineer-sidebar-footer"><span className="engineer-brand-mark">E /</span><p>ENERMAN SYSTEM<br /><span>Portal de ingeniería</span></p></div>
      </aside>); }
