/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { CurrencyCode } from '../../types';
import { StorageService } from '../../infrastructure/storage';
import {
  Search,
  Plus,
  Bell,
  ChevronDown,
  Building2,
  FileText,
  CreditCard,
  Receipt,
  Users,
  ShieldCheck,
  Check,
} from 'lucide-react';

interface HeaderProps {
  selectedCurrency: CurrencyCode;
  onCurrencyChange: (c: CurrencyCode) => void;
  onOpenCreateInvoice: () => void;
  onOpenRecordPayment: () => void;
  onOpenCreateQuote: () => void;
  onNavigate: (view: string) => void;
  searchTerm: string;
  onSearchChange: (s: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  selectedCurrency,
  onCurrencyChange,
  onOpenCreateInvoice,
  onOpenRecordPayment,
  onOpenCreateQuote,
  onNavigate,
  searchTerm,
  onSearchChange,
}) => {
  const [showCreateDropdown, setShowCreateDropdown] = useState(false);
  const [showWorkspaceDropdown, setShowWorkspaceDropdown] = useState(false);

  const currencies: CurrencyCode[] = ['KES', 'USD', 'EUR', 'GBP'];
  const biz = StorageService.getBusiness();
  const workspaceName = biz.tradingName || biz.name || 'Unconfigured Workspace';
  const signatoryName = biz.authorizedSignatoryName?.trim() || 'Not set';
  const signatoryInitials = signatoryName === 'Not set'
    ? '—'
    : signatoryName
        .split(/\s+/)
        .map((p) => p[0])
        .slice(0, 2)
        .join('')
        .toUpperCase();

  return (
    <header className="h-16 border-b border-slate-800/80 bg-slate-950/90 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-30">
      {/* Left Workspace Indicator */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center shadow-md shadow-indigo-950/50 shrink-0">
            {biz.logoUrl ? (
              <img src={biz.logoUrl} alt="" className="w-full h-full object-cover rounded-lg" />
            ) : (
              <span className="text-white font-bold text-sm tracking-wider">
                {(workspaceName || '??').slice(0, 2).toUpperCase()}
              </span>
            )}
          </div>
          <div className="relative">
            <button
              onClick={() => setShowWorkspaceDropdown(!showWorkspaceDropdown)}
              className="flex items-center gap-2 text-left hover:opacity-80 transition"
            >
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold text-white tracking-tight">{workspaceName}</span>
                  <span className="text-[10px] bg-indigo-500/20 text-indigo-300 font-medium px-1.5 py-0.2 rounded">Workspace</span>
                </div>
                <p className="text-[11px] text-slate-400">Local Workspace • Single Op</p>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {showWorkspaceDropdown && (
              <div className="absolute left-0 mt-2 w-56 bg-slate-900 border border-slate-800 rounded-lg shadow-xl py-1.5 z-50 text-xs">
                <div className="px-3 py-1.5 border-b border-slate-800">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Active Organization</p>
                  <p className="font-semibold text-white">{biz.name || 'Not configured yet'}</p>
                  <p className="text-[10px] text-slate-500 font-mono">
                    KRA PIN: {biz.kraPin || '—'}
                  </p>
                </div>
                <button
                  onClick={() => {
                    onNavigate('settings');
                    setShowWorkspaceDropdown(false);
                  }}
                  className="w-full text-left px-3 py-2 text-slate-300 hover:bg-slate-800 hover:text-white flex items-center gap-2"
                >
                  <Building2 className="w-3.5 h-3.5 text-slate-400" />
                  Organization Settings
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Center Search Bar */}
      <div className="flex-1 max-w-md mx-8">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search invoices, clients, payments..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-900/90 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
          />
        </div>
      </div>

      {/* Right Actions & Profile */}
      <div className="flex items-center gap-4">
        {/* Currency Switcher Pill */}
        <div className="flex items-center bg-slate-900 p-0.5 rounded-lg border border-slate-800 text-xs">
          {currencies.map((curr) => (
            <button
              key={curr}
              onClick={() => onCurrencyChange(curr)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition ${
                selectedCurrency === curr
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {curr}
            </button>
          ))}
        </div>

        {/* Quick "+ Create" Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowCreateDropdown(!showCreateDropdown)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg shadow-sm shadow-indigo-900/30 transition"
          >
            <Plus className="w-4 h-4" />
            <span>Create</span>
            <ChevronDown className="w-3 h-3 ml-0.5 opacity-80" />
          </button>

          {showCreateDropdown && (
            <div className="absolute right-0 mt-2 w-48 bg-slate-900 border border-slate-800 rounded-lg shadow-2xl py-1 z-50 text-xs">
              <button
                onClick={() => {
                  onOpenCreateInvoice();
                  setShowCreateDropdown(false);
                }}
                className="w-full text-left px-3 py-2 text-slate-200 hover:bg-slate-800 hover:text-white flex items-center gap-2"
              >
                <FileText className="w-3.5 h-3.5 text-indigo-400" />
                <span>New Invoice</span>
              </button>
              <button
                onClick={() => {
                  onOpenRecordPayment();
                  setShowCreateDropdown(false);
                }}
                className="w-full text-left px-3 py-2 text-slate-200 hover:bg-slate-800 hover:text-white flex items-center gap-2"
              >
                <CreditCard className="w-3.5 h-3.5 text-emerald-400" />
                <span>Record Payment</span>
              </button>
              <button
                onClick={() => {
                  onOpenCreateQuote();
                  setShowCreateDropdown(false);
                }}
                className="w-full text-left px-3 py-2 text-slate-200 hover:bg-slate-800 hover:text-white flex items-center gap-2"
              >
                <FileText className="w-3.5 h-3.5 text-amber-400" />
                <span>New Quotation</span>
              </button>
              <button
                onClick={() => {
                  onNavigate('clients');
                  setShowCreateDropdown(false);
                }}
                className="w-full text-left px-3 py-2 text-slate-200 hover:bg-slate-800 hover:text-white flex items-center gap-2"
              >
                <Users className="w-3.5 h-3.5 text-blue-400" />
                <span>Add Client</span>
              </button>
            </div>
          )}
        </div>

        {/* Notifications Icon */}
        <button className="relative p-2 text-slate-400 hover:text-white hover:bg-slate-900 rounded-lg transition">
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-indigo-500 rounded-full ring-2 ring-slate-950"></span>
        </button>

        {/* Authorized Signatory */}
        <button
          onClick={() => onNavigate('settings')}
          className="flex items-center gap-3 pl-3 border-l border-slate-800"
          title="Set in Organization Settings"
        >
          <div className="w-8 h-8 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center font-bold text-amber-400 text-xs shrink-0">
            {signatoryInitials}
          </div>
          <div className="text-left hidden sm:block">
            <p className="text-xs font-semibold text-white leading-tight">{signatoryName}</p>
            <p className="text-[10px] text-slate-400">{biz.authorizedSignatoryTitle || 'Authorized Signatory'}</p>
          </div>
        </button>
      </div>
    </header>
  );
};
