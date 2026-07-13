/*
 * Lightweight spectral-network canvas for a Quarto static site.
 * No dependencies. Mount one or more elements with [data-quantum-field].
 */
(() => {
  "use strict";

  const FIELD_SELECTOR = "[data-quantum-field]";
  const SAFE_SELECTOR = "[data-network-safe]";
  const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)");
  const SAVE_DATA = Boolean(navigator.connection && navigator.connection.saveData);

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const smoothstep = (edge0, edge1, value) => {
    const x = clamp((value - edge0) / (edge1 - edge0 || 1), 0, 1);
    return x * x * (3 - 2 * x);
  };

  function hashString(value) {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i += 1) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function mulberry32(seed) {
    let state = seed >>> 0;
    return () => {
      state += 0x6d2b79f5;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  class QuantumField {
    constructor(host, index) {
      this.host = host;
      this.canvas = document.createElement("canvas");
      this.canvas.className = "quantum-field__canvas";
      this.canvas.setAttribute("aria-hidden", "true");
      this.canvas.setAttribute("role", "presentation");
      this.host.prepend(this.canvas);

      this.ctx = this.canvas.getContext("2d", { alpha: true });
      this.width = 0;
      this.height = 0;
      this.dpr = 1;
      this.nodes = [];
      this.safeRects = [];
      this.frameId = 0;
      this.lastTime = 0;
      this.isVisible = true;
      this.pageVisible = !document.hidden;
      this.pointer = { x: 0, y: 0, active: false };

      const rawSeed = host.dataset.seed || `${document.title}-${index}`;
      const numericSeed = Number.parseInt(rawSeed, 10);
      this.seed = Number.isFinite(numericSeed) ? numericSeed : hashString(rawSeed);
      this.random = mulberry32(this.seed);

      this.onPointerMove = this.onPointerMove.bind(this);
      this.onPointerLeave = this.onPointerLeave.bind(this);
      this.onVisibilityChange = this.onVisibilityChange.bind(this);
      this.onMotionPreferenceChange = this.onMotionPreferenceChange.bind(this);
      this.resize = this.resize.bind(this);
      this.tick = this.tick.bind(this);

      this.host.addEventListener("pointermove", this.onPointerMove, { passive: true });
      this.host.addEventListener("pointerleave", this.onPointerLeave, { passive: true });
      document.addEventListener("visibilitychange", this.onVisibilityChange);
      REDUCED_MOTION.addEventListener("change", this.onMotionPreferenceChange);

      this.resizeObserver = new ResizeObserver(this.resize);
      this.resizeObserver.observe(this.host);

      this.safeObservers = [];
      this.host.querySelectorAll(SAFE_SELECTOR).forEach((element) => {
        const observer = new ResizeObserver(() => this.measureSafeRects());
        observer.observe(element);
        this.safeObservers.push(observer);
      });

      this.intersectionObserver = new IntersectionObserver(
        ([entry]) => {
          this.isVisible = Boolean(entry && entry.isIntersecting);
          this.syncAnimation();
        },
        { rootMargin: "120px 0px" },
      );
      this.intersectionObserver.observe(this.host);

      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(() => {
          this.measureSafeRects();
          this.draw(0);
        });
      }

      this.resize();
    }

    get shouldAnimate() {
      return !REDUCED_MOTION.matches && !SAVE_DATA && this.isVisible && this.pageVisible;
    }

    readColors() {
      const styles = getComputedStyle(this.host);
      const value = (name, fallback) => styles.getPropertyValue(name).trim() || fallback;
      this.colors = {
        edge: value("--quantum-edge", "#397fc5"),
        edgeHot: value("--quantum-edge-hot", "#078f83"),
        node: value("--quantum-node", "#285ea8"),
        nodeHot: value("--quantum-node-hot", "#087f75"),
        halo: value("--quantum-halo", "#7457e8"),
      };
    }

    resize() {
      const rect = this.host.getBoundingClientRect();
      const width = Math.round(rect.width);
      const height = Math.round(rect.height);
      if (!width || !height) return;

      const oldWidth = this.width || width;
      const oldHeight = this.height || height;
      this.width = width;
      this.height = height;
      this.dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      this.canvas.width = Math.round(width * this.dpr);
      this.canvas.height = Math.round(height * this.dpr);
      this.canvas.style.width = `${width}px`;
      this.canvas.style.height = `${height}px`;
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.readColors();

      if (this.nodes.length) {
        const scaleX = width / oldWidth;
        const scaleY = height / oldHeight;
        this.nodes.forEach((node) => {
          node.x *= scaleX;
          node.y *= scaleY;
        });
      }

      this.reconcileNodes();
      this.measureSafeRects();
      this.draw(performance.now());
      this.syncAnimation();
    }

    reconcileNodes() {
      const area = this.width * this.height;
      const mobile = this.width < 720;
      const target = clamp(
        Math.round(area / (mobile ? 25000 : 19000)),
        mobile ? 22 : 34,
        mobile ? 42 : 76,
      );

      while (this.nodes.length < target) {
        const speed = 0.055 + this.random() * 0.13;
        const angle = this.random() * Math.PI * 2;
        const tier = this.random();
        this.nodes.push({
          x: this.random() * this.width,
          y: this.random() * this.height,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          radius: tier > 0.92 ? 2.2 : tier > 0.68 ? 1.55 : 1.05,
          phase: this.random() * Math.PI * 2,
          mode: tier > 0.955,
        });
      }
      if (this.nodes.length > target) this.nodes.length = target;
    }

    measureSafeRects() {
      const hostRect = this.host.getBoundingClientRect();
      this.safeRects = Array.from(this.host.querySelectorAll(SAFE_SELECTOR)).map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          left: rect.left - hostRect.left,
          top: rect.top - hostRect.top,
          right: rect.right - hostRect.left,
          bottom: rect.bottom - hostRect.top,
        };
      });
    }

    safetyAt(x, y) {
      if (!this.safeRects.length) return 1;
      let safety = 1;
      const quietPadding = this.width < 720 ? 22 : 36;
      const fadeDistance = this.width < 720 ? 72 : 110;

      for (const rect of this.safeRects) {
        const left = rect.left - quietPadding;
        const top = rect.top - quietPadding;
        const right = rect.right + quietPadding;
        const bottom = rect.bottom + quietPadding;
        const dx = Math.max(left - x, 0, x - right);
        const dy = Math.max(top - y, 0, y - bottom);
        const distance = Math.hypot(dx, dy);
        const local = 0.06 + 0.94 * smoothstep(0, fadeDistance, distance);
        safety = Math.min(safety, local);
      }
      return safety;
    }

    onPointerMove(event) {
      if (event.pointerType === "touch" || REDUCED_MOTION.matches) return;
      const rect = this.host.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const inside = x >= 0 && x <= this.width && y >= 0 && y <= this.height;
      this.pointer.x = x;
      this.pointer.y = y;
      this.pointer.active = inside;
    }

    onPointerLeave() {
      this.pointer.active = false;
    }

    onVisibilityChange() {
      this.pageVisible = !document.hidden;
      this.syncAnimation();
    }

    onMotionPreferenceChange() {
      this.pointer.active = false;
      this.syncAnimation();
      this.draw(performance.now());
    }

    syncAnimation() {
      if (this.shouldAnimate) {
        if (!this.frameId) {
          this.lastTime = performance.now();
          this.frameId = requestAnimationFrame(this.tick);
        }
      } else if (this.frameId) {
        cancelAnimationFrame(this.frameId);
        this.frameId = 0;
      }
    }

    update(delta) {
      const pointerRadius = this.width < 720 ? 96 : 145;
      const pointerRadiusSq = pointerRadius * pointerRadius;

      this.nodes.forEach((node) => {
        if (this.pointer.active) {
          const dx = node.x - this.pointer.x;
          const dy = node.y - this.pointer.y;
          const distanceSq = dx * dx + dy * dy;
          if (distanceSq > 1 && distanceSq < pointerRadiusSq) {
            const distance = Math.sqrt(distanceSq);
            const force = (1 - distance / pointerRadius) * 0.018 * delta;
            node.vx += (dx / distance) * force;
            node.vy += (dy / distance) * force;
          }
        }

        const speed = Math.hypot(node.vx, node.vy);
        if (speed > 0.52) {
          node.vx = (node.vx / speed) * 0.52;
          node.vy = (node.vy / speed) * 0.52;
        }

        node.vx *= 0.999;
        node.vy *= 0.999;
        node.x += node.vx * delta;
        node.y += node.vy * delta;

        const margin = 18;
        if (node.x < -margin) node.x = this.width + margin;
        else if (node.x > this.width + margin) node.x = -margin;
        if (node.y < -margin) node.y = this.height + margin;
        else if (node.y > this.height + margin) node.y = -margin;
      });
    }

    draw(time) {
      const ctx = this.ctx;
      const linkRadius = clamp(this.width * 0.13, 108, 168);
      const linkRadiusSq = linkRadius * linkRadius;
      const pointerRadius = this.width < 720 ? 96 : 145;
      const pointerRadiusSq = pointerRadius * pointerRadius;

      ctx.clearRect(0, 0, this.width, this.height);
      ctx.lineWidth = 0.72;

      // Graph edges: distance-based opacity creates an irregular spectral mesh.
      for (let i = 0; i < this.nodes.length; i += 1) {
        const a = this.nodes[i];
        for (let j = i + 1; j < this.nodes.length; j += 1) {
          const b = this.nodes[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const distanceSq = dx * dx + dy * dy;
          if (distanceSq >= linkRadiusSq) continue;

          const distance = Math.sqrt(distanceSq);
          const proximity = 1 - distance / linkRadius;
          const midpointX = (a.x + b.x) * 0.5;
          const midpointY = (a.y + b.y) * 0.5;
          const quiet = this.safetyAt(midpointX, midpointY);
          let hot = 0;
          if (this.pointer.active) {
            const px = midpointX - this.pointer.x;
            const py = midpointY - this.pointer.y;
            const pointerDistanceSq = px * px + py * py;
            hot = pointerDistanceSq < pointerRadiusSq
              ? 1 - Math.sqrt(pointerDistanceSq) / pointerRadius
              : 0;
          }

          ctx.globalAlpha = proximity * proximity * quiet * (0.14 + hot * 0.18);
          ctx.strokeStyle = hot > 0.1 ? this.colors.edgeHot : this.colors.edge;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }

      // A few larger nodes behave like faint eigenmode rings.
      this.nodes.forEach((node) => {
        const quiet = this.safetyAt(node.x, node.y);
        let hot = 0;
        if (this.pointer.active) {
          const dx = node.x - this.pointer.x;
          const dy = node.y - this.pointer.y;
          const distanceSq = dx * dx + dy * dy;
          hot = distanceSq < pointerRadiusSq
            ? 1 - Math.sqrt(distanceSq) / pointerRadius
            : 0;
        }

        if (node.mode) {
          const pulse = REDUCED_MOTION.matches ? 0.45 : 0.5 + 0.5 * Math.sin(time * 0.0011 + node.phase);
          ctx.globalAlpha = quiet * (0.035 + pulse * 0.055);
          ctx.strokeStyle = this.colors.halo;
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.arc(node.x, node.y, 9 + pulse * 7, 0, Math.PI * 2);
          ctx.stroke();
        }

        ctx.globalAlpha = quiet * (0.42 + hot * 0.42);
        ctx.fillStyle = hot > 0.1 ? this.colors.nodeHot : this.colors.node;
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius + hot * 0.6, 0, Math.PI * 2);
        ctx.fill();
      });

      ctx.globalAlpha = 1;
      ctx.lineWidth = 1;
    }

    tick(now) {
      this.frameId = 0;
      if (!this.shouldAnimate) return;
      const delta = clamp((now - this.lastTime) / 16.6667, 0.25, 2);
      this.lastTime = now;
      this.update(delta);
      this.draw(now);
      this.frameId = requestAnimationFrame(this.tick);
    }
  }

  function init() {
    document.querySelectorAll(FIELD_SELECTOR).forEach((host, index) => {
      if (host.dataset.quantumReady === "true") return;
      host.dataset.quantumReady = "true";
      new QuantumField(host, index);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
