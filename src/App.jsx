import { motion, useMotionValue, useTransform, animate, AnimatePresence } from 'framer-motion'
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

  const titleY = down ? imageY + 82 : imageY - 102;
  const descY = titleY + 28;

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

      <text x={visualCx} y={titleY} textAnchor="middle" fontFamily="Georgia, serif" fontSize="27" fontWeight="700" fill="#1c1917" letterSpacing="0.2">{title}</text>
      <text x={visualCx} y={descY} textAnchor="middle" fontSize="13.5" fontFamily="'Helvetica Neue', Helvetica, Arial, sans-serif" fontWeight="400" fill="#78716c" letterSpacing="0.6" opacity="0.8">{desc}</text>
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
          <a href="#products" className="hover:text-orange-500 transition-colors">Products</a>
          <a href="#community" className="hover:text-orange-500 transition-colors">Contact</a>
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

// ─── Product Showcase ──────────────────────────────────────────────────────────
function ProductShowcase() {
  const [activeIndex, setActiveIndex] = useState(0);
  const touchStartX = useRef(null);

  const products = [
    {
      name: 'Leather Carving',
      desc: 'Carved in leather. Never repeated.',
      price: 'From $69',
      gradient: 'from-amber-100 to-orange-100',
      placeholder: '[Leather Carving Product Image]',
    },
    {
      name: 'Stylized Pet Figurine',
      desc: 'Reimagined in a style you choose.',
      price: 'From $59',
      gradient: 'from-rose-100 to-pink-100',
      placeholder: '[Figurine Product Image]',
    },
    {
      name: 'Art Accessories',
      desc: 'Lightweight keepsakes. Carry everywhere.',
      price: 'From $29',
      gradient: 'from-cyan-100 to-sky-100',
      placeholder: '[Accessories Product Image]',
    },
  ];

  const prev = () => setActiveIndex(i => Math.max(0, i - 1));
  const next = () => setActiveIndex(i => Math.min(products.length - 1, i + 1));

  return (
    <section id="products" className="relative z-10 py-24 overflow-hidden">
      <motion.div
        className="text-center mb-12 px-6"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.5 }}
      >
        <div className="text-xs font-mono tracking-widest text-orange-700 opacity-70 mb-3">WHAT WE MAKE</div>
        <h2 className="text-3xl sm:text-4xl font-serif font-bold text-stone-900">
          One Pet, One Piece
        </h2>
      </motion.div>

      <div
        className="relative"
        onTouchStart={e => { touchStartX.current = e.touches[0].clientX; }}
        onTouchEnd={e => {
          if (touchStartX.current === null) return;
          const diff = e.changedTouches[0].clientX - touchStartX.current;
          if (diff < -50) next();
          else if (diff > 50) prev();
          touchStartX.current = null;
        }}
      >
        {/* Cards track */}
        <div className="relative flex items-center justify-center h-[540px] sm:h-[580px] lg:h-[620px]">
          {products.map((product, index) => {
            const offset = index - activeIndex;
            const isCenter = offset === 0;
            const isVisible = Math.abs(offset) <= 1;

            return (
              <motion.div
                key={index}
                className="absolute"
                style={{ zIndex: isCenter ? 10 : 5, cursor: !isCenter && isVisible ? 'pointer' : 'default' }}
                animate={{
                  x: offset * 300,
                  scale: isCenter ? 1.06 : 0.78,
                  opacity: isVisible ? 1 : 0,
                }}
                transition={{ type: 'tween', duration: 0.5, ease: [0.32, 0.72, 0, 1] }}
                onClick={() => !isCenter && isVisible && setActiveIndex(index)}
              >
                <div className="w-[280px] sm:w-[380px] lg:w-[480px] rounded-3xl bg-white border border-orange-100 shadow-xl overflow-hidden relative select-none">
                  <div className={`h-56 sm:h-64 lg:h-72 bg-gradient-to-br ${product.gradient} flex items-center justify-center`}>
                    <p className="text-xs font-mono text-stone-400 px-4 text-center">{product.placeholder}</p>
                  </div>
                  <div className="px-5 py-4 flex justify-between items-end">
                    <div className="min-w-0 pr-3">
                      <h3 className="text-base font-serif font-bold text-stone-900 leading-snug">{product.name}</h3>
                      <p className="text-stone-400 text-xs leading-snug mt-0.5 truncate">{product.desc}</p>
                      <span className="text-base font-bold text-stone-900 mt-2 block">{product.price}</span>
                    </div>
                    <button
                      className="flex-shrink-0 px-4 py-1.5 bg-stone-900 text-white text-xs font-semibold rounded-full hover:bg-stone-700 active:scale-95 transition-all whitespace-nowrap"
                      onClick={e => e.stopPropagation()}
                    >
                      Order →
                    </button>
                  </div>
                  {!isCenter && (
                    <div className="absolute inset-0 bg-amber-50/70 backdrop-blur-[4px] rounded-3xl pointer-events-none" />
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Navigation arrows — hidden on mobile */}
        <motion.button
          className="hidden sm:flex absolute left-6 lg:left-12 top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full bg-white/80 backdrop-blur-sm border border-stone-200 items-center justify-center shadow-md hover:bg-white transition-colors"
          onClick={prev}
          animate={{ opacity: activeIndex === 0 ? 0.3 : 1 }}
          transition={{ duration: 0.2 }}
          disabled={activeIndex === 0}
          aria-label="Previous product"
        >
          <svg className="w-5 h-5 text-stone-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </motion.button>

        <motion.button
          className="hidden sm:flex absolute right-6 lg:right-12 top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full bg-white/80 backdrop-blur-sm border border-stone-200 items-center justify-center shadow-md hover:bg-white transition-colors"
          onClick={next}
          animate={{ opacity: activeIndex === products.length - 1 ? 0.3 : 1 }}
          transition={{ duration: 0.2 }}
          disabled={activeIndex === products.length - 1}
          aria-label="Next product"
        >
          <svg className="w-5 h-5 text-stone-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </motion.button>
      </div>

      {/* Dot indicators */}
      <div className="flex justify-center gap-2 mt-6 px-6">
        {products.map((_, i) => (
          <button
            key={i}
            onClick={() => setActiveIndex(i)}
            className={`h-2 rounded-full transition-all duration-300 ${i === activeIndex ? 'bg-orange-500 w-5' : 'bg-stone-300 w-2'}`}
            aria-label={`Go to product ${i + 1}`}
          />
        ))}
      </div>

      {/* Show More CTA */}
      <div className="flex justify-center mt-10 px-6">
        <button className="px-8 py-3 rounded-full border border-stone-300 text-stone-600 text-sm font-semibold hover:border-stone-500 hover:text-stone-900 active:scale-95 transition-all">
          Show More →
        </button>
      </div>
    </section>
  );
}

// ─── Community Section ────────────────────────────────────────────────────────
function CommunitySection() {
  const [toasts, setToasts] = useState([]); // [{ id }]
  const [copiedId, setCopiedId] = useState(null);

  const addToast = () => {
    const id = Date.now();
    setToasts(prev => [...prev, { id }].slice(-3)); // max 3, drop oldest
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 5000);
  };

  const removeToast = (id) => setToasts(prev => prev.filter(t => t.id !== id));

  const handleCopy = (id) => {
    navigator.clipboard.writeText('support@pummy.art');
    setCopiedId(id);
    setTimeout(() => setCopiedId(prev => (prev === id ? null : prev)), 2000);
  };

  const links = [
    {
      href: 'https://discord.gg/zgQVnxmd',
      label: 'Discord',
      desc: <span>Find other <em>cre</em>-sumers.</span>,
      icon: (
        <svg viewBox="0 0 24 24" className="w-7 h-7" fill="currentColor">
          <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057.1 18.08.114 18.1.136 18.116a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
        </svg>
      ),
      color: 'text-[#5865F2]',
    },
    {
      href: 'https://www.instagram.com/pummy.art/',
      label: 'Instagram',
      desc: 'Follow our updates.',
      icon: (
        <svg viewBox="0 0 24 24" className="w-7 h-7" fill="currentColor">
          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z" />
        </svg>
      ),
      color: 'text-[#E1306C]',
    },
    {
      href: 'https://www.tiktok.com/@pummyart',
      label: 'TikTok',
      desc: 'Watch us in action.',
      icon: (
        <svg viewBox="0 0 24 24" className="w-7 h-7" fill="currentColor">
          <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.75a4.85 4.85 0 0 1-1.01-.06z" />
        </svg>
      ),
      color: 'text-stone-900',
    },
  ];

  return (
    <>
      <section id="community" className="relative z-10 py-24 px-6 bg-white/30">
        <div className="max-w-2xl mx-auto text-center">
          <motion.h2
            className="text-3xl sm:text-4xl font-serif font-bold text-stone-900 mb-16"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.5 }}
          >
            Join our community
          </motion.h2>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-y-10 gap-x-6 sm:gap-x-8 justify-items-center">
            {links.map((item, i) => (
              <motion.a
                key={item.label}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex flex-col items-center gap-3"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
              >
                <div className={`w-16 h-16 rounded-2xl bg-stone-100 flex items-center justify-center ${item.color} group-hover:bg-stone-200 group-hover:-translate-y-1.5 group-hover:shadow-md transition-all duration-200`}>
                  {item.icon}
                </div>
                <span className="font-semibold text-stone-900 text-sm">{item.label}</span>
                <span className="text-stone-500 text-xs leading-relaxed">{item.desc}</span>
              </motion.a>
            ))}

            {/* Email — click to reveal */}
            <motion.button
              onClick={addToast}
              className="group flex flex-col items-center gap-3"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.4, delay: 0.3 }}
            >
              <div className="w-16 h-16 rounded-2xl bg-stone-100 flex items-center justify-center text-stone-600 group-hover:bg-stone-200 group-hover:-translate-y-1.5 group-hover:shadow-md transition-all duration-200">
                <svg viewBox="0 0 24 24" className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <span className="font-semibold text-stone-900 text-sm">E-mail</span>
              <span className="text-stone-500 text-xs leading-relaxed">Contact us directly.</span>
            </motion.button>
          </div>
        </div>
      </section>

      {/* Email toast stack — fixed bottom, card-queue effect */}
      <AnimatePresence>
        {toasts.map((toast, i) => {
          // depth: 0 = newest (front/bottom), increases for older ones (peek above)
          const depth = toasts.length - 1 - i;
          return (
            // Outer div: handles fixed centering only (no transform conflict)
            <div
              key={toast.id}
              className="fixed left-1/2 -translate-x-1/2"
              style={{ bottom: 24, zIndex: 200 - depth }}
            >
            <motion.div
              className="flex items-center gap-2 px-5 py-3 bg-white rounded-2xl border border-stone-200"
              style={{
                boxShadow: '0 0 0 1px rgba(0,0,0,0.04), 0 4px 12px 0 rgba(0,0,0,0.10), 0 12px 40px 0 rgba(0,0,0,0.13)',
              }}
              initial={{ opacity: 0, y: 48 }}
              animate={{
                opacity: 1 - depth * 0.12,
                y: -depth * 10,
                scale: 1 - depth * 0.03,
              }}
              exit={{ opacity: 0, y: 48 }}
              transition={{ duration: 0.56, ease: [0.32, 0.72, 0, 1] }}
            >
              <span className="text-stone-700 text-sm font-mono select-all whitespace-nowrap">
                contact@pummy.art
              </span>
              <button
                onClick={() => handleCopy(toast.id)}
                title="Copy"
                className="p-1.5 rounded-lg hover:bg-stone-100 transition-colors text-stone-500 hover:text-stone-800"
              >
                {copiedId === toast.id ? (
                  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                  </svg>
                )}
              </button>
              <button
                onClick={() => removeToast(toast.id)}
                title="Close"
                className="p-1.5 rounded-lg hover:bg-stone-100 transition-colors text-stone-400 hover:text-stone-700"
              >
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </motion.div>
            </div>
          );
        })}
      </AnimatePresence>
    </>
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
            onClick={() => document.getElementById('products')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            className="px-8 py-3.5 bg-stone-900 text-white font-semibold rounded-full hover:bg-stone-700 active:scale-95 transition-all shadow-lg shadow-stone-900/10 text-base"
          >
            Try It Now
          </button>

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

      <ProductShowcase />

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
          WHAT MAKES IT YOURS
      ════════════════════════════════════════════════════════════ */}
      <section className="relative z-10 py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <motion.div
            className="text-center mb-20"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.5 }}
          >
            <div className="text-xs font-mono tracking-widest text-orange-700 opacity-70 mb-3">WHAT MAKES IT YOURS</div>
            <h2 className="text-3xl sm:text-4xl font-serif font-bold text-stone-900">
              Made for One. Made for Yours.
            </h2>
          </motion.div>

          {/* Block 1: One of One — text left, visual right */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center mb-24">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.6 }}
            >
              <h3 className="text-2xl sm:text-3xl font-serif font-bold text-stone-900 mb-5">One of One</h3>
              <p className="text-stone-500 leading-relaxed">
                The patch on their nose. The fold in their ear. The exact line where dark fur meets light. We read your pet and translate every recognizable detail into form and color. The mold is made once and destroyed after pressing — what you hold is the only one that will ever exist.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.6, delay: 0.1 }}
            >
              <div className="rounded-2xl bg-gradient-to-br from-amber-100 to-orange-100 aspect-[4/3] flex items-center justify-center border border-orange-100">
                <div className="text-center text-stone-400 px-6">
                  <p className="text-sm font-mono">[Cat Photo → Carved Detail Comparison + Mold Destruction]</p>
                </div>
              </div>
            </motion.div>
          </div>

          {/* Block 2: One Click, Endless Possibilities — visual left, text right */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <motion.div
              className="order-2 lg:order-1"
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.6 }}
            >
              <div className="rounded-2xl bg-gradient-to-br from-cyan-100 to-rose-100 aspect-[4/3] flex items-center justify-center border border-rose-100">
                <div className="text-center text-stone-400 px-6">
                  <p className="text-sm font-mono">[Same Pet → Multiple Styles × Multiple Forms — Grid Preview]</p>
                </div>
              </div>
            </motion.div>

            <motion.div
              className="order-1 lg:order-2"
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.6, delay: 0.1 }}
            >
              <h3 className="text-2xl sm:text-3xl font-serif font-bold text-stone-900 mb-5">One Click, Endless Possibilities</h3>
              <p className="text-stone-500 leading-relaxed">
                Your pet in watercolor. As a miniature figurine. In the style of a Dutch master, or a pattern designed by another creator in our community. Different styles, different forms, different materials — each one begins with the same photo and arrives as something you can hold.
              </p>
            </motion.div>
          </div>
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

      <CommunitySection />

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
                  <li><a href="#products" className="hover:text-orange-400 transition-colors">Products</a></li>
                  <li><a href="#community" className="hover:text-orange-400 transition-colors">Contact</a></li>
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
            <p className="text-stone-600 text-xs">© 2026 Makirel. All rights reserved.</p>
            <p className="text-stone-600 text-xs font-mono">Art creation is no longer a privilege.</p>
          </div>
        </div>
      </footer>

    </div>
  )
}
