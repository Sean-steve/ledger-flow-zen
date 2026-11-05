/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { ClientEntity, CurrencyCode } from '../../types';
import { formatCurrency } from '../../domain/math';
import { StorageService } from '../../infrastructure/storage';
import { Users, Plus, Search, Mail, Phone, MapPin, X, Check } from 'lucide-react';

interface ClientsViewProps {
  clients: ClientEntity[];
  onClientAdded: () => void;
}

export const ClientsView: React.FC<ClientsViewProps> = ({ clients, onClientAdded }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // New Client Form State
  const [name, setName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [kraPin, setKraPin] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');
  const [currency, setCurrency] = useState<CurrencyCode>('KES');
  const [paymentTermsDays, setPaymentTermsDays] = useState(30);
  const [error, setError] = useState<string | null>(null);

  const handleAddClient = () => {
    setError(null);
    if (!name.trim()) {
      setError('Please provide client name');
      return;
    }
    if (!email.trim()) {
      setError('Please provide billing email');
      return;
    }

    const biz = StorageService.getBusiness();
    const newClient: ClientEntity = {
      id: `client-${Date.now()}`,
      businessId: biz.id,
      name: name.trim(),
      contactPerson: contactPerson.trim(),
      email: email.trim(),
      phone: phone.trim(),
      kraPin: kraPin.trim().toUpperCase() || undefined,
      address: address.trim(),
      city: city.trim(),
      country: country.trim(),
      currency,
      paymentTermsDays,
      totalInvoiced: '0.00',
      totalPaid: '0.00',
      outstandingBalance: '0.00',
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
    };

    const currentList = StorageService.getClients();
    currentList.unshift(newClient);
    StorageService.saveClients(currentList);

    StorageService.logAction(StorageService.getCurrentActor(), 'CREATE_CLIENT', 'CLIENT', newClient.id, `Created client account ${newClient.name}.`);

    setIsModalOpen(false);
    // Reset fields
    setName('');
    setContactPerson('');
    setEmail('');
    setPhone('');
    setKraPin('');
    setAddress('');
    setCity('');
    setCountry('');
    onClientAdded();
  };

  const filtered = clients.filter((c) => {
    if (
      searchTerm &&
      !c.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
      !c.email.toLowerCase().includes(searchTerm.toLowerCase()) &&
      !(c.kraPin || '').toLowerCase().includes(searchTerm.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto text-slate-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">Client Accounts Directory</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Verified enterprise counterparties, KRA PIN registries, and balance ledgers
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg shadow-sm transition self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Add New Client</span>
        </button>
      </div>

      {/* Filter and Search */}
      <div className="flex justify-end">
        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search clients or PIN..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-900/80 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {/* Clients Table */}
      <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-900/80 shadow-sm">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 uppercase tracking-wider text-[10px] font-semibold">
              <th className="py-3 px-4">Client Name</th>
              <th className="py-3 px-4">KRA PIN</th>
              <th className="py-3 px-4">Contact Person</th>
              <th className="py-3 px-4">Terms</th>
              <th className="py-3 px-4 text-right">Invoiced (Gross)</th>
              <th className="py-3 px-4 text-right">Collected</th>
              <th className="py-3 px-4 text-right">Outstanding</th>
              <th className="py-3 px-4 text-center">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {filtered.map((c) => (
              <tr key={c.id} className="hover:bg-slate-800/40 transition">
                <td className="py-3.5 px-4">
                  <p className="font-bold text-white text-sm">{c.name}</p>
                  <p className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                    <Mail className="w-3 h-3 text-slate-500" />
                    <span>{c.email}</span>
                  </p>
                </td>
                <td className="py-3.5 px-4 font-mono font-semibold text-slate-300">
                  {c.kraPin || '—'}
                </td>
                <td className="py-3.5 px-4 text-slate-300">
                  <p>{c.contactPerson || 'Direct Accounts'}</p>
                  <p className="text-[10px] text-slate-500 font-mono">{c.phone}</p>
                </td>
                <td className="py-3.5 px-4 text-slate-400">
                  {c.paymentTermsDays} Days
                </td>
                <td className="py-3.5 px-4 text-right font-mono font-semibold text-slate-300">
                  {formatCurrency(c.totalInvoiced, c.currency)}
                </td>
                <td className="py-3.5 px-4 text-right font-mono font-semibold text-emerald-400">
                  {formatCurrency(c.totalPaid, c.currency)}
                </td>
                <td className="py-3.5 px-4 text-right font-mono font-bold text-amber-400">
                  {formatCurrency(c.outstandingBalance, c.currency)}
                </td>
                <td className="py-3.5 px-4 text-center">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                    {c.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add Client Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl max-w-lg w-full text-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center bg-slate-950">
              <h3 className="text-base font-bold text-white">Add Enterprise Client Account</h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-3.5 text-xs">
              {error && (
                <div className="p-2.5 rounded bg-rose-500/15 border border-rose-500/30 text-rose-300">
                  {error}
                </div>
              )}

              <div>
                <label className="text-slate-400 block mb-1 font-semibold">Corporate / Legal Name</label>
                <input
                  type="text"
                  placeholder="e.g. Kenya Airways PLC"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1 font-semibold">KRA PIN</label>
                  <input
                    type="text"
                    placeholder="e.g. P051283941M"
                    value={kraPin}
                    onChange={(e) => setKraPin(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white font-mono uppercase"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1 font-semibold">Payment Terms (Days)</label>
                  <input
                    type="number"
                    value={paymentTermsDays}
                    onChange={(e) => setPaymentTermsDays(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1 font-semibold">Billing Email</label>
                  <input
                    type="email"
                    placeholder="billing@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1 font-semibold">Phone / Tel</label>
                  <input
                    type="text"
                    placeholder="+254 7..."
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-400 block mb-1 font-semibold">Contact Person</label>
                <input
                  type="text"
                  placeholder="Primary billing contact"
                  value={contactPerson}
                  onChange={(e) => setContactPerson(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1 font-semibold">Physical / Postal Address</label>
                <input
                  type="text"
                  placeholder="Street, Building"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-slate-400 block mb-1 font-semibold">City</label>
                  <input
                    type="text"
                    placeholder="e.g. Nairobi"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1 font-semibold">Country</label>
                  <input
                    type="text"
                    placeholder="e.g. Kenya"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
                  />
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-800 bg-slate-950 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 text-xs text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddClient}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg shadow-sm"
              >
                Save Client Account
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
