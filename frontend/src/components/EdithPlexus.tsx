"use client";

import { useEffect, useRef } from "react";

type Mode = "ambient" | "hero" | "intro";

type Props = {
  mode?: Mode;
  className?: string;
  paused?: boolean;
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
};

const PRESETS: Record<
  Mode,
  {
    density: number;
    linkDist: number;
    speed: number;
    nodeAlpha: number;
    lineAlpha: number;
    accent: string;
    soft: string;
  }
> = {
  ambient: {
    density: 0.000045,
    linkDist: 110,
    speed: 0.28,
    nodeAlpha: 0.45,
    lineAlpha: 0.18,
    accent: "54, 115, 252",
    soft: "25, 51, 180",
  },
  hero: {
    density: 0.00008,
    linkDist: 130,
    speed: 0.35,
    nodeAlpha: 0.65,
    lineAlpha: 0.28,
    accent: "54, 115, 252",
    soft: "100, 160, 255",
  },
  intro: {
    density: 0.00011,
    linkDist: 150,
    speed: 0.42,
    nodeAlpha: 0.9,
    lineAlpha: 0.42,
    accent: "140, 190, 255",
    soft: "54, 115, 252",
  },
};

function seedParticles(w: number, h: number, count: number, speed: number): Particle[] {
  const out: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const mag = speed * (0.35 + Math.random() * 0.9);
    out.push({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: Math.cos(angle) * mag,
      vy: Math.sin(angle) * mag,
      r: 1 + Math.random() * 1.6,
    });
  }
  return out;
}

export function EdithPlexus({ mode = "ambient", className = "", paused = false }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const preset = PRESETS[mode];
    let particles: Particle[] = [];
    let raf = 0;
    let running = true;
    let w = 0;
    let h = 0;
    let dpr = 1;

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      w = Math.max(1, Math.floor(rect.width));
      h = Math.max(1, Math.floor(rect.height));
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.max(28, Math.min(140, Math.floor(w * h * preset.density)));
      particles = seedParticles(w, h, count, preset.speed);
    };

    const step = () => {
      if (!running) return;
      if (paused) {
        raf = requestAnimationFrame(step);
        return;
      }

      ctx.clearRect(0, 0, w, h);

      // Soft radial wash so the network feels centered (Nemotron-like focus).
      if (mode === "intro" || mode === "hero") {
        const g = ctx.createRadialGradient(w * 0.5, h * 0.45, 20, w * 0.5, h * 0.45, Math.max(w, h) * 0.55);
        g.addColorStop(0, `rgba(${preset.soft}, 0.18)`);
        g.addColorStop(0.55, `rgba(${preset.accent}, 0.05)`);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }

      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < -20) p.x = w + 20;
        if (p.x > w + 20) p.x = -20;
        if (p.y < -20) p.y = h + 20;
        if (p.y > h + 20) p.y = -20;
      }

      const link = preset.linkDist;
      for (let i = 0; i < particles.length; i++) {
        const a = particles[i];
        for (let j = i + 1; j < particles.length; j++) {
          const b = particles[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.hypot(dx, dy);
          if (dist > link) continue;
          const t = 1 - dist / link;
          ctx.strokeStyle = `rgba(${preset.accent}, ${preset.lineAlpha * t})`;
          ctx.lineWidth = mode === "intro" ? 1.1 : 0.85;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }

      for (const p of particles) {
        ctx.beginPath();
        ctx.fillStyle = `rgba(${preset.accent}, ${preset.nodeAlpha})`;
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
        if (mode === "intro") {
          ctx.beginPath();
          ctx.fillStyle = `rgba(255,255,255,${0.35 * preset.nodeAlpha})`;
          ctx.arc(p.x, p.y, p.r * 0.45, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      raf = requestAnimationFrame(step);
    };

    resize();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    ro?.observe(wrap);
    window.addEventListener("resize", resize);
    raf = requestAnimationFrame(step);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      ro?.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, [mode, paused]);

  return (
    <div ref={wrapRef} className={`edith-plexus ${className}`} aria-hidden>
      <canvas ref={canvasRef} />
    </div>
  );
}
