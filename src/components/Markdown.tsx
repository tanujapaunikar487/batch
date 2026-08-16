import { memo } from "react";
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
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
});
