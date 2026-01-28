import BLACK_100 from '@/assets/ink-splash-svgs/BLACK_100.svg';
import WHITE_90 from '@/assets/ink-splash-svgs/WHITE_90.svg';
import GREY_155 from '@/assets/ink-splash-svgs/GREY_155.svg';
import GREY_156 from '@/assets/ink-splash-svgs/GREY_156.svg';
import VIOLET_10 from '@/assets/ink-splash-svgs/VIOLET_10.svg';
import BLUE_20 from '@/assets/ink-splash-svgs/BLUE_20.svg';
import BLUE_22 from '@/assets/ink-splash-svgs/BLUE_22.svg';
import BLUE_24 from '@/assets/ink-splash-svgs/BLUE_24.svg';
import BLUE_26 from '@/assets/ink-splash-svgs/BLUE_26.svg';
import BLUE_27 from '@/assets/ink-splash-svgs/BLUE_27.svg';
import NAVY from '@/assets/ink-splash-svgs/NAVY.svg';
import GREEN_30 from '@/assets/ink-splash-svgs/GREEN_30.svg';
import GREEN_31 from '@/assets/ink-splash-svgs/GREEN_31.svg';
import GREEN_32 from '@/assets/ink-splash-svgs/GREEN_32.svg';
import GREEN_33 from '@/assets/ink-splash-svgs/GREEN_33.svg';
import GREEN_34 from '@/assets/ink-splash-svgs/GREEN_34.svg';
import YELLOW_40 from '@/assets/ink-splash-svgs/YELLOW_40.svg';
import YELLOW_41 from '@/assets/ink-splash-svgs/YELLOW_41.svg';
import YELLOW_42 from '@/assets/ink-splash-svgs/YELLOW_42.svg';
import ORANGE_50 from '@/assets/ink-splash-svgs/ORANGE_50.svg';
import ORANGE_51 from '@/assets/ink-splash-svgs/ORANGE_51.svg';
import RED_56 from '@/assets/ink-splash-svgs/RED_56.svg';
import RED_60 from '@/assets/ink-splash-svgs/RED_60.svg';
import RED_61 from '@/assets/ink-splash-svgs/RED_61.svg';
import PINK_70 from '@/assets/ink-splash-svgs/PINK_70.svg';
import BROWN_80 from '@/assets/ink-splash-svgs/BROWN_80.svg';
import BROWN_81 from '@/assets/ink-splash-svgs/BROWN_81.svg';
import GOLD_120 from '@/assets/ink-splash-svgs/GOLD_120.svg';
import SILVER_110 from '@/assets/ink-splash-svgs/SILVER_110.svg';

const otCodeToSvg: Record<string, string> = {
  'OT 91': WHITE_90,
  'OT 100': BLACK_100,
  'OT 155': GREY_155,
  'OT 156': GREY_156,
  'OT 10': VIOLET_10,
  'OT 20': BLUE_20,
  'OT 22': BLUE_22,
  'OT 24': BLUE_24,
  'OT 26': BLUE_26,
  'OT 27': BLUE_27,
  'OT 96': NAVY,
  'OT 30': GREEN_30,
  'OT 31': GREEN_31,
  'OT 32': GREEN_32,
  'OT 33': GREEN_33,
  'OT 34': GREEN_34,
  'OT 40': YELLOW_40,
  'OT 41': YELLOW_41,
  'OT 42': YELLOW_42,
  'OT 50': ORANGE_50,
  'OT 51': ORANGE_51,
  'OT 56': RED_56,
  'OT 60': RED_60,
  'OT 61': RED_61,
  'OT 70': PINK_70,
  'OT 80': BROWN_80,
  'OT 81': BROWN_81,
  'OT 120': GOLD_120,
  'OT 110': SILVER_110,
};

interface InkDropSwatchProps {
  color: string;
  colorName: string;
  isSelected: boolean;
  onClick: () => void;
  otCode?: string;
  variant?: 'drop1' | 'drop2' | 'drop3';
}

export default function InkDropSwatch({ 
  color, 
  colorName, 
  isSelected, 
  onClick, 
  otCode,
  variant = 'drop1' 
}: InkDropSwatchProps) {
  const svgSrc = otCode ? otCodeToSvg[otCode] : undefined;

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
      {svgSrc ? (
        <img 
          src={svgSrc} 
          alt={colorName}
          width={80}
          height={80}
          className="drop-shadow-md"
        />
      ) : (
        <FallbackDroplet color={color} colorName={colorName} variant={variant} />
      )}
      
      {isSelected && (
        <div className="absolute -top-1 -right-1 w-4 h-4 bg-[#922168] rounded-full flex items-center justify-center">
          <div className="w-2 h-2 bg-white rounded-full"></div>
        </div>
      )}
    </div>
  );
}

function FallbackDroplet({ color, colorName, variant }: { color: string; colorName: string; variant: string }) {
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
    <svg 
      width="80" 
      height="80" 
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
  );
}
