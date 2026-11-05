/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

const PRINTABLE_ID = 'printable-document';

/**
 * All export paths (PDF, PNG, JPG) — and print, and the on-screen live
 * preview — render from the exact same DOM node: the `#printable-document`
 * element produced by `LiveDocumentPreview`. This module never re-lays-out
 * or re-renders the document independently; it only rasterizes whatever
 * `LiveDocumentPreview` already put on screen. That is what keeps every
 * output format visually identical to what the operator is looking at.
 */
async function captureDocumentCanvas(): Promise<HTMLCanvasElement> {
  const el = document.getElementById(PRINTABLE_ID);
  if (!el) {
    throw new Error('No document is currently rendered to export. Open a document preview first.');
  }

  const { default: html2canvas } = await import('html2canvas');

  // The on-screen preview is often shown scaled down (zoom-to-fit) via a
  // CSS transform. Capturing it at that scale would produce a blurry,
  // wrong-sized export, so we temporarily render at 1:1 for the capture and
  // restore the operator's zoom level afterward.
  const originalTransform = el.style.transform;
  el.style.transform = 'none';

  try {
    const canvas = await html2canvas(el, {
      scale: 2, // supersample for crisp text in the exported raster
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
    });
    return canvas;
  } finally {
    el.style.transform = originalTransform;
  }
}

function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export async function exportDocumentAsPng(filename: string): Promise<void> {
  const canvas = await captureDocumentCanvas();
  downloadDataUrl(canvas.toDataURL('image/png'), filename.endsWith('.png') ? filename : `${filename}.png`);
}

export async function exportDocumentAsJpg(filename: string): Promise<void> {
  const canvas = await captureDocumentCanvas();
  downloadDataUrl(canvas.toDataURL('image/jpeg', 0.95), filename.endsWith('.jpg') ? filename : `${filename}.jpg`);
}

export async function exportDocumentAsPdf(filename: string): Promise<void> {
  const canvas = await captureDocumentCanvas();
  const imgData = canvas.toDataURL('image/png');
  const { default: jsPDF } = await import('jspdf');

  // A4 in mm — matches the 210mm x 297mm size LiveDocumentPreview renders at.
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = (canvas.height * pageWidth) / canvas.width;

  pdf.addImage(imgData, 'PNG', 0, 0, pageWidth, pageHeight);
  pdf.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`);
}
