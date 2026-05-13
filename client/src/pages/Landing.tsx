import { useEffect, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { ChatInput, type AttachmentPayload, type ChatMode, type DebateParticipant } from "@/components/ChatInput";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Zap,  Clock,  ArrowRight, CheckCircle2,
  Sparkles,  GraduationCap, FlaskConical, Rocket, ChevronDown,
  Star, Play, TrendingUp,  Lock, MessageSquare, Route, Wand2,
  Swords, Search, Layers, GitMerge, Linkedin, Twitter, Activity, Palette, Mail
} from "lucide-react";
import { SiMedium, SiTrustpilot } from "react-icons/si";
import { FaGooglePlay } from "react-icons/fa";
import {
  motion,
  useInView,
  useScroll,
  useTransform,
  AnimatePresence,
  useMotionValue,
  useSpring,
  type MotionValue,
} from "framer-motion";
import {
  SUBSCRIPTION_MONTHLY_PRICE,
  SUBSCRIPTION_YEARLY_DISCOUNT_PERCENT,
  SUBSCRIPTION_YEARLY_MONTHLY_EQUIVALENT,
  SUBSCRIPTION_YEARLY_PRICE,
} from "@shared/billing";

interface LandingAvailableModel {
  id: string;
  displayName: string;
  role: string;
  iconUrl?: string;
  provider: string;
  tier?: 1 | 2 | 3;
  isSelectable?: boolean;
  accessLabel?: string | null;
}

/* ─── Intersection Observer hook for scroll-triggered animations ─── */
function useScrollReveal(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, amount: threshold });
  return { ref, isInView };
}

/* ─── Stagger container variants ─── */
const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12 } },
};
const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } },
};
const fadeIn = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.8 } },
};
const scaleIn = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] } },
};

/* ─── Floating particles component ─── */
function FloatingParticles() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {[...Array(12)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{
            width: Math.random() * 4 + 2,
            height: Math.random() * 4 + 2,
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
            background: i % 3 === 0
              ? "rgba(212, 175, 55, 0.4)"
              : i % 3 === 1
                ? "rgba(139, 92, 246, 0.3)"
                : "rgba(34, 197, 94, 0.3)",
          }}
          animate={{
            y: [0, -30, 0],
            opacity: [0.2, 0.8, 0.2],
          }}
          transition={{
            duration: Math.random() * 4 + 3,
            repeat: Infinity,
            delay: Math.random() * 2,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

const heroWavePaths = [
  {
    d: "M-120 154C36 88 173 78 301 138C437 202 553 267 693 235C815 207 881 121 1012 126C1166 132 1301 236 1544 164C1627 140 1702 116 1760 108",
    strokeWidth: 1.4,
    opacity: [0.08, 0.36, 0.08],
    shift: [-22, 26, -22],
    drift: [0, 12, 0],
    duration: 18,
    delay: 0,
    dashArray: "10 16",
  },
  {
    d: "M-140 360C53 292 171 286 302 327C433 368 549 445 734 411C899 380 953 272 1123 267C1303 262 1435 363 1764 278",
    strokeWidth: 2,
    opacity: [0.06, 0.24, 0.06],
    shift: [18, -24, 18],
    drift: [0, -14, 0],
    duration: 22,
    delay: 1.2,
    dashArray: "1 0",
  },
  {
    d: "M-160 592C49 508 197 474 355 527C513 580 662 670 858 628C1065 583 1130 450 1290 434C1434 420 1557 482 1760 526",
    strokeWidth: 1.8,
    opacity: [0.05, 0.2, 0.05],
    shift: [-26, 20, -26],
    drift: [0, 16, 0],
    duration: 24,
    delay: 0.8,
    dashArray: "14 18",
  },
  {
    d: "M-150 740C20 690 140 648 297 672C463 699 610 794 807 781C1018 767 1140 654 1325 654C1466 654 1605 712 1768 762",
    strokeWidth: 1.2,
    opacity: [0.04, 0.16, 0.04],
    shift: [24, -18, 24],
    drift: [0, -10, 0],
    duration: 20,
    delay: 1.7,
    dashArray: "8 14",
  },
];

const heroSignalCards = [
  {
    icon: <Route className="h-3.5 w-3.5" />,
    title: "Smart AI routing",
  },
  {
    icon: <Layers className="h-3.5 w-3.5" />,
    title: "Parallel intelligence",
  },
  {
    icon: <Activity className="h-3.5 w-3.5" />,
    title: "Live motion layer",
  },
];

const heroOrbitCards = [
  {
    title: "Prompt Boost",
    value: "Expert rewrite",
    className: "left-[2%] top-[16%] md:left-[6%] md:top-[18%]",
    duration: 9,
    delay: 0.2,
  },
  {
    title: "Consensus",
    value: "11 models aligned",
    className: "right-[2%] top-[18%] md:right-[8%] md:top-[22%]",
    duration: 10,
    delay: 0.8,
  },
  {
    title: "Signal Flow",
    value: "Realtime synth",
    className: "left-[8%] bottom-[12%] md:left-[12%] md:bottom-[16%]",
    duration: 11,
    delay: 0.4,
  },
  {
    title: "Web Search",
    value: "Grounded answers",
    className: "right-[4%] bottom-[10%] md:right-[14%] md:bottom-[14%]",
    duration: 8.5,
    delay: 1.1,
  },
];

function GoldenWaveField() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      <svg
        className="absolute inset-0 h-full w-full opacity-90"
        viewBox="0 0 1600 900"
        fill="none"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="hero-wave-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(255,255,255,0)" />
            <stop offset="22%" stopColor="rgba(250,204,21,0.06)" />
            <stop offset="52%" stopColor="rgba(253,224,71,0.62)" />
            <stop offset="80%" stopColor="rgba(234,179,8,0.18)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </linearGradient>
        </defs>

        {heroWavePaths.map((wave, index) => (
          <motion.path
            key={index}
            d={wave.d}
            fill="none"
            stroke="url(#hero-wave-gradient)"
            strokeWidth={wave.strokeWidth}
            strokeLinecap="round"
            strokeDasharray={wave.dashArray}
            style={{ filter: "drop-shadow(0 0 14px rgba(250, 204, 21, 0.12))" }}
            animate={{
              opacity: wave.opacity,
              x: wave.shift,
              y: wave.drift,
            }}
            transition={{
              duration: wave.duration,
              delay: wave.delay,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        ))}
      </svg>

      <motion.div
        className="absolute left-1/2 top-[10%] h-[30rem] w-[30rem] -translate-x-1/2 rounded-full bg-amber-300/10 blur-[150px] md:h-[38rem] md:w-[38rem]"
        animate={{ opacity: [0.12, 0.22, 0.12], scale: [0.96, 1.06, 0.96] }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute bottom-[-18%] left-[16%] h-[18rem] w-[28rem] rounded-full bg-gradient-to-r from-amber-400/16 via-yellow-300/6 to-transparent blur-[120px]"
        animate={{ x: [-18, 22, -18], opacity: [0.1, 0.18, 0.1] }}
        transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}

function BrainShowcase({
  isMobile,
  brainX,
  brainY,
  brainRotateX,
  brainRotateY,
  sceneY,
}: {
  isMobile: boolean;
  brainX: MotionValue<number>;
  brainY: MotionValue<number>;
  brainRotateX: MotionValue<number>;
  brainRotateY: MotionValue<number>;
  sceneY: MotionValue<number>;
}) {
  return (
    <motion.div
      style={{ y: sceneY }}
      className="relative mx-auto flex h-[23rem] w-full max-w-[46rem] items-center justify-center sm:h-[29rem] lg:h-[44rem]"
    >
      <div className="absolute inset-[8%] rounded-[2.4rem] border border-white/7 bg-black/30 shadow-[0_24px_120px_rgba(0,0,0,0.45)] backdrop-blur-[2px]" />
      <div className="absolute inset-[2%] rounded-[3rem] border border-amber-300/12 bg-[radial-gradient(circle_at_center,rgba(250,204,21,0.16),transparent_56%)]" />
      <motion.div
        className="absolute inset-[12%] rounded-full border border-amber-200/12"
        animate={{ rotate: 360, scale: [1, 1.03, 1] }}
        transition={{ rotate: { duration: 28, repeat: Infinity, ease: "linear" }, scale: { duration: 10, repeat: Infinity, ease: "easeInOut" } }}
      />
      <motion.div
        className="absolute inset-[17%] rounded-full border border-amber-300/10"
        animate={{ rotate: -360, scale: [0.98, 1.01, 0.98] }}
        transition={{ rotate: { duration: 34, repeat: Infinity, ease: "linear" }, scale: { duration: 8, repeat: Infinity, ease: "easeInOut" } }}
      />
      <motion.div
        className="absolute inset-x-[12%] top-[14%] h-[48%] rounded-full bg-gradient-to-b from-amber-200/18 via-yellow-300/10 to-transparent blur-3xl"
        animate={{ opacity: [0.26, 0.42, 0.26], y: [0, -10, 0] }}
        transition={{ duration: 7.5, repeat: Infinity, ease: "easeInOut" }}
      />

      {!isMobile && heroOrbitCards.map((card) => (
        <motion.div
          key={card.title}
          className={`absolute ${card.className} z-20 rounded-2xl border border-white/10 bg-black/45 px-4 py-3 backdrop-blur-xl`}
          animate={{ y: [0, -10, 0], x: [0, 6, 0], opacity: [0.72, 1, 0.72] }}
          transition={{ duration: card.duration, delay: card.delay, repeat: Infinity, ease: "easeInOut" }}
        >
          <p className="text-[10px] uppercase tracking-[0.28em] text-amber-200/55">{card.title}</p>
          <p className="mt-1 text-sm font-medium text-white/90">{card.value}</p>
        </motion.div>
      ))}

      <motion.div
        style={{
          x: brainX,
          y: brainY,
          rotateX: brainRotateX,
          rotateY: brainRotateY,
          transformPerspective: 1600,
        }}
        className="relative z-30 flex h-full w-full items-center justify-center transform-gpu will-change-transform"
      >
        <motion.div
          animate={{ y: [0, -12, 0], rotate: [-2, 1.8, -2], scale: [1, 1.02, 1] }}
          transition={{ duration: 8.5, repeat: Infinity, ease: "easeInOut" }}
          className="relative"
        >
          <div className="absolute inset-x-[18%] bottom-[10%] h-16 rounded-full bg-amber-400/38 blur-[42px]" />
          <div className="absolute inset-x-[14%] bottom-[7%] h-20 rounded-full bg-yellow-200/16 blur-[58px]" />
          <motion.img
            src="/brain1.png"
            alt="3D brain visualization"
            className="relative z-10 w-[18rem] drop-shadow-[0_40px_80px_rgba(241,180,66,0.22)] sm:w-[23rem] lg:w-[34rem]"
            animate={{
              filter: [
                "drop-shadow(0 18px 42px rgba(251, 191, 36, 0.16))",
                "drop-shadow(0 24px 56px rgba(251, 191, 36, 0.24))",
                "drop-shadow(0 18px 42px rgba(251, 191, 36, 0.16))",
              ],
            }}
            transition={{ duration: 6.8, repeat: Infinity, ease: "easeInOut" }}
          />

          <div className="pointer-events-none absolute inset-x-[-2%] bottom-[20%] z-40">
            <motion.div
              className="absolute inset-x-[8%] top-1/2 h-9 -translate-y-1/2 rounded-full bg-gradient-to-r from-transparent via-amber-300/20 to-transparent blur-2xl"
              animate={{ opacity: [0.28, 0.5, 0.28], x: [-14, 16, -14] }}
              transition={{ duration: 7.2, repeat: Infinity, ease: "easeInOut" }}
            />
            <svg viewBox="0 0 900 180" className="h-24 w-full overflow-visible">
              <defs>
                <linearGradient id="brain-wave-gradient" x1="0%" y1="50%" x2="100%" y2="50%">
                  <stop offset="0%" stopColor="rgba(255,255,255,0)" />
                  <stop offset="20%" stopColor="rgba(250,204,21,0.14)" />
                  <stop offset="50%" stopColor="rgba(253,224,71,0.98)" />
                  <stop offset="82%" stopColor="rgba(234,179,8,0.35)" />
                  <stop offset="100%" stopColor="rgba(255,255,255,0)" />
                </linearGradient>
              </defs>
              <motion.path
                d="M-40 110C72 84 138 72 232 96C337 123 429 139 515 118C612 95 668 54 751 61C838 67 900 109 952 95"
                fill="none"
                stroke="url(#brain-wave-gradient)"
                strokeWidth="22"
                strokeLinecap="round"
                style={{ filter: "blur(9px)" }}
                animate={{ x: [-16, 18, -16], opacity: [0.34, 0.58, 0.34] }}
                transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
              />
              <motion.path
                d="M-40 110C72 84 138 72 232 96C337 123 429 139 515 118C612 95 668 54 751 61C838 67 900 109 952 95"
                fill="none"
                stroke="url(#brain-wave-gradient)"
                strokeWidth="10"
                strokeLinecap="round"
                style={{ filter: "drop-shadow(0 0 18px rgba(250, 204, 21, 0.55))" }}
                animate={{ x: [-22, 22, -22], opacity: [0.9, 1, 0.9] }}
                transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
              />
            </svg>
          </div>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

/* ─── Typing text animation ─── */
function TypingText({ texts, className = "" }: { texts: string[]; className?: string }) {
  const [currentTextIndex, setCurrentTextIndex] = useState(0);
  const [displayedText, setDisplayedText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const currentFullText = texts[currentTextIndex];
    let timeout: ReturnType<typeof setTimeout>;

    if (!isDeleting && displayedText.length < currentFullText.length) {
      timeout = setTimeout(() => {
        setDisplayedText(currentFullText.slice(0, displayedText.length + 1));
      }, 60 + Math.random() * 40);
    } else if (!isDeleting && displayedText.length === currentFullText.length) {
      timeout = setTimeout(() => setIsDeleting(true), 2200);
    } else if (isDeleting && displayedText.length > 0) {
      timeout = setTimeout(() => {
        setDisplayedText(currentFullText.slice(0, displayedText.length - 1));
      }, 30);
    } else if (isDeleting && displayedText.length === 0) {
      setIsDeleting(false);
      setCurrentTextIndex((prev) => (prev + 1) % texts.length);
    }
    return () => clearTimeout(timeout);
  }, [displayedText, isDeleting, currentTextIndex, texts]);

  return (
    <span className={className}>
      {displayedText}
      <span className="inline-block w-[3px] h-[1em] bg-amber-400 ml-1 align-middle animate-blink" />
    </span>
  );
}

/* ─── Neural Network Brain Canvas ─── */
function NeuralNetworkCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: -1000, y: -1000 });
  const animFrameRef = useRef<number>(0);
  const neuronsRef = useRef<any[]>([]);
  const connectionsRef = useRef<any[]>([]);
  const adjacencyRef = useRef<number[][]>([]);
  const pulsesRef = useRef<any[]>([]);
  const initedRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let height = 0;

    const resize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (!rect) return;
      const dpr = Math.min(window.devicePixelRatio || 1, width < 768 ? 1 : 1.25);
      width = rect.width;
      height = rect.height;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!initedRef.current || neuronsRef.current.length === 0) {
        initNetwork();
        initedRef.current = true;
      } else {
        // Re-position neurons on resize
        repositionNeurons();
      }
    };

    // Color palette inspired by the brain favicon (gold + green circuit tones)
    const neuronColors = [
      { r: 212, g: 175, b: 55 },   // gold
      { r: 180, g: 160, b: 40 },   // dark gold
      { r: 34, g: 197, b: 94 },    // green
      { r: 50, g: 160, b: 80 },    // dark green
      { r: 139, g: 92, b: 246 },   // purple accent
      { r: 251, g: 191, b: 36 },   // amber
    ];

    // Brain silhouette points (normalized 0-1, brain shaped)
    // We define multiple regions for left and right hemispheres + stem
    const brainPoints = (() => {
      const pts: { x: number; y: number; region: string }[] = [];

      // Left hemisphere — bumpy outline
      const leftOutline = [
        { x: 0.48, y: 0.12 }, { x: 0.40, y: 0.10 }, { x: 0.32, y: 0.13 },
        { x: 0.25, y: 0.18 }, { x: 0.20, y: 0.25 }, { x: 0.17, y: 0.30 },
        { x: 0.15, y: 0.38 }, { x: 0.16, y: 0.45 }, { x: 0.18, y: 0.50 },
        { x: 0.15, y: 0.55 }, { x: 0.17, y: 0.62 }, { x: 0.20, y: 0.68 },
        { x: 0.25, y: 0.73 }, { x: 0.30, y: 0.76 }, { x: 0.35, y: 0.78 },
        { x: 0.40, y: 0.80 }, { x: 0.45, y: 0.82 }, { x: 0.48, y: 0.85 },
      ];
      // Right hemisphere — mirror
      const rightOutline = leftOutline.map(p => ({ x: 1 - p.x, y: p.y }));

      // Internal nodes for left hemisphere
      const leftInner = [
        { x: 0.35, y: 0.25 }, { x: 0.28, y: 0.35 }, { x: 0.32, y: 0.45 },
        { x: 0.25, y: 0.55 }, { x: 0.30, y: 0.65 }, { x: 0.38, y: 0.55 },
        { x: 0.42, y: 0.40 }, { x: 0.38, y: 0.30 }, { x: 0.33, y: 0.50 },
        { x: 0.40, y: 0.70 }, { x: 0.36, y: 0.60 }, { x: 0.30, y: 0.42 },
        { x: 0.23, y: 0.45 }, { x: 0.35, y: 0.35 }, { x: 0.42, y: 0.60 },
      ];
      // Internal nodes for right hemisphere
      const rightInner = leftInner.map(p => ({ x: 1 - p.x, y: p.y }));

      // Center / corpus callosum
      const center = [
        { x: 0.48, y: 0.30 }, { x: 0.50, y: 0.40 }, { x: 0.52, y: 0.30 },
        { x: 0.50, y: 0.50 }, { x: 0.50, y: 0.60 }, { x: 0.48, y: 0.70 },
        { x: 0.52, y: 0.70 }, { x: 0.50, y: 0.20 },
      ];

      // Brain stem
      const stem = [
        { x: 0.50, y: 0.85 }, { x: 0.48, y: 0.90 }, { x: 0.52, y: 0.90 },
        { x: 0.50, y: 0.95 },
      ];

      // Scattered ambient neurons outside the brain
      const ambient: { x: number; y: number }[] = [];
      for (let i = 0; i < 10; i++) {
        ambient.push({ x: Math.random(), y: Math.random() });
      }

      // Left-side particle field so desktop hero reaches the screen edge
      const leftEdgeAmbient: { x: number; y: number }[] = [];
      for (let i = 0; i < 24; i++) {
        leftEdgeAmbient.push({
          x: Math.pow(Math.random(), 1.8) * 0.34,
          y: Math.random(),
        });
      }

      // Mid-left fillers to blend text side into the brain silhouette
      const leftMidAmbient: { x: number; y: number }[] = [];
      for (let i = 0; i < 12; i++) {
        leftMidAmbient.push({
          x: 0.2 + Math.random() * 0.28,
          y: Math.random(),
        });
      }

      leftOutline.forEach(p => pts.push({ ...p, region: "left-outline" }));
      rightOutline.forEach(p => pts.push({ ...p, region: "right-outline" }));
      leftInner.forEach(p => pts.push({ ...p, region: "left-inner" }));
      rightInner.forEach(p => pts.push({ ...p, region: "right-inner" }));
      center.forEach(p => pts.push({ ...p, region: "center" }));
      stem.forEach(p => pts.push({ ...p, region: "stem" }));
      ambient.forEach(p => pts.push({ ...p, region: "ambient" }));
      leftEdgeAmbient.forEach(p => pts.push({ ...p, region: "left-edge" }));
      leftMidAmbient.forEach(p => pts.push({ ...p, region: "left-mid" }));

      return pts;
    })();

    interface Neuron {
      baseX: number; baseY: number;
      x: number; y: number;
      size: number;
      color: typeof neuronColors[0];
      baseAlpha: number;
      fireLevel: number; // 0..1, how bright/fired it is
      region: string;
      phase: number;
    }

    interface Connection {
      from: number; to: number;
      alpha: number;
    }

    interface Pulse {
      fromX: number; fromY: number;
      toX: number; toY: number;
      progress: number; // 0..1
      speed: number;
      color: typeof neuronColors[0];
      alpha: number;
    }

    const initNetwork = () => {
      const neurons: Neuron[] = [];
      const isDesktop = width >= 1024;
      const cx = width * (isDesktop ? 0.48 : 0.55);
      const cy = height * 0.5;
      const scaleX = isDesktop ? width * 0.95 : Math.min(width, height) * 0.85;
      const scaleY = Math.min(width, height) * (isDesktop ? 0.92 : 0.85);

      brainPoints.forEach((pt, _i) => {
        const jitterX = (Math.random() - 0.5) * 0.03;
        const jitterY = (Math.random() - 0.5) * 0.03;
        const bx = cx + (pt.x - 0.5 + jitterX) * scaleX;
        const by = cy + (pt.y - 0.5 + jitterY) * scaleY;
        const isAmbient = pt.region === "ambient" || pt.region === "left-edge" || pt.region === "left-mid";
        const isLeftEdge = pt.region === "left-edge";
        neurons.push({
          baseX: bx, baseY: by,
          x: bx, y: by,
          size: isLeftEdge ? 0.9 + Math.random() * 1.2 : (isAmbient ? 1 + Math.random() * 1.5 : 2 + Math.random() * 3),
          color: neuronColors[Math.floor(Math.random() * neuronColors.length)],
          baseAlpha: isLeftEdge
            ? 0.12 + Math.random() * 0.12
            : (isAmbient ? 0.15 + Math.random() * 0.15 : 0.3 + Math.random() * 0.3),
          fireLevel: 0,
          region: pt.region,
          phase: Math.random() * Math.PI * 2,
        });
      });

      // Build connections — connect nearby neurons, favor same-region
      const connections: Connection[] = [];
      const MAX_DIST = Math.min(scaleX, scaleY) * 0.22;
      for (let i = 0; i < neurons.length; i++) {
        for (let j = i + 1; j < neurons.length; j++) {
          const dx = neurons[i].baseX - neurons[j].baseX;
          const dy = neurons[i].baseY - neurons[j].baseY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const sameRegion = neurons[i].region === neurons[j].region;
          const isAmbient = neurons[i].region === "ambient" || neurons[j].region === "ambient" || neurons[i].region === "left-edge" || neurons[j].region === "left-edge" || neurons[i].region === "left-mid" || neurons[j].region === "left-mid";
          const hasLeftEdge = neurons[i].region === "left-edge" || neurons[j].region === "left-edge";
          const threshold = hasLeftEdge
            ? MAX_DIST * 0.44
            : (sameRegion ? MAX_DIST : (isAmbient ? MAX_DIST * 0.5 : MAX_DIST * 0.7));
          if (dist < threshold) {
            connections.push({
              from: i,
              to: j,
              alpha: hasLeftEdge ? 0.035 + Math.random() * 0.03 : 0.06 + Math.random() * 0.06,
            });
          }
        }
      }

      const adjacency = Array.from({ length: neurons.length }, () => [] as number[]);
      connections.forEach((connection) => {
        adjacency[connection.from]?.push(connection.to);
        adjacency[connection.to]?.push(connection.from);
      });

      neuronsRef.current = neurons;
      connectionsRef.current = connections;
      adjacencyRef.current = adjacency;
      pulsesRef.current = [];
    };

    const repositionNeurons = () => {
      const neurons = neuronsRef.current;
      const isDesktop = width >= 1024;
      const cx = width * (isDesktop ? 0.48 : 0.55);
      const cy = height * 0.5;
      const scaleX = isDesktop ? width * 0.95 : Math.min(width, height) * 0.85;
      const scaleY = Math.min(width, height) * (isDesktop ? 0.92 : 0.85);

      brainPoints.forEach((pt, i) => {
        if (i >= neurons.length) return;
        const jitterX = (Math.random() - 0.5) * 0.03;
        const jitterY = (Math.random() - 0.5) * 0.03;
        neurons[i].baseX = cx + (pt.x - 0.5 + jitterX) * scaleX;
        neurons[i].baseY = cy + (pt.y - 0.5 + jitterY) * scaleY;
        neurons[i].x = neurons[i].baseX;
        neurons[i].y = neurons[i].baseY;
      });

      // Rebuild connections
      const connections: Connection[] = [];
      const MAX_DIST = Math.min(scaleX, scaleY) * 0.22;
      for (let i = 0; i < neurons.length; i++) {
        for (let j = i + 1; j < neurons.length; j++) {
          const dx = neurons[i].baseX - neurons[j].baseX;
          const dy = neurons[i].baseY - neurons[j].baseY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const sameRegion = neurons[i].region === neurons[j].region;
          const isAmbient = neurons[i].region === "ambient" || neurons[j].region === "ambient" || neurons[i].region === "left-edge" || neurons[j].region === "left-edge" || neurons[i].region === "left-mid" || neurons[j].region === "left-mid";
          const hasLeftEdge = neurons[i].region === "left-edge" || neurons[j].region === "left-edge";
          const threshold = hasLeftEdge
            ? MAX_DIST * 0.44
            : (sameRegion ? MAX_DIST : (isAmbient ? MAX_DIST * 0.5 : MAX_DIST * 0.7));
          if (dist < threshold) {
            connections.push({
              from: i,
              to: j,
              alpha: hasLeftEdge ? 0.035 + Math.random() * 0.03 : 0.06 + Math.random() * 0.06,
            });
          }
        }
      }
      const adjacency = Array.from({ length: neurons.length }, () => [] as number[]);
      connections.forEach((connection) => {
        adjacency[connection.from]?.push(connection.to);
        adjacency[connection.to]?.push(connection.from);
      });

      connectionsRef.current = connections;
      adjacencyRef.current = adjacency;
    };

    resize();
    window.addEventListener("resize", resize);

    let time = 0;
    let lastPulseTime = 0;
    const CURSOR_RADIUS = 180;

    const animate = () => {
      time += 0.006;
      ctx.clearRect(0, 0, width, height);

      const neurons = neuronsRef.current;
      const connections = connectionsRef.current;
      const pulses = pulsesRef.current;
      const adjacency = adjacencyRef.current;
      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;

      // Auto-fire random pulses periodically
      if (time - lastPulseTime > 0.15 && connections.length > 0) {
        lastPulseTime = time;
        const ci = Math.floor(Math.random() * connections.length);
        const conn = connections[ci];
        const fromN = neurons[conn.from];
        const toN = neurons[conn.to];
        if (fromN && toN) {
          const direction = Math.random() > 0.5;
          pulses.push({
            fromX: direction ? fromN.x : toN.x,
            fromY: direction ? fromN.y : toN.y,
            toX: direction ? toN.x : fromN.x,
            toY: direction ? toN.y : fromN.y,
            progress: 0,
            speed: 0.008 + Math.random() * 0.012,
            color: neuronColors[Math.floor(Math.random() * 3)], // gold/green bias
            alpha: 0.6 + Math.random() * 0.4,
          });
        }
      }

      // Draw connections (dendrites/axons — organic neural arcs)
      for (const conn of connections) {
        const nA = neurons[conn.from];
        const nB = neurons[conn.to];
        if (!nA || !nB) continue;
        const isAmbientConn = nA.region === "ambient" || nB.region === "ambient" || nA.region === "left-edge" || nB.region === "left-edge" || nA.region === "left-mid" || nB.region === "left-mid";

        // Check if cursor is near this connection
        const midX = (nA.x + nB.x) / 2;
        const midY = (nA.y + nB.y) / 2;
        const dxM = midX - mx;
        const dyM = midY - my;
        const distM = Math.sqrt(dxM * dxM + dyM * dyM);
        const cursorBoost = distM < CURSOR_RADIUS ? (1 - distM / CURSOR_RADIUS) * 0.15 : 0;

        ctx.beginPath();
        const dx = nB.x - nA.x;
        const dy = nB.y - nA.y;

        if (isAmbientConn) {
          ctx.moveTo(nA.x, nA.y);
          ctx.lineTo(nB.x, nB.y);
        } else {
          const normalX = -dy;
          const normalY = dx;
          const normalLen = Math.max(1, Math.sqrt(normalX * normalX + normalY * normalY));
          const curve = Math.min(24, Math.sqrt(dx * dx + dy * dy) * 0.22);
          const controlX = (nA.x + nB.x) / 2 + (normalX / normalLen) * curve;
          const controlY = (nA.y + nB.y) / 2 + (normalY / normalLen) * curve;
          ctx.moveTo(nA.x, nA.y);
          ctx.quadraticCurveTo(controlX, controlY, nB.x, nB.y);
        }
        ctx.strokeStyle = `rgba(212, 175, 55, ${conn.alpha + cursorBoost})`;
        ctx.lineWidth = isAmbientConn ? 0.45 : 0.7;
        ctx.stroke();
      }

      // Update & draw neurons
      for (let i = 0; i < neurons.length; i++) {
        const n = neurons[i];

        // Gentle floating
        const floatX = Math.sin(time * 1.5 + n.phase) * 2;
        const floatY = Math.cos(time * 1.2 + n.phase * 1.3) * 2;
        n.x = n.baseX + floatX;
        n.y = n.baseY + floatY;

        // Cursor interaction — fire neurons near cursor
        const dx = n.x - mx;
        const dy = n.y - my;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < CURSOR_RADIUS && dist > 0) {
          const intensity = (1 - dist / CURSOR_RADIUS);
          n.fireLevel = Math.min(1, n.fireLevel + intensity * 0.08);
          // Spawn pulses from fired neurons
          if (n.fireLevel > 0.5 && Math.random() < 0.03) {
            // Find a connected neuron
            const relatedTargets = adjacency[i];
            if (relatedTargets && relatedTargets.length > 0) {
              const targetIdx = relatedTargets[Math.floor(Math.random() * relatedTargets.length)];
              const target = neurons[targetIdx];
              if (target) {
                pulses.push({
                  fromX: n.x, fromY: n.y,
                  toX: target.x, toY: target.y,
                  progress: 0,
                  speed: 0.015 + Math.random() * 0.01,
                  color: n.color,
                  alpha: 0.8,
                });
              }
            }
          }
        }

        // Decay fire level
        n.fireLevel *= 0.96;

        const alpha = Math.min(1, n.baseAlpha + n.fireLevel * 0.7 + Math.sin(time * 2 + n.phase) * 0.05);
        const { r, g, b } = n.color;

        // Outer glow when fired
        if (n.fireLevel > 0.1) {
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.size * 4 + n.fireLevel * 8, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${n.fireLevel * 0.12})`;
          ctx.fill();
        }

        // Neuron body glow
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.size * 2.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha * 0.12})`;
        ctx.fill();

        // Neuron core
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
        ctx.fill();

        // Bright center when firing
        if (n.fireLevel > 0.2) {
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.size * 0.5, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255, 255, 255, ${n.fireLevel * 0.6})`;
          ctx.fill();
        }
      }

      // Update & draw pulses (signal traveling along connections)
      for (let i = pulses.length - 1; i >= 0; i--) {
        const p = pulses[i];
        p.progress += p.speed;
        if (p.progress >= 1) {
          pulses.splice(i, 1);
          continue;
        }

        const x = p.fromX + (p.toX - p.fromX) * p.progress;
        const y = p.fromY + (p.toY - p.fromY) * p.progress;
        const fadeAlpha = p.alpha * (1 - Math.abs(p.progress - 0.5) * 2) * 0.8;
        const { r, g, b } = p.color;

        // Pulse glow
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${fadeAlpha * 0.3})`;
        ctx.fill();

        // Pulse core
        ctx.beginPath();
        ctx.arc(x, y, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${fadeAlpha})`;
        ctx.fill();

        // Bright center
        ctx.beginPath();
        ctx.arc(x, y, 1, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${fadeAlpha * 0.8})`;
        ctx.fill();
      }

      animFrameRef.current = requestAnimationFrame(animate);
    };

    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  const handleMouseLeave = useCallback(() => {
    mouseRef.current = { x: -1000, y: -1000 };
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const touch = e.touches[0];
    mouseRef.current = { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
  }, []);

  return (
    <div
      className="relative w-full h-full"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleMouseLeave}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
      />
    </div>
  );
}

/* ─── Animated counter ─── */
function AnimatedCounter({ target, suffix = "" }: { target: number; suffix?: string }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true });

  useEffect(() => {
    if (!isInView) return;
    let start = 0;
    const step = target / 60;
    const timer = setInterval(() => {
      start += step;
      if (start >= target) {
        setCount(target);
        clearInterval(timer);
      } else {
        setCount(Math.floor(start));
      }
    }, 16);
    return () => clearInterval(timer);
  }, [isInView, target]);

  return <span ref={ref}>{count.toLocaleString()}{suffix}</span>;
}

/* ─── Model Logo Carousel ─── */
function ModelLogoCarousel() {
  const models = [
    { name: "Gemini", src: "/icons/gemini.svg" },
    { name: "GPT", src: "/icons/openai.svg" },
    { name: "Claude", src: "/icons/openai.svg" },
    { name: "Grok", src: "/icons/openai.svg" },
    { name: "LLaMA Scout", src: "/icons/meta.svg" },
    { name: "LLaMA Maverick", src: "/icons/meta.svg" },
    { name: "LLaMA", src: "/icons/meta.svg" },
    { name: "Nemotron", src: "/icons/nvidia.svg" },
    { name: "Qwen", src: "/icons/qwen.svg" },
    { name: "Kimi", src: "/icons/moonshot.svg" },
    { name: "GLM", src: "/icons/glm.svg" },
    { name: "Trinity", src: "/icons/mistral.svg" },
    { name: "Groq", src: "/icons/groq.svg" },
  ];

  return (
    <div className="relative overflow-hidden py-6" aria-label="Supported AI models">
      <div className="flex animate-scroll-logos gap-16 items-center">
        {[...models, ...models].map((model, i) => (
          <div key={i} className="flex items-center gap-3 shrink-0 opacity-50 hover:opacity-100 transition-opacity duration-300 group">
            <img
              src={model.src}
              alt={`${model.name} AI model logo`}
              className="w-8 h-8 grayscale group-hover:grayscale-0 transition-all duration-300"
              loading="lazy"
            />
            <span className="text-sm font-medium text-muted-foreground group-hover:text-white transition-colors whitespace-nowrap">
              {model.name}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Testimonial data ─── */
const testimonials = [
  {
    quote: "The debate mode is insane — I pitted 3 models against each other on my thesis topic and got perspectives I never would have considered. Cut my lit review from 3 days to 4 hours.",
    name: "Sarah K.",
    role: "PhD Researcher, MIT",
    avatar: "SK",
  },
  {
    quote: "As a founder, prompt enhancement alone is worth it. I type a rough question and MetaLLM rewrites it into something an expert would ask. The multi-model synthesis is the cherry on top.",
    name: "Ahmed R.",
    role: "CEO, TechVenture",
    avatar: "AR",
  },
  {
    quote: "Smart routing is magic — it sends my code questions to Kimi and my math to Nemotron automatically. I used to spend hours picking the right AI. Now MetaLLM just knows.",
    name: "Priya M.",
    role: "CS Student, Stanford",
    avatar: "PM",
  },
];

/* ─── FAQ data ─── */
const faqs = [
  {
    q: "What is an AI aggregator and how is MetaLLM different?",
    a: "MetaLLM is the ultimate AI aggregator. Instead of switching tabs, it sends your query to multiple leading AI models — Gemini, GPT, LLaMA, Nemotron, Qwen, Kimi, and more — simultaneously. Unlike ChatGPT (one model, one perspective), MetaLLM brings all AI in one chat, giving you multi-model consensus, automatic prompt enhancement, and an AI-powered debate mode."
  },
  {
    q: "How does MetaLLM function as an AI Orchestrator?",
    a: "As an intelligent AI Orchestrator, MetaLLM analyzes your intent and context. If it's a coding question, it routes to Kimi K2 automatically. Math goes to Nemotron. Creative writing to Trinity. It orchestrates multiple AI models seamlessly in the background so you always get the best tool for the job."
  },
  {
    q: "What is Prompt Enhancement?",
    a: "Before any AI model sees your question, MetaLLM automatically rewrites it into an expert-level prompt — adding context, constraints, specificity, and persona framing. In Multi-Model mode, each model gets a uniquely tailored version of your prompt optimized for its specialty. This dramatically improves response quality."
  },
  {
    q: "How does Debate Mode work?",
    a: "Debate Mode assigns each AI model a unique stance on your topic — 'strongly in favour', 'devil's advocate', 'ethical critic', etc. Models argue their positions over 2+ structured rounds, responding directly to each other's arguments. A neutral judge model then delivers the final verdict. It's like having a panel of expert debaters analyze your question from every angle."
  },
  {
    q: "Which AI models does MetaLLM support?",
    a: "MetaLLM integrates 13+ specialist models: Google Gemini, OpenAI GPT, Anthropic Claude, xAI Grok, Meta LLaMA 4 Scout, Meta LLaMA 4 Maverick, Meta LLaMA 3.3, NVIDIA Nemotron, Alibaba Qwen 3, Moonshot Kimi K2, ZhipuAI GLM 4.5, Arcee Trinity, and Groq Compound — all queried simultaneously."
  },
  {
    q: "Does MetaLLM support web search?",
    a: "Yes! Toggle Live Web Search to ground AI responses in current data. MetaLLM searches the web, fetches and reads actual page content, and injects it into every model's context — so you get answers based on real-time information, not just training data."
  },
  {
    q: "Is MetaLLM the best alternative to ChatGPT in 2026?",
    a: "MetaLLM is the best ChatGPT alternative because it doesn't limit you to a single model. Instead of picking between ChatGPT, Gemini, or Claude, MetaLLM queries all of them simultaneously and synthesizes the best answer. You get multi-model consensus, prompt enhancement, debate mode, and deep web search — all in one chat."
  },
  {
    q: "Can students use MetaLLM for free?",
    a: "Yes! MetaLLM offers a free tier with daily chat limits. Students can access all core features including multi-model querying, prompt enhancement, debate mode, and web search. It's perfect for research papers, thesis work, assignment help, and exam preparation where cross-referencing multiple AI perspectives gives deeper, more accurate results."
  },
  {
    q: "How does MetaLLM prevent AI hallucinations?",
    a: "MetaLLM prevents hallucinations through three mechanisms: (1) Deep web search injects real-time factual data into every model's context, (2) Multi-model consensus cross-validates claims across 11+ different AI models, and (3) Source attribution forces all models to cite verifiable sources. When multiple independent AIs agree on an answer backed by web sources, hallucination risk drops dramatically."
  },
  {
    q: "How can I compare GPT vs Gemini vs Claude responses?",
    a: "In Multi-Model mode, type your question once and all models respond simultaneously in separate panels. You can see exactly how each model interprets and answers the same query — making it effortless to identify strengths, weaknesses, and blind spots across GPT, Gemini, LLaMA, and all other supported models."
  },
  {
    q: "What is epistemic diversity and why does it matter?",
    a: "Epistemic diversity means getting knowledge from multiple distinct sources. In AI, this means querying different language models trained on different data with different architectures. MetaLLM enforces epistemic diversity through Debate Mode (models argue different perspectives) and Multi-Model mode (parallel querying), effectively combating the 'echo chamber' effect of relying on a single AI."
  },
  {
    q: "How does MetaLLM help with research papers and literature reviews?",
    a: "MetaLLM is ideal for research: query 11+ models simultaneously to cross-validate findings, use Debate Mode to explore perspectives you might miss, and leverage deep web search for source-cited answers. Researchers report cutting their literature review time from days to hours — a 10× improvement in research efficiency."
  },
];

/* ════════════════════════════════════════════════════════════════════════════ */
/*  MAIN LANDING COMPONENT                                                     */
/* ════════════════════════════════════════════════════════════════════════════ */

export default function Landing() {
  const { toast } = useToast();
  const { scrollYProgress } = useScroll();
  const heroParallax = useTransform(scrollYProgress, [0, 0.3], [0, -28]);
  const heroCopyY = useTransform(scrollYProgress, [0, 0.2], [0, -14]);
  const heroSceneY = useTransform(scrollYProgress, [0, 0.22], [0, -34]);
  const heroBackdropOpacity = useTransform(scrollYProgress, [0, 0.22], [1, 0.84]);

  useEffect(() => {
    const scriptId = "landing-llm-battle-schema";
    if (!document.getElementById(scriptId)) {
      const schemaScript = document.createElement("script");
      schemaScript.type = "application/ld+json";
      schemaScript.id = scriptId;
      schemaScript.text = JSON.stringify({
        "@context": "https://schema.org",
        "@type": "WebApplication",
        "name": "MetaLLM | LLM Battle & Model Comparison",
        "applicationCategory": "DeveloperApplication",
        "description": "Engage in the ultimate LLM Battle. Compare ChatGPT vs Claude vs Gemini simultaneously. Analyze speed, reasoning, and logic across 13+ frontier AI models in side-by-side matches constrainted by real-time deep web search.",
        "url": "https://metallm.tech/",
        "isAccessibleForFree": true,
        "keywords": "llm battle, llm comparison, model comparison, chatgpt vs claude, gemini vs gpt, ai model comparison",
        "publisher": {
          "@type": "Organization",
          "name": "MetaLLM",
          "url": "https://metallm.tech"
        }
      });
      document.head.appendChild(schemaScript);
    }
    
    return () => {
      const scriptToRemove = document.getElementById(scriptId);
      if (scriptToRemove) {
        document.head.removeChild(scriptToRemove);
      }
    };
  }, []);
  const [activeFaq, setActiveFaq] = useState<number | null>(null);
  const [availableModels, setAvailableModels] = useState<LandingAvailableModel[]>([]);
  const [selectedMultiModelIds, setSelectedMultiModelIds] = useState<string[]>([]);
  const [debateParticipants, setDebateParticipants] = useState<DebateParticipant[]>([
    { modelId: "", customRole: "Angel", customSystemPrompt: "" },
    { modelId: "", customRole: "Devil", customSystemPrompt: "" },
  ]);
  const isMobile = useIsMobile();
  const heroPointerX = useMotionValue(0);
  const heroPointerY = useMotionValue(0);
  const brainXTarget = useTransform(heroPointerX, [-0.5, 0.5], isMobile ? [-10, 10] : [-36, 36]);
  const brainYTarget = useTransform(heroPointerY, [-0.5, 0.5], isMobile ? [-8, 8] : [-28, 28]);
  const brainRotateXTarget = useTransform(heroPointerY, [-0.5, 0.5], isMobile ? [5, -5] : [12, -12]);
  const brainRotateYTarget = useTransform(heroPointerX, [-0.5, 0.5], isMobile ? [-6, 6] : [-14, 14]);
  const brainX = useSpring(brainXTarget, { stiffness: 120, damping: 18, mass: 0.7 });
  const brainY = useSpring(brainYTarget, { stiffness: 120, damping: 18, mass: 0.7 });
  const brainRotateX = useSpring(brainRotateXTarget, { stiffness: 120, damping: 18, mass: 0.7 });
  const brainRotateY = useSpring(brainRotateYTarget, { stiffness: 120, damping: 18, mass: 0.7 });

  const resetHeroPointer = useCallback(() => {
    heroPointerX.set(0);
    heroPointerY.set(0);
  }, [heroPointerX, heroPointerY]);

  const handleHeroPointerMove = useCallback((e: React.MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const nextX = (e.clientX - rect.left) / rect.width - 0.5;
    const nextY = (e.clientY - rect.top) / rect.height - 0.5;
    heroPointerX.set(nextX);
    heroPointerY.set(nextY);
  }, [heroPointerX, heroPointerY]);

  const handleHeroTouchMove = useCallback((e: React.TouchEvent<HTMLElement>) => {
    const touch = e.touches[0];
    if (!touch) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const nextX = (touch.clientX - rect.left) / rect.width - 0.5;
    const nextY = (touch.clientY - rect.top) / rect.height - 0.5;
    heroPointerX.set(nextX);
    heroPointerY.set(nextY);
  }, [heroPointerX, heroPointerY]);

  const features = [
    {
      icon: <Route className="w-6 h-6" />,
      title: "Intelligent Model Routing",
      description: "Our proprietary AI router evaluates queries against latency, cost, and reasoning capability metrics to automatically select the optimal specialist model—bypassing vendor lock-in completely.",
      color: "from-amber-500/20 to-yellow-500/10",
      iconColor: "text-amber-400",
    },
    {
      icon: <Wand2 className="w-6 h-6" />,
      title: "Prompt Enhancement",
      description: "Your raw question is automatically rewritten into an expert-level prompt — adding context, constraints, and specificity — before any AI model sees it. Better prompts = dramatically better answers.",
      color: "from-purple-500/20 to-violet-500/10",
      iconColor: "text-purple-400",
    },
    {
      icon: <Swords className="w-6 h-6" />,
      title: "AI Debate for Epistemic Diversity",
      description: "Prevent LLM model collapse and eliminate bias. MetaLLM's Debate Mode forces multiple frontier models to argue their perspectives logic-first, providing you with a rigorous testing ground for epistemic diversity.",
      color: "from-rose-500/20 to-pink-500/10",
      iconColor: "text-rose-400",
    },
    {
      icon: <Layers className="w-6 h-6" />,
      title: "Query Multiple AI Models",
      description: "Send your question to multiple AI models simultaneously — each receives a prompt tailored to its specialty. Kimi K2 for coding, Qwen 3 for writing — giving you all AI in one chat.",
      color: "from-emerald-500/20 to-green-500/10",
      iconColor: "text-emerald-400",
    },
    {
      icon: <Search className="w-6 h-6" />,
      title: "Deep Web Search & Source Graph",
      description: "Eradicate hallucinations. Our deep web search architecture injects real-time factual data into model context windows, guaranteeing 100% verifiability and strict source attribution for every claim.",
      color: "from-cyan-500/20 to-blue-500/10",
      iconColor: "text-cyan-400",
    },
    {
      icon: <GitMerge className="w-6 h-6" />,
      title: "AI Synthesis Engine",
      description: "After all models respond, the orchestrator synthesizes every answer into one unified, conflict-resolved analysis — highlighting key insights and delivering an actionable conclusion.",
      color: "from-amber-500/20 to-orange-500/10",
      iconColor: "text-amber-300",
    },
    {
      icon: <Palette className="w-6 h-6" />,
      title: "AI Image & Video Generation",
      description: "Create stunning visuals with 6 frontier models — GPT Image 2, Gemini 3 Pro, Flux 2 Pro for images and Kling 3.0 Pro, Seedance 2.0, Veo 3.1 for video — all through one unified interface via OpenRouter.",
      color: "from-pink-500/20 to-fuchsia-500/10",
      iconColor: "text-pink-400",
    },
    {
      icon: <MessageSquare className="w-6 h-6" />,
      title: "WhatsApp AI Agent",
      description: "Deploy a human-like AI agent directly on WhatsApp to answer queries and close deals 24/7. No Meta API key required. Turn customer chats into revenue on autopilot.",
      color: "from-[#25D366]/20 to-[#128C7E]/10",
      iconColor: "text-[#25D366]",
    },
  ];

  const audienceCards = [
    {
      icon: <GraduationCap className="w-8 h-8" />,
      title: "Developers",
      tagline: "Build without vendor lock-in",
      pain: "Spending hours writing abstractions to switch between OpenAI and Anthropic APIs?",
      solution: "Use MetaLLM as your intelligent infrastructure layer. Let our routing engine handle latency and token efficiency while you focus on shipping.",
      stat: "99.9% uptime across all model clusters",
      color: "border-amber-500/30 hover:border-amber-400/60",
      iconBg: "bg-amber-500/10",
      iconColor: "text-amber-400",
    },
    {
      icon: <FlaskConical className="w-8 h-8" />,
      title: "Researchers",
      tagline: "Multi-perspective analysis, instantly",
      pain: "Need to cross-reference findings across multiple AI knowledge bases?",
      solution: "MetaLLM queries all leading models simultaneously and synthesizes conflicting viewpoints into actionable insights.",
      stat: "10× faster literature reviews",
      color: "border-purple-500/30 hover:border-purple-400/60",
      iconBg: "bg-purple-500/10",
      iconColor: "text-purple-400",
    },
    {
      icon: <Rocket className="w-8 h-8" />,
      title: "Founders",
      tagline: "Hedge against model collapse",
      pain: "Every wrong strategic decision costs runway and capital you don't have?",
      solution: "Cross-validate your business logic against 11 frontier models simultaneously. Achieve data-driven consensus and bypass single-provider vulnerabilities.",
      stat: "40% reduction in API overhead costs",
      color: "border-emerald-500/30 hover:border-emerald-400/60",
      iconBg: "bg-emerald-500/10",
      iconColor: "text-emerald-400",
    },
    {
      icon: <Star className="w-8 h-8" />,
      title: "Students",
      tagline: "Ace every assignment with multi-AI depth",
      pain: "Switching between ChatGPT and Google just to research one topic for a paper?",
      solution: "Ask once, get answers from 11 AI models with source citations. Debate mode provides multi-perspective analysis perfect for essays, thesis research, and exam prep.",
      stat: "3× better research quality in half the time",
      color: "border-cyan-500/30 hover:border-cyan-400/60",
      iconBg: "bg-cyan-500/10",
      iconColor: "text-cyan-400",
    },
  ];

  const stats = [
    { value: 10, suffix: "×", label: "Faster Than Manual Research" },
    { value: 3, suffix: "", label: "Modes: Single, Multi, Debate" },
    { value: 13, suffix: "+", label: "AI Models Supported" },
    { value: 50000, suffix: "+", label: "Queries Processed" },
  ];

  const howItWorks = [
    {
      step: "01",
      title: "Ask Anything",
      description: "Type any question — research, code, analysis, creative writing. Choose Single, Multi-Model, or Debate mode.",
      icon: <MessageSquare className="w-6 h-6" />,
    },
    {
      step: "02",
      title: "Algorithmic Routing",
      description: "Our proprietary heuristic engine evaluates your prompt and securely routes it to the specialized model with the lowest latency and highest reasoning score.",
      icon: <Route className="w-6 h-6" />,
    },
    {
      step: "03",
      title: "Models Respond in Parallel",
      description: "In Multi mode, all 13 models — Gemini, GPT, Claude, Grok, LLaMA 4 Scout, LLaMA 4 Maverick, LLaMA 3.3, Nemotron, Qwen 3, Kimi K2, GLM 4.5, Trinity, Groq Compound — respond simultaneously with tailored prompts.",
      icon: <Layers className="w-6 h-6" />,
    },
    {
      step: "04",
      title: "All AI in One Chat",
      description: "The orchestrator merges all responses into one conflict-resolved, citation-rich analysis — delivering the combined intelligence of multiple AI models in a single view.",
      icon: <GitMerge className="w-6 h-6" />,
    },
  ];

  /* ── Scroll reveal refs ── */
  const statsReveal = useScrollReveal();
  const featuresReveal = useScrollReveal();
  const audienceReveal = useScrollReveal();
  const howReveal = useScrollReveal();
  const testimonialsReveal = useScrollReveal();
  const pricingReveal = useScrollReveal();
  const faqReveal = useScrollReveal();
  const ctaReveal = useScrollReveal();

  useEffect(() => {
    const fetchModels = async () => {
      try {
        const res = await fetch("/api/models", { credentials: "include" });
        if (!res.ok) return;
        const data = await res.json();
        const models = (data.models ?? []) as LandingAvailableModel[];
        setAvailableModels(models);

        const selectableModels = models.filter((model) => model.isSelectable !== false);
        const preferredModels = selectableModels.length > 0 ? selectableModels : models;

        setSelectedMultiModelIds((prev) => {
          const next = prev.filter((id) => preferredModels.some((model) => model.id === id));
          return next.length > 0 ? next : preferredModels.slice(0, 3).map((model) => model.id);
        });

        setDebateParticipants((prev) => [
          {
            modelId: prev[0]?.modelId && preferredModels.some((model) => model.id === prev[0]?.modelId)
              ? prev[0].modelId
              : preferredModels[0]?.id ?? "",
            customRole: prev[0]?.customRole || "Angel",
            customSystemPrompt: prev[0]?.customSystemPrompt || "",
          },
          {
            modelId: prev[1]?.modelId && preferredModels.some((model) => model.id === prev[1]?.modelId)
              ? prev[1].modelId
              : preferredModels[1]?.id ?? preferredModels[0]?.id ?? "",
            customRole: prev[1]?.customRole || "Devil",
            customSystemPrompt: prev[1]?.customSystemPrompt || "",
          },
        ]);

      } catch (error) {
        console.error("Failed to fetch landing models:", error);
      }
    };

    void fetchModels();
  }, []);

  const handleLandingSend = async (
    _content: string,
    _mode: ChatMode,
    _enhancerEnabled: boolean,
    _webSearch?: boolean,
    _directModelId?: string,
    _attachmentPayload?: AttachmentPayload,
  ) => {
    toast({
      title: "Preview ready",
      description: "The preview input is interactive. Continue in the full workspace after signing in.",
    });
    window.location.href = "/login";
    return false;
  };

  return (
    <div className="min-h-screen bg-background text-foreground overflow-hidden selection:bg-amber-500/30 selection:text-amber-100">
      <main role="main">

      <div className="pointer-events-none fixed inset-x-0 top-5 z-50 flex justify-center px-4">
        <nav
          className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-white/12 bg-black/38 px-3 py-2 shadow-[0_18px_50px_rgba(0,0,0,0.28)] backdrop-blur-xl"
          aria-label="Main navigation"
        >
          <a
            href="#features"
            className="inline-flex h-10 items-center rounded-full border border-transparent px-4 text-sm font-medium text-white/72 transition-all duration-300 hover:-translate-y-0.5 hover:border-white/10 hover:bg-white/10 hover:text-white hover:shadow-[0_10px_26px_rgba(255,255,255,0.08)]"
          >
            Features
          </a>
          <a
            href="#pricing"
            className="inline-flex h-10 items-center rounded-full border border-transparent px-4 text-sm font-medium text-white/72 transition-all duration-300 hover:-translate-y-0.5 hover:border-white/10 hover:bg-white/10 hover:text-white hover:shadow-[0_10px_26px_rgba(255,255,255,0.08)]"
          >
            Pricing
          </a>
          <a
            href="/login"
            className="inline-flex h-10 items-center rounded-full border border-transparent px-4 text-sm font-medium text-white/72 transition-all duration-300 hover:-translate-y-0.5 hover:border-white/10 hover:bg-white/10 hover:text-white hover:shadow-[0_10px_26px_rgba(255,255,255,0.08)]"
          >
            Login
          </a>
          <a
            href="/tutorials/"
            className="inline-flex h-10 items-center rounded-full border border-transparent px-4 text-sm font-medium text-white/72 transition-all duration-300 hover:-translate-y-0.5 hover:border-white/10 hover:bg-white/10 hover:text-white hover:shadow-[0_10px_26px_rgba(255,255,255,0.08)]"
          >
            Tutorials
          </a>
          <a
            href="/agent"
            className="inline-flex h-10 items-center rounded-full border border-amber-300/20 bg-amber-500/10 px-4 text-sm font-semibold text-amber-300 transition-all duration-300 hover:-translate-y-0.5 hover:bg-amber-500/20 hover:text-amber-200 hover:shadow-[0_10px_26px_rgba(251,191,36,0.12)]"
          >
            WhatsApp Agent
          </a>
          <a href="/login">
            <Button className="h-10 rounded-full bg-white px-5 text-sm font-semibold text-black transition-all duration-300 hover:-translate-y-0.5 hover:bg-white/90 hover:shadow-[0_12px_30px_rgba(255,255,255,0.22)]">
              Signup
            </Button>
          </a>
        </nav>
      </div>

      <div className="pointer-events-none fixed right-0 top-1/2 z-40 hidden -translate-y-1/2 lg:flex">
        <div className="pointer-events-auto relative flex flex-col items-center gap-3 rounded-l-[1.75rem] border border-r-0 border-white/12 bg-black/34 pl-3 pr-4 py-4 shadow-[0_18px_50px_rgba(0,0,0,0.28)] backdrop-blur-xl">
          <div
            aria-hidden="true"
            className="absolute left-0 top-0 h-10 w-8 -translate-x-[88%] border border-r-0 border-b-0 border-white/12 bg-black/34 [clip-path:polygon(100%_0,100%_100%,0_100%)]"
          />
          <div
            aria-hidden="true"
            className="absolute bottom-0 left-0 h-10 w-8 -translate-x-[88%] border border-r-0 border-t-0 border-white/12 bg-black/34 [clip-path:polygon(0_0,100%_0,100%_100%)]"
          />
          <a
            href="https://x.com/metallmai"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="MetaLLM on X (Twitter)"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/6 text-white/72 transition-colors hover:bg-white/10 hover:text-white"
          >
            <Twitter className="h-4 w-4" />
          </a>
          <a
            href="https://www.linkedin.com/company/metallmtech/"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="MetaLLM on LinkedIn"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/6 text-white/72 transition-colors hover:bg-white/10 hover:text-white"
          >
            <Linkedin className="h-4 w-4" />
          </a>
          <a
            href="mailto:support@metallm.tech"
            aria-label="Email MetaLLM Support"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/6 text-white/72 transition-colors hover:bg-white/10 hover:text-white"
          >
            <Mail className="h-4 w-4" />
          </a>
          <a
            href="https://medium.com/@metallm"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="MetaLLM on Medium"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/6 text-white/72 transition-colors hover:bg-white/10 hover:text-white"
          >
            <SiMedium className="h-4 w-4" />
          </a>
          <a
            href="https://play.google.com/store/apps/details?id=tech.metallm.app"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="MetaLLM on Google Play"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/6 text-white/72 transition-colors hover:bg-white/10 hover:text-white"
          >
            <FaGooglePlay className="h-4 w-4" />
          </a>
          <a
             href="https://www.trustpilot.com/review/metallm.tech"
             target="_blank"
             rel="noopener noreferrer"
             aria-label="MetaLLM on Trustpilot"
             className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/6 text-white/72 transition-colors hover:bg-white/10 hover:text-white"
          >
             <SiTrustpilot className="h-4 w-4" />
          </a>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* HERO SECTION                                                           */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      <section
        className="hero-section relative flex min-h-screen items-center overflow-hidden"
        aria-labelledby="hero-heading"
      >
        <div className="absolute inset-0">
          <img
            src="/hero.png"
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover object-center"
            loading="eager"
            fetchPriority="high"
          />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(2,6,12,0.88)_0%,rgba(4,8,16,0.72)_28%,rgba(4,8,16,0.3)_52%,rgba(4,8,16,0.5)_100%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(3,6,12,0.2)_0%,rgba(3,6,12,0.35)_55%,rgba(3,6,12,0.72)_100%)]" />
          <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-transparent to-background" />
        </div>

        <div className="relative z-10 mx-auto flex min-h-[100dvh] w-full max-w-7xl items-center px-4 pb-8 pt-16 sm:px-6 sm:pt-20 lg:px-8">
          <div className="w-full max-w-3xl">
            <div className="hero-text-side relative text-left">
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55 }}
                className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/28 px-4 py-2 backdrop-blur-md"
              >
                <Sparkles className="h-3.5 w-3.5 text-amber-300" />
                <span className="text-[11px] font-medium uppercase tracking-[0.28em] text-amber-100/75">
                  Multi-AI Intelligence Layer
                </span>
              </motion.div>

              <motion.h1
                id="hero-heading"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.75, delay: 0.08 }}
                className="hero-heading max-w-3xl text-4xl font-bold leading-[0.96] tracking-[-0.04em] text-white sm:text-5xl lg:text-[4.7rem] xl:text-[5rem]"
              >
                MetaLLM
                <br />
                <span className="text-white/96">Your AI lab in a chat.</span>
              </motion.h1>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.14 }}
                className="mb-5 mt-5 min-h-[1.75rem] sm:min-h-[2rem]"
              >
                <span className="text-lg font-medium uppercase tracking-[0.12em] text-white/78 sm:text-xl">
                  Debate, refine, execute.
                </span>
              </motion.div>

              <motion.p
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.75, delay: 0.18 }}
                className="hero-description max-w-xl text-sm leading-7 text-white/72 sm:text-base"
              >
                <strong className="font-semibold text-white/92">MetaLLM is an AI aggregator that queries 13+ frontier AI models simultaneously</strong> — Gemini, GPT, Claude, Grok, LLaMA, Nemotron, Qwen, Kimi, and more. Smart routing, prompt enhancement, debate mode, deep web search, and persistent shared memory — all in one chat. Built for developers, researchers, founders, and students.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.75, delay: 0.24 }}
                className="mt-8 flex flex-col items-start gap-3 sm:flex-row"
              >
                <a href="/login">
                  <Button className="group h-12 rounded-full border border-[#9bb6ff]/55 bg-white/8 px-7 text-sm font-semibold text-white shadow-[0_12px_40px_rgba(101,138,255,0.14)] backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5 hover:bg-white/12 hover:shadow-[0_16px_44px_rgba(101,138,255,0.2)]">
                    Launch MetaLLM
                    <ArrowRight className="ml-2 h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                  </Button>
                </a>
                <a href="/agent">
                  <Button className="group h-12 rounded-full border-0 bg-[#25D366] px-7 text-sm font-bold text-white shadow-[0_12px_40px_rgba(37,211,102,0.2)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#128C7E] hover:shadow-[0_16px_44px_rgba(37,211,102,0.3)]">
                    WhatsApp Agent
                    <MessageSquare className="ml-2 h-4 w-4" />
                  </Button>
                </a>
                <a
                  href="/compare"
                  className="group inline-flex h-12 items-center gap-2 rounded-full border border-white/12 bg-black/22 px-5 text-sm font-medium text-white/78 backdrop-blur-md transition-all duration-300 hover:border-white/20 hover:bg-black/30 hover:text-white"
                >
                  <Swords className="h-3.5 w-3.5 text-amber-300" />
                  LLM Battle
                </a>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.75, delay: 0.3 }}
                className="mt-6 flex flex-wrap gap-2"
              >
                {heroSignalCards.map((card) => (
                  <div
                    key={card.title}
                    className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/24 px-3.5 py-2 text-[11px] font-medium text-white/78 backdrop-blur-md"
                  >
                    <span className="text-amber-300">
                      {card.icon}
                    </span>
                    {card.title}
                  </div>
                ))}
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.36 }}
                className="mt-5 flex flex-wrap items-center gap-3"
              >
                <a
                  href="https://play.google.com/store/apps/details?id=tech.metallm.app"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button className="group h-12 rounded-full border border-white/10 bg-black/40 px-6 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(0,0,0,0.2)] backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5 hover:border-white/20 hover:bg-black/60 hover:shadow-[0_12px_24px_rgba(0,0,0,0.3)]">
                    <Play className="mr-2 h-4 w-4 text-[#3DDC84]" fill="currentColor" />
                    Download App
                  </Button>
                </a>
              </motion.div>

            </div>
          </div>
        </div>

      </section>

      <section className="relative z-30 -mt-10 pb-10">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="overflow-visible">
            <div>
              <ChatInput
                onSend={handleLandingSend}
                isLoading={false}
                disabled={false}
                availableModels={availableModels}
                selectedMultiModelIds={selectedMultiModelIds}
                debateParticipants={debateParticipants}
                appearance="transparent"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* MODEL LOGOS BAR                                                        */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      <section className="relative border-y border-white/5 bg-black/20 py-8" aria-label="Supported AI models">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-center text-sm text-muted-foreground/60 mb-4 uppercase tracking-widest font-medium">
            Powered by the world's leading AI models
          </p>
          <ModelLogoCarousel />
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* SOCIAL PROOF STATS                                                     */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      <section className="py-20 relative" aria-label="Statistics" ref={statsReveal.ref}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            variants={stagger}
            initial="hidden"
            animate={statsReveal.isInView ? "visible" : "hidden"}
            className="grid grid-cols-2 md:grid-cols-4 gap-8"
          >
            {stats.map((stat, i) => (
              <motion.div key={i} variants={fadeUp} className="text-center">
                <div className="text-3xl sm:text-4xl md:text-5xl font-bold font-display bg-clip-text text-transparent bg-gradient-to-br from-amber-300 to-yellow-400">
                  {statsReveal.isInView && <AnimatedCounter target={stat.value} suffix={stat.suffix} />}
                </div>
                <p className="mt-2 text-sm sm:text-base text-muted-foreground">{stat.label}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* PAIN POINT → SOLUTION (Psychology: Loss Aversion)                      */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      <section className="py-24 relative overflow-hidden" aria-labelledby="problem-heading">
        <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-amber-500/5 rounded-full blur-[200px]" />
        </div>

        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="text-center mb-16"
          >
            <h2 id="problem-heading" className="text-3xl sm:text-4xl md:text-5xl font-bold font-display mb-6">
              Every Hour You Spend Switching AI Tabs
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-orange-400">Is an Hour You'll Never Get Back</span>
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              The average researcher loses <strong className="text-white">12+ hours per week</strong> copy-pasting between ChatGPT, Claude, and Gemini.
              That's <strong className="text-amber-400">624 hours per year</strong> — almost a month of your life.</p>
          </motion.div>

          {/* Before/After comparison */}
          <div className="grid md:grid-cols-2 gap-8 items-stretch">
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="rounded-2xl border border-red-500/20 bg-red-500/5 p-8 space-y-4"
            >
              <div className="flex items-center gap-2 text-red-400 font-semibold text-lg mb-4">
                <Clock className="w-6 h-6" />
                Without MetaLLM
              </div>
              {[
                "Open 5+ AI tabs",
                "Type the same query 5 times",
                "Wait for each response separately",
                "Manually compare & synthesize",
                "Second-guess which AI is right",
                "Repeat for every new question",
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-3 text-muted-foreground">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500/60 shrink-0" />
                  {item}
                </div>
              ))}
              <p className="text-red-400/80 text-sm font-medium pt-4 border-t border-red-500/10">
                ⏱ Average time: 25-40 minutes per question
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-8 space-y-4"
            >
              <div className="flex items-center gap-2 text-emerald-400 font-semibold text-lg mb-4">
                <Zap className="w-6 h-6" />
                With MetaLLM
              </div>
              {[
                "One query, one platform",
                "AI auto-routes to the best model",
                "Prompt auto-enhanced for better results",
                "All 13 models queried simultaneously",
                "AI synthesizes unified, accurate answer",
                "Debate mode for multi-perspective analysis",
                "Shared memory retains your context",
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-3 text-muted-foreground">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  {item}
                </div>
              ))}
              <p className="text-emerald-400/80 text-sm font-medium pt-4 border-t border-emerald-500/10">
                ⚡ Average time: 30 seconds per question
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* FEATURES GRID                                                          */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      <section id="features" className="py-24 bg-gradient-to-b from-black/20 to-transparent border-t border-white/5" aria-labelledby="features-heading" ref={featuresReveal.ref}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            variants={stagger}
            initial="hidden"
            animate={featuresReveal.isInView ? "visible" : "hidden"}
            className="text-center mb-16"
          >
            <motion.div variants={fadeUp}>
              <span className="text-amber-400 text-sm font-semibold uppercase tracking-widest">Why MetaLLM</span>
              <h2 id="features-heading" className="text-3xl sm:text-4xl md:text-5xl font-bold font-display mt-3 mb-4">
                Intelligence Multiplied,{" "}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-300 to-yellow-300">
                  Time Divided
                </span>
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Every feature is engineered to save your most valuable resource — time — while maximizing the accuracy of your decisions.
              </p>
            </motion.div>
          </motion.div>

          <motion.div
            variants={stagger}
            initial="hidden"
            animate={featuresReveal.isInView ? "visible" : "hidden"}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            {features.map((feature, i) => (
              <motion.article
                key={i}
                variants={fadeUp}
                className="group relative p-6 rounded-2xl bg-card/50 border border-white/5 hover:border-amber-500/20 transition-all duration-500 hover:-translate-y-1 hover:shadow-xl hover:shadow-amber-500/5"
              >
                <div className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${feature.color} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
                <div className="relative z-10">
                  <div className={`w-12 h-12 rounded-xl bg-white/5 group-hover:bg-white/10 flex items-center justify-center mb-4 ${feature.iconColor} transition-colors`}>
                    {feature.icon}
                  </div>
                  <h3 className="text-xl font-bold font-display mb-2">{feature.title}</h3>
                  <p className="text-muted-foreground leading-relaxed">{feature.description}</p>
                </div>
              </motion.article>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* TARGET AUDIENCE SECTION (Psychology: Identity Labeling)                 */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      <section className="py-24 relative overflow-hidden" aria-labelledby="audience-heading" ref={audienceReveal.ref}>
        <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
          <div className="absolute top-1/3 right-0 w-[400px] h-[400px] bg-purple-600/8 rounded-full blur-[150px]" />
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <motion.div
            variants={stagger}
            initial="hidden"
            animate={audienceReveal.isInView ? "visible" : "hidden"}
            className="text-center mb-16"
          >
            <motion.div variants={fadeUp}>
              <span className="text-amber-400 text-sm font-semibold uppercase tracking-widest">Built For You</span>
              <h2 id="audience-heading" className="text-3xl sm:text-4xl md:text-5xl font-bold font-display mt-3 mb-4">
                Your Time Is Too Valuable to Waste
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Whether you're writing a thesis, publishing research, or building a startup — MetaLLM gives you an unfair advantage.
              </p>
            </motion.div>
          </motion.div>

          {/* Audience image */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="mb-16 rounded-2xl overflow-hidden border border-white/10 max-w-4xl mx-auto"
          >
            <img
              src="/target-audience.png"
              alt="Students, researchers, and founders using MetaLLM AI aggregator to save time and make better decisions"
              className="w-full h-auto"
              loading="lazy"
              width={900}
              height={500}
            />
          </motion.div>

          <motion.div
            variants={stagger}
            initial="hidden"
            animate={audienceReveal.isInView ? "visible" : "hidden"}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8"
          >
            {audienceCards.map((card, i) => (
              <motion.article
                key={i}
                variants={fadeUp}
                className={`relative rounded-2xl border ${card.color} bg-card/40 backdrop-blur-sm p-8 transition-all duration-500 hover:-translate-y-2 hover:shadow-2xl group`}
              >
                <div className={`w-14 h-14 rounded-xl ${card.iconBg} flex items-center justify-center mb-5 ${card.iconColor}`}>
                  {card.icon}
                </div>
                <h3 className="text-2xl font-bold font-display mb-1">{card.title}</h3>
                <p className="text-amber-400/80 text-sm font-medium mb-4">{card.tagline}</p>
                <p className="text-muted-foreground text-sm mb-3 italic">"{card.pain}"</p>
                <p className="text-foreground/80 text-sm mb-6 leading-relaxed">{card.solution}</p>
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                  <span className="text-emerald-400">{card.stat}</span>
                </div>
              </motion.article>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* HOW IT WORKS                                                           */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      <section id="how-it-works" className="py-24 bg-gradient-to-b from-black/20 to-transparent border-t border-white/5" aria-labelledby="how-heading" ref={howReveal.ref}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            variants={stagger}
            initial="hidden"
            animate={howReveal.isInView ? "visible" : "hidden"}
            className="text-center mb-16"
          >
            <motion.div variants={fadeUp}>
              <span className="text-amber-400 text-sm font-semibold uppercase tracking-widest">Simple Process</span>
              <h2 id="how-heading" className="text-3xl sm:text-4xl md:text-5xl font-bold font-display mt-3 mb-4">
                Three Steps to{" "}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-300 to-yellow-300">
                  Smarter Decisions
                </span>
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                No complex setup. No learning curve. Just ask and get the most comprehensive AI answer available.
              </p>
            </motion.div>
          </motion.div>

          <motion.div
            variants={stagger}
            initial="hidden"
            animate={howReveal.isInView ? "visible" : "hidden"}
            className="space-y-8"
          >
            {howItWorks.map((step, i) => (
              <motion.div
                key={i}
                variants={fadeUp}
                className="flex flex-col md:flex-row items-start gap-6 p-8 rounded-2xl bg-card/30 border border-white/5 hover:border-amber-500/20 transition-all duration-500 group"
              >
                <div className="flex items-center gap-4 shrink-0">
                  <span className="text-5xl font-bold font-display text-transparent bg-clip-text bg-gradient-to-b from-amber-400/40 to-amber-400/10">
                    {step.step}
                  </span>
                  <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-400 group-hover:bg-amber-500/20 transition-colors">
                    {step.icon}
                  </div>
                </div>
                <div>
                  <h3 className="text-xl font-bold font-display mb-2">{step.title}</h3>
                  <p className="text-muted-foreground leading-relaxed">{step.description}</p>
                </div>
                {i < howItWorks.length - 1 && (
                  <div className="hidden md:block w-px h-8 bg-gradient-to-b from-amber-500/20 to-transparent mx-auto" />
                )}
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* TESTIMONIALS                                                           */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      <section className="py-24 relative" aria-labelledby="testimonials-heading" ref={testimonialsReveal.ref}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            variants={stagger}
            initial="hidden"
            animate={testimonialsReveal.isInView ? "visible" : "hidden"}
            className="text-center mb-16"
          >
            <motion.div variants={fadeUp}>
              <span className="text-amber-400 text-sm font-semibold uppercase tracking-widest">Testimonials</span>
              <h2 id="testimonials-heading" className="text-3xl sm:text-4xl md:text-5xl font-bold font-display mt-3 mb-4">
                Trusted by People Who{" "}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-300 to-yellow-300">
                  Value Their Time
                </span>
              </h2>
            </motion.div>
          </motion.div>

          <motion.div
            variants={stagger}
            initial="hidden"
            animate={testimonialsReveal.isInView ? "visible" : "hidden"}
            className="grid grid-cols-1 md:grid-cols-3 gap-8"
          >
            {testimonials.map((t, i) => (
              <motion.div
                key={i}
                variants={fadeUp}
                className="p-8 rounded-2xl bg-card/40 border border-white/5 hover:border-amber-500/15 transition-all duration-500 relative group"
              >
                {/* Stars */}
                <div className="flex gap-1 mb-4">
                  {[...Array(5)].map((_, j) => (
                    <Star key={j} className="w-4 h-4 fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <p className="text-foreground/80 leading-relaxed mb-6 italic">"{t.quote}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-500/30 to-purple-500/30 flex items-center justify-center text-sm font-bold text-amber-300">
                    {t.avatar}
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{t.name}</p>
                    <p className="text-xs text-muted-foreground">{t.role}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* PRICING                                                                */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      <section id="pricing" className="py-24 bg-gradient-to-b from-black/20 to-transparent border-t border-white/5" aria-labelledby="pricing-heading" ref={pricingReveal.ref}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            variants={stagger}
            initial="hidden"
            animate={pricingReveal.isInView ? "visible" : "hidden"}
            className="text-center mb-16"
          >
            <motion.div variants={fadeUp}>
              <span className="text-amber-400 text-sm font-semibold uppercase tracking-widest">Simple Pricing</span>
              <h2 id="pricing-heading" className="text-3xl sm:text-4xl md:text-5xl font-bold font-display mt-3 mb-4">
                Pick the plan that keeps your
                {" "}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-300 to-yellow-300">
                  best models close
                </span>
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Start monthly for flexibility or go yearly and save {SUBSCRIPTION_YEARLY_DISCOUNT_PERCENT}% on your Pro access.
              </p>
            </motion.div>
          </motion.div>

          <motion.div
            variants={stagger}
            initial="hidden"
            animate={pricingReveal.isInView ? "visible" : "hidden"}
            className="grid gap-6 lg:grid-cols-2"
          >
            <motion.article
              variants={fadeUp}
              className="rounded-3xl border border-white/10 bg-card/40 p-8 backdrop-blur-xl"
            >
              <p className="text-sm font-semibold uppercase tracking-[0.28em] text-white/45">Monthly</p>
              <div className="mt-5 flex items-end gap-3">
                <span className="text-5xl font-bold font-display text-white">${SUBSCRIPTION_MONTHLY_PRICE}</span>
                <span className="pb-2 text-base text-muted-foreground">/ month</span>
              </div>
              <p className="mt-4 max-w-md text-sm leading-7 text-muted-foreground">
                Best for flexible access if you want to try MetaLLM with full Pro workflow and upgrade on your own pace.
              </p>
              <div className="mt-8 space-y-3 text-sm text-foreground/85">
                {[
                  "Full MetaLLM Pro access",
                  "Smart routing across 13+ AI models",
                  "Prompt enhancement, debate mode, and deep web search",
                  "Cancel any time",
                ].map((item) => (
                  <div key={item} className="flex items-center gap-3">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </motion.article>

            <motion.article
              variants={fadeUp}
              className="relative overflow-hidden rounded-3xl border border-amber-400/25 bg-[linear-gradient(180deg,rgba(250,204,21,0.12),rgba(255,255,255,0.03))] p-8 shadow-[0_24px_90px_rgba(250,204,21,0.08)] backdrop-blur-xl"
            >
              <div className="absolute right-5 top-5 rounded-full border border-amber-300/25 bg-amber-300/12 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-100">
                {SUBSCRIPTION_YEARLY_DISCOUNT_PERCENT}% Off
              </div>
              <p className="text-sm font-semibold uppercase tracking-[0.28em] text-amber-100/70">Yearly</p>
              <div className="mt-5 flex items-end gap-3">
                <span className="text-5xl font-bold font-display text-white">${SUBSCRIPTION_YEARLY_PRICE}</span>
                <span className="pb-2 text-base text-white/65">/ year</span>
              </div>
              <p className="mt-3 text-sm font-medium text-amber-200">
                Only ${SUBSCRIPTION_YEARLY_MONTHLY_EQUIVALENT}/month billed annually.
              </p>
              <p className="mt-4 max-w-md text-sm leading-7 text-white/72">
                Best value for teams, founders, researchers, and power users who want lower yearly cost with uninterrupted access.
              </p>
              <div className="mt-8 space-y-3 text-sm text-white/88">
                {[
                  "Everything in Monthly",
                  "Save 20% compared to monthly billing",
                  "Priority long-term value for daily use",
                  "One yearly payment, less billing overhead",
                ].map((item) => (
                  <div key={item} className="flex items-center gap-3">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-amber-300" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </motion.article>
          </motion.div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* FAQ SECTION (SEO + Psychology: Objection Handling)                      */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      <section id="faq" className="py-24 bg-gradient-to-b from-black/20 to-transparent border-t border-white/5" aria-labelledby="faq-heading" ref={faqReveal.ref}>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            variants={stagger}
            initial="hidden"
            animate={faqReveal.isInView ? "visible" : "hidden"}
            className="text-center mb-16"
          >
            <motion.div variants={fadeUp}>
              <span className="text-amber-400 text-sm font-semibold uppercase tracking-widest">FAQ</span>
              <h2 id="faq-heading" className="text-3xl sm:text-4xl font-bold font-display mt-3 mb-4">
                Frequently Asked Questions
              </h2>
              <p className="text-lg text-muted-foreground">
                Everything you need to know about MetaLLM's multi-AI aggregation platform.
              </p>
            </motion.div>
          </motion.div>

          <motion.div
            variants={stagger}
            initial="hidden"
            animate={faqReveal.isInView ? "visible" : "hidden"}
            className="space-y-4"
          >
            {faqs.map((faq, i) => (
              <motion.div key={i} variants={fadeUp}>
                <button
                  onClick={() => setActiveFaq(activeFaq === i ? null : i)}
                  className="w-full text-left p-6 rounded-xl bg-card/40 border border-white/5 hover:border-amber-500/15 transition-all duration-300"
                  aria-expanded={activeFaq === i}
                >
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold font-display text-lg pr-4">{faq.q}</h3>
                    <ChevronDown className={`w-5 h-5 text-amber-400 shrink-0 transition-transform duration-300 ${activeFaq === i ? "rotate-180" : ""}`} />
                  </div>
                  <AnimatePresence>
                    {activeFaq === i && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        className="overflow-hidden"
                      >
                        <p className="text-muted-foreground mt-4 leading-relaxed">{faq.a}</p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </button>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* FINAL CTA (Psychology: Urgency + Social Proof)                          */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      <section className="py-24 relative overflow-hidden" aria-labelledby="cta-heading" ref={ctaReveal.ref}>
        <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-amber-500/8 rounded-full blur-[200px]" />
          {!isMobile && <FloatingParticles />}
        </div>

        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
          <motion.div
            variants={stagger}
            initial="hidden"
            animate={ctaReveal.isInView ? "visible" : "hidden"}
          >
            <motion.div variants={fadeUp} className="mb-6">
              <img
                src="/logo-96.jpg"
                alt="MetaLLM Logo"
                className="w-20 h-20 mx-auto rounded-2xl ring-2 ring-amber-500/20 shadow-xl shadow-amber-500/10 mb-8"
                loading="lazy"
                decoding="async"
                width={80}
                height={80}
              />
            </motion.div>
            <motion.h2 variants={fadeUp} id="cta-heading" className="text-3xl sm:text-4xl md:text-5xl font-bold font-display mb-6">
              Stop Wasting Time.{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-300 to-yellow-300">
                Start Deciding.
              </span>
            </motion.h2>
            <motion.p variants={fadeUp} className="text-lg text-muted-foreground max-w-2xl mx-auto mb-10">
              Join thousands of students, researchers, and founders who use MetaLLM to make faster, more accurate decisions with multi-AI intelligence.
            </motion.p>
            <motion.p variants={fadeUp} className="mb-8 text-sm text-white/68">
              Pro starts at ${SUBSCRIPTION_MONTHLY_PRICE}/month or ${SUBSCRIPTION_YEARLY_PRICE}/year with {SUBSCRIPTION_YEARLY_DISCOUNT_PERCENT}% off on yearly billing.
            </motion.p>
            <motion.div variants={fadeUp}>
              <a href="/login">
                <Button
                  size="lg"
                  className="h-16 px-12 text-xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-black font-bold shadow-2xl shadow-amber-500/30 hover:shadow-amber-400/50 transition-all duration-300 group"
                >
                  Get Started — It Takes 30 Seconds
                  <ArrowRight className="w-6 h-6 ml-3 group-hover:translate-x-1 transition-transform" />
                </Button>
              </a>
              <p className="mt-4 text-sm text-muted-foreground/60 flex items-center justify-center gap-2">
                <Lock className="w-3.5 h-3.5" />
                100% secure.  
              </p>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* FOOTER (SEO Links)                                                     */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      <footer className="py-16 border-t border-white/5 bg-background" role="contentinfo">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-6 gap-8 mb-12">
            {/* Brand */}
            <div className="md:col-span-2">
              <a href="/" className="flex items-center gap-3 mb-4">
                <img src="/logo-96.jpg" alt="MetaLLM" className="w-10 h-10 rounded-lg" loading="lazy" decoding="async" width={40} height={40} />
                <span className="text-xl font-bold font-display">
                  Meta<span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-yellow-300">LLM</span>
                </span>
              </a>
              <p className="text-sm text-muted-foreground leading-relaxed">
                The ultimate AI aggregator and AI orchestrator. Query multiple AI models simultaneously and enjoy all AI in one chat.
              </p>
              <div className="flex items-center flex-wrap gap-3 mt-4">
                <a
                  href="https://x.com/metallmai"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="MetaLLM on X (Twitter)"
                  className="text-muted-foreground hover:text-white transition-colors"
                >
                  <Twitter className="w-5 h-5" />
                </a>
                <a
                  href="https://www.linkedin.com/company/metallmtech/"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="MetaLLM on LinkedIn"
                  className="text-muted-foreground hover:text-white transition-colors"
                >
                  <Linkedin className="w-5 h-5" />
                </a>
                <a
                  href="mailto:support@metallm.tech"
                  aria-label="Email MetaLLM Support"
                  className="text-muted-foreground hover:text-white transition-colors"
                >
                  <Mail className="w-5 h-5" />
                </a>
                <a
                  href="https://medium.com/@metallm"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="MetaLLM on Medium"
                  className="text-muted-foreground hover:text-white transition-colors"
                >
                  <SiMedium className="w-5 h-5" />
                </a>
                <a
                  href="https://play.google.com/store/apps/details?id=tech.metallm.app"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="MetaLLM on Google Play"
                  className="text-muted-foreground hover:text-white transition-colors"
                >
                  <FaGooglePlay className="w-4 h-4" />
                </a>
                <a
                  href="https://www.trustpilot.com/review/metallm.tech"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="MetaLLM on Trustpilot"
                  className="text-muted-foreground hover:text-white transition-colors"
                >
                  <SiTrustpilot className="w-5 h-5" />
                </a>
              </div>
            </div>

            {/* Product */}
            <div>
              <h4 className="font-semibold font-display mb-4 text-sm uppercase tracking-wider text-amber-400/80">Product</h4>
              <ul className="space-y-3">
                <li><a href="#features" className="text-sm text-muted-foreground hover:text-white transition-colors">Features</a></li>
                <li><a href="#how-it-works" className="text-sm text-muted-foreground hover:text-white transition-colors">How It Works</a></li>
                <li><a href="/compare" className="text-sm text-muted-foreground hover:text-white transition-colors">Model Compare Tool</a></li>
                <li><a href="/login" className="text-sm text-muted-foreground hover:text-white transition-colors">Get Started</a></li>
                <li><a href="#faq" className="text-sm text-muted-foreground hover:text-white transition-colors">FAQ</a></li>
              </ul>
            </div>

            {/* Compare MetaLLM */}
            <div>
              <h4 className="font-semibold font-display mb-4 text-sm uppercase tracking-wider text-amber-400/80">Compare</h4>
              <ul className="space-y-3">
                <li><a href="/compare-competitors" className="text-sm text-muted-foreground hover:text-white transition-colors font-medium text-amber-400/80">MetaLLM vs All</a></li>
                <li><a href="/compare/poe" className="text-sm text-muted-foreground hover:text-white transition-colors">vs Poe</a></li>
                <li><a href="/compare/chatly" className="text-sm text-muted-foreground hover:text-white transition-colors">vs Chatly</a></li>
                <li><a href="/compare/megallm" className="text-sm text-muted-foreground hover:text-white transition-colors">vs MegaLLM</a></li>
                <li><a href="/compare/perplexity" className="text-sm text-muted-foreground hover:text-white transition-colors">vs Perplexity</a></li>
              </ul>
            </div>

            {/* LLM Resources & Ecosystem */}
            <div>
              <h4 className="font-semibold font-display mb-4 text-sm uppercase tracking-wider text-amber-400/80">Resources</h4>
              <ul className="space-y-3">
                <li><a href="/llms.txt" target="_blank" className="text-sm text-muted-foreground hover:text-white transition-colors">LLMs (llms.txt)</a></li>
                <li><a href="/llms-full.txt" target="_blank" className="text-sm text-muted-foreground hover:text-white transition-colors">Full LLMs (llms-full.txt)</a></li>
                <li><a href="/blogs" className="text-sm text-muted-foreground hover:text-white transition-colors">Blogs & Insights</a></li>
                <li><a href="/tutorials/" className="text-sm text-muted-foreground hover:text-white transition-colors">Tutorials</a></li>
              </ul>
            </div>

            {/* Legal */}
            <div>
              <h4 className="font-semibold font-display mb-4 text-sm uppercase tracking-wider text-amber-400/80">Legal</h4>
              <ul className="space-y-3">
                <li><a href="/terms" className="text-sm text-muted-foreground hover:text-white transition-colors">Terms of Service</a></li>
                <li><a href="/privacy" className="text-sm text-muted-foreground hover:text-white transition-colors">Privacy Policy</a></li>
                <li><a href="/refund" className="text-sm text-muted-foreground hover:text-white transition-colors">Refund Policy</a></li>
                <li><a href="/sitemap.xml" className="text-sm text-muted-foreground hover:text-white transition-colors">Sitemap</a></li>
                <li>
                  <a
                    href="https://stats.uptimerobot.com/HSqaIQf4Rk"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-muted-foreground hover:text-white transition-colors inline-flex items-center gap-1.5"
                  >
                    <Activity className="w-3.5 h-3.5 text-green-400" />
                    System Status
                  </a>
                </li>
              </ul>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="pt-8 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground/60">
              © {new Date().getFullYear()} MetaLLM. All rights reserved.
            </p>
            <div className="text-right">
              <p className="text-xs text-muted-foreground/40">
                MetaLLM — AI Aggregator Platform | Multi-Model AI Analysis | Gemini, Grok, GPT, Claude, LLaMA , Kimi K, Qwen , Nemotron
              </p>
              <p className="text-[10px] text-muted-foreground/30 mt-1">
                Last updated: March 30, 2026
              </p>
            </div>
          </div>
        </div>
      </footer>

      </main>
    </div>
  );
}
