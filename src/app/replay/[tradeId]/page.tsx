'use client';

import { useEffect, useRef, useState } from 'react';
import { formatIST } from '@/utils/format';
import { useParams } from 'next/navigation';
import { createChart, CandlestickSeries } from 'lightweight-charts';
import { Play, Pause, FastForward, StepForward, RotateCcw } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';

export default function ReplayPage() {
  const params = useParams();
  const tradeId = params?.tradeId as string;
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const shouldReduceMotion = useReducedMotion();

  const { data: replayData, isLoading } = useQuery({
    queryKey: ['replay', tradeId],
    queryFn: async () => {
      const res = await fetch(`/api/replay?tradeId=${tradeId}`);
      if (!res.ok) throw new Error('Failed to fetch replay data');
      return res.json();
    }
  });

  useEffect(() => {
    if (!chartContainerRef.current || !replayData) return;
    
    const newChart = createChart(chartContainerRef.current, {
      layout: { background: { color: 'transparent' }, textColor: '#d1d5db' },
      grid: { vertLines: { color: '#2d2e33' }, horzLines: { color: '#2d2e33' } },
      width: chartContainerRef.current.clientWidth,
      height: 400,
    });
    
    const series = newChart.addSeries(CandlestickSeries, {
      upColor: '#06b6d4', downColor: '#ef4444', borderVisible: false,
      wickUpColor: '#06b6d4', wickDownColor: '#ef4444',
    });

    if (replayData.ohlc && replayData.ohlc.length > 0) {
      const formattedData = replayData.ohlc.map((c: { date: string; open: number; high: number; low: number; close: number }) => ({
        time: c.date.split('T')[0], // format date for lightweight-charts
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      })).sort((a: { time: string }, b: { time: string }) => a.time.localeCompare(b.time));
      
      series.setData(formattedData);
    }

    // Overlays
    if (replayData.entryPrice) {
      series.createPriceLine({ price: replayData.entryPrice, color: '#3b82f6', lineWidth: 2, lineStyle: 2, axisLabelVisible: true, title: 'Entry' });
    }
    if (replayData.stopLoss) {
      series.createPriceLine({ price: replayData.stopLoss, color: '#ef4444', lineWidth: 2, lineStyle: 2, axisLabelVisible: true, title: 'SL' });
    }
    if (replayData.target) {
      series.createPriceLine({ price: replayData.target, color: '#10b981', lineWidth: 2, lineStyle: 2, axisLabelVisible: true, title: 'Target' });
    }
    if (replayData.exitPrice) {
      series.createPriceLine({ price: replayData.exitPrice, color: '#f59e0b', lineWidth: 2, lineStyle: 2, axisLabelVisible: true, title: 'Exit' });
    }

    const handleResize = () => {
      if (chartContainerRef.current) newChart.applyOptions({ width: chartContainerRef.current.clientWidth });
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      newChart.remove();
    };
  }, [replayData]);

  if (isLoading) return <div className="text-center py-12 text-muted-foreground animate-pulse">Loading Replay Engine...</div>;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-blue-600">Execution Replay</h1>
          <p className="text-muted-foreground mt-1">Trade ID: {tradeId}</p>
        </div>
      </div>

      <motion.div 
        className="border border-border bg-card rounded-xl overflow-hidden shadow-xl"
        initial={shouldReduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div ref={chartContainerRef} className="w-full h-[400px]" />
        
        {/* Controls */}
        <div className="p-4 border-t border-border/50 bg-white/5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button 
              className="p-2 rounded-full bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 transition"
              onClick={() => setIsPlaying(!isPlaying)}
              title={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
            </button>
            <button className="p-2 rounded-full hover:bg-white/10 text-muted-foreground transition" title="Step">
              <StepForward className="w-5 h-5" />
            </button>
            <button className="p-2 rounded-full hover:bg-white/10 text-muted-foreground transition" title="Jump">
              <FastForward className="w-5 h-5" />
            </button>
            <button className="p-2 rounded-full hover:bg-white/10 text-muted-foreground transition" title="Reset">
              <RotateCcw className="w-5 h-5" />
            </button>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Speed:</span>
            <select 
              className="bg-background border border-border rounded-md px-2 py-1 text-sm text-foreground"
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
            >
              <option value={0.5}>0.5x</option>
              <option value={1}>1x</option>
              <option value={2}>2x</option>
              <option value={5}>5x</option>
            </select>
          </div>
        </div>
      </motion.div>

      {/* Events / Trade Details Shell */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div 
          className="border border-border bg-card rounded-xl p-6" 
          initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0 }} 
          animate={{ opacity: 1 }} 
          transition={{ delay: shouldReduceMotion ? 0 : 0.2 }}
        >
          <h3 className="font-semibold mb-4 text-cyan-400">Trade Timeline</h3>
          <ul className="space-y-3">
            {replayData?.events?.map((ev: { timestamp: string; event: string; details?: string }, idx: number) => (
              <li key={idx} className="flex gap-3 text-sm">
                <span className="text-muted-foreground">{formatIST(ev.timestamp, { shortTime: true })}</span>
                <span className={ev.event === 'FILLED' ? 'text-cyan-400' : ''}>{ev.event}: {ev.details || ''}</span>
              </li>
            ))}
            {(!replayData?.events || replayData.events.length === 0) && (
              <li className="text-sm text-muted-foreground italic">No events recorded</li>
            )}
          </ul>
        </motion.div>
        
        <motion.div 
          className="border border-border bg-card rounded-xl p-6" 
          initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0 }} 
          animate={{ opacity: 1 }} 
          transition={{ delay: shouldReduceMotion ? 0 : 0.3 }}
        >
          <h3 className="font-semibold mb-4 text-cyan-400">Execution Parameters</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="block text-muted-foreground">Risk Amount</span>
              <span className="font-medium">
                {replayData?.riskAmount != null ? `₹${Number(replayData.riskAmount).toLocaleString('en-IN')}` : '—'}
              </span>
            </div>
            <div>
              <span className="block text-muted-foreground">Position Size</span>
              <span className="font-medium">
                {replayData?.positionSize != null ? `${Number(replayData.positionSize).toFixed(0)} Qty` : '—'}
              </span>
            </div>
            <div>
              <span className="block text-muted-foreground">Stop Loss</span>
              <span className="font-medium text-red-400">
                {replayData?.stopLoss != null ? `₹${Number(replayData.stopLoss).toFixed(2)}` : '—'}
              </span>
            </div>
            <div>
              <span className="block text-muted-foreground">Target</span>
              <span className="font-medium text-green-400">
                {replayData?.target != null ? `₹${Number(replayData.target).toFixed(2)}` : '—'}
              </span>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
