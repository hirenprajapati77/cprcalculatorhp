import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  icon?: React.ReactNode;
  headerAction?: React.ReactNode;
  glow?: 'green' | 'red' | 'blue' | 'none';
}

export const Card: React.FC<CardProps> = ({
  children,
  title,
  icon,
  headerAction,
  glow = 'none',
  className = '',
  ...props
}) => {
  const glowClasses = {
    green: 'hover:shadow-[0_0_15px_rgba(16,185,129,0.08)] hover:border-accent-green/30',
    red: 'hover:shadow-[0_0_15px_rgba(239,68,68,0.08)] hover:border-accent-red/30',
    blue: 'hover:shadow-[0_0_15px_rgba(59,130,246,0.08)] hover:border-accent-blue/30',
    none: '',
  };

  return (
    <div
      className={`bg-bg-primary border border-border-primary hover:border-border-secondary rounded-lg p-4 transition-all duration-300 ${glowClasses[glow]} ${className}`}
      {...props}
    >
      {(title || icon || headerAction) && (
        <div className="flex items-center justify-between border-b border-border-primary pb-3 mb-3.5">
          <div className="flex items-center gap-2">
            {icon && <span className="text-accent-blue flex items-center">{icon}</span>}
            {title && (
              <h3 className="text-[10px] font-mono font-medium text-text-tertiary uppercase tracking-wider">
                {title}
              </h3>
            )}
          </div>
          {headerAction && <div className="flex items-center">{headerAction}</div>}
        </div>
      )}
      <div>{children}</div>
    </div>
  );
};

export default Card;
