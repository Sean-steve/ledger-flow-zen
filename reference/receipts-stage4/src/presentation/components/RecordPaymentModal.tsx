/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { ClientEntity, InvoiceEntity, PaymentChannel, CurrencyCode } from '../../types';
import { StorageService } from '../../infrastructure/storage';
import { PaymentService } from '../../application/paymentService';
import { formatCurrency } from '../../domain/math';
import { X, Check, Smartphone, Building, Banknote, ShieldCheck } from 'lucide-react';

interface RecordPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPaymentRecorded: () => void;
  initialInvoiceId?: string;
}

export const RecordPaymentModal: React.FC<RecordPaymentModalProps> = ({
  isOpen,
  onClose,
  onPaymentRecorded,
  initialInvoiceId,
}) => {
  const [clients, setClients] = useState<ClientEntity[]>([]);
  const [invoices, setInvoices] = useState<InvoiceEntity[]>([]);

  const [selectedClientId, setSelectedClientId] = useState('');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState(initialInvoiceId || '');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<CurrencyCode>('KES');
  const [channel, setChannel] = useState<PaymentChannel>('MPESA_C2B');
  const [channelTransactionId, setChannelTransactionId] = useState('');
  const [payerName, setPayerName] = useState('');
  const [payerPhone, setPayerPhone] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [autoReceipt, setAutoReceipt] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      const cls = StorageService.getClients();
      const invs = StorageService.getInvoices();
      setClients(cls);
      setInvoices(invs);

      if (initialInvoiceId) {
        const inv = invs.find((i) => i.id === initialInvoiceId);
        if (inv) {
          setSelectedInvoiceId(inv.id);
          setSelectedClientId(inv.clientId);
          setAmount(inv.balanceDue);
          setCurrency(inv.currency);
          setPayerName(inv.clientName);
        }
      } else if (cls.length > 0) {
        setSelectedClientId(cls[0].id);
        setPayerName(cls[0].name);
        setPayerPhone(cls[0].phone || '');
      }

      // Left blank intentionally — this must be the real channel reference
      // (M-Pesa code, bank ref, etc.) as reported by the payment channel.
      // A previous version auto-filled a fabricated-looking code here "for
      // convenience", which risked a real financial record being created
      // with a reference number nobody actually verified.
      setChannelTransactionId('');
    }
  }, [isOpen, initialInvoiceId]);

  if (!isOpen) return null;

  const handleClientChange = (clientId: string) => {
    setSelectedClientId(clientId);
    const cl = clients.find((c) => c.id === clientId);
    if (cl) {
      setPayerName(cl.name);
      setPayerPhone(cl.phone || '');
    }
    setSelectedInvoiceId('');
    setAmount('');
  };

  const handleInvoiceChange = (invId: string) => {
    setSelectedInvoiceId(invId);
    const inv = invoices.find((i) => i.id === invId);
    if (inv) {
      setAmount(inv.balanceDue);
      setCurrency(inv.currency);
      setSelectedClientId(inv.clientId);
      setPayerName(inv.clientName);
    }
  };

  const handleSubmit = (generateReceipt: boolean) => {
    setError(null);
    try {
      if (!selectedClientId) {
        setError('Please select a client account.');
        return;
      }
      if (!amount || Number(amount) <= 0) {
        setError('Please enter a valid settlement amount.');
        return;
      }
      if (!channelTransactionId.trim()) {
        setError('Please provide a confirmation transaction reference.');
        return;
      }

      PaymentService.recordPayment({
        clientId: selectedClientId,
        invoiceId: selectedInvoiceId || undefined,
        amount,
        currency,
        channel,
        channelTransactionId: channelTransactionId.trim().toUpperCase(),
        payerName: payerName.trim(),
        payerPhone: payerPhone.trim(),
        paymentDate: new Date(paymentDate).toISOString(),
        notes: notes.trim(),
        autoGenerateReceipt: generateReceipt,
      });

      onPaymentRecorded();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to record payment');
    }
  };

  const clientInvoices = invoices.filter(
    (i) => i.clientId === selectedClientId && Number(i.balanceDue) > 0 && i.status !== 'VOID'
  );

  const selectedClient = clients.find((c) => c.id === selectedClientId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl max-w-xl w-full text-slate-200 overflow-hidden my-8">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center bg-slate-950/60">
          <div>
            <h2 className="text-base font-bold text-white tracking-tight">Record Incoming Payment</h2>
            <p className="text-xs text-slate-400">Treasury Settlement & Verification Engine</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4 text-xs">
          {error && (
            <div className="p-3 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 font-medium">
              {error}
            </div>
          )}

          {/* Client Selection */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-slate-300 font-semibold">Client Account</label>
              {selectedClient && (
                <span className="text-[11px] text-amber-400 font-mono">
                  Outstanding: {formatCurrency(selectedClient.outstandingBalance, selectedClient.currency)}
                </span>
              )}
            </div>
            <select
              value={selectedClientId}
              onChange={(e) => handleClientChange(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800/80 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.currency})
                </option>
              ))}
            </select>
          </div>

          {/* Target Invoice Link */}
          <div>
            <label className="text-slate-300 font-semibold mb-1 block">
              Allocate to Invoice (Optional)
            </label>
            <select
              value={selectedInvoiceId}
              onChange={(e) => handleInvoiceChange(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800/80 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
            >
              <option value="">General Account Settlement (Unallocated)</option>
              {clientInvoices.map((inv) => (
                <option key={inv.id} value={inv.id}>
                  {inv.documentNumber} — Due: {formatCurrency(inv.balanceDue, inv.currency)} (Total: {formatCurrency(inv.totalAmount, inv.currency)})
                </option>
              ))}
            </select>
          </div>

          {/* Amount & Currency */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="text-slate-300 font-semibold mb-1 block">Settlement Amount</label>
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800/80 border border-slate-700 rounded-lg text-white font-mono text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="text-slate-300 font-semibold mb-1 block">Currency</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
                className="w-full px-3 py-2 bg-slate-800/80 border border-slate-700 rounded-lg text-white font-semibold focus:outline-none focus:border-indigo-500"
              >
                <option value="KES">KES (Kenya Shillings)</option>
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
                <option value="GBP">GBP (£)</option>
              </select>
            </div>
          </div>

          {/* Payment Channel Pills */}
          <div>
            <label className="text-slate-300 font-semibold mb-1.5 block">Payment Channel</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setChannel('MPESA_C2B')}
                className={`p-2.5 rounded-lg border text-left flex items-center gap-2 transition ${
                  channel === 'MPESA_C2B'
                    ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300 font-semibold'
                    : 'border-slate-800 bg-slate-800/40 text-slate-400 hover:text-white'
                }`}
              >
                <Smartphone className="w-4 h-4 text-emerald-400" />
                <span>M-Pesa C2B</span>
              </button>

              <button
                type="button"
                onClick={() => setChannel('BANK_TRANSFER')}
                className={`p-2.5 rounded-lg border text-left flex items-center gap-2 transition ${
                  channel === 'BANK_TRANSFER'
                    ? 'border-blue-500 bg-blue-500/10 text-blue-300 font-semibold'
                    : 'border-slate-800 bg-slate-800/40 text-slate-400 hover:text-white'
                }`}
              >
                <Building className="w-4 h-4 text-blue-400" />
                <span>Bank Transfer</span>
              </button>

              <button
                type="button"
                onClick={() => setChannel('CASH')}
                className={`p-2.5 rounded-lg border text-left flex items-center gap-2 transition ${
                  channel === 'CASH'
                    ? 'border-amber-500 bg-amber-500/10 text-amber-300 font-semibold'
                    : 'border-slate-800 bg-slate-800/40 text-slate-400 hover:text-white'
                }`}
              >
                <Banknote className="w-4 h-4 text-amber-400" />
                <span>Cash / Escrow</span>
              </button>
            </div>
          </div>

          {/* Reference & Payer Details */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-slate-300 font-semibold mb-1 block">
                {channel === 'MPESA_C2B' ? 'M-Pesa Confirmation Code' : 'Bank / Channel Reference'}
              </label>
              <input
                type="text"
                placeholder="e.g. QDF8723KL"
                value={channelTransactionId}
                onChange={(e) => setChannelTransactionId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800/80 border border-slate-700 rounded-lg text-white font-mono uppercase focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="text-slate-300 font-semibold mb-1 block">Settlement Date</label>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800/80 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-slate-300 font-semibold mb-1 block">Payer Name</label>
              <input
                type="text"
                placeholder="Name of payer or signatory"
                value={payerName}
                onChange={(e) => setPayerName(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800/80 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="text-slate-300 font-semibold mb-1 block">Sender Phone / MSISDN</label>
              <input
                type="text"
                placeholder="+254 7..."
                value={payerPhone}
                onChange={(e) => setPayerPhone(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800/80 border border-slate-700 rounded-lg text-white font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Auto Receipt Checkbox */}
          <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-lg flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="w-4 h-4 text-indigo-400" />
              <div>
                <p className="font-semibold text-white">Auto-generate Official Receipt</p>
                <p className="text-[10px] text-slate-400">Issues an immutable sequentially numbered receipt (RCT-2026-XXXX)</p>
              </div>
            </div>
            <input
              type="checkbox"
              checked={autoReceipt}
              onChange={(e) => setAutoReceipt(e.target.checked)}
              className="w-4 h-4 accent-indigo-600 rounded cursor-pointer"
            />
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-950/60 flex justify-end items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => handleSubmit(false)}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-lg transition"
          >
            Record Payment Only
          </button>
          <button
            type="button"
            onClick={() => handleSubmit(true)}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg shadow-md shadow-indigo-900/30 transition flex items-center gap-1.5"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Record & Issue Receipt</span>
          </button>
        </div>
      </div>
    </div>
  );
};
