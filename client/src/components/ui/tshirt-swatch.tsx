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
        viewBox="0 0 24 24"
        className="w-full h-full"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Main t-shirt body */}
        <path
          d="M8 4h8v2h2l2 3v3l-2 1v9H6v-9l-2-1V9l2-3h2V4z"
          fill={color}
          stroke="#9ca3af"
          strokeWidth="0.8"
          strokeLinejoin="round"
        />
        
        {/* Neck opening - rounded rectangle */}
        <path
          d="M10 4c0-1 1-2 2-2s2 1 2 2v1h-4V4z"
          fill="white"
          stroke="#9ca3af"
          strokeWidth="0.5"
        />
      </svg>
    </button>
  );
};

export default TShirtSwatch;