import { cn } from "@/lib/utils";

/** The Batch mark (src-tauri/icons/src/logo.svg), drawn in currentColor. */
export function Logo({ className, ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 300 300" fill="currentColor" aria-hidden className={cn("size-4", className)} {...props}>
      <rect width="100" height="300" rx="12" />
      <rect x="116" width="184" height="142" rx="12" />
      <rect x="116" y="158" width="184" height="142" rx="12" />
    </svg>
  );
}
