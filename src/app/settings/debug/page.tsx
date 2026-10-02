'use client';

import React, { useEffect, useState } from 'react';
import {
  Cpu,
  RefreshCw,
  Database,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Server,
  Layers,
  Clock,
} from 'lucide-react';

interface HealthData {
  version: string;
  environment: string;
  build: string;
  uptime: number;
  cache: {
    provider: string;
    redisConnected: boolean;
    memoryUsage?: { size: number; max: number };
  };
  queues: {
    enabled: boolean;
    queues?: Record<string, { waiting: number; active: number; completed: number; failed: number }>;
  };
}

export default function DebugPanel() {
  const [healthData, setHealthData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchHealth = async (manual = false) => {
    if (manual) setIsRefreshing(true);
    try {
      const res = await fetch('/api/health');
      if (res.ok) {
        setHealthData(await res.json());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      if (manual) setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(() => fetchHealth(false), 5000);
    return () => clearInterval(interval);
  }, []);

  if (loading && !healthData) {
    return (
      <div className="min-h-[400px] flex items-center justify-center p-8 bg-bg-primary text-text-primary font-mono text-xs">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-accent-blue border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-text-secondary">Loading diagnostics telemetry...</p>
        </div>
      </div>
    );
  }

  if (!healthData) return null;

  const formatUptime = (seconds: number) => {
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    return `${m}m ${s}s`;
  };

  const isHealthy = healthData.cache.redisConnected;

  return (
    <div className="space-y-4 font-mono select-none text-xs">
      {/* ── Workstation Header ── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 bg-bg-secondary border border-border-primary rounded-lg p-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-md bg-accent-blue/10 text-accent-blue">
              <Cpu size={18} />
            </span>
            <h1 className="text-lg font-bold text-text-primary tracking-tight">
              Diagnostics &amp; System Health
            </h1>
            <span
              className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase flex items-center gap-1 border ${
                isHealthy
                  ? 'bg-accent-green/10 text-accent-green border-accent-green/30'
                  : 'bg-accent-amber/10 text-accent-amber border-accent-amber/30'
              }`}
            >
              {isHealthy ? <CheckCircle2 size={11} /> : <AlertTriangle size={11} />}
              {isHealthy ? 'SYSTEM OPERATIONAL' : 'DEGRADED CACHE'}
            </span>
          </div>
          <p className="text-xs text-text-tertiary mt-1">
            Real-time process telemetry, memory consumption, distributed cache connection, and background job queue health.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fetchHealth(true)}
            disabled={isRefreshing}
            className="px-3 py-1.5 bg-accent-blue hover:bg-accent-blue/90 disabled:opacity-50 text-white font-semibold rounded-md text-xs transition-colors flex items-center gap-1.5 shadow-sm"
          >
            <RefreshCw size={13} className={isRefreshing ? 'animate-spin' : ''} />
            <span>{isRefreshing ? 'Probing...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* ── Top KPI Strip ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-bg-secondary border border-border-primary rounded-lg p-3">
          <div className="flex items-center justify-between text-[10px] text-text-tertiary uppercase">
            <span className="font-semibold flex items-center gap-1">
              <Clock size={11} className="text-accent-blue" />
              Process Uptime
            </span>
            <span className="text-[8px] bg-accent-blue/10 text-accent-blue font-bold px-1 rounded">PID</span>
          </div>
          <div className="text-xl font-bold text-text-primary mt-1">
            {formatUptime(healthData.uptime)}
          </div>
          <div className="text-[10px] text-text-tertiary mt-0.5">Continuous runtime</div>
        </div>

        <div className="bg-bg-secondary border border-border-primary rounded-lg p-3">
          <div className="flex items-center justify-between text-[10px] text-text-tertiary uppercase">
            <span className="font-semibold flex items-center gap-1">
              <Server size={11} className="text-accent-purple" />
              Environment
            </span>
            <span className="text-[8px] bg-accent-purple/10 text-accent-purple font-bold px-1 rounded">NODE</span>
          </div>
          <div className="text-xl font-bold text-accent-purple mt-1 uppercase">
            {healthData.environment}
          </div>
          <div className="text-[10px] text-text-tertiary mt-0.5">v{healthData.version}</div>
        </div>

        <div className="bg-bg-secondary border border-border-primary rounded-lg p-3">
          <div className="flex items-center justify-between text-[10px] text-text-tertiary uppercase">
            <span className="font-semibold flex items-center gap-1">
              <Database size={11} className="text-accent-green" />
              Cache Engine
            </span>
            <span className="text-[8px] bg-accent-green/10 text-accent-green font-bold px-1 rounded">CACHE</span>
          </div>
          <div className={`text-xl font-bold mt-1 ${healthData.cache.redisConnected ? 'text-accent-green' : 'text-accent-amber'}`}>
            {healthData.cache.redisConnected ? 'Redis Active' : 'In-Memory Fallback'}
          </div>
          <div className="text-[10px] text-text-tertiary mt-0.5">Provider: {healthData.cache.provider}</div>
        </div>

        <div className="bg-bg-secondary border border-border-primary rounded-lg p-3">
          <div className="flex items-center justify-between text-[10px] text-text-tertiary uppercase">
            <span className="font-semibold flex items-center gap-1">
              <Activity size={11} className="text-accent-amber" />
              Background Queues
            </span>
            <span className="text-[8px] bg-accent-amber/10 text-accent-amber font-bold px-1 rounded">BULLMQ</span>
          </div>
          <div className="text-xl font-bold text-accent-amber mt-1">
            {healthData.queues.enabled ? 'Enabled' : 'Disabled'}
          </div>
          <div className="text-[10px] text-text-tertiary mt-0.5">
            {Object.keys(healthData.queues.queues || {}).length} registered workers
          </div>
        </div>
      </div>

      {/* ── Diagnostics Cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* System Details */}
        <div className="bg-bg-secondary border border-border-primary rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-border-primary pb-2.5">
            <h2 className="text-xs font-bold text-text-primary uppercase tracking-wider flex items-center gap-1.5">
              <Server size={13} className="text-accent-blue" />
              Runtime Details
            </h2>
            <span className="text-[9px] font-bold text-accent-blue bg-accent-blue/10 px-1.5 py-0.5 rounded">
              NODE.JS
            </span>
          </div>
          <div className="space-y-2 text-text-secondary">
            <div className="flex justify-between items-center">
              <span>Platform Version:</span>
              <span className="font-bold text-text-primary">v{healthData.version}</span>
            </div>
            <div className="flex justify-between items-center">
              <span>Execution Environment:</span>
              <span className="font-bold text-text-primary capitalize">{healthData.environment}</span>
            </div>
            <div className="flex justify-between items-center">
              <span>Build Identifier:</span>
              <span className="font-bold font-mono text-text-primary">{healthData.build}</span>
            </div>
            <div className="flex justify-between items-center">
              <span>Total Uptime:</span>
              <span className="font-bold font-mono text-text-primary">{Math.floor(healthData.uptime)} seconds</span>
            </div>
          </div>
        </div>

        {/* Cache Status */}
        <div className="bg-bg-secondary border border-border-primary rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-border-primary pb-2.5">
            <h2 className="text-xs font-bold text-text-primary uppercase tracking-wider flex items-center gap-1.5">
              <Database size={13} className="text-accent-purple" />
              Cache &amp; Storage Status
            </h2>
            <span className="text-[9px] font-bold text-accent-purple bg-accent-purple/10 px-1.5 py-0.5 rounded">
              L1/L2
            </span>
          </div>
          <div className="space-y-2 text-text-secondary">
            <div className="flex justify-between items-center">
              <span>Cache Provider:</span>
              <span className="font-bold text-text-primary uppercase">{healthData.cache.provider}</span>
            </div>
            <div className="flex justify-between items-center">
              <span>Distributed Redis State:</span>
              <span
                className={`font-bold flex items-center gap-1 ${
                  healthData.cache.redisConnected ? 'text-accent-green' : 'text-accent-red'
                }`}
              >
                {healthData.cache.redisConnected ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
                {healthData.cache.redisConnected ? 'Connected (TCP 6379)' : 'Offline / Standalone'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span>Local Memory Keys:</span>
              <span className="font-bold font-mono text-text-primary">
                {healthData.cache.memoryUsage?.size ?? 0} / {healthData.cache.memoryUsage?.max ?? 'Unlimited'}
              </span>
            </div>
          </div>
        </div>

        {/* Queue Metrics */}
        <div className="bg-bg-secondary border border-border-primary rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-border-primary pb-2.5">
            <h2 className="text-xs font-bold text-text-primary uppercase tracking-wider flex items-center gap-1.5">
              <Layers size={13} className="text-accent-green" />
              Async Queue Metrics
            </h2>
            <span className="text-[9px] font-bold text-accent-green bg-accent-green/10 px-1.5 py-0.5 rounded">
              WORKERS
            </span>
          </div>
          {healthData.queues.enabled && healthData.queues.queues ? (
            <div className="space-y-3">
              {Object.keys(healthData.queues.queues).map((qName) => {
                const q = healthData.queues.queues![qName];
                return (
                  <div key={qName} className="bg-bg-tertiary border border-border-primary rounded-md p-2.5 space-y-1.5">
                    <div className="flex items-center justify-between font-bold text-text-primary capitalize">
                      <span>{qName} Queue</span>
                      <span className="text-[9px] bg-accent-green/10 text-accent-green px-1.5 py-0.2 rounded font-mono">
                        Active
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-1 text-[10px] text-center font-mono">
                      <div className="bg-bg-secondary p-1 rounded border border-border-primary/50">
                        <div className="text-text-tertiary text-[8px]">WAIT</div>
                        <div className="font-bold text-text-primary">{q.waiting}</div>
                      </div>
                      <div className="bg-bg-secondary p-1 rounded border border-border-primary/50">
                        <div className="text-text-tertiary text-[8px]">ACTIVE</div>
                        <div className="font-bold text-accent-blue">{q.active}</div>
                      </div>
                      <div className="bg-bg-secondary p-1 rounded border border-border-primary/50">
                        <div className="text-text-tertiary text-[8px]">DONE</div>
                        <div className="font-bold text-accent-green">{q.completed}</div>
                      </div>
                      <div className="bg-bg-secondary p-1 rounded border border-border-primary/50">
                        <div className="text-text-tertiary text-[8px]">FAIL</div>
                        <div className={`font-bold ${q.failed > 0 ? 'text-accent-red' : 'text-text-tertiary'}`}>
                          {q.failed}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-text-tertiary text-xs">
              Background queue workers are currently operating in inline fallback mode.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
