import type { CSSProperties } from "react";

/**
 * Canonical palette registry; preserves every Stage 4 Receipts template ID.
 * This file contains presentation choices only; no financial calculations or
 * external fiscal/QR/payment status is invented by a template.
 */
export type TemplateId =
  | "executive-atelier" | "modern-minimal" | "midnight-ledger"
  | "linear-mono" | "editorial-classic" | "nordic-studio"
  | "swiss-grid" | "compact-ledger";
export type DocumentTemplateConfig = {
  id: TemplateId;
  name: string;
  category: string;
  description: string;
  thumbnailColor: string;
  fontFamily: string;
  primaryColor: string;
  accentColor: string;
  showKraBreakdown: boolean;
  showVerificationQr: boolean;
  showMpesaBox: boolean;
  showSeal: boolean;
};

export const DOCUMENT_TEMPLATES: DocumentTemplateConfig[] = [
  {
    id: 'executive-atelier',
    name: 'Executive Atelier',
    category: 'Corporate & Executive',
    description: 'Bespoke corporate architecture with formal header geometry, navy accents, and distinguished typography.',
    thumbnailColor: 'bg-slate-900 border-amber-500/30',
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    primaryColor: '#0f172a',
    accentColor: '#d97706',
    showKraBreakdown: true,
    showVerificationQr: true,
    showMpesaBox: true,
    showSeal: true,
  },
  {
    id: 'modern-minimal',
    name: 'Modern Minimal',
    category: 'Minimalist & Modern',
    description: 'Clean whitespace, airy gutters, hairline dividers, and understated luxury typography.',
    thumbnailColor: 'bg-zinc-800 border-zinc-700',
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    primaryColor: '#18181b',
    accentColor: '#0ea5e9',
    showKraBreakdown: true,
    showVerificationQr: true,
    showMpesaBox: true,
    showSeal: false,
  },
  {
    id: 'midnight-ledger',
    name: 'Midnight Ledger',
    category: 'Corporate & Executive',
    description: 'High-contrast dark indigo top anchor with luminous data hierarchy and crisp monetary figures.',
    thumbnailColor: 'bg-indigo-950 border-indigo-500/40',
    fontFamily: "'JetBrains Mono', monospace",
    primaryColor: '#1e1b4b',
    accentColor: '#6366f1',
    showKraBreakdown: true,
    showVerificationQr: true,
    showMpesaBox: true,
    showSeal: true,
  },
  {
    id: 'linear-mono',
    name: 'Linear Mono',
    category: 'Compact & High-Density',
    description: 'Industrial precision grid inspired by architectural blueprints with monospace ledger columns.',
    thumbnailColor: 'bg-neutral-900 border-emerald-500/30',
    fontFamily: "'JetBrains Mono', monospace",
    primaryColor: '#171717',
    accentColor: '#10b981',
    showKraBreakdown: true,
    showVerificationQr: false,
    showMpesaBox: true,
    showSeal: false,
  },
  {
    id: 'editorial-classic',
    name: 'Editorial Classic',
    category: 'Creative & Studio',
    description: 'Refined serif typography with editorial layout cadence for advisory firms and legal consultancies.',
    thumbnailColor: 'bg-stone-900 border-amber-700/40',
    fontFamily: "'Newsreader', Georgia, serif",
    primaryColor: '#1c1917',
    accentColor: '#b45309',
    showKraBreakdown: true,
    showVerificationQr: true,
    showMpesaBox: true,
    showSeal: true,
  },
  {
    id: 'nordic-studio',
    name: 'Nordic Studio',
    category: 'Creative & Studio',
    description: 'Scandinavian balance of pure proportion, soft sage tints, and contemporary typography.',
    thumbnailColor: 'bg-slate-800 border-teal-500/30',
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    primaryColor: '#0f172a',
    accentColor: '#14b8a6',
    showKraBreakdown: true,
    showVerificationQr: true,
    showMpesaBox: true,
    showSeal: false,
  },
  {
    id: 'swiss-grid',
    name: 'Swiss Grid',
    category: 'Minimalist & Modern',
    description: 'Rigorous asymmetric columns, heavy primary weights, and mathematical layout alignment.',
    thumbnailColor: 'bg-zinc-900 border-red-500/30',
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    primaryColor: '#09090b',
    accentColor: '#ef4444',
    showKraBreakdown: true,
    showVerificationQr: true,
    showMpesaBox: true,
    showSeal: false,
  },
  {
    id: 'compact-ledger',
    name: 'Compact Ledger',
    category: 'Compact & High-Density',
    description: 'Maximum item density and condensed row heights designed for multi-line wholesale manifests.',
    thumbnailColor: 'bg-slate-900 border-blue-500/30',
    fontFamily: "'JetBrains Mono', monospace",
    primaryColor: '#0f172a',
    accentColor: '#2563eb',
    showKraBreakdown: true,
    showVerificationQr: false,
    showMpesaBox: true,
    showSeal: false,
  },
];

export function getTemplateById(id: string | null | undefined): DocumentTemplateConfig {
  return DOCUMENT_TEMPLATES.find((t) => t.id === id) ?? DOCUMENT_TEMPLATES[0]!;
}

export function templateStyle(template: DocumentTemplateConfig): CSSProperties {
  return {
    "--doc-accent": template.accentColor,
    "--doc-ink": template.primaryColor,
    "--doc-font": template.fontFamily,
  } as CSSProperties;
}
