import React from 'react';

interface TShirtSwatchProps {
  color: string;
  size?: 'sm' | 'md' | 'lg';
  selected?: boolean;
  onClick?: () => void;
  className?: string;
}

const TShirtSwatch: React.FC<TShirtSwatchProps> = ({ 
  color, 
  size = 'md', 
  selected = false, 
  onClick,
  className = ''
}) => {
  const sizeClasses = {
    sm: 'w-6 h-6',
    md: 'w-10 h-10', 
    lg: 'w-12 h-12'
  };

  const ringSize = {
    sm: 'ring-1',
    md: 'ring-2',
    lg: 'ring-2'
  };

  return (
    <button
      className={`${sizeClasses[size]} hover:scale-105 transition-transform cursor-pointer ${
        selected 
          ? `${ringSize[size]} ring-primary ring-offset-2` 
          : 'hover:ring-2 hover:ring-gray-300 hover:ring-offset-1'
      } ${className}`}
      onClick={onClick}
      style={{ filter: 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.1))' }}
    >
      <svg
        viewBox="0 0 100 100"
        className="w-full h-full"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* T-shirt shape */}
        <path
          d="M25 30 L15 25 L15 45 L25 40 L25 85 L75 85 L75 40 L85 45 L85 25 L75 30 L75 20 L65 15 L35 15 L25 20 Z"
          fill={color}
          stroke="#e5e7eb"
          strokeWidth="1"
        />
        
        {/* Neck opening */}
        <ellipse
          cx="50"
          cy="22"
          rx="8"
          ry="6"
          fill="white"
          stroke="#e5e7eb"
          strokeWidth="0.5"
        />
      </svg>
    </button>
  );
};

export default TShirtSwatch;