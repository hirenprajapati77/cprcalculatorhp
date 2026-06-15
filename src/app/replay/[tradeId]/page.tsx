'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { createChart, CandlestickSeries } from 'lightweight-charts';
import { Play, Pause, SkipForward, RotateCcw } from 'lucide-react';
import { motion } from 'framer-motion';

export default function ReplayPage() {
  const params = useParams();
  const tradeId = params?.tradeId as string;
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

  useEffect(() => {
    if (!chartContainerRef.current) return;
    
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

    // Mock initial data
    series.setData([
      { time: '2023-01-01', open: 100, high: 105, low: 95, close: 102 },
      { time: '2023-01-02', open: 102, high: 108, low: 100, close: 106 },
    ]);

    const handleResize = () => {
      if (chartContainerRef.current) newChart.applyOptions({ width: chartContainerRef.current.clientWidth });
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      newChart.remove();
    };
  }, []);

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
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div ref={chartContainerRef} className="w-full h-[400px]" />
        
        {/* Controls */}
        <div className="p-4 border-t border-border/50 bg-white/5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button 
              className="p-2 rounded-full bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 transition"
              onClick={() => setIsPlaying(!isPlaying)}
            >
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
            </button>
            <button className="p-2 rounded-full hover:bg-white/10 text-muted-foreground transition"><SkipForward className="w-5 h-5" /></button>
            <button className="p-2 rounded-full hover:bg-white/10 text-muted-foreground transition"><RotateCcw className="w-5 h-5" /></button>
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
        <motion.div className="border border-border bg-card rounded-xl p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
          <h3 className="font-semibold mb-4 text-cyan-400">Trade Timeline</h3>
          <ul className="space-y-3">
            <li className="flex gap-3 text-sm"><span className="text-muted-foreground">09:15</span> <span>Signal Triggered: Breakout</span></li>
            <li className="flex gap-3 text-sm text-cyan-400"><span className="text-muted-foreground">09:16</span> <span>Order Filled (Long @ 102)</span></li>
          </ul>
        </motion.div>
        
        <motion.div className="border border-border bg-card rounded-xl p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
          <h3 className="font-semibold mb-4 text-cyan-400">Execution Parameters</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><span className="block text-muted-foreground">Risk Amount</span><span className="font-medium">$1,000</span></div>
            <div><span className="block text-muted-foreground">Position Size</span><span className="font-medium">250 Qty</span></div>
            <div><span className="block text-muted-foreground">Stop Loss</span><span className="font-medium text-red-400">95.00</span></div>
            <div><span className="block text-muted-foreground">Target</span><span className="font-medium text-green-400">110.00</span></div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
