import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { useEffect, useRef, useState, useCallback } from "react";

interface MarkdownRendererProps {
    content: string;
}

// ── Mermaid sanitizer ─────────────────────────────────────────────────────────
// Fixes the most common AI-generated Mermaid mistakes before handing to the parser
function sanitizeMermaid(raw: string): string {
    let c = raw.trim();

    // Normalize line endings
    c = c.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    // 1. Self-closing <br/> → <br>  (Mermaid only accepts <br>)
    c = c.replace(/<br\s*\/>/g, "<br>");

    // 2. Strip inline HTML tags that Mermaid can't parse (<i>, <b>, <em>, <strong>, <span>)
    //    Keep the inner text, just remove the tag wrappers
    c = c.replace(/<\/?(?:i|em|b|strong|span)[^>]*>/g, "");

    // 3. Literal \n escape inside labels → <br>
    c = c.replace(/\\n/g, "<br>");

    // 4. classDef `class A, B, C style` — spaces after commas break the parser
    c = c.replace(/^(\s*class\s+)([\w\s,]+?)(\s+\w+\s*;?\s*)$/gm, (_m, prefix, ids, suffix) => {
        return prefix + ids.replace(/,\s+/g, ",") + suffix;
    });

    // 5. Remove emoji / non-ASCII from node IDs (they're fine in label text, not in IDs)
    //    Node IDs are the bare identifiers before [ or ( or {
    c = c.replace(/^(\s*)([\w\u4e00-\u9fa5]+)(\[|\(|\{)/gm, (_m, indent, id, bracket) => {
        const cleanId = id.replace(/[^\w]/g, "_");
        return `${indent}${cleanId}${bracket}`;
    });

    // 6. Direction shorthands sometimes come with whitespace issues – normalise
    c = c.replace(/^(flowchart|graph)\s+(TD|LR|TB|RL|BT)\s*$/gm, "$1 $2");

    return c;
}

// ── Mermaid Block with fullscreen + zoom/pan ──────────────────────────────────
function MermaidBlock({ chart }: { chart: string }) {
    const [svg, setSvg] = useState<string>("");
    const [error, setError] = useState<string>("");
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const isPanningRef = useRef(false);
    const panStartRef = useRef({ x: 0, y: 0 });
    const panOriginRef = useRef({ x: 0, y: 0 });
    const idRef = useRef(`mermaid-${Math.random().toString(36).slice(2)}`);

    useEffect(() => {
        let cancelled = false;
        setSvg("");
        setError("");

        (async () => {
            const sanitized = sanitizeMermaid(chart);
            try {
                const mermaid = (await import("mermaid")).default;
                mermaid.initialize({
                    startOnLoad: false,
                    theme: "dark",
                    htmlLabels: true,
                    securityLevel: "loose",   // needed for HTML labels to render
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
                        fontSize: "14px",
                    },
                    flowchart: { useMaxWidth: false, htmlLabels: true, curve: "basis" },
                    sequence: { useMaxWidth: false },
                    gantt: { useMaxWidth: false },
                });
                // Use a unique id every render to avoid stale SVG collisions
                const uid = `mermaid-${Date.now()}-${Math.random().toString(36).slice(2)}`;
                idRef.current = uid;
                const { svg: rendered } = await mermaid.render(uid, sanitized);
                if (!cancelled) setSvg(rendered);
            } catch (e: any) {
                if (cancelled) return;
                // Retry once: strip ALL HTML from labels and try again
                try {
                    const stripped = sanitizeMermaid(chart)
                        .replace(/<[^>]+>/g, " ")          // strip all remaining HTML tags
                        .replace(/\s{2,}/g, " ");            // collapse whitespace
                    const mermaid = (await import("mermaid")).default;
                    const uid2 = `mermaid-retry-${Date.now()}`;
                    idRef.current = uid2;
                    const { svg: rendered } = await mermaid.render(uid2, stripped);
                    if (!cancelled) setSvg(rendered);
                } catch (e2: any) {
                    if (!cancelled) setError(e2?.message ?? e?.message ?? "Diagram render failed");
                }
            }
        })();
        return () => { cancelled = true; };
    }, [chart]);

    // ── Zoom helpers ──────────────────────────────────────────────────────────
    const zoomIn  = useCallback(() => setZoom(z => Math.min(z + 0.25, 5)), []);
    const zoomOut = useCallback(() => setZoom(z => Math.max(z - 0.25, 0.25)), []);
    const resetView = useCallback(() => { setZoom(1); setPan({ x: 0, y: 0 }); }, []);

    // ── Pan helpers (mouse) ───────────────────────────────────────────────────
    const onMouseDown = useCallback((e: React.MouseEvent) => {
        isPanningRef.current = true;
        panStartRef.current = { x: e.clientX, y: e.clientY };
        panOriginRef.current = { x: pan.x, y: pan.y };
        e.preventDefault();
    }, [pan]);

    const onMouseMove = useCallback((e: React.MouseEvent) => {
        if (!isPanningRef.current) return;
        const dx = e.clientX - panStartRef.current.x;
        const dy = e.clientY - panStartRef.current.y;
        setPan({ x: panOriginRef.current.x + dx, y: panOriginRef.current.y + dy });
    }, []);

    const onMouseUp = useCallback(() => { isPanningRef.current = false; }, []);

    // ── Wheel zoom ────────────────────────────────────────────────────────────
    const onWheel = useCallback((e: React.WheelEvent) => {
        e.preventDefault();
        setZoom(z => Math.min(Math.max(z - e.deltaY * 0.001, 0.25), 5));
    }, []);

    // ── Touch pan ─────────────────────────────────────────────────────────────
    const touchStartRef = useRef<{ x: number; y: number } | null>(null);
    const onTouchStart = useCallback((e: React.TouchEvent) => {
        if (e.touches.length === 1) {
            touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            panOriginRef.current = { x: pan.x, y: pan.y };
        }
    }, [pan]);
    const onTouchMove = useCallback((e: React.TouchEvent) => {
        if (e.touches.length === 1 && touchStartRef.current) {
            const dx = e.touches[0].clientX - touchStartRef.current.x;
            const dy = e.touches[0].clientY - touchStartRef.current.y;
            setPan({ x: panOriginRef.current.x + dx, y: panOriginRef.current.y + dy });
        }
    }, []);

    // ── Keyboard shortcuts in fullscreen ─────────────────────────────────────
    useEffect(() => {
        if (!isFullscreen) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") { setIsFullscreen(false); resetView(); }
            if (e.key === "+" || e.key === "=") zoomIn();
            if (e.key === "-") zoomOut();
            if (e.key === "0") resetView();
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [isFullscreen, zoomIn, zoomOut, resetView]);

    // ── Toolbar ───────────────────────────────────────────────────────────────
    const Toolbar = ({ fullscreenMode }: { fullscreenMode: boolean }) => (
        <div className={`flex items-center gap-1 ${fullscreenMode ? "bg-black/60 backdrop-blur-sm rounded-xl px-3 py-1.5" : ""}`}>
            <button
                onClick={zoomOut}
                title="Zoom out  (−)"
                className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm font-bold transition-colors"
            >−</button>
            <button
                onClick={resetView}
                title="Reset view  (0)"
                className="min-w-[46px] h-7 px-1.5 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-mono transition-colors"
            >{Math.round(zoom * 100)}%</button>
            <button
                onClick={zoomIn}
                title="Zoom in  (+)"
                className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm font-bold transition-colors"
            >+</button>
            {!fullscreenMode ? (
                <button
                    onClick={() => { resetView(); setIsFullscreen(true); }}
                    title="Fullscreen"
                    className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/10 hover:bg-primary/40 text-white text-xs transition-colors ml-1"
                >
                    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-current">
                        <path d="M1.5 1h4v1.5h-2.5v2.5h-1.5v-4zm9 0h4v4h-1.5v-2.5h-2.5v-1.5zm-9 9h1.5v2.5h2.5v1.5h-4v-4zm10.5 2.5v-2.5h1.5v4h-4v-1.5h2.5z"/>
                    </svg>
                </button>
            ) : (
                <button
                    onClick={() => { setIsFullscreen(false); resetView(); }}
                    title="Exit fullscreen  (Esc)"
                    className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/10 hover:bg-red-500/40 text-white text-xs transition-colors ml-1"
                >
                    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-current">
                        <path d="M4 1.5h-2.5v2.5h-1.5v-4h4v1.5zm6.5 0v-1.5h4v4h-1.5v-2.5h-2.5zm-6.5 9v-1.5h-2.5v-2.5h-1.5v4h4zm8 0h-4v1.5h4v-4h-1.5v2.5z"/>
                    </svg>
                </button>
            )}
        </div>
    );

    // ── SVG viewport (shared between inline + fullscreen) ─────────────────────
    const SvgViewport = ({ fullscreenMode }: { fullscreenMode: boolean }) => (
        <div
            className={`overflow-hidden ${fullscreenMode ? "w-full flex-1 cursor-grab active:cursor-grabbing" : "w-full cursor-grab active:cursor-grabbing"}`}
            style={{ userSelect: "none" }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            onWheel={onWheel}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
        >
            <div
                style={{
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                    transformOrigin: "top center",
                    transition: isPanningRef.current ? "none" : "transform 0.1s ease",
                }}
                className="[&_svg]:max-w-full [&_svg]:h-auto [&_svg]:mx-auto [&_svg]:block"
                dangerouslySetInnerHTML={{ __html: svg }}
            />
        </div>
    );

    // ── Error state ────────────────────────────────────────────────────────────
    if (error) {
        return (
            <div className="my-3 rounded-xl border border-red-500/20 overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border-b border-red-500/15">
                    <span className="text-red-400 text-xs font-medium">⚠ Diagram parse error</span>
                </div>
                <details className="group">
                    <summary className="cursor-pointer text-xs text-red-400/70 px-3 py-1.5 hover:text-red-400 select-none">
                        Show details
                    </summary>
                    <pre className="text-[11px] text-red-300/50 px-3 pb-3 whitespace-pre-wrap overflow-x-auto leading-relaxed">{error}</pre>
                </details>
                <pre className="text-xs text-muted-foreground/50 px-3 pb-3 whitespace-pre-wrap overflow-x-auto border-t border-white/5 pt-2 leading-relaxed">{chart}</pre>
            </div>
        );
    }

    // ── Loading state ──────────────────────────────────────────────────────────
    if (!svg) {
        return (
            <div className="my-3 p-3 rounded-lg bg-white/5 border border-white/10 text-xs text-muted-foreground flex items-center gap-2">
                <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin inline-block" />
                Rendering diagram…
            </div>
        );
    }

    return (
        <>
            {/* ── Inline view ── */}
            <div className="my-4 rounded-xl bg-white/[0.03] border border-white/10 overflow-hidden">
                <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/5 bg-white/[0.02]">
                    <span className="text-[10px] text-muted-foreground/50 font-mono uppercase tracking-wider">Diagram</span>
                    <Toolbar fullscreenMode={false} />
                </div>
                <div className="p-3">
                    <SvgViewport fullscreenMode={false} />
                </div>
            </div>

            {/* ── Fullscreen overlay ── */}
            {isFullscreen && (
                <div
                    className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex flex-col"
                    onKeyDown={(e) => e.key === "Escape" && setIsFullscreen(false)}
                >
                    {/* Header bar */}
                    <div className="flex items-center justify-between px-4 py-2 border-b border-white/10 bg-black/40 flex-shrink-0">
                        <span className="text-xs text-muted-foreground">
                            Drag to pan · Scroll / pinch to zoom · <kbd className="px-1 py-0.5 bg-white/10 rounded text-[10px]">Esc</kbd> to close
                        </span>
                        <Toolbar fullscreenMode={true} />
                    </div>
                    {/* Diagram */}
                    <div className="flex-1 overflow-hidden p-4">
                        <SvgViewport fullscreenMode={true} />
                    </div>
                </div>
            )}
        </>
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
