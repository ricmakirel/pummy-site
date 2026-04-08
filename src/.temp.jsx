import { motion, useMotionValue, useTransform, animate, useScroll, useTransform as useScrollTransform } from 'framer-motion'
import { useState, useEffect, useMemo, useRef } from 'react'

// ─── 核心调优参数 ─────────────────────────────────────────────────────────────
const SHOW_PATH          = true;
const PATH_STROKE_WIDTH  = 5;
const PATH_COLOR         = "#F04E23";
const PATH_OPACITY       = 0.4;
const PATH_DASH_LEN      = 8;
const PATH_DASH_GAP      = 8;

const PAW_SIZE           = 1.5;
const NUM_PAWS           = 16;

const TOTAL_DURATION      = 12.5;

const PAW_WALK_START      = 0;
const PAW_WALK_DURATION   = 7;
const PAW_STAY_DURATION   = 3;

const GAP_AFTER_PAWS      = 0.2;
const PATH_GROW_DURATION  = 2;
const PATH_SOFT_EDGE      = 1.2;

const WAYPOINT_APPEAR_LAG = 0.3;
const WAYPOINT_FADE_TIME  = 0.8;

// ─── 逻辑计算 ──────────────────────────────────────────────────────────────
const LAST_PAW_VANISH_SEC = PAW_WALK_DURATION + PAW_STAY_DURATION;
const PATH_START_SEC = LAST_PAW_VANISH_SEC + GAP_AFTER_PAWS;

const WAYPOINTS_BASE = [
  { x: 140, title: 'Inspire', desc: 'Share pet photo', image: 'step1-inspire.png', down: true  },
  { x: 320, title: 'Design',  desc: 'Shape the form',  image: 'step2-design.png', down: false },
  { x: 500, title: 'Produce', desc: 'Make it real',      image: 'step3-produce.png', down: true  },
  { x: 680, title: 'Receive', desc: 'Treasure your creation',    image: 'step4-receive.png', down: false },
].map((wp) => {
  const tBase = (wp.x - 20) / (800 - 20);
  const baseY = 240 + (80 - 240) * ((wp.x - 140) / (680 - 140));
  return { ...wp, y: baseY, tBase };
});

const PATH_ANCHORS = [
  { x: 20,  y: 280 },
  { x: WAYPOINTS_BASE[0].x, y: WAYPOINTS_BASE[0].y - 65 },
  { x: WAYPOINTS_BASE[1].x, y: WAYPOINTS_BASE[1].y + 65 },
  { x: WAYPOINTS_BASE[2].x, y: WAYPOINTS_BASE[2].y - 65 },
  { x: WAYPOINTS_BASE[3].x, y: WAYPOINTS_BASE[3].y + 65 },
  { x: 800, y: 50  },
];

const catmullRom = (p0, p1, p2, p3, t) => {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
};

const getPointOnPath = (t, anchors) => {
  const n = anchors.length - 1;
  const rawT = t * n;
  let i = Math.floor(rawT);
  let localT = rawT - i;
  if (i >= n) { i = n - 1; localT = 1.0; }
  const getP = (idx) => anchors[Math.max(0, Math.min(n, idx))];
  const p0 = getP(i - 1), p1 = getP(i), p2 = getP(i + 1), p3 = getP(i + 2);
  const x = catmullRom(p0.x, p1.x, p2.x, p3.x, localT);
  const y = catmullRom(p0.y, p1.y, p2.y, p3.y, localT);
  const delta = 0.001;
  const nx = catmullRom(p0.x, p1.x, p2.x, p3.x, Math.min(1, localT + delta));
  const ny = catmullRom(p0.y, p1.y, p2.y, p3.y, Math.min(1, localT + delta));
  return { x, y, r: Math.atan2(ny - y, nx - x) * (180 / Math.PI) + 90 };
};

const pathD = (() => {
  let d = `M ${PATH_ANCHORS[0].x} ${PATH_ANCHORS[0].y}`;
  for (let t = 0.01; t <= 1; t += 0.01) { const p = getPointOnPath(t, PATH_ANCHORS); d += ` L ${p.x} ${p.y}`; }
  return d;
})();

// ─── 子组件 ────────────────────────────────────────────────────────────────────

function MaskBead({ x, y, t, progress }) {
  const pointStartSec = PATH_START_SEC + (t * PATH_GROW_DURATION);
  const startProg = pointStartSec / TOTAL_DURATION;
  const endProg   = (pointStartSec + PATH_SOFT_EDGE) / TOTAL_DURATION;
  const opacity = useTransform(progress, [startProg, endProg], [0, 1], { clamp: true });
  return <motion.circle cx={x} cy={y} r={PATH_STROKE_WIDTH + 3} fill="white" style={{ opacity }} />;
}

function PawIcon({ x, y, rotation, t, progress }) {
  const appearSec = (t * PAW_WALK_DURATION);
  const startProg = appearSec / TOTAL_DURATION;
  const peakProg  = (appearSec + PAW_STAY_DURATION * 0.2) / TOTAL_DURATION;
  const endProg   = (appearSec + PAW_STAY_DURATION) / TOTAL_DURATION;
  return (
    <motion.g
      transform={`translate(${x - 9}, ${y - 9}) rotate(${rotation}, 9, 9) scale(${PAW_SIZE})`}
      style={{ opacity: useTransform(progress, [startProg, peakProg, endProg], [0, 0.8, 0]) }}
    >
      <ellipse cx="9" cy="14" rx="5.5" ry="4.5" fill="#A0784A" />
      <circle cx="4" cy="7" r="2.5" fill="#A0784A" /><circle cx="9" cy="4" r="2.5" fill="#A0784A" /><circle cx="14" cy="7" r="2.5" fill="#A0784A" />
    </motion.g>
  )
}

function ImageWithLabel({ cx, cy, down, title, desc, image, opacity, offsetX = 0 }) {
  const dir = down ? 1 : -1;
  const imageY = cy + dir * 45;
  const visualCx = cx + offsetX;

  const titleY = down ? imageY + 80 : imageY - 100;
  const descY = titleY + 24;

  return (
    <motion.g style={{ opacity }}>
      <defs>
        <radialGradient id={`glow-${image}`}>
          <stop offset="0%" stopColor="white" stopOpacity="1" />
          <stop offset="75%" stopColor="white" stopOpacity="0.6" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </radialGradient>
      </defs>

      <motion.g
        animate={{ y: [0, -12, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      >
        <ellipse cx={visualCx} cy={imageY + 52} rx={24} ry={6} fill="#000" opacity="0.06" />

        <image
          x={visualCx - 50}
          y={imageY - 50}
          width={100}
          height={100}
          href={`/${image}`}
          opacity={0.92}
          style={{ borderRadius: "50%", filter: "brightness(1.15) saturate(0.95)" }}
        />

        <circle cx={visualCx} cy={imageY} r={50} fill={`url(#glow-${image})`} opacity="0.25" style={{ mixBlendMode: "screen" }} />
        <circle cx={visualCx} cy={imageY} r={52} fill="none" stroke="#F04E23" strokeWidth="0.8" opacity="0.1" />
      </motion.g>

      <text x={visualCx} y={titleY} textAnchor="middle" fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" fontSize="28" fontWeight="600" fill="#1c1917" letterSpacing="0.3">{title}</text>
      <text x={visualCx} y={descY} textAnchor="middle" fontSize="15.5" fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" fontWeight="400" fill="#78716c" opacity="0.78">{desc}</text>
    </motion.g>
  )
}

function JourneyPath() {
  const drawProgress = useMotionValue(0);

  useEffect(() => {
    let active = true;
    const cycle = async () => {
      while (active) {
        drawProgress.set(0);
        await animate(drawProgress, 1, { duration: TOTAL_DURATION, ease: 'linear' });
        if (!active) break;
        await new Promise(r => setTimeout(r, 3000));
      }
    };
    cycle(); return () => { active = false };
  }, []);

  const maskBeads = useMemo(() => {
    const beads = [];
    for (let i = 0; i <= 180; i++) {
      const t = i / 180;
      const p = getPointOnPath(t, PATH_ANCHORS);
      beads.push({ x: p.x, y: p.y, t });
    }
    return beads;
  }, []);

  const pawPositions = useMemo(() => {
    const samples = 300;
    let totalLen = 0;
    const luts = [{ t: 0, len: 0 }];

    let prevP = getPointOnPath(0, PATH_ANCHORS);
    for (let i = 1; i <= samples; i++) {
      const t = i / samples;
      const currP = getPointOnPath(t, PATH_ANCHORS);
      const dist = Math.sqrt(Math.pow(currP.x - prevP.x, 2) + Math.pow(currP.y - prevP.y, 2));
      totalLen += dist;
      luts.push({ t, len: totalLen });
      prevP = currP;
    }

    const paws = [];
    const step = totalLen / (NUM_PAWS - 1);

    for (let i = 0; i < NUM_PAWS; i++) {
      const targetLen = i * step;
      let low = 0, high = luts.length - 1;
      while (low < high - 1) {
        const mid = Math.floor((low + high) / 2);
        if (luts[mid].len < targetLen) low = mid;
        else high = mid;
      }
      const p1 = luts[low], p2 = luts[high];
      const ratio = (targetLen - p1.len) / (p2.len - p1.len || 1);
      const exactT = p1.t + (p2.t - p1.t) * ratio;

      const p = getPointOnPath(exactT, PATH_ANCHORS);
      const side = i % 2 === 0 ? 1 : -1;
      const rad = (p.r - 90) * Math.PI / 180;
      paws.push({
        x: p.x + side * (-10 * Math.sin(rad)),
        y: p.y + side * (10 * Math.cos(rad)),
        r: p.r + side * 15,
        t: exactT
      });
    }
    return paws;
  }, []);

  return (
    <div className="relative w-full h-[280px] sm:h-[420px] lg:h-[560px]">
      <svg className="absolute inset-0 w-full h-full" viewBox="-50 -110 900 580" preserveAspectRatio="xMidYMid meet">
        <defs>
          <mask id="beadMask">
            {maskBeads.map((bead, i) => (
              <MaskBead key={i} x={bead.x} y={bead.y} t={bead.t} progress={drawProgress} />
            ))}
          </mask>
        </defs>

        {SHOW_PATH && (
          <path d={pathD} fill="none" stroke={PATH_COLOR} strokeWidth={PATH_STROKE_WIDTH} strokeDasharray={`${PATH_DASH_LEN} ${PATH_DASH_GAP}`} strokeOpacity={PATH_OPACITY} mask="url(#beadMask)" />
        )}

        {pawPositions.map((paw, i) => (
          <PawIcon key={i} x={paw.x} y={paw.y} rotation={paw.r} t={paw.t} progress={drawProgress} />
        ))}

        {WAYPOINTS_BASE.map((wp, i) => {
          const arriveSec = wp.tBase * PAW_WALK_DURATION;
          const startProg = (arriveSec + WAYPOINT_APPEAR_LAG) / TOTAL_DURATION;
          const endProg   = (arriveSec + WAYPOINT_APPEAR_LAG + WAYPOINT_FADE_TIME) / TOTAL_DURATION;
          const opacity = useTransform(drawProgress, [startProg, endProg], [0, 1]);
          const offsetX = i === 1 ? -18 : i === 2 ? 18 : 0;
          return <ImageWithLabel key={i} cx={wp.x} cy={wp.y} down={wp.down} title={wp.title} desc={wp.desc} image={wp.image} opacity={opacity} offsetX={offsetX} />
        })}
      </svg>
    </div>
  )
}

// ─── Navbar ───────────────────────────────────────────────────────────────────
function Navbar({ onJoinClick }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <motion.nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? 'bg-amber-50/90 backdrop-blur-md shadow-sm border-b border-orange-100/50' : 'bg-transparent'}`}
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="max-w-6xl mx-auto px-6 sm:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-gradient-to-r from-green-400 to-emerald-400 animate-pulse shadow-sm shadow-green-300/50" />
          <span className="text-xl font-serif font-bold">
            P<span className="italic text-orange-500">u</span>mmy
          </span>
          <span className="text-xs font-medium tracking-widest text-orange-700/70 uppercase hidden sm:block">by Makirel</span>
        </div>

        {/* Nav links – desktop */}
        <div className="hidden md:flex items-center gap-8 text-sm font-medium text-stone-600">
          <a href="#how-it-works" className="hover:text-orange-500 transition-colors">How It Works</a>
          <a href="#features" className="hover:text-orange-500 transition-colors">Features</a>
          <a href="#waitlist" className="hover:text-orange-500 transition-colors">Pricing</a>
        </div>

        {/* CTA */}
        <button
          onClick={onJoinClick}
          className="px-4 py-2 bg-stone-900 text-white text-sm font-semibold rounded-full hover:bg-stone-700 active:scale-95 transition-all"
        >
          Join Waitlist
        </button>
      </div>
    </motion.nav>
  );
}

// ─── Feature Card ──────────────────────────────────────────────────────────────
function FeatureCard({ icon, title, description, delay = 0 }) {
  return (
    <motion.div
      className="flex flex-col gap-4 p-6 rounded-2xl bg-white/60 border border-orange-100 hover:border-orange-200 hover:shadow-md transition-all"
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5, delay }}
    >
      <div className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-xl">
        {icon}
      </div>
      <div>
        <h3 className="font-semibold text-stone-900 mb-1">{title}</h3>
        <p className="text-sm text-stone-500 leading-relaxed">{description}</p>
      </div>
    </motion.div>
  );
}

// ─── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const waitlistRef = useRef(null);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (email.includes('@')) {
      setSubmitted(true);
      setTimeout(() => { setEmail(''); setSubmitted(false); }, 3000);
    }
  };

  const scrollToWaitlist = () => {
    waitlistRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  return (
    <div className="min-h-screen bg-amber-50 text-stone-900 font-sans overflow-x-hidden">

      {/* ── 水彩氛围背景 ── */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-br from-yellow-100/30 via-orange-50/20 to-rose-100/20" />
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-yellow-200/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/3 right-1/4 w-96 h-96 bg-rose-200/10 rounded-full blur-3xl" />
        <div className="absolute top-1/3 right-0 w-72 h-72 bg-cyan-200/10 rounded-full blur-3xl" />
      </div>

      <Navbar onJoinClick={scrollToWaitlist} />

      {/* ════════════════════════════════════════════════════════════
          HERO SECTION
      ════════════════════════════════════════════════════════════ */}
      <section className="relative z-10 min-h-screen flex flex-col items-center justify-center text-center px-6 pt-24 pb-16">
        <motion.div
          className="text-xs font-mono tracking-widest text-orange-700 mb-6 opacity-70"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 0.7, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          → MAKE_IT_REAL
        </motion.div>

        <motion.h1
          className="text-5xl sm:text-6xl lg:text-7xl font-serif font-bold leading-tight mb-6 max-w-3xl"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.6 }}
        >
          With Your Pet<br />
          Create{' '}
          <span className="italic text-orange-500">Into Forms</span>
        </motion.h1>

        <motion.p
          className="text-lg sm:text-xl text-stone-600 max-w-xl leading-relaxed mb-10"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45, duration: 0.6 }}
        >
          Art creation is no longer a privilege. <br />
          Inspired by your pet, powered by technology, made by you.
        </motion.p>

        <motion.div
          className="flex flex-col sm:flex-row gap-4 items-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.6 }}
        >
          <button
            onClick={scrollToWaitlist}
            className="px-8 py-3.5 bg-stone-900 text-white font-semibold rounded-full hover:bg-stone-700 active:scale-95 transition-all shadow-lg shadow-stone-900/10 text-base"
          >
            Start for free
          </button>
          <a
            href="#how-it-works"
            className="px-8 py-3.5 border border-stone-300 text-stone-700 font-semibold rounded-full hover:border-orange-400 hover:text-orange-600 transition-all text-base"
          >
            See how it works
          </a>
        </motion.div>

        {/* Hero sub-badges */}
        <motion.div
          className="flex flex-col sm:flex-row gap-3 mt-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
        >
          <div className="flex items-center gap-2 px-4 py-2 rounded-full border border-stone-200 bg-white/60 text-sm text-stone-600">
            <span>🐾</span>
            <span>Pet-inspired art objects</span>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 rounded-full border border-stone-200 bg-white/60 text-sm text-stone-600">
            <span>✨</span>
            <span>AI-powered design</span>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 rounded-full border border-stone-200 bg-white/60 text-sm text-stone-600">
            <span>📦</span>
            <span>Shipped to your door</span>
          </div>
        </motion.div>
      </section>

      {/* ════════════════════════════════════════════════════════════
          HOW IT WORKS — Journey Animation
      ════════════════════════════════════════════════════════════ */}
      <section id="how-it-works" className="relative z-10 py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <motion.div
            className="text-center mb-12"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.5 }}
          >
            <div className="text-xs font-mono tracking-widest text-orange-700 opacity-70 mb-3">YOUR CREATIVE JOURNEY</div>
            <h2 className="text-3xl sm:text-4xl font-serif font-bold text-stone-900 mb-4">
              From Photo to Treasure
            </h2>
            <p className="text-stone-500 max-w-md mx-auto">
              Four simple steps to turn your pet's personality into a beautiful, one-of-a-kind art object.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            <JourneyPath />
          </motion.div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════
          FEATURES SECTION
      ════════════════════════════════════════════════════════════ */}
      <section id="features" className="relative z-10 py-24 px-6 bg-white/30">
        <div className="max-w-5xl mx-auto">
          <motion.div
            className="text-center mb-16"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.5 }}
          >
            <div className="text-xs font-mono tracking-widest text-orange-700 opacity-70 mb-3">WHY PUMMY</div>
            <h2 className="text-3xl sm:text-4xl font-serif font-bold text-stone-900 mb-4">
              Everything You Need to Create
            </h2>
            <p className="text-stone-500 max-w-md mx-auto">
              [Placeholder — describe the platform's key value proposition in 1–2 sentences here.]
            </p>
          </motion.div>

          {/* Feature grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <FeatureCard
              icon="🐶"
              title="[Feature Title One]"
              description="[Placeholder — describe this feature in 1–2 sentences. What problem does it solve? What's the user benefit?]"
              delay={0}
            />
            <FeatureCard
              icon="🎨"
              title="[Feature Title Two]"
              description="[Placeholder — describe this feature in 1–2 sentences. What does it enable the user to do that they couldn't before?]"
              delay={0.1}
            />
            <FeatureCard
              icon="⚡"
              title="[Feature Title Three]"
              description="[Placeholder — describe this feature in 1–2 sentences. Highlight speed, ease, or uniqueness.]"
              delay={0.2}
            />
            <FeatureCard
              icon="🛡️"
              title="[Feature Title Four]"
              description="[Placeholder — describe this feature in 1–2 sentences. Could cover quality guarantees, materials, or craftsmanship.]"
              delay={0.3}
            />
            <FeatureCard
              icon="🌍"
              title="[Feature Title Five]"
              description="[Placeholder — describe this feature in 1–2 sentences. Could be about global shipping, community, or customization range.]"
              delay={0.4}
            />
            <FeatureCard
              icon="💌"
              title="[Feature Title Six]"
              description="[Placeholder — describe this feature in 1–2 sentences. Could be about gifting, packaging, personal messages.]"
              delay={0.5}
            />
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════
          HIGHLIGHT SECTION A  (image left + text right)
      ════════════════════════════════════════════════════════════ */}
      <section className="relative z-10 py-24 px-6">
        <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Visual placeholder */}
          <motion.div
            className="rounded-2xl bg-gradient-to-br from-orange-100 to-rose-100 aspect-[4/3] flex items-center justify-center border border-orange-100"
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6 }}
          >
            <div className="text-center text-stone-400">
              <div className="text-5xl mb-3">🖼️</div>
              <p className="text-sm font-mono">[Illustration / Screenshot]</p>
            </div>
          </motion.div>

          {/* Text */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6 }}
          >
            <div className="text-xs font-mono tracking-widest text-orange-700 opacity-70 mb-3">STEP INTO YOUR STORY</div>
            <h2 className="text-3xl sm:text-4xl font-serif font-bold text-stone-900 mb-4">
              [Highlight Section Title]
            </h2>
            <p className="text-stone-500 leading-relaxed mb-6">
              [Placeholder — write 2–3 sentences about this key feature or benefit. What makes Pummy different here? Why should a pet owner care?]
            </p>
            <ul className="space-y-3">
              {['[Benefit point one — short, punchy]', '[Benefit point two — show the outcome]', '[Benefit point three — build trust]'].map((item, i) => (
                <li key={i} className="flex items-start gap-3 text-stone-600 text-sm">
                  <span className="mt-0.5 w-5 h-5 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
                    <svg className="w-3 h-3 text-orange-500" fill="none" viewBox="0 0 12 12"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </motion.div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════
          HIGHLIGHT SECTION B  (text left + image right)
      ════════════════════════════════════════════════════════════ */}
      <section className="relative z-10 py-24 px-6 bg-white/30">
        <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Text */}
          <motion.div
            className="lg:order-1 order-2"
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6 }}
          >
            <div className="text-xs font-mono tracking-widest text-orange-700 opacity-70 mb-3">POWERED BY TECHNOLOGY</div>
            <h2 className="text-3xl sm:text-4xl font-serif font-bold text-stone-900 mb-4">
              [Second Highlight Title]
            </h2>
            <p className="text-stone-500 leading-relaxed mb-6">
              [Placeholder — describe another unique aspect of Pummy in 2–3 sentences. This could be about AI design assistance, material choices, or the production process.]
            </p>
            <p className="text-stone-500 leading-relaxed">
              [Placeholder — a second paragraph elaborating on the details. Keep it warm and approachable — talk to a pet lover, not a tech audience.]
            </p>
          </motion.div>

          {/* Visual placeholder */}
          <motion.div
            className="lg:order-2 order-1 rounded-2xl bg-gradient-to-br from-cyan-100 to-yellow-100 aspect-[4/3] flex items-center justify-center border border-cyan-100"
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6 }}
          >
            <div className="text-center text-stone-400">
              <div className="text-5xl mb-3">🤖</div>
              <p className="text-sm font-mono">[Illustration / Demo]</p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════
          TESTIMONIALS / SOCIAL PROOF  (placeholder)
      ════════════════════════════════════════════════════════════ */}
      <section className="relative z-10 py-24 px-6">
        <div className="max-w-5xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.5 }}
          >
            <div className="text-xs font-mono tracking-widest text-orange-700 opacity-70 mb-3">LOVED BY PET OWNERS</div>
            <h2 className="text-3xl sm:text-4xl font-serif font-bold text-stone-900 mb-12">
              [Social Proof / Testimonials]
            </h2>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {[
              { quote: '"[Placeholder testimonial — what did a customer love about Pummy? Be specific and emotional.]"', name: '[Customer Name]', pet: '[Pet Name, Breed]' },
              { quote: '"[Placeholder testimonial — another happy customer. Show the impact: gift, joy, surprise.]"', name: '[Customer Name]', pet: '[Pet Name, Breed]' },
              { quote: '"[Placeholder testimonial — a third voice. Diversity of use cases builds trust.]"', name: '[Customer Name]', pet: '[Pet Name, Breed]' },
            ].map((t, i) => (
              <motion.div
                key={i}
                className="p-6 rounded-2xl bg-white/60 border border-orange-100 text-left"
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
              >
                <p className="text-stone-600 text-sm leading-relaxed mb-4 italic">{t.quote}</p>
                <div>
                  <p className="text-stone-900 font-semibold text-sm">{t.name}</p>
                  <p className="text-stone-400 text-xs">{t.pet}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════
          WAITLIST SECTION
      ════════════════════════════════════════════════════════════ */}
      <section id="waitlist" className="relative z-10 py-24 px-6 bg-stone-900 overflow-hidden" ref={waitlistRef}>
        {/* Background glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-orange-500/10 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-2xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6 }}
          >
            <div className="text-xs font-mono tracking-widest text-orange-400 opacity-80 mb-4">EARLY ACCESS</div>
            <h2 className="text-3xl sm:text-4xl font-serif font-bold text-white mb-4">
              Be the First to Create
            </h2>
            <p className="text-stone-400 mb-10 leading-relaxed">
              Join the waitlist and get early access to Pummy. We'll notify you when your spot is ready — and you'll be the first to turn your pet into art.
            </p>

            <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                className="flex-1 px-5 py-3.5 rounded-full bg-white/10 border border-white/20 text-white placeholder-stone-500 outline-none focus:border-orange-400 focus:bg-white/15 transition-all"
              />
              <button
                type="submit"
                className="px-6 py-3.5 bg-gradient-to-r from-orange-400 to-rose-400 text-white font-bold rounded-full hover:from-orange-500 hover:to-rose-500 active:scale-95 transition-all whitespace-nowrap shadow-lg shadow-orange-500/20"
              >
                Join Waitlist
              </button>
            </form>

            {submitted && (
              <motion.p
                className="text-sm text-orange-400 mt-4 font-mono"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
              >
                ✓ Confirmed. See you soon.
              </motion.p>
            )}

            <p className="text-stone-600 text-xs mt-6">No spam, ever. Unsubscribe any time.</p>
          </motion.div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════
          FOOTER
      ════════════════════════════════════════════════════════════ */}
      <footer className="relative z-10 bg-stone-900 border-t border-stone-800 px-6 py-12">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between gap-8 mb-10">
            {/* Brand */}
            <div className="max-w-xs">
              <div className="text-2xl font-serif font-bold text-white mb-2">
                P<span className="italic text-orange-500">u</span>mmy
              </div>
              <p className="text-xs font-medium tracking-widest text-orange-700 uppercase mb-3">by Makirel</p>
              <p className="text-stone-500 text-sm leading-relaxed">
                Where your pet's personality becomes a tangible piece of art.
              </p>
            </div>

            {/* Links */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-8 text-sm">
              <div>
                <p className="text-stone-400 font-semibold mb-3">Product</p>
                <ul className="space-y-2 text-stone-500">
                  <li><a href="#how-it-works" className="hover:text-orange-400 transition-colors">How It Works</a></li>
                  <li><a href="#features" className="hover:text-orange-400 transition-colors">Features</a></li>
                  <li><a href="#waitlist" className="hover:text-orange-400 transition-colors">Pricing</a></li>
                </ul>
              </div>
              <div>
                <p className="text-stone-400 font-semibold mb-3">Company</p>
                <ul className="space-y-2 text-stone-500">
                  <li><a href="#" className="hover:text-orange-400 transition-colors">About</a></li>
                  <li><a href="#" className="hover:text-orange-400 transition-colors">Blog</a></li>
                  <li><a href="#" className="hover:text-orange-400 transition-colors">Contact</a></li>
                </ul>
              </div>
              <div>
                <p className="text-stone-400 font-semibold mb-3">Legal</p>
                <ul className="space-y-2 text-stone-500">
                  <li><a href="#" className="hover:text-orange-400 transition-colors">Privacy</a></li>
                  <li><a href="#" className="hover:text-orange-400 transition-colors">Terms</a></li>
                </ul>
              </div>
            </div>
          </div>

          <div className="border-t border-stone-800 pt-6 flex flex-col sm:flex-row justify-between items-center gap-4">
            <p className="text-stone-600 text-xs">© 2025 Makirel. All rights reserved.</p>
            <p className="text-stone-600 text-xs font-mono">Art creation is no longer a privilege.</p>
          </div>
        </div>
      </footer>

    </div>
  )
}
