import React from 'react';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'green' | 'red' | 'blue' | 'amber' | 'purple' | 'gray';
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'gray',
  className = '',
  ...props
}) => {
  const baseStyles =
    'inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-semibold tracking-wide uppercase border';

  const variants = {
    green: 'bg-accent-green/10 text-accent-green border-accent-green/20',
    red: 'bg-accent-red/10 text-accent-red border-accent-red/20',
    blue: 'bg-accent-blue/10 text-accent-blue border-accent-blue/20',
    amber: 'bg-accent-amber/10 text-accent-amber border-accent-amber/20',
    purple: 'bg-accent-purple/10 text-accent-purple border-accent-purple/20',
    gray: 'bg-bg-tertiary text-text-secondary border-border-tertiary',
  };

  return (
    <span
      className={`${baseStyles} ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
};

export default Badge;
