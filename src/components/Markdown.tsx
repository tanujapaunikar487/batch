import { memo, useState } from "react";
import { Check, Copy } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { native } from "@/lib/native";
import { isTauri } from "@/store/persistence";
import { cn } from "@/lib/utils";

/** Compact GFM renderer for note bodies. Links open in the system browser. */
export const Markdown = memo(function Markdown({ text, className }: { text: string; className?: string }) {
  return (
    <div className={cn("md", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a
              href={href}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!href) return;
                if (isTauri()) void native.openUrl(href);
                else window.open(href, "_blank", "noopener");
              }}
              title={href}
            >
              {children}
            </a>
          ),
          // Checkbox syntax in GFM renders disabled inputs; keep them inert & tiny.
          input: (props) => <input {...props} disabled className="mr-1 align-middle" />,
          pre: ({ children, ...props }) => <CodeBlock {...props}>{children}</CodeBlock>,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
});

/** <pre> with a hover copy button (copies the raw code text). */
function CodeBlock({ children, ...props }: React.ComponentProps<"pre">) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="group/code relative">
      <pre {...props}>{children}</pre>
      <button
        type="button"
        aria-label="Copy code"
        onClick={async (e) => {
          e.stopPropagation();
          const text = (e.currentTarget.previousElementSibling as HTMLElement | null)?.innerText ?? "";
          try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1200);
          } catch {
            /* ignore */
          }
        }}
        className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-md bg-background/80 text-muted-foreground opacity-0 shadow-sm transition-opacity hover:text-foreground group-hover/code:opacity-100"
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </button>
    </div>
  );
}
