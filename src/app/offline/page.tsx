'use client';

import { WifiOff, Home } from 'lucide-react';
import Link from 'next/link';

export default function OfflinePage() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center min-h-[80vh] px-4 text-center">
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-full p-6 mb-6">
        <WifiOff className="w-12 h-12 text-zinc-500" />
      </div>
      
      <h1 className="text-2xl font-bold tracking-tight text-zinc-100 mb-3">
        You are offline
      </h1>
      
      <p className="text-zinc-400 max-w-md mx-auto mb-8">
        It looks like you&apos;ve lost your internet connection. Live market data, scanning, and journaling require an active connection.
      </p>

      <div className="flex items-center gap-4">
        <Link 
          href="/dashboard"
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-lg font-medium transition-colors"
        >
          <Home className="w-4 h-4" />
          View Cached Dashboard
        </Link>
        <button 
          onClick={() => {
            if (typeof window !== 'undefined') window.location.reload();
          }}
          className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-5 py-2.5 rounded-lg font-medium transition-colors"
        >
          Try Again
        </button>
      </div>

      <div className="mt-12 text-xs text-zinc-600">
        CPR Trading Platform (Offline Mode)
      </div>
    </div>
  );
}
