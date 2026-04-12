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
    <div className={cn("flex items-center justify-center text-black dark:text-white", className)}>
      <span
        role="img"
        aria-label={alt}
        className={cn("block h-full w-full bg-current", imageClassName)}
        style={{
          WebkitMask: "url('/tawjeeh-ai-logo.png') center / contain no-repeat",
          mask: "url('/tawjeeh-ai-logo.png') center / contain no-repeat",
        }}
      />
    </div>
  );
}
