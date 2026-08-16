import { cn } from "@/lib/utils";

/** The Batch mark (src-tauri/icons/src/logo.svg), drawn in currentColor. */
export function Logo({ className, ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 332 332" fill="currentColor" aria-hidden className={cn("size-4", className)} {...props}>
      <rect width="100" height="332" rx="12" />
      <rect x="111" width="221" height="100" rx="12" />
      <rect x="111" y="116" width="221" height="100" rx="12" />
      <rect x="111" y="232" width="221" height="100" rx="12" />
    </svg>
  );
}
