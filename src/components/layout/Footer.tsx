import React from 'react';

export const Footer: React.FC = () => {
  return (
    <footer className="w-full bg-bg-secondary border-t border-border-primary py-3.5 px-4 font-mono text-[10px] text-text-tertiary select-none">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-2">
        <div>
          &copy; {new Date().getFullYear()} CPR PRO Platform. Designed for advanced technical analysis.
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-accent-green animate-pulse" />
            Terminal: Online
          </span>
          <span className="text-border-tertiary">|</span>
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-accent-green" />
            Database: PostgreSQL
          </span>
          <span className="text-border-tertiary">|</span>
          <span>Feed: Realtime</span>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
