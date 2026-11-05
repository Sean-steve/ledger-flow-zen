/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  LayoutDashboard,
  FileText,
  Receipt,
  FileSpreadsheet,
  FileMinus,
  FilePlus2,
  CreditCard,
  Users,
  BarChart3,
  Palette,
  History,
  Settings,
  ShieldAlert,
  Database,
} from 'lucide-react';

interface SidebarProps {
  currentView: string;
  onNavigate: (view: string) => void;
  unpaidCount: number;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentView, onNavigate, unpaidCount }) => {
  const navSections = [
    {
      title: 'OVERVIEW',
      items: [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      ],
    },
    {
      title: 'DOCUMENTS',
      items: [
        { id: 'invoices', label: 'Invoices', icon: FileText, badge: unpaidCount > 0 ? unpaidCount : undefined },
        { id: 'receipts', label: 'Receipts', icon: Receipt },
        { id: 'quotations', label: 'Quotations', icon: FileSpreadsheet },
        { id: 'credit-notes', label: 'Credit Notes', icon: FileMinus },
        { id: 'debit-notes', label: 'Debit Notes', icon: FilePlus2 },
      ],
    },
    {
      title: 'MONEY & TREASURY',
      items: [
        { id: 'payments', label: 'Payments & Ledger', icon: CreditCard },
      ],
    },
    {
      title: 'BUSINESS',
      items: [
        { id: 'clients', label: 'Clients & Accounts', icon: Users },
      ],
    },
    {
      title: 'INSIGHTS',
      items: [
        { id: 'reports', label: 'Reports & Analytics', icon: BarChart3 },
      ],
    },
    {
      title: 'WORKSPACE',
      items: [
        { id: 'templates', label: 'Stationery Atelier', icon: Palette },
        { id: 'audit-log', label: 'Audit Trail', icon: History },
        { id: 'settings', label: 'Settings', icon: Settings },
      ],
    },
  ];

  return (
    <aside className="w-64 border-r border-slate-800/80 bg-slate-950 flex flex-col justify-between h-[calc(100vh-4rem)] sticky top-16 select-none">
      <div className="py-4 px-3 space-y-6 overflow-y-auto">
        {navSections.map((sec) => (
          <div key={sec.title}>
            <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
              {sec.title}
            </p>
            <div className="space-y-0.5">
              {sec.items.map((item) => {
                const Icon = item.icon;
                const isActive = currentView === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => onNavigate(item.id)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition ${
                      isActive
                        ? 'bg-indigo-600/15 text-indigo-300 font-semibold'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/80'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon className={`w-4 h-4 ${isActive ? 'text-indigo-400' : 'text-slate-500'}`} />
                      <span>{item.label}</span>
                    </div>
                    {item.badge !== undefined && (
                      <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-400">
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Compliance & Storage Footer Status */}
      <div className="p-3 border-t border-slate-900 bg-slate-950/60 space-y-2 text-[11px]">
        <div className="p-2.5 rounded-md bg-slate-900/60 border border-slate-800/60">
          <div className="flex items-center gap-2 text-amber-400 font-semibold text-[10px]">
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>KRA eTIMS Status</span>
          </div>
          <p className="text-[10px] text-slate-400 mt-1">
            Standby: <span className="font-mono text-slate-300">NOT_CONFIGURED</span>
          </p>
        </div>

        <div className="flex items-center justify-between px-1 text-[10px] text-slate-500">
          <div className="flex items-center gap-1.5">
            <Database className="w-3 h-3 text-emerald-500" />
            <span>Saved to this device</span>
          </div>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
        </div>
      </div>
    </aside>
  );
};
