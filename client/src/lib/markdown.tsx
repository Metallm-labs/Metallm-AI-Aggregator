import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { useEffect, useRef, useState } from "react";

interface MarkdownRendererProps {
    content: string;
}

// ── Mermaid block ────────────────────────────────────────────────────────────
function MermaidBlock({ chart }: { chart: string }) {
    const [svg, setSvg] = useState<string>("");
    const [error, setError] = useState<string>("");
    const idRef = useRef(`mermaid-${Math.random().toString(36).slice(2)}`);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const mermaid = (await import("mermaid")).default;
                mermaid.initialize({
                    startOnLoad: false,
                    theme: "dark",
                    themeVariables: {
                        darkMode: true,
                        background: "transparent",
                        primaryColor: "#6366f1",
                        primaryTextColor: "#e2e8f0",
                        primaryBorderColor: "#4f46e5",
                        lineColor: "#94a3b8",
                        secondaryColor: "#1e293b",
                        tertiaryColor: "#0f172a",
                        edgeLabelBackground: "#1e293b",
                        fontFamily: "ui-sans-serif, system-ui, sans-serif",
                    },
                    flowchart: { useMaxWidth: true, htmlLabels: true },
                });
                const { svg: rendered } = await mermaid.render(idRef.current, chart.trim());
                if (!cancelled) setSvg(rendered);
            } catch (e: any) {
                if (!cancelled) setError(e?.message || "Diagram render failed");
            }
        })();
        return () => { cancelled = true; };
    }, [chart]);

    if (error) {
        return (
            <div className="my-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs">
                <p className="text-red-400 font-medium mb-1">Diagram error: {error}</p>
                <pre className="text-red-300/60 whitespace-pre-wrap overflow-x-auto">{chart}</pre>
            </div>
        );
    }

    if (!svg) {
        return (
            <div className="my-3 p-3 rounded-lg bg-white/5 border border-white/10 text-xs text-muted-foreground flex items-center gap-2">
                <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin inline-block" />
                Rendering diagram…
            </div>
        );
    }

    return (
        <div
            className="my-4 p-4 rounded-xl bg-white/[0.03] border border-white/10 overflow-x-auto [&_svg]:max-w-full [&_svg]:h-auto"
            dangerouslySetInnerHTML={{ __html: svg }}
        />
    );
}
// ─────────────────────────────────────────────────────────────────────────────

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
    return (
        <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
                code({ node, inline, className, children, ...props }: any) {
                    const match = /language-(\w+)/.exec(className || "");
                    const lang = match?.[1];

                    // Mermaid diagrams
                    if (!inline && lang === "mermaid") {
                        return <MermaidBlock chart={String(children).replace(/\n$/, "")} />;
                    }

                    return !inline && lang ? (
                        <SyntaxHighlighter
                            style={oneDark}
                            language={lang}
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
