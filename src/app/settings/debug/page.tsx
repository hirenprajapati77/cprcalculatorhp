'use client';
import { useEffect, useState } from 'react';
import { notFound } from 'next/navigation';

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

  useEffect(() => {
    // Basic check for dev mode or explicit env flag
    if (process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_ENABLE_DEBUG_PANEL !== 'true') {
      return notFound();
    }
    
    const fetchHealth = async () => {
      try {
        const res = await fetch('/api/health');
        if (res.ok) setHealthData(await res.json());
      } catch (e) {
        console.error(e);
      }
    };
    
    fetchHealth();
    const interval = setInterval(fetchHealth, 5000);
    return () => clearInterval(interval);
  }, []);

  if (!healthData) return <div className="p-8 text-text-secondary">Loading debug metrics...</div>;

  return (
    <div className="p-8 font-mono space-y-6">
      <h1 className="text-2xl font-bold text-accent-blue">Performance Debug Panel</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="bg-bg-secondary border border-border-primary rounded-lg p-4">
          <h2 className="text-accent-amber font-bold mb-4">System Details</h2>
          <div className="space-y-2 text-sm text-text-secondary">
            <p>Version: <span className="text-text-primary">{healthData.version}</span></p>
            <p>Env: <span className="text-text-primary">{healthData.environment}</span></p>
            <p>Build: <span className="text-text-primary">{healthData.build}</span></p>
            <p>Uptime: <span className="text-text-primary">{Math.floor(healthData.uptime)}s</span></p>
          </div>
        </div>
        
        <div className="bg-bg-secondary border border-border-primary rounded-lg p-4">
          <h2 className="text-accent-purple font-bold mb-4">Cache Status</h2>
          <div className="space-y-2 text-sm text-text-secondary">
            <p>Provider: <span className="text-text-primary">{healthData.cache.provider}</span></p>
            <p>Redis Connected: <span className={healthData.cache.redisConnected ? 'text-accent-green' : 'text-accent-red'}>{healthData.cache.redisConnected ? 'Yes' : 'No'}</span></p>
            <p>Memory Keys: <span className="text-text-primary">{healthData.cache.memoryUsage?.size} / {healthData.cache.memoryUsage?.max}</span></p>
          </div>
        </div>

        <div className="bg-bg-secondary border border-border-primary rounded-lg p-4">
          <h2 className="text-accent-green font-bold mb-4">Queue Metrics</h2>
          {healthData.queues.enabled ? (
            <div className="space-y-4 text-sm text-text-secondary">
              {Object.keys(healthData.queues.queues || {}).map((qName) => (
                <div key={qName} className="border-b border-border-primary/50 pb-2">
                  <p className="font-bold text-text-primary capitalize">{qName} Queue</p>
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    <p>Waiting: {(healthData.queues.queues || {})[qName].waiting}</p>
                    <p>Active: {(healthData.queues.queues || {})[qName].active}</p>
                    <p>Completed: {(healthData.queues.queues || {})[qName].completed}</p>
                    <p className="text-accent-red">Failed: {(healthData.queues.queues || {})[qName].failed}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-text-secondary">Queues are currently disabled.</p>
          )}
        </div>
      </div>
    </div>
  );
}
