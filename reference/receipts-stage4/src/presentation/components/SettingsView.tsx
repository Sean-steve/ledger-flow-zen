/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { StorageService } from '../../infrastructure/storage';
import { BusinessEntity } from '../../types';
import { Building2, Smartphone, ShieldAlert, RotateCcw, Check, Save, UserCog, Database, AlertTriangle } from 'lucide-react';

interface SettingsViewProps {
  onSettingsUpdated: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ onSettingsUpdated }) => {
  const [biz, setBiz] = useState<BusinessEntity>(() => StorageService.getBusiness());
  const [savedMessage, setSavedMessage] = useState(false);
  const workspaceEmpty = StorageService.isWorkspaceEmpty();

  const handleSave = () => {
    StorageService.saveBusiness(biz);
    StorageService.logAction(StorageService.getCurrentActor(), 'UPDATE_SETTINGS', 'CLIENT', biz.id, 'Updated organization profile and settlement directives.');
    setSavedMessage(true);
    onSettingsUpdated();
    setTimeout(() => setSavedMessage(false), 3000);
  };

  const handleLoadSampleData = () => {
    if (confirm('Load sample clients, invoices, and payments for evaluation? This is only available on an empty workspace.')) {
      StorageService.loadSampleData();
      onSettingsUpdated();
      window.location.reload();
    }
  };

  const handleClearAll = () => {
    if (
      confirm(
        'This permanently deletes every client, document, payment, and audit log entry in this workspace. This cannot be undone. Continue?'
      )
    ) {
      StorageService.clearAllData();
      onSettingsUpdated();
      window.location.reload();
    }
  };

  return (
    <div className="p-8 space-y-8 max-w-4xl mx-auto text-slate-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">Organization & Treasury Settings</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Configure legal identity, KRA tax profiles, and settlement collection channels
          </p>
        </div>

        <div className="flex items-center gap-3">
          {workspaceEmpty && (
            <button
              onClick={handleLoadSampleData}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-indigo-500/20 text-slate-400 hover:text-indigo-300 text-xs font-semibold border border-slate-700 transition"
            >
              <Database className="w-3.5 h-3.5" />
              <span>Load Sample Data</span>
            </button>
          )}
          <button
            onClick={handleClearAll}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 text-xs font-semibold border border-slate-700 transition"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Clear All Data</span>
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-sm transition"
          >
            <Save className="w-4 h-4" />
            <span>Save Configuration</span>
          </button>
        </div>
      </div>

      {savedMessage && (
        <div className="p-3 bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-medium rounded-lg flex items-center gap-2">
          <Check className="w-4 h-4" />
          <span>Organization settings saved successfully!</span>
        </div>
      )}

      {/* Legal Entity Configuration */}
      <div className="p-6 rounded-xl bg-slate-900/90 border border-slate-800/80 space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
          <Building2 className="w-4 h-4 text-indigo-400" />
          <h2 className="text-sm font-bold text-white">Commercial Entity & Legal Registration</h2>
        </div>

        <div className="grid grid-cols-2 gap-4 text-xs">
          <div>
            <label className="text-slate-400 block mb-1 font-semibold">Registered Company Name</label>
            <input
              type="text"
              value={biz.name}
              onChange={(e) => setBiz({ ...biz, name: e.target.value })}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
            />
          </div>
          <div>
            <label className="text-slate-400 block mb-1 font-semibold">Trading / Brand Name</label>
            <input
              type="text"
              value={biz.tradingName}
              onChange={(e) => setBiz({ ...biz, tradingName: e.target.value })}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
            />
          </div>

          <div>
            <label className="text-slate-400 block mb-1 font-semibold">KRA PIN</label>
            <input
              type="text"
              value={biz.kraPin}
              onChange={(e) => setBiz({ ...biz, kraPin: e.target.value })}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white font-mono uppercase"
            />
          </div>
          <div>
            <label className="text-slate-400 block mb-1 font-semibold">VAT Registration Number</label>
            <input
              type="text"
              value={biz.vatNumber || ''}
              onChange={(e) => setBiz({ ...biz, vatNumber: e.target.value })}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white font-mono"
            />
          </div>

          <div className="col-span-2">
            <label className="text-slate-400 block mb-1 font-semibold">Physical Address</label>
            <input
              type="text"
              value={biz.physicalAddress}
              onChange={(e) => setBiz({ ...biz, physicalAddress: e.target.value })}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
            />
          </div>
          <div>
            <label className="text-slate-400 block mb-1 font-semibold">Billing Email</label>
            <input
              type="email"
              value={biz.email}
              onChange={(e) => setBiz({ ...biz, email: e.target.value })}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
            />
          </div>
          <div>
            <label className="text-slate-400 block mb-1 font-semibold">Phone</label>
            <input
              type="text"
              value={biz.phone}
              onChange={(e) => setBiz({ ...biz, phone: e.target.value })}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white font-mono"
            />
          </div>
          <div className="col-span-2">
            <label className="text-slate-400 block mb-1 font-semibold">Logo URL (optional)</label>
            <input
              type="text"
              value={biz.logoUrl || ''}
              onChange={(e) => setBiz({ ...biz, logoUrl: e.target.value })}
              placeholder="https://... — shown on issued documents in place of initials"
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
            />
          </div>
        </div>
      </div>

      {!StorageService.isBusinessConfigured() && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-medium rounded-lg flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>
            Company name and KRA PIN are required before issuing invoices — documents cannot be finalized until this
            profile is saved.
          </span>
        </div>
      )}

      {/* Authorized Signatory */}
      <div className="p-6 rounded-xl bg-slate-900/90 border border-slate-800/80 space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
          <UserCog className="w-4 h-4 text-indigo-400" />
          <h2 className="text-sm font-bold text-white">Authorized Signatory</h2>
        </div>
        <p className="text-[11px] text-slate-500 -mt-2">
          This name appears on issued documents and as the actor recorded in the audit trail for actions taken in
          this workspace.
        </p>
        <div className="grid grid-cols-2 gap-4 text-xs">
          <div>
            <label className="text-slate-400 block mb-1 font-semibold">Signatory Full Name</label>
            <input
              type="text"
              value={biz.authorizedSignatoryName || ''}
              onChange={(e) => setBiz({ ...biz, authorizedSignatoryName: e.target.value })}
              placeholder="e.g. Jane Doe"
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
            />
          </div>
          <div>
            <label className="text-slate-400 block mb-1 font-semibold">Title</label>
            <input
              type="text"
              value={biz.authorizedSignatoryTitle || ''}
              onChange={(e) => setBiz({ ...biz, authorizedSignatoryTitle: e.target.value })}
              placeholder="e.g. Director"
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
            />
          </div>
        </div>
      </div>

      {/* Settlement Directives (M-Pesa & Bank Wire) */}
      <div className="p-6 rounded-xl bg-slate-900/90 border border-slate-800/80 space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
          <Smartphone className="w-4 h-4 text-emerald-400" />
          <h2 className="text-sm font-bold text-white">Settlement Directives (M-Pesa & Bank Wire)</h2>
        </div>

        <div className="grid grid-cols-2 gap-4 text-xs">
          <div>
            <label className="text-slate-400 block mb-1 font-semibold">M-Pesa C2B Paybill Business #</label>
            <input
              type="text"
              value={biz.mpesaPaybill?.businessNumber || ''}
              onChange={(e) =>
                setBiz({
                  ...biz,
                  mpesaPaybill: {
                    businessNumber: e.target.value,
                    accountReferenceFormat: biz.mpesaPaybill?.accountReferenceFormat || 'INV-{DOCUMENT_NO}',
                  },
                })
              }
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white font-mono"
            />
          </div>

          <div>
            <label className="text-slate-400 block mb-1 font-semibold">Settlement Bank Name</label>
            <input
              type="text"
              value={biz.bankDetails?.bankName || ''}
              onChange={(e) =>
                setBiz({
                  ...biz,
                  bankDetails: {
                    ...biz.bankDetails!,
                    bankName: e.target.value,
                  },
                })
              }
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
            />
          </div>

          <div>
            <label className="text-slate-400 block mb-1 font-semibold">Settlement Account Number</label>
            <input
              type="text"
              value={biz.bankDetails?.accountNumber || ''}
              onChange={(e) =>
                setBiz({
                  ...biz,
                  bankDetails: {
                    ...biz.bankDetails!,
                    accountNumber: e.target.value,
                  },
                })
              }
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white font-mono"
            />
          </div>

          <div>
            <label className="text-slate-400 block mb-1 font-semibold">SWIFT / BIC Code</label>
            <input
              type="text"
              value={biz.bankDetails?.swiftCode || ''}
              onChange={(e) =>
                setBiz({
                  ...biz,
                  bankDetails: {
                    ...biz.bankDetails!,
                    swiftCode: e.target.value,
                  },
                })
              }
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white font-mono uppercase"
            />
          </div>
        </div>
      </div>

      {/* Compliance Section */}
      <div className="p-6 rounded-xl bg-slate-900/90 border border-slate-800/80 space-y-3 text-xs">
        <div className="flex items-center gap-2 text-amber-400">
          <ShieldAlert className="w-4 h-4" />
          <h2 className="text-sm font-bold">KRA eTIMS Fiscal Compliance Architecture</h2>
        </div>
        <p className="text-slate-400 leading-relaxed">
          The application operates under the strict <span className="text-white font-mono">DisabledKraEtimsProvider</span> specification. No synthetic fiscal receipts or false approvals are broadcast to tax authorities until an authenticated hardware or cloud OSCU/VSCU endpoint is provisioned.
        </p>
        <div className="p-3 bg-slate-950/80 rounded-lg border border-slate-800 flex items-center justify-between">
          <span className="text-slate-300">Active Fiscal Provider:</span>
          <span className="font-mono font-bold text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded border border-amber-500/20">
            NOT_CONFIGURED (Standby)
          </span>
        </div>
      </div>
    </div>
  );
};
