"use client";

import { useEffect, useRef } from "react";

type Bill = {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  spin: number;
  width: number;
  height: number;
  age: number;
  life: number;
  denomination: string;
  hue: number;
};

const DENOMINATIONS = ["$1", "$5", "$10", "$20", "$50", "$100"];
const MAX_BILLS = 22;
const SPAWN_EVERY_MS = 420;

export default function MoneyRain() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduceMotion.matches) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const surface = canvas;

    const ctx = surface.getContext("2d");
    if (!ctx) return;
    const context = ctx;

    let frame = 0;
    let width = 0;
    let height = 0;
    let dpr = 1;
    let lastTime = performance.now();
    let lastSpawn = lastTime;
    let nextId = 1;
    const bills: Bill[] = [];

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      surface.width = Math.floor(width * dpr);
      surface.height = Math.floor(height * dpr);
      surface.style.width = `${width}px`;
      surface.style.height = `${height}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function spawnBill(now: number) {
      if (bills.length >= MAX_BILLS || now - lastSpawn < SPAWN_EVERY_MS) return;
      lastSpawn = now;
      const baseWidth = width < 640 ? 54 : 72;
      const size = baseWidth + Math.random() * 26;
      const denomination = DENOMINATIONS[Math.floor(Math.random() * DENOMINATIONS.length)];
      bills.push({
        id: nextId++,
        x: Math.random() * width,
        y: -80,
        vx: (Math.random() - 0.5) * 26,
        vy: 16 + Math.random() * 22,
        rotation: (Math.random() - 0.5) * 0.8,
        spin: (Math.random() - 0.5) * 1.4,
        width: size,
        height: size * 0.43,
        age: 0,
        life: 12 + Math.random() * 6,
        denomination,
        hue: denomination === "$100" ? 147 : denomination === "$50" ? 205 : denomination === "$20" ? 42 : 122,
      });
    }

    function roundRect(x: number, y: number, w: number, h: number, r: number) {
      context.beginPath();
      context.moveTo(x + r, y);
      context.arcTo(x + w, y, x + w, y + h, r);
      context.arcTo(x + w, y + h, x, y + h, r);
      context.arcTo(x, y + h, x, y, r);
      context.arcTo(x, y, x + w, y, r);
      context.closePath();
    }

    function drawBill(bill: Bill) {
      const fadeIn = Math.min(1, bill.age / 0.8);
      const fadeOut = Math.min(1, (bill.life - bill.age) / 2.2);
      const alpha = Math.max(0, Math.min(fadeIn, fadeOut)) * 0.46;
      if (alpha <= 0) return;

      context.save();
      context.translate(bill.x, bill.y);
      context.rotate(bill.rotation);
      context.globalAlpha = alpha;
      context.shadowColor = "rgba(15, 23, 42, 0.16)";
      context.shadowBlur = 16;
      context.shadowOffsetY = 8;

      const x = -bill.width / 2;
      const y = -bill.height / 2;
      const fill = `hsl(${bill.hue} 50% 88%)`;
      const stroke = `hsl(${bill.hue} 45% 42%)`;

      roundRect(x, y, bill.width, bill.height, 7);
      context.fillStyle = fill;
      context.fill();
      context.strokeStyle = stroke;
      context.lineWidth = 1.2;
      context.stroke();

      context.shadowColor = "transparent";
      context.globalAlpha = alpha * 0.85;
      roundRect(x + 6, y + 5, bill.width - 12, bill.height - 10, 5);
      context.strokeStyle = `hsl(${bill.hue} 40% 55%)`;
      context.lineWidth = 0.9;
      context.stroke();

      context.beginPath();
      context.ellipse(0, 0, bill.height * 0.46, bill.height * 0.3, 0, 0, Math.PI * 2);
      context.strokeStyle = `hsl(${bill.hue} 45% 48%)`;
      context.stroke();

      context.fillStyle = `hsl(${bill.hue} 45% 30%)`;
      context.font = `700 ${Math.max(11, bill.height * 0.38)}px var(--font-mono), monospace`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(bill.denomination, 0, 0);

      context.font = `700 ${Math.max(7, bill.height * 0.2)}px var(--font-mono), monospace`;
      context.fillText("$", x + 12, y + 11);
      context.fillText("$", -x - 12, -y - 11);
      context.restore();
    }

    function tick(now: number) {
      const dt = Math.min(0.033, (now - lastTime) / 1000);
      lastTime = now;
      context.clearRect(0, 0, width, height);
      spawnBill(now);

      const wind = Math.sin(now / 1800) * 14;
      for (let index = bills.length - 1; index >= 0; index -= 1) {
        const bill = bills[index];
        bill.age += dt;
        bill.vy += 42 * dt;
        bill.vx += Math.sin(now / 700 + bill.id) * 3.5 * dt + wind * dt;
        bill.x += bill.vx * dt;
        bill.y += bill.vy * dt;
        bill.rotation += bill.spin * dt;

        const halfW = bill.width / 2;
        const halfH = bill.height / 2;
        if (bill.x < halfW) {
          bill.x = halfW;
          bill.vx = Math.abs(bill.vx) * 0.62;
          bill.spin *= -0.75;
        } else if (bill.x > width - halfW) {
          bill.x = width - halfW;
          bill.vx = -Math.abs(bill.vx) * 0.62;
          bill.spin *= -0.75;
        }

        if (bill.y > height - halfH) {
          bill.y = height - halfH;
          bill.vy = -Math.abs(bill.vy) * 0.34;
          bill.vx *= 0.82;
          bill.spin *= 0.82;
        }

        if (bill.age > bill.life || bill.y > height + 120) {
          bills.splice(index, 1);
          continue;
        }

        drawBill(bill);
      }

      frame = window.requestAnimationFrame(tick);
    }

    resize();
    window.addEventListener("resize", resize);
    frame = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="money-rain-canvas" aria-hidden="true" />;
}
