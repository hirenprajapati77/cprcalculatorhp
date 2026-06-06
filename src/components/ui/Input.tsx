import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, className = '', ...props }, ref) => {
    return (
      <div className="flex flex-col w-full gap-1">
        {label && (
          <label className="text-[11px] font-mono font-medium text-text-secondary tracking-wide">
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={`w-full bg-bg-secondary border border-border-secondary hover:border-border-tertiary focus:border-accent-blue rounded px-3.5 py-2 text-sm font-mono text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-blue/30 transition-all placeholder:text-text-tertiary/60 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
            error ? 'border-accent-red/70 focus:border-accent-red focus:ring-accent-red/30' : ''
          } ${className}`}
          {...props}
        />
        {error && (
          <span className="text-[10px] font-mono text-accent-red mt-0.5 font-medium leading-none">
            {error}
          </span>
        )}
        {!error && helperText && (
          <span className="text-[10px] font-mono text-text-tertiary mt-0.5">
            {helperText}
          </span>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
export default Input;
