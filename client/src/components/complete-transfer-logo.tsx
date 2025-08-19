import completeTransfersLogoPath from "@assets/Artboard 1@4x_1753539065182.png";

interface CompleteTransferLogoProps {
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
}

export function CompleteTransferLogo({ size = "md", className = "" }: CompleteTransferLogoProps) {
  const sizeClasses = {
    xs: "h-5",
    sm: "h-8",
    md: "h-12", 
    lg: "h-16",
    xl: "h-20"
  };

  return (
    <div className={`flex items-center justify-center ${className}`}>
      <img
        src={completeTransfersLogoPath}
        alt="Complete Transfers - No Mess, Just Press"
        className={`${sizeClasses[size]} object-contain`}
      />
    </div>
  );
}

export default CompleteTransferLogo;