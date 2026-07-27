'use client';

import React, { useState } from 'react';
import { ShieldAlert, Key } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useToast } from '@/components/ui/Toast';

export default function UnlockPage() {
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim()) return;

    setLoading(true);
    try {
      const res = await fetch('/api/auth/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.trim() }),
      });

      if (res.ok) {
        showToast('System unlocked successfully!', 'success');
        // Force browser-level redirect to bypass Next.js Client Router cache
        window.location.href = '/scanner';
      } else {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || 'Invalid access token', 'error');
      }
    } catch {
      showToast('Network error while unlocking', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-grow flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 font-mono text-xs text-slate-300">
      <div className="max-w-md w-full">
        <Card
          title="Security Gated Access"
          icon={<ShieldAlert size={14} className="text-accent-red" />}
          glow="blue"
          className="shadow-2xl relative overflow-hidden"
        >
          <div className="space-y-4 py-2">
            <div className="text-center space-y-1">
              <div className="mx-auto h-10 w-10 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-accent-blue mb-2">
                <Key size={16} />
              </div>
              <h2 className="text-base font-bold text-white uppercase tracking-wider">
                Unlock Quant Platform
              </h2>
              <p className="text-[10px] text-slate-400">
                This system is protected. Enter the system access token to establish a session.
              </p>
            </div>

            <form onSubmit={handleUnlock} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block">
                  Access Token
                </label>
                <input
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Paste APP_ACCESS_TOKEN..."
                  className="w-full bg-bg-secondary border border-border-primary rounded px-3 py-2 text-white font-mono placeholder-slate-600 focus:outline-none focus:border-border-tertiary focus:ring-1 focus:ring-border-tertiary text-xs transition-colors"
                  disabled={loading}
                  required
                />
              </div>

              <Button
                type="submit"
                variant="primary"
                className="w-full justify-center uppercase tracking-wider text-[10px]"
                disabled={loading}
              >
                {loading ? 'Validating...' : 'Unlock System'}
              </Button>
            </form>
          </div>
        </Card>
      </div>
    </div>
  );
}
