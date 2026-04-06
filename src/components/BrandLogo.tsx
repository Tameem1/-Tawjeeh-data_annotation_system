import { cn } from "@/lib/utils";

type BrandLogoProps = {
  className?: string;
  imageClassName?: string;
  alt?: string;
};

export function BrandLogo({
  className,
  imageClassName,
  alt = "Tawjeeh AI logo",
}: BrandLogoProps) {
  return (
    <div className={cn("flex items-center justify-center", className)}>
      <img
        src="/tawjeeh-ai-logo.png"
        alt={alt}
        className={cn("h-full w-full object-contain", imageClassName)}
      />
    </div>
  );
}
