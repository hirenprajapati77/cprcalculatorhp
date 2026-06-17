'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';

export default function ChartsGrid({ runId }: { runId: string }) {
  const { data: rawSnapshots, isLoading } = useQuery({
    queryKey: ['snapshots', runId],
    queryFn: async () => {
      const res = await fetch(`/api/analytics?runId=${runId}`);
      if (!res.ok) throw new Error('Failed to fetch analytics');
      return res.json() as Promise<Record<string, Array<{ period: string; metricValue: number }>>>;
    }
  });

  const snapshots = React.useMemo(() => {
    if (!rawSnapshots) return [];
    
    // Convert grouped format back to array for charts
    // The API groups by metricType: { EQUITY: [{period, metricValue}], RETURN: [{period, metricValue}] }
    const merged: Record<string, { period: string; value?: number; return?: number; dd?: number; sharpe?: number; expectancy?: number; signal?: string }> = {};
    
    Object.entries(rawSnapshots).forEach(([type, items]) => {
      items.forEach(item => {
        if (!merged[item.period]) merged[item.period] = { period: item.period };
        
        if (type === 'EQUITY') merged[item.period].value = item.metricValue;
        if (type === 'RETURN') merged[item.period].return = item.metricValue;
        if (type === 'DRAWDOWN') merged[item.period].dd = item.metricValue;
        if (type === 'SHARPE') merged[item.period].sharpe = item.metricValue;
        if (type === 'EXPECTANCY') merged[item.period].expectancy = item.metricValue;
        
        // Signal logic for pie chart
        if (type === 'SIGNAL_BULLISH') merged[item.period].signal = 'Bullish';
        else if (type === 'SIGNAL_BEARISH') merged[item.period].signal = 'Bearish';
        else if (type === 'SIGNAL_BREAKOUT') merged[item.period].signal = 'Breakout';
      });
    });

    return Object.values(merged).sort((a, b) => a.period.localeCompare(b.period));
  }, [rawSnapshots]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
        {[1, 2, 3, 4, 5, 6].map(i => (
          <div key={i} className="border border-border bg-card rounded-xl p-4 h-80 flex flex-col">
            <div className="h-5 w-1/3 bg-white/10 rounded animate-pulse mb-4"></div>
            <div className="flex-1 bg-white/5 rounded animate-pulse"></div>
          </div>
        ))}
      </div>
    );
  }

  if (!snapshots || snapshots.length === 0) {
    return (
      <div className="mt-8 text-center py-12 border border-border bg-card rounded-xl">
        <p className="text-muted-foreground">No chart data available for this run.</p>
      </div>
    );
  }

  const signalData = [
    { name: 'Bullish', value: snapshots.filter(s => s.signal === 'Bullish').length, color: '#10b981' },
    { name: 'Bearish', value: snapshots.filter(s => s.signal === 'Bearish').length, color: '#ef4444' },
    { name: 'Breakout', value: snapshots.filter(s => s.signal === 'Breakout').length, color: '#3b82f6' },
  ].filter(d => d.value > 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
      {/* Equity Curve */}
      <motion.div className="border border-border bg-card rounded-xl p-4 h-80" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
        <h3 className="font-semibold mb-4 text-muted-foreground text-sm uppercase tracking-wider">Equity Curve</h3>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={snapshots}>
            <XAxis dataKey="period" stroke="#888888" fontSize={10} tickLine={false} axisLine={false} />
            <YAxis stroke="#888888" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => `₹${Number(v).toLocaleString('en-IN')}`} width={70} />
            <Tooltip 
              contentStyle={{ backgroundColor: '#1a1b1e', borderColor: '#2d2e33', fontSize: 12 }} 
              formatter={(value) => value != null ? [`₹${Number(value).toLocaleString('en-IN')}`, 'Equity'] : ['—', 'Equity']}
            />
            <Line type="monotone" dataKey="value" stroke="#06b6d4" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </motion.div>

      {/* Monthly Return */}
      <motion.div className="border border-border bg-card rounded-xl p-4 h-80" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
        <h3 className="font-semibold mb-4 text-muted-foreground text-sm uppercase tracking-wider">Monthly Return %</h3>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={snapshots}>
            <XAxis dataKey="period" stroke="#888888" fontSize={10} tickLine={false} axisLine={false} />
            <YAxis stroke="#888888" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} width={40} />
            <Tooltip contentStyle={{ backgroundColor: '#1a1b1e', borderColor: '#2d2e33', fontSize: 12 }} cursor={{ fill: '#ffffff10' }} />
            <Bar dataKey="return" fill="#3b82f6" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </motion.div>

      {/* Rolling Drawdown */}
      <motion.div className="border border-border bg-card rounded-xl p-4 h-80" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}>
        <h3 className="font-semibold mb-4 text-muted-foreground text-sm uppercase tracking-wider">Rolling Drawdown</h3>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={snapshots}>
            <XAxis dataKey="period" stroke="#888888" fontSize={10} tickLine={false} axisLine={false} />
            <YAxis stroke="#888888" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} width={40} />
            <Tooltip contentStyle={{ backgroundColor: '#1a1b1e', borderColor: '#2d2e33', fontSize: 12 }} />
            <Area type="monotone" dataKey="dd" stroke="#ef4444" fill="#ef4444" fillOpacity={0.2} />
          </AreaChart>
        </ResponsiveContainer>
      </motion.div>

      {/* Signal Distribution */}
      <motion.div className="border border-border bg-card rounded-xl p-4 h-80" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>
        <h3 className="font-semibold mb-4 text-muted-foreground text-sm uppercase tracking-wider">Signal Distribution</h3>
        {signalData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={signalData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                {signalData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ backgroundColor: '#1a1b1e', borderColor: '#2d2e33', fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex items-center justify-center text-muted-foreground text-xs">No signals generated</div>
        )}
      </motion.div>

      {/* Rolling Sharpe */}
      <motion.div className="border border-border bg-card rounded-xl p-4 h-80" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}>
        <h3 className="font-semibold mb-4 text-muted-foreground text-sm uppercase tracking-wider">Rolling Sharpe Ratio</h3>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={snapshots}>
            <XAxis dataKey="period" stroke="#888888" fontSize={10} tickLine={false} axisLine={false} />
            <YAxis stroke="#888888" fontSize={10} tickLine={false} axisLine={false} width={40} />
            <Tooltip contentStyle={{ backgroundColor: '#1a1b1e', borderColor: '#2d2e33', fontSize: 12 }} />
            <Line type="stepAfter" dataKey="sharpe" stroke="#a855f7" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </motion.div>

      {/* Expectancy Curve */}
      <motion.div className="border border-border bg-card rounded-xl p-4 h-80" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}>
        <h3 className="font-semibold mb-4 text-muted-foreground text-sm uppercase tracking-wider">Expectancy Curve</h3>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={snapshots}>
            <XAxis dataKey="period" stroke="#888888" fontSize={10} tickLine={false} axisLine={false} />
            <YAxis stroke="#888888" fontSize={10} tickLine={false} axisLine={false} width={40} />
            <Tooltip contentStyle={{ backgroundColor: '#1a1b1e', borderColor: '#2d2e33', fontSize: 12 }} />
            <Area type="monotone" dataKey="expectancy" stroke="#10b981" fill="#10b981" fillOpacity={0.2} />
          </AreaChart>
        </ResponsiveContainer>
      </motion.div>
    </div>
  );
}
