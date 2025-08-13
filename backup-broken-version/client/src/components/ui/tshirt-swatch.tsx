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
        {/* Main t-shirt body */}
        <path
          d="M30 25 L25 20 Q23 18 21 20 L18 25 L18 35 Q18 37 20 38 L25 40 L25 85 Q25 87 27 87 L73 87 Q75 87 75 85 L75 40 L80 38 Q82 37 82 35 L82 25 L79 20 Q77 18 75 20 L70 25 L70 18 Q70 15 67 15 L33 15 Q30 15 30 18 L30 25 Z"
          fill={color}
          stroke="#6b7280"
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        
        {/* Neck opening - realistic curve */}
        <path
          d="M42 15 Q42 10 50 10 Q58 10 58 15 L58 22 Q58 25 55 25 L45 25 Q42 25 42 22 L42 15 Z"
          fill="white"
          stroke="#6b7280"
          strokeWidth="1"
          strokeLinejoin="round"
        />
        
        {/* Sleeve details */}
        <path
          d="M25 25 Q20 30 20 35"
          stroke="#9ca3af"
          strokeWidth="0.8"
          fill="none"
          opacity="0.6"
        />
        <path
          d="M75 25 Q80 30 80 35"
          stroke="#9ca3af"
          strokeWidth="0.8"
          fill="none"
          opacity="0.6"
        />
        
        {/* Body seam line */}
        <line
          x1="30"
          y1="25"
          x2="30"
          y2="85"
          stroke="#9ca3af"
          strokeWidth="0.5"
          opacity="0.4"
        />
        <line
          x1="70"
          y1="25"
          x2="70"
          y2="85"
          stroke="#9ca3af"
          strokeWidth="0.5"
          opacity="0.4"
        />
      </svg>
    </button>
  );
};

export default TShirtSwatch;