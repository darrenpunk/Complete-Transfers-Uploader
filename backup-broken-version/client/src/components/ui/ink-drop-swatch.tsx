interface InkDropSwatchProps {
  color: string;
  colorName: string;
  isSelected: boolean;
  onClick: () => void;
  variant?: 'drop1' | 'drop2' | 'drop3';
}

export default function InkDropSwatch({ 
  color, 
  colorName, 
  isSelected, 
  onClick, 
  variant = 'drop1' 
}: InkDropSwatchProps) {
  // Three different ink drop path variants extracted from the PDF
  const getPathData = () => {
    switch (variant) {
      case 'drop1':
        return "M2029 2562 c-118 -185 -289 -475 -289 -489 0 -5 43 -81 96 -168 115 -191 251 -465 292 -590 36 -110 54 -218 46 -279 l-7 -46 36 0 c56 0 188 46 253 88 76 50 171 151 210 227 70 132 82 302 33 450 -33 99 -209 445 -311 610 -119 192 -231 359 -243 362 -5 1 -58 -73 -116 -165z";
      case 'drop2':
        return "M1392 2168 c-58 -88 -218 -346 -296 -481 l-57 -97 59 -98 c87 -143 216 -394 256 -497 51 -132 70 -239 63 -354 -3 -53 -9 -106 -12 -119 -7 -21 -5 -22 60 -22 256 0 485 187 551 450 22 85 15 221 -15 310 -33 98 -167 368 -260 523 -85 142 -289 457 -296 457 -3 0 -26 -33 -53 -72z";
      case 'drop3':
        return "M669 1827 c-46 -64 -290 -457 -350 -564 -103 -184 -193 -404 -214 -524 -9 -47 12 -189 36 -254 28 -76 110 -187 182 -246 107 -90 216 -129 362 -129 173 0 296 51 420 175 132 131 182 256 172 430 -7 114 -42 217 -143 417 -108 213 -419 719 -441 718 -4 0 -15 -11 -24 -23z";
      default:
        return "M2029 2562 c-118 -185 -289 -475 -289 -489 0 -5 43 -81 96 -168 115 -191 251 -465 292 -590 36 -110 54 -218 46 -279 l-7 -46 36 0 c56 0 188 46 253 88 76 50 171 151 210 227 70 132 82 302 33 450 -33 99 -209 445 -311 610 -119 192 -231 359 -243 362 -5 1 -58 -73 -116 -165z";
    }
  };

  return (
    <div
      className={`relative cursor-pointer transition-all duration-200 hover:scale-110 ${
        isSelected 
          ? 'ring-4 ring-[#922168] ring-offset-2 ring-offset-white dark:ring-offset-gray-900 scale-105' 
          : 'hover:ring-2 hover:ring-[#922168]/50 hover:ring-offset-1 hover:ring-offset-white dark:hover:ring-offset-gray-900'
      }`}
      onClick={onClick}
      title={colorName}
    >
      <svg 
        width="48" 
        height="48" 
        viewBox="0 0 283 283" 
        className="drop-shadow-md"
      >
        <g transform="translate(0,283) scale(0.1,-0.1)">
          <path 
            d={getPathData()}
            fill={color}
            stroke={color === '#FFFFFF' || color === '#F8F8FF' ? '#E5E7EB' : 'none'}
            strokeWidth={color === '#FFFFFF' || color === '#F8F8FF' ? '20' : '0'}
          />
        </g>
        
        {/* Highlight effect for realistic ink appearance */}
        <defs>
          <radialGradient id={`highlight-${colorName?.replace(/\s+/g, '-') || 'default'}`} cx="0.3" cy="0.3" r="0.6">
            <stop offset="0%" stopColor="rgba(255,255,255,0.4)" />
            <stop offset="70%" stopColor="rgba(255,255,255,0.1)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0.05)" />
          </radialGradient>
        </defs>
        
        <g transform="translate(0,283) scale(0.1,-0.1)">
          <path 
            d={getPathData()}
            fill={`url(#highlight-${colorName?.replace(/\s+/g, '-') || 'default'})`}
          />
        </g>
      </svg>
      
      {/* Selection indicator */}
      {isSelected && (
        <div className="absolute -top-1 -right-1 w-4 h-4 bg-[#922168] rounded-full flex items-center justify-center">
          <div className="w-2 h-2 bg-white rounded-full"></div>
        </div>
      )}
    </div>
  );
}