'use client';

import React, { useState, useRef, useEffect } from 'react';
import { triggerPrintPdf } from '@/lib/export-utils';

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
    <div className="relative inline-block text-left" ref={dropdownRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
          disabled
            ? 'bg-gray-900/50 text-gray-600 border-gray-800 cursor-not-allowed'
            : 'bg-gray-900 text-gray-200 border-gray-800 hover:bg-gray-800 hover:text-white hover:border-gray-700'
        }`}
        title="Export data to Excel / CSV or Print to PDF"
      >
        <span>📥</span>
        <span>{label}</span>
        <svg
          className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && !disabled && (
        <div className="absolute right-0 mt-2 w-48 rounded-lg bg-gray-900 border border-gray-800 shadow-2xl py-1 z-50 text-xs animate-in fade-in zoom-in-95 duration-100">
          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              onExportCsv();
            }}
            className="w-full text-left px-3 py-2 text-gray-200 hover:bg-gray-800 hover:text-white flex items-center gap-2.5 transition"
          >
            <span className="text-emerald-400">📊</span>
            <div>
              <div className="font-bold">Export to Excel / CSV</div>
              <div className="text-[10px] text-gray-400">Formatted spreadsheet (.csv)</div>
            </div>
          </button>

          <div className="border-t border-gray-800/80 my-1" />

          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              onExportPdf();
            }}
            className="w-full text-left px-3 py-2 text-gray-200 hover:bg-gray-800 hover:text-white flex items-center gap-2.5 transition"
          >
            <span className="text-blue-400">📄</span>
            <div>
              <div className="font-bold">Print / Save as PDF</div>
              <div className="text-[10px] text-gray-400">Print-ready document layout</div>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}
