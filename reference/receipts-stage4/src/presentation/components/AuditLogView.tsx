/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { StorageService } from '../../infrastructure/storage';
import { History, ShieldCheck, Database } from 'lucide-react';

export const AuditLogView: React.FC = () => {
  const logs = StorageService.getAuditLogs();

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto text-slate-200">
      <div>
        <h1 className="text-xl font-bold text-white tracking-tight">Audit Trail & Forensic Ledger</h1>
        <p className="text-xs text-slate-400 mt-0.5">
          Immutable event log of all document issuances, payment allocations, and administrative state transitions
        </p>
      </div>

      <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-900/80 shadow-sm">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 uppercase tracking-wider text-[10px] font-semibold">
              <th className="py-3 px-4">Timestamp (UTC)</th>
              <th className="py-3 px-4">Actor</th>
              <th className="py-3 px-4">Action</th>
              <th className="py-3 px-4">Entity</th>
              <th className="py-3 px-4">Event Description</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 font-mono">
            {logs.map((log) => (
              <tr key={log.id} className="hover:bg-slate-800/40 transition">
                <td className="py-3.5 px-4 text-slate-400 text-[11px]">
                  {log.timestamp.replace('T', ' ').substring(0, 19)}
                </td>
                <td className="py-3.5 px-4 font-sans font-semibold text-white">
                  {log.actor}
                </td>
                <td className="py-3.5 px-4">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    {log.action}
                  </span>
                </td>
                <td className="py-3.5 px-4 text-slate-300 text-[11px]">
                  {log.entityType}
                </td>
                <td className="py-3.5 px-4 font-sans text-slate-300 text-xs">
                  {log.details}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
