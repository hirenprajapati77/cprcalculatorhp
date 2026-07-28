'use client';

import { useEffect, useState } from 'react';

// Defines the beforeinstallprompt event signature
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed', platform: string }>;
  prompt(): Promise<void>;
}

export default function PwaRegistration() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [swRegistration, setSwRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [showUpdate, setShowUpdate] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      // Register Service Worker
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          setSwRegistration(registration);
          
          // Check for updates
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  // A new update is available and waiting
                  setShowUpdate(true);
                }
              });
            }
          });
        })
        .catch((err) => console.error('[PWA] Service Worker registration failed:', err));

      // Handle subsequent updates if a waiting worker already exists
      navigator.serviceWorker.ready.then((registration) => {
        if (registration.waiting) {
          setShowUpdate(true);
          setSwRegistration(registration);
        }
      });
    }

    // Handle Install Prompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  const handleUpdate = () => {
    if (swRegistration && swRegistration.waiting) {
      swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
      setShowUpdate(false);
      // Reload once the new SW takes control
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
          refreshing = true;
          window.location.reload();
        }
      });
    }
  };

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  };

  return (
    <>
      {showUpdate && (
        <div className="fixed bottom-4 right-4 z-[9999] bg-zinc-900 border border-amber-500/50 p-4 rounded-xl shadow-xl flex flex-col gap-3 max-w-sm animate-in slide-in-from-bottom-5">
          <div className="text-sm text-zinc-100 font-medium">New version available!</div>
          <div className="flex gap-2">
            <button 
              onClick={handleUpdate}
              className="bg-amber-500 hover:bg-amber-600 text-black text-xs px-3 py-1.5 rounded font-semibold transition-colors"
            >
              Update Now
            </button>
            <button 
              onClick={() => setShowUpdate(false)}
              className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs px-3 py-1.5 rounded transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {deferredPrompt && (
        <div className="fixed bottom-4 left-4 z-[9999] bg-zinc-900 border border-blue-500/50 p-4 rounded-xl shadow-xl flex flex-col gap-3 max-w-sm animate-in slide-in-from-bottom-5">
          <div className="text-sm text-zinc-100 font-medium">Install CPR Trading App</div>
          <div className="flex gap-2">
            <button 
              onClick={handleInstall}
              className="bg-blue-600 hover:bg-blue-500 text-white text-xs px-3 py-1.5 rounded font-semibold transition-colors"
            >
              Install
            </button>
            <button 
              onClick={() => setDeferredPrompt(null)}
              className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs px-3 py-1.5 rounded transition-colors"
            >
              Later
            </button>
          </div>
        </div>
      )}
    </>
  );
}
