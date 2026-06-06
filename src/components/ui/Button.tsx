import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'secondary',
  size = 'md',
  className = '',
  ...props
}) => {
  const baseStyles =
    'inline-flex items-center justify-center gap-2 font-mono font-medium rounded transition-all focus:outline-none focus:ring-1 active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none cursor-pointer border border-border-secondary';

  const variants = {
    primary:
      'bg-accent-blue hover:bg-accent-blue/90 border-accent-blue text-white focus:ring-accent-blue shadow-[0_0_10px_rgba(59,130,246,0.2)]',
    secondary:
      'bg-bg-secondary hover:bg-bg-tertiary border-border-secondary text-text-primary focus:ring-border-tertiary',
    danger:
      'bg-accent-red/10 hover:bg-accent-red/20 border-accent-red/30 hover:border-accent-red/50 text-accent-red focus:ring-accent-red',
    ghost:
      'bg-transparent hover:bg-bg-secondary border-transparent text-text-secondary hover:text-text-primary focus:ring-border-primary border-none active:scale-100',
  };

  const sizes = {
    sm: 'px-2.5 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base',
  };

  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};

export default Button;
