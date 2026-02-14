import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

interface MarkdownRendererProps {
    content: string;
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
    return (
        <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
                code({ node, inline, className, children, ...props }: any) {
                    const match = /language-(\w+)/.exec(className || "");
                    return !inline && match ? (
                        <SyntaxHighlighter
                            style={oneDark}
                            language={match[1]}
                            PreTag="div"
                            className="rounded-lg !bg-black/40 !my-3"
                            {...props}
                        >
                            {String(children).replace(/\n$/, "")}
                        </SyntaxHighlighter>
                    ) : (
                        <code className="bg-white/10 px-1.5 py-0.5 rounded text-sm" {...props}>
                            {children}
                        </code>
                    );
                },
                table({ children }: any) {
                    return (
                        <div className="overflow-x-auto my-3">
                            <table className="min-w-full border border-white/10 rounded-lg overflow-hidden">
                                {children}
                            </table>
                        </div>
                    );
                },
                thead({ children }: any) {
                    return <thead className="bg-white/5">{children}</thead>;
                },
                th({ children }: any) {
                    return (
                        <th className="px-4 py-2 text-left text-sm font-medium text-white border-b border-white/10">
                            {children}
                        </th>
                    );
                },
                td({ children }: any) {
                    return (
                        <td className="px-4 py-2 text-sm text-muted-foreground border-b border-white/5">
                            {children}
                        </td>
                    );
                },
                h1({ children }: any) {
                    return <h1 className="text-2xl font-bold text-white mt-4 mb-2">{children}</h1>;
                },
                h2({ children }: any) {
                    return <h2 className="text-xl font-semibold text-white mt-3 mb-2">{children}</h2>;
                },
                h3({ children }: any) {
                    return <h3 className="text-lg font-medium text-white mt-2 mb-1">{children}</h3>;
                },
                p({ children }: any) {
                    return <p className="text-gray-100 leading-relaxed mb-3">{children}</p>;
                },
                ul({ children }: any) {
                    return <ul className="list-disc list-inside space-y-2 mb-3 ml-2">{children}</ul>;
                },
                ol({ children }: any) {
                    return <ol className="list-decimal list-inside space-y-2 mb-3 ml-2">{children}</ol>;
                },
                li({ children }: any) {
                    return <li className="text-gray-100 leading-relaxed">{children}</li>;
                },
                blockquote({ children }: any) {
                    return (
                        <blockquote className="border-l-4 border-primary/50 pl-4 italic text-muted-foreground my-3">
                            {children}
                        </blockquote>
                    );
                },
                a({ href, children }: any) {
                    return (
                        <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                            {children}
                        </a>
                    );
                },
                strong({ children }: any) {
                    return <strong className="font-semibold text-white">{children}</strong>;
                },
                em({ children }: any) {
                    return <em className="italic">{children}</em>;
                },
                hr() {
                    return <hr className="border-white/10 my-4" />;
                },
            }}
        >
            {content}
        </ReactMarkdown>
    );
}
