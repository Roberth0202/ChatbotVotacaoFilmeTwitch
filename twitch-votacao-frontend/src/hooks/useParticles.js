import { useRef, useCallback, useEffect } from 'react';

// Particle types
const SPARK = 'spark';
const CONFETTI = 'confetti';

const CONFETTI_COLORS = [
  '#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
  '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE',
  '#FF69B4', '#00CED1', '#FF4500', '#7CFC00', '#1E90FF'
];

function createSpark(x, y) {
  const angle = Math.random() * Math.PI * 2;
  const speed = 1 + Math.random() * 4;
  return {
    type: SPARK,
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed - 2,
    life: 1,
    decay: 0.02 + Math.random() * 0.03,
    size: 1 + Math.random() * 2.5,
    color: Math.random() > 0.3 ? '#FFD700' : '#FFF'
  };
}

function createConfettiParticle(canvasWidth) {
  return {
    type: CONFETTI,
    x: Math.random() * canvasWidth,
    y: -10 - Math.random() * 50,
    vx: (Math.random() - 0.5) * 3,
    vy: 1.5 + Math.random() * 3,
    life: 1,
    decay: 0.002 + Math.random() * 0.003,
    size: 4 + Math.random() * 6,
    color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
    rotation: Math.random() * 360,
    rotationSpeed: (Math.random() - 0.5) * 10,
    wobble: Math.random() * Math.PI * 2,
    wobbleSpeed: 0.03 + Math.random() * 0.05
  };
}

export function useParticles(canvasRef) {
  const particlesRef = useRef([]);
  const animFrameRef = useRef(null);
  const isRunningRef = useRef(false);
  const confettiActiveRef = useRef(false);
  const confettiIntervalRef = useRef(null);

  const startLoop = useCallback(() => {
    if (isRunningRef.current) return;
    isRunningRef.current = true;

    const loop = () => {
      const canvas = canvasRef.current;
      if (!canvas) {
        isRunningRef.current = false;
        return;
      }

      const ctx = canvas.getContext('2d');
      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);

      const particles = particlesRef.current;

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life -= p.decay;
        if (p.life <= 0) {
          particles.splice(i, 1);
          continue;
        }

        p.x += p.vx;
        p.y += p.vy;

        if (p.type === SPARK) {
          p.vy += 0.08; // gravity
          p.vx *= 0.99;
          ctx.globalAlpha = p.life;
          ctx.fillStyle = p.color;
          ctx.shadowColor = p.color;
          ctx.shadowBlur = p.size * 3;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        } else if (p.type === CONFETTI) {
          p.vy += 0.03; // light gravity
          p.wobble += p.wobbleSpeed;
          p.x += Math.sin(p.wobble) * 0.5;
          p.rotation += p.rotationSpeed;

          ctx.globalAlpha = Math.min(p.life * 2, 1);
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate((p.rotation * Math.PI) / 180);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
          ctx.restore();
        }
      }

      ctx.globalAlpha = 1;

      if (particles.length > 0 || confettiActiveRef.current) {
        animFrameRef.current = requestAnimationFrame(loop);
      } else {
        isRunningRef.current = false;
      }
    };

    animFrameRef.current = requestAnimationFrame(loop);
  }, [canvasRef]);

  const emitSparks = useCallback((x, y, intensity = 1) => {
    const count = Math.floor(5 + intensity * 15);
    for (let i = 0; i < count; i++) {
      particlesRef.current.push(createSpark(x, y));
    }
    if (particlesRef.current.length > 500) {
      particlesRef.current = particlesRef.current.slice(-500);
    }
    startLoop();
  }, [startLoop]);

  const emitConfetti = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    confettiActiveRef.current = true;

    // Burst initial batch
    for (let i = 0; i < 80; i++) {
      particlesRef.current.push(createConfettiParticle(canvas.width));
    }

    // Keep emitting for a while
    confettiIntervalRef.current = setInterval(() => {
      if (!canvasRef.current) return;
      for (let i = 0; i < 15; i++) {
        particlesRef.current.push(createConfettiParticle(canvasRef.current.width));
      }
      if (particlesRef.current.length > 800) {
        particlesRef.current = particlesRef.current.slice(-800);
      }
    }, 200);

    // Stop after 5 seconds
    setTimeout(() => {
      clearInterval(confettiIntervalRef.current);
      confettiActiveRef.current = false;
    }, 5000);

    startLoop();
  }, [canvasRef, startLoop]);

  const stopAll = useCallback(() => {
    confettiActiveRef.current = false;
    clearInterval(confettiIntervalRef.current);
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
    }
    particlesRef.current = [];
    isRunningRef.current = false;

    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }, [canvasRef]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      confettiActiveRef.current = false;
      clearInterval(confettiIntervalRef.current);
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, []);

  return { emitSparks, emitConfetti, stopAll };
}
