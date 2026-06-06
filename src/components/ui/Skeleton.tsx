import React from 'react';

export const Skeleton: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className = '',
  ...props
}) => {
  return (
    <div
      className={`animate-pulse rounded bg-bg-tertiary/75 ${className}`}
      {...props}
    />
  );
};

export default Skeleton;
