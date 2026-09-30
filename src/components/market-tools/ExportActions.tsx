'use client';

import React, { useState, useRef, useEffect } from 'react';
import { triggerPrintPdf } from '@/lib/export-utils';
import { Download, FileSpreadsheet, Printer, ChevronDown } from 'lucide-react';

interface ExportActionsProps {
  onExportCsv: () => void;
  onExportPdf?: () => void;
  disabled?: boolean;
  label?: string;
}

export function ExportActions({
  onExportCsv,
  onExportPdf = triggerPrintPdf,
  disabled = false,
  label = 'Export',
}: ExportActionsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative inline-block text-left font-mono select-none" ref={dropdownRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold border transition-colors ${
          disabled
            ? 'bg-bg-tertiary text-text-tertiary border-border-primary opacity-50 cursor-not-allowed'
            : 'bg-bg-tertiary text-text-secondary border-border-primary hover:text-text-primary hover:bg-bg-tertiary/80'
        }`}
        title="Export data to Excel / CSV or Print to PDF"
      >
        <Download size={13} className="text-accent-blue" />
        <span>{label}</span>
        <ChevronDown size={12} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && !disabled && (
        <div className="absolute right-0 mt-2 w-52 rounded-lg bg-bg-secondary border border-border-secondary shadow-2xl py-1 z-50 text-xs">
          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              onExportCsv();
            }}
            className="w-full text-left px-3 py-2 text-text-secondary hover:bg-bg-tertiary hover:text-text-primary flex items-center gap-2.5 transition-colors"
          >
            <FileSpreadsheet size={14} className="text-accent-green" />
            <div>
              <div className="font-bold text-text-primary">Export to CSV</div>
              <div className="text-[10px] text-text-tertiary">Spreadsheet data (.csv)</div>
            </div>
          </button>

          <div className="border-t border-border-primary/80 my-1" />

          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              onExportPdf();
            }}
            className="w-full text-left px-3 py-2 text-text-secondary hover:bg-bg-tertiary hover:text-text-primary flex items-center gap-2.5 transition-colors"
          >
            <Printer size={14} className="text-accent-blue" />
            <div>
              <div className="font-bold text-text-primary">Print / Save PDF</div>
              <div className="text-[10px] text-text-tertiary">Print-ready document</div>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}
