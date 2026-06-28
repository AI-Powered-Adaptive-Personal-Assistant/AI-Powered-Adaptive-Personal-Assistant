import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const SIGNS_RE = /^\[Signs:\s(.+)\]$/;

/**
 * Renders an AI message as proper Markdown (GitHub-flavored: bold, lists,
 * tables, code, links) while preserving the app's `[Signs: 🤟👋]` accessibility
 * block, which is pulled out and rendered as a sign-translation panel for
 * deaf / hard-of-hearing users instead of being markdown-ed away.
 */
export default function MarkdownMessage({ content }: { content: string }) {
  const signLines: string[] = [];
  const body = content
    .split('\n')
    .filter((line) => {
      const m = line.match(SIGNS_RE);
      if (m) {
        signLines.push(m[1]);
        return false;
      }
      return true;
    })
    .join('\n');

  return (
    <div className="adaptive-response">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ node, ...p }: any) => <h2 className="text-xl font-bold text-primary border-b-2 border-primary/5 pb-1 mb-2 pt-4" {...p} />,
          h2: ({ node, ...p }: any) => <h2 className="text-xl font-bold text-primary border-b-2 border-primary/5 pb-1 mb-2 pt-4" {...p} />,
          h3: ({ node, ...p }: any) => <h3 className="text-lg font-bold text-text-main mb-2 pt-3" {...p} />,
          p: ({ node, ...p }: any) => <p className="mb-4 leading-relaxed" {...p} />,
          ul: ({ node, ...p }: any) => <ul className="list-disc ms-6 mb-4 space-y-1 marker:text-primary" {...p} />,
          ol: ({ node, ...p }: any) => <ol className="list-decimal ms-6 mb-4 space-y-1 marker:text-primary" {...p} />,
          li: ({ node, ...p }: any) => <li className="leading-relaxed" {...p} />,
          a: ({ node, ...p }: any) => <a className="text-primary underline underline-offset-2 hover:text-blue-700" target="_blank" rel="noreferrer" {...p} />,
          strong: ({ node, ...p }: any) => <strong className="font-bold text-text-main" {...p} />,
          em: ({ node, ...p }: any) => <em className="italic" {...p} />,
          hr: ({ node, ...p }: any) => <hr className="my-4 border-border" {...p} />,
          blockquote: ({ node, ...p }: any) => <blockquote className="border-s-4 border-primary/30 ps-4 italic text-text-muted my-4" {...p} />,
          pre: ({ node, ...p }: any) => <pre className="bg-slate-900 text-slate-100 rounded-xl p-4 overflow-x-auto text-sm my-4 custom-scrollbar" {...p} />,
          code: ({ node, className, children, ...p }: any) => {
            const isBlock = (className && className.includes('language-')) || String(children).includes('\n');
            return isBlock ? (
              <code className={`font-mono ${className || ''}`} {...p}>{children}</code>
            ) : (
              <code className="px-1.5 py-0.5 rounded bg-surface-3 text-rose-600 text-[0.85em] font-mono" {...p}>{children}</code>
            );
          },
          table: ({ node, ...p }: any) => <div className="overflow-x-auto my-4"><table className="w-full text-sm border-collapse" {...p} /></div>,
          th: ({ node, ...p }: any) => <th className="border border-border bg-surface-2 px-3 py-2 text-start font-bold" {...p} />,
          td: ({ node, ...p }: any) => <td className="border border-border px-3 py-2" {...p} />,
        }}
      >
        {body}
      </ReactMarkdown>

      {signLines.map((emojis, i) => (
        <div key={i} className="flex flex-col gap-2 mt-4 pt-4 border-t border-border not-italic">
          <span className="text-[10px] font-black uppercase text-faint tracking-widest">Sign Translation</span>
          <span className="text-3xl bg-surface-2 border border-border p-3 rounded-xl inline-flex w-max">{emojis}</span>
        </div>
      ))}
    </div>
  );
}
