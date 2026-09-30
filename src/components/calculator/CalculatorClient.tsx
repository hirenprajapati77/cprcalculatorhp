'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { CalculateHeader } from '@/components/calculator/CalculateHeader';
import { CalculationControls } from '@/components/calculator/CalculationControls';
import { CPRTimeframeCard } from '@/components/calculator/CPRTimeframeCard';
import { CPRLevelGrid } from '@/components/calculator/CPRLevelGrid';
import { CPRInterpretation } from '@/components/calculator/CPRInterpretation';
import { CalculationEmptyState } from '@/components/calculator/CalculationEmptyState';
import { LevelChart } from '@/components/chart/LevelChart';
import { StockDetailDrawer, DrawerStockData } from '@/components/enterprise/StockDetailDrawer';
import { useToast } from '@/components/ui/Toast';
import { CalculationRecord, CPRInput, CPRClassification, CPRTrend } from '@/types/cpr.types';
import { MtfCprLevels } from '@/services/mtf-cpr.service';
import { exportToCSV } from '@/lib/export';
import { fmt, formatPct } from '@/utils/format';

export default function CalculatorClient() {
  const searchParams = useSearchParams();
  const { showToast } = useToast();

  const [record, setRecord] = useState<CalculationRecord | null>(null);
  const [mtfData, setMtfData] = useState<MtfCprLevels | null>(null);
  const [activeSymbol, setActiveSymbol] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingMTF, setIsFetchingMTF] = useState(false);
  const [isFetchingSymbol, setIsFetchingSymbol] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [defaultValues, setDefaultValues] = useState<Partial<CPRInput & { symbol?: string | undefined }>>({});

  // Fetch MTF CPR levels (Weekly & Monthly)
  const fetchMTFData = useCallback(async (symbol: string) => {
    if (!symbol) return;
    setIsFetchingMTF(true);
    try {
      const res = await fetch(`/api/mtf-cpr?symbol=${encodeURIComponent(symbol)}`);
      if (res.ok) {
        const data: MtfCprLevels = await res.json();
        setMtfData(data);
        sessionStorage.setItem('cpr_last_mtf', JSON.stringify(data));
      } else {
        // Non-fatal: Symbol might not have sufficient Yahoo history
        setMtfData(null);
      }
    } catch (err) {
      console.warn('Could not fetch MTF CPR for symbol:', symbol, err);
      setMtfData(null);
    } finally {
      setIsFetchingMTF(false);
    }
  }, []);

  // Fetch Stock OHLC from scanner / market service
  const fetchStockCandle = useCallback(async (symbol: string) => {
    if (!symbol) return;
    setIsFetchingSymbol(true);
    try {
      const res = await fetch(`/api/stock/${encodeURIComponent(symbol)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.current) {
          const fetchedHigh = Number(data.current.high || data.current.price * 1.01);
          const fetchedLow = Number(data.current.low || data.current.price * 0.99);
          const fetchedClose = Number(data.current.price || data.current.ltp);

          setDefaultValues({
            symbol: symbol.toUpperCase(),
            high: Number(fetchedHigh.toFixed(2)),
            low: Number(fetchedLow.toFixed(2)),
            close: Number(fetchedClose.toFixed(2)),
          });
          setActiveSymbol(symbol.toUpperCase());
          showToast(`Loaded market data for ${symbol.toUpperCase()}`, 'success');

          // Parallel fetch MTF levels
          fetchMTFData(symbol.toUpperCase());
          return;
        }
      }
      showToast(`No live candle available for ${symbol.toUpperCase()}, please enter OHLC manually`, 'info');
      setActiveSymbol(symbol.toUpperCase());
      fetchMTFData(symbol.toUpperCase());
    } catch {
      showToast(`Could not auto-fetch ${symbol.toUpperCase()}`, 'error');
    } finally {
      setIsFetchingSymbol(false);
    }
  }, [fetchMTFData, showToast]);

  // Load last calculation from sessionStorage or query param on initial mount
  useEffect(() => {
    const symbolFromQuery = searchParams.get('symbol');
    if (symbolFromQuery) {
      const upper = symbolFromQuery.toUpperCase();
      setActiveSymbol(upper);
      fetchStockCandle(upper);
      return;
    }

    const cached = sessionStorage.getItem('cpr_last_calculation');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        parsed.createdAt = new Date(parsed.createdAt);
        setRecord(parsed);
        if (parsed.symbol) {
          setActiveSymbol(parsed.symbol);
        }
      } catch (err) {
        console.error('Failed to load session cached calculation:', err);
      }
    }

    const cachedMtf = sessionStorage.getItem('cpr_last_mtf');
    if (cachedMtf) {
      try {
        setMtfData(JSON.parse(cachedMtf));
      } catch (err) {
        console.error('Failed to load cached MTF data:', err);
      }
    }
  }, [searchParams, fetchStockCandle]);

  // Core CPR Calculation
  const handleCalculate = async (input: CPRInput & { symbol?: string | undefined }) => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/cpr/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to calculate levels');
      }

      const data: CalculationRecord = await res.json();
      data.createdAt = new Date(data.createdAt);

      setRecord(data);
      if (input.symbol) {
        setActiveSymbol(input.symbol.toUpperCase());
        fetchMTFData(input.symbol.toUpperCase());
      }

      sessionStorage.setItem('cpr_last_calculation', JSON.stringify({ ...data, symbol: input.symbol }));

      // Dual-storage sync to localStorage history
      try {
        const rawHistory = localStorage.getItem('cpr_history') || '[]';
        const historyList: CalculationRecord[] = JSON.parse(rawHistory);
        const exists = historyList.some(
          (h) => h.id === data.id || (h.high === data.high && h.low === data.low && h.close === data.close)
        );
        if (!exists) {
          historyList.unshift(data);
          if (historyList.length > 50) historyList.splice(50);
          localStorage.setItem('cpr_history', JSON.stringify(historyList));
        }
      } catch {
        // Non-fatal localStorage quota issue
      }

      showToast('Daily CPR levels computed successfully!', 'success');
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Calculation error';
      showToast(errMsg, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setRecord(null);
    setMtfData(null);
    setActiveSymbol(null);
    sessionStorage.removeItem('cpr_last_calculation');
    sessionStorage.removeItem('cpr_last_mtf');
    showToast('Terminal reset to baseline.', 'info');
  };

  const handleCopyReport = () => {
    if (!record) return;

    const shareUrl = record.shareToken
      ? `${window.location.origin}/share/${record.shareToken}`
      : 'URL unavailable';

    let text =
      `===================================================\n` +
      `CPR PRO — QUANTITATIVE LEVEL REPORT\n` +
      `Symbol: ${activeSymbol || 'MANUAL INPUT'}\n` +
      `Date: ${new Date().toLocaleDateString('en-IN')}\n` +
      `===================================================\n\n` +
      `[INPUT CANDLE]\n` +
      `  High:  ₹${fmt(record.high)}\n` +
      `  Low:   ₹${fmt(record.low)}\n` +
      `  Close: ₹${fmt(record.close)}\n\n` +
      `[DAILY CPR LEVELS]\n` +
      `  Pivot Point:         ₹${fmt(record.pivot)}\n` +
      `  Top Central (TC):    ₹${fmt(record.tc)}\n` +
      `  Bottom Central (BC): ₹${fmt(record.bc)}\n` +
      `  CPR Width:           ${formatPct(record.width)} (${record.classification})\n` +
      `  Bias:                ${record.trend}\n\n` +
      `[PIVOT RESISTANCE / SUPPORT]\n` +
      `  R4: ₹${fmt(record.r4)} | R3: ₹${fmt(record.r3)} | R2: ₹${fmt(record.r2)} | R1: ₹${fmt(record.r1)}\n` +
      `  S1: ₹${fmt(record.s1)} | S2: ₹${fmt(record.s2)} | S3: ₹${fmt(record.s3)} | S4: ₹${fmt(record.s4)}\n`;

    if (mtfData) {
      text +=
        `\n[WEEKLY CPR]\n` +
        `  Pivot: ₹${fmt(mtfData.weekly.pivot)} | TC: ₹${fmt(mtfData.weekly.tc)} | BC: ₹${fmt(mtfData.weekly.bc)}\n` +
        `  Width: ${formatPct(mtfData.weekly.width)} (${mtfData.weekly.classification})\n\n` +
        `[MONTHLY CPR]\n` +
        `  Pivot: ₹${fmt(mtfData.monthly.pivot)} | TC: ₹${fmt(mtfData.monthly.tc)} | BC: ₹${fmt(mtfData.monthly.bc)}\n` +
        `  Width: ${formatPct(mtfData.monthly.width)} (${mtfData.monthly.classification})\n`;

      if (mtfData.confluence.strongSupport.length > 0) {
        text += `  ★ Strong Support Zone: ₹${mtfData.confluence.strongSupport.join(', ')}\n`;
      }
      if (mtfData.confluence.strongResistance.length > 0) {
        text += `  ★ Strong Resistance Zone: ₹${mtfData.confluence.strongResistance.join(', ')}\n`;
      }
    }

    text += `\nPublic Share Link: ${shareUrl}\n`;

    navigator.clipboard.writeText(text).then(
      () => {
        setIsCopied(true);
        showToast('Complete CPR report copied to clipboard!', 'success');
        setTimeout(() => setIsCopied(false), 2000);
      },
      () => showToast('Failed to copy report', 'error')
    );
  };

  const handleExportCSV = () => {
    if (!record) return;
    try {
      const csv = exportToCSV(record);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `cpr_report_${activeSymbol || 'custom'}_${Date.now()}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast('CSV level matrix downloaded.', 'success');
    } catch {
      showToast('Failed to export CSV', 'error');
    }
  };

  const handleShareURL = () => {
    if (!record?.shareToken) return;
    const url = `${window.location.origin}/share/${record.shareToken}`;
    navigator.clipboard.writeText(url).then(
      () => showToast('Public share URL copied to clipboard!', 'success'),
      () => showToast('Failed to copy share link', 'error')
    );
  };

  const handleLoadPreset = (preset: { symbol: string; high: number; low: number; close: number }) => {
    setDefaultValues({
      symbol: preset.symbol,
      high: preset.high,
      low: preset.low,
      close: preset.close,
    });
    setActiveSymbol(preset.symbol);
    handleCalculate({
      symbol: preset.symbol,
      high: preset.high,
      low: preset.low,
      close: preset.close,
    });
  };

  // Stock drawer data mapping
  const drawerStock: DrawerStockData | null =
    activeSymbol && record
      ? {
          symbol: activeSymbol,
          ltp: record.close,
          high: record.high,
          low: record.low,
          close: record.close,
          pivot: record.pivot,
          tc: record.tc,
          bc: record.bc,
          r1: record.r1,
          r2: record.r2,
          r3: record.r3,
          r4: record.r4,
          s1: record.s1,
          s2: record.s2,
          s3: record.s3,
          s4: record.s4,
          width: record.width,
          classification: record.classification,
          direction: record.close > record.tc ? 'LONG' : record.close < record.bc ? 'SHORT' : undefined,
          entry: record.close > record.tc ? record.tc : record.bc,
          target: record.close > record.tc ? record.r1 : record.s1,
          sl: record.close > record.tc ? record.bc : record.tc,
        }
      : activeSymbol
      ? {
          symbol: activeSymbol,
          ltp: defaultValues.close || 0,
        }
      : null;

  return (
    <div className="space-y-5">
      {/* 1. Header Banner */}
      <CalculateHeader
        record={record}
        activeSymbol={activeSymbol}
        onReset={handleReset}
        onCopyReport={handleCopyReport}
        onExportCSV={handleExportCSV}
        onShareURL={handleShareURL}
        onOpenStockDrawer={activeSymbol ? (_sym: string) => setIsDrawerOpen(true) : undefined}
        isCopied={isCopied}
      />

      {/* 2. Sticky Calculation Controls */}
      <CalculationControls
        onCalculate={handleCalculate}
        onReset={handleReset}
        onFetchSymbol={fetchStockCandle}
        isLoading={isLoading}
        isFetchingSymbol={isFetchingSymbol}
        defaultValues={defaultValues}
      />

      {/* 3. Main Workspace Display */}
      {record ? (
        <div className="space-y-5 animate-fade-in">
          {/* Multi-Timeframe Triad: Daily, Weekly, Monthly Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Daily CPR */}
            <CPRTimeframeCard
              timeframe="DAILY"
              title="Daily Session CPR"
              data={record}
              high={record.high}
              low={record.low}
              close={record.close}
            />

            {/* Weekly CPR */}
            <CPRTimeframeCard
              timeframe="WEEKLY"
              title="Weekly Swing CPR"
              data={mtfData ? mtfData.weekly : null}
              isLoading={isFetchingMTF}
              emptyPrompt={
                activeSymbol
                  ? 'Weekly data unavailable for this symbol'
                  : 'Enter symbol (e.g. RELIANCE, NIFTY) to unlock Weekly CPR'
              }
              onActionClick={
                !activeSymbol
                  ? () => {
                      setDefaultValues((prev) => ({ ...prev, symbol: 'NIFTY' }));
                      fetchStockCandle('NIFTY');
                    }
                  : undefined
              }
              actionLabel="Load NIFTY MTF"
            />

            {/* Monthly CPR */}
            <CPRTimeframeCard
              timeframe="MONTHLY"
              title="Monthly Macro CPR"
              data={mtfData ? mtfData.monthly : null}
              isLoading={isFetchingMTF}
              emptyPrompt={
                activeSymbol
                  ? 'Monthly data unavailable for this symbol'
                  : 'Enter symbol (e.g. RELIANCE, NIFTY) to unlock Monthly CPR'
              }
              onActionClick={
                !activeSymbol
                  ? () => {
                      setDefaultValues((prev) => ({ ...prev, symbol: 'BANKNIFTY' }));
                      fetchStockCandle('BANKNIFTY');
                    }
                  : undefined
              }
              actionLabel="Load BANKNIFTY MTF"
            />
          </div>

          {/* Deep Analytics Grid: Level Grid (Left) + Chart & Playbook (Right) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* Left Column: Full Level Matrix */}
            <div className="lg:col-span-5 space-y-5">
              <CPRLevelGrid
                levels={record}
                referencePrice={record.close}
                symbol={activeSymbol || undefined}
              />
            </div>

            {/* Right Column: Visualization + Institutional Regime Playbook */}
            <div className="lg:col-span-7 space-y-5">
              <LevelChart record={{ ...record, ltp: record.close }} />

              <CPRInterpretation
                classification={record.classification as CPRClassification}
                trend={record.trend as CPRTrend}
                width={record.width}
                pivot={record.pivot}
                tc={record.tc}
                bc={record.bc}
                close={record.close}
                confluence={mtfData?.confluence}
              />
            </div>
          </div>
        </div>
      ) : (
        <CalculationEmptyState onLoadPreset={handleLoadPreset} />
      )}

      {/* 4. Stock Detail Drawer */}
      <StockDetailDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        stock={drawerStock}
      />
    </div>
  );
}
