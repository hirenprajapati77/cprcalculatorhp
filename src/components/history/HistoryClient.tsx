'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { HistoryTable } from '@/components/history/HistoryTable';
import { HistoryFilters, FilterState } from '@/components/history/HistoryFilters';
import { HistoryExport } from '@/components/history/HistoryExport';
import { useToast } from '@/components/ui/Toast';
import { CalculationRecord } from '@/types/cpr.types';
import { History } from 'lucide-react';

export default function HistoryClient() {
  const [calculations, setCalculations] = useState<CalculationRecord[]>([]);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const router = useRouter();
  const { showToast } = useToast();

  const [filters, setFilters] = useState<FilterState>({
    classification: 'ALL',
    timeframe: 'ALL',
    searchQuery: '',
  });

  // Load history from localStorage
  useEffect(() => {
    const raw = localStorage.getItem('cpr_history') || '[]';
    try {
      const parsed: CalculationRecord[] = JSON.parse(raw);
      const formatted = parsed.map((item) => ({
        ...item,
        createdAt: new Date(item.createdAt),
      }));
      setCalculations(formatted);
    } catch {
      console.error('Failed to parse calculations history:');
    }
  }, []);

  const handleLoadEntry = (record: CalculationRecord) => {
    // Pre-cache inputs in sessionStorage to let calculator form auto-populate
    sessionStorage.setItem('cpr_last_calculation', JSON.stringify(record));
    sessionStorage.setItem('cpr_last_saved', 'true');
    showToast('Session loaded! Redirecting to calculator...', 'info');
    router.push('/calculate');
  };

  const handleDeleteEntry = async (id: string) => {
    setIsDeletingId(id);
    try {
      // 1. Attempt to delete from backend DB
      if (id && !id.startsWith('local_')) {
        await fetch(`/api/history/${id}`, {
          method: 'DELETE',
        });
      }

      // 2. Remove from local storage list
      const updated = calculations.filter((c) => c.id !== id);
      setCalculations(updated);
      localStorage.setItem('cpr_history', JSON.stringify(updated));
      showToast('Calculation session deleted.', 'success');
    } catch {
      showToast('Failed to delete history entry.', 'error');
    } finally {
      setIsDeletingId(null);
    }
  };

  const handleClearAll = async () => {
    try {
      // Clear all items on the database that exist in current list
      const dbIds = calculations
        .filter((c) => c.id && !c.id.startsWith('local_'))
        .map((c) => c.id);
        
      for (const id of dbIds) {
        await fetch(`/api/history/${id}`, { method: 'DELETE' }).catch(() => {});
      }

      // Clear local storage list
      setCalculations([]);
      localStorage.removeItem('cpr_history');
      showToast('All calculations history cleared.', 'success');
    } catch {
      showToast('Failed to clear entire history.', 'error');
    }
  };

  // Filter calculations based on current FilterState
  const filteredCalculations = calculations.filter((c) => {
    // 1. Filter by Width Type
    if (filters.classification !== 'ALL' && c.classification !== filters.classification) {
      return false;
    }

    // 2. Filter by Timeframe (Daily/Weekly/Monthly)
    if (filters.timeframe !== 'ALL') {
      const recordTime = new Date(c.createdAt).getTime();
      const now = Date.now();
      const diffMs = now - recordTime;

      if (filters.timeframe === 'DAILY' && diffMs > 24 * 60 * 60 * 1000) {
        return false;
      }
      if (filters.timeframe === 'WEEKLY' && diffMs > 7 * 24 * 60 * 60 * 1000) {
        return false;
      }
      if (filters.timeframe === 'MONTHLY' && diffMs > 30 * 24 * 60 * 60 * 1000) {
        return false;
      }
    }

    // 3. Filter by Search Query
    if (filters.searchQuery.trim() !== '') {
      const q = filters.searchQuery.toLowerCase();
      return (
        String(c.high).includes(q) ||
        String(c.low).includes(q) ||
        String(c.close).includes(q) ||
        String(c.pivot.toFixed(2)).includes(q) ||
        c.classification.toLowerCase().includes(q) ||
        c.trend.toLowerCase().includes(q)
      );
    }

    return true;
  });

  return (
    <div className="space-y-5">
      {/* Title block */}
      <div className="bg-bg-secondary border border-border-primary rounded-lg p-5 font-mono select-none">
        <span className="text-[10px] text-accent-blue font-bold uppercase tracking-widest flex items-center gap-1.5">
          <History size={13} />
          Calculations Vault
        </span>
        <h1 className="text-xl md:text-2xl font-bold tracking-tight text-text-primary uppercase mt-1">
          Historical Sessions
        </h1>
        <p className="text-xs text-text-secondary max-w-2xl leading-relaxed">
          Access your saved CPR parameters. Inspect pivot levels, reload sessions back into the calculator, and export consolidated CSV reports.
        </p>
      </div>

      {/* Filters */}
      <HistoryFilters filters={filters} onFiltersChange={setFilters} />

      {/* Export & Actions header */}
      <HistoryExport
        calculations={calculations}
        onClearAll={handleClearAll}
        filteredCount={filteredCalculations.length}
      />

      {/* History Table */}
      <div className="bg-bg-primary p-2 border border-border-primary rounded-lg">
        <HistoryTable
          calculations={filteredCalculations}
          onLoadEntry={handleLoadEntry}
          onDeleteEntry={handleDeleteEntry}
          isDeletingId={isDeletingId}
        />
      </div>
    </div>
  );
}
