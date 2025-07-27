interface InkDropSwatchProps {
  color: string;
  size?: "sm" | "md" | "lg";
  selected?: boolean;
  onClick?: () => void;
  className?: string;
}

export default function InkDropSwatch({ 
  color, 
  size = "md", 
  selected = false, 
  onClick, 
  className = "" 
}: InkDropSwatchProps) {
  const sizeClasses = {
    sm: "w-8 h-8",
    md: "w-12 h-12",
    lg: "w-16 h-16"
  };

  return (
    <div
      className={`${sizeClasses[size]} cursor-pointer transition-all duration-200 hover:scale-110 ${
        selected ? "ring-2 ring-offset-2 ring-blue-500" : ""
      } ${className}`}
      onClick={onClick}
      style={{ filter: selected ? "drop-shadow(0 4px 8px rgba(0,0,0,0.3))" : "" }}
    >
      <svg
        viewBox="0 0 100 100"
        className="w-full h-full"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Main ink drop shape */}
        <path
          d="M50 5 
             C55 15, 65 25, 70 35
             C75 45, 75 55, 70 65
             C65 75, 55 85, 50 90
             C45 85, 35 75, 30 65
             C25 55, 25 45, 30 35
             C35 25, 45 15, 50 5 Z
             
             M58 12
             C60 18, 65 22, 68 28
             C68 28, 70 30, 68 32
             C66 30, 62 28, 58 24
             
             M42 20
             C38 24, 35 28, 32 34
             C30 34, 28 32, 30 30
             C32 28, 38 24, 42 20
             
             M75 40
             C78 42, 80 45, 82 48
             C82 50, 80 52, 78 50
             C76 48, 74 44, 72 42
             C72 40, 74 38, 76 40
             
             M25 50
             C22 52, 18 55, 15 58
             C13 58, 11 56, 13 54
             C15 52, 19 48, 23 46
             C25 46, 27 48, 25 50"
          fill={color}
          stroke={selected ? "#3B82F6" : "rgba(0,0,0,0.1)"}
          strokeWidth={selected ? "1.5" : "0.5"}
        />
        
        {/* Ink splashes around the main drop */}
        <circle cx="20" cy="25" r="3" fill={color} opacity="0.8" />
        <circle cx="82" cy="30" r="2" fill={color} opacity="0.6" />
        <circle cx="15" cy="70" r="2.5" fill={color} opacity="0.7" />
        <circle cx="85" cy="75" r="1.5" fill={color} opacity="0.5" />
        <circle cx="25" cy="85" r="2" fill={color} opacity="0.6" />
        <circle cx="75" cy="15" r="1.5" fill={color} opacity="0.4" />
        
        {/* Small droplets */}
        <ellipse cx="12" cy="40" rx="1.5" ry="2" fill={color} opacity="0.5" />
        <ellipse cx="88" cy="55" rx="1" ry="1.5" fill={color} opacity="0.4" />
        <ellipse cx="35" cy="10" rx="1" ry="1.5" fill={color} opacity="0.3" />
        <ellipse cx="90" cy="85" rx="1.5" ry="1" fill={color} opacity="0.4" />
        
        {/* Highlight effect on main drop */}
        <ellipse 
          cx="45" 
          cy="25" 
          rx="8" 
          ry="12" 
          fill="rgba(255,255,255,0.3)" 
          transform="rotate(-15 45 25)"
        />
      </svg>
    </div>
  );
}