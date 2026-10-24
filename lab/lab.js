// The header critter: follows the cursor, can be "probed", hides, and fights back (breaking the screen).
(() => {
  const lane = document.querySelector(".critter-lane");
  const critter = document.getElementById("critter");
  const pop = document.getElementById("critter-pop");
  const tag = document.getElementById("critter-tag");
  if (!lane || !critter || !pop || !tag) return;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const PX = 3.5;            // screen pixels per art pixel
  const W = 16 * PX;         // sprite width

  // Pixel art on a 16 x 7 grid ------------------------------------------------
  const body = [];
  for (let y = 0; y <= 4; y++) for (let x = 2; x <= 13; x++) body.push([x, y]);
  const arms = [[0, 2], [1, 2], [14, 2], [15, 2]];
  const legsA = [[3, 5], [3, 6], [5, 5], [5, 6], [10, 5], [10, 6], [12, 5], [12, 6]];
  const legsB = [[3, 5], [5, 5], [5, 6], [10, 5], [12, 5], [12, 6]];
  const rects = (cells, cls) =>
    cells.map(([x, y]) => `<rect class="${cls}" x="${x}" y="${y}" width="1" height="1"/>`).join("");

  critter.innerHTML = `
    <svg class="sprite" viewBox="0 0 16 7" width="${W}" height="${7 * PX}" shape-rendering="crispEdges" aria-hidden="true">
      ${rects(body, "c-body")}${rects(arms, "c-body")}
      <g class="legs-a">${rects(legsA, "c-body")}</g>
      <g class="legs-b">${rects(legsB, "c-body")}</g>
      <rect class="c-eye" x="4" y="1" width="1" height="2"/>
      <rect class="c-eye" x="11" y="1" width="1" height="2"/>
    </svg>
    <svg class="sword" viewBox="0 0 5 9" width="${5 * PX}" height="${9 * PX}" shape-rendering="crispEdges" aria-hidden="true">
      <rect class="s-blade" x="2" y="0" width="1" height="6"/>
      <rect class="s-guard" x="0" y="6" width="5" height="1"/>
      <rect class="s-grip" x="2" y="7" width="1" height="2"/>
    </svg>`;

  // State ------------------------------------------------------------------------
  let x = 24, target = 24, facing = 1, last = performance.now();
  let pokes = 0, mode = "idle", popTimer = 0, idleWander = 0, mouseSeen = false;
  const timers = [];
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));
  const clearLater = () => { timers.forEach(clearTimeout); timers.length = 0; };

  const laneWidth = () => lane.clientWidth;
  const clampX = (v) => Math.max(4, Math.min(laneWidth() - W - 4, v));
  const centerX = () => lane.getBoundingClientRect().left + x + W / 2;

  function follow(el) {
    const left = Math.max(8, Math.min(window.innerWidth - el.offsetWidth - 8, centerX() - el.offsetWidth / 2));
    el.style.left = left + "px";
    el.style.setProperty("--arrow", `${centerX() - left}px`);
  }

  function say(html, ms = 3500) {
    pop.innerHTML = html;
    pop.hidden = false;
    follow(pop);
    clearTimeout(popTimer);
    if (ms) popTimer = setTimeout(() => (pop.hidden = true), ms);
  }

  const bar = (label, v) =>
    `<div class="feat"><span>${label}</span><i style="--v:${v}"></i><b>${v.toFixed(2)}</b></div>`;
  const readout = (cur, shy, sword, caption) => `<p class="pop-title">${caption}</p>
      ${bar("curiosity", cur)}${bar("shyness", shy)}${bar("sword", sword)}
      <p class="pop-eq">mood &asymp; 0.91&middot;curiosity &minus; 0.35&middot;pokes&sup2;</p>
      <p class="pop-note">equation found by symbolic regression (R&sup2; = 0.97, n = ${pokes})</p>`;

  // The tag escalates with each poke so it's clear there's more to find.
  const TAGS = ["don't click me", "don't do that again", "last warning."];
  let fought = false;
  const tagText = () => (fought && pokes === 0 ? "seriously. don't click me" : TAGS[Math.min(pokes, 2)]);
  const nudge = (text) => `<p class="pop-next">${text} <b>Click again?</b></p>`;

  function setMode(next) {
    mode = next;
    critter.dataset.mode = next;
  }

  // Breaking the screen --------------------------------------------------------
  function breakScreen(cx, cy) {
    const w = window.innerWidth, h = window.innerHeight;
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class", "cracks");
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);

    const rays = [];
    const n = 13 + Math.floor(Math.random() * 5);
    for (let i = 0; i < n; i++) {
      let a = (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.35;
      const reach = 260 + Math.random() * Math.max(w, h) * 0.7;
      const pts = [[cx, cy]];
      let px = cx, py = cy, len = 0;
      while (len < reach) {
        const seg = 25 + Math.random() * 60;
        a += (Math.random() - 0.5) * 0.45;
        px += Math.cos(a) * seg; py += Math.sin(a) * seg; len += seg;
        pts.push([px, py]);
      }
      rays.push(pts);
    }
    const line = (pts) => pts.map((p) => p.map((v) => v.toFixed(1)).join(",")).join(" ");
    const draw = (pts) => {
      for (const cls of ["crack-shadow", "crack-light"]) {
        const pl = document.createElementNS(NS, "polyline");
        pl.setAttribute("points", line(pts));
        pl.setAttribute("class", cls);
        svg.appendChild(pl);
      }
    };
    rays.forEach(draw);
    // Spider-web rings connecting neighbouring rays
    for (const k of [1, 3, 5]) {
      const ring = rays.map((r) => r[Math.min(k, r.length - 1)]);
      ring.push(ring[0]);
      draw(ring);
    }
    const burst = document.createElementNS(NS, "circle");
    burst.setAttribute("cx", cx); burst.setAttribute("cy", cy); burst.setAttribute("r", 7);
    burst.setAttribute("class", "crack-burst");
    svg.appendChild(burst);
    document.body.appendChild(svg);

    // Falling shards
    const shards = [];
    if (!reduceMotion) {
      for (let i = 0; i < 9; i++) {
        const s = document.createElement("div");
        s.className = "shard";
        const size = 14 + Math.random() * 30;
        s.style.cssText = `left:${cx + (Math.random() - 0.5) * 140}px; top:${cy + (Math.random() - 0.5) * 80}px;
          width:${size}px; height:${size}px; --dx:${(Math.random() - 0.5) * 240}px; --rot:${(Math.random() - 0.5) * 720}deg;
          animation-delay:${Math.random() * 0.25}s`;
        document.body.appendChild(s);
        shards.push(s);
      }
    }

    // Knock the page sections crooked
    const sections = [...document.querySelectorAll("main > section")];
    if (!reduceMotion) {
      sections.forEach((sec) => {
        const r = (Math.random() - 0.5) * 3.2;
        const dx = (Math.random() - 0.5) * 22;
        const dy = Math.random() * 14;
        sec.style.transition = "transform .35s cubic-bezier(.2,1.6,.4,1)";
        sec.style.transform = `translate(${dx}px, ${dy}px) rotate(${r}deg)`;
      });
      document.body.classList.add("shake");
      setTimeout(() => document.body.classList.remove("shake"), 450);
    }

    // Repair
    later(() => {
      svg.classList.add("fade");
      sections.forEach((sec) => {
        sec.style.transition = "transform .8s ease";
        sec.style.transform = "";
      });
    }, 4200);
    later(() => { svg.remove(); shards.forEach((s) => s.remove()); }, 5200);
  }

  // Interaction ------------------------------------------------------------------
  critter.addEventListener("click", () => {
    if (mode === "attack") return;
    clearLater();
    pokes += 1;
    if (pokes === 1) {
      setMode("probe");
      say(readout(0.91, 0.24, 0.03, "Probing activations&hellip;") + nudge("He didn't like that."), 4500);
      later(() => setMode("idle"), 4500);
    } else if (pokes === 2) {
      target = centerX() - lane.getBoundingClientRect().left > laneWidth() / 2 ? 4 : laneWidth() - W - 4;
      setMode("hide");
      say(readout(0.40, 0.88, 0.21, "Hey. I said don't.") + nudge("Last warning."), 4500);
      later(() => setMode("idle"), 4500);
    } else {
      setMode("attack");
      say(readout(0.12, 0.05, 0.99, "En garde!"), 1100);
      later(() => {
        const r = critter.querySelector(".sword").getBoundingClientRect();
        breakScreen(r.left + r.width / 2, r.top + r.height * 0.2 + 30);
      }, 900);
      later(() => {
        setMode("idle");
        pokes = 0;
        fought = true;
        say(`<p class="pop-title">&hellip;oops.</p><p>Interpretability is harder when the model fights back.
             <a href="#publications">Read the papers instead.</a></p>`, 5000);
      }, 5400);
    }
  });

  window.addEventListener("pointermove", (e) => {
    mouseSeen = true;
    if (mode === "idle" || mode === "attack") {
      target = clampX(e.clientX - lane.getBoundingClientRect().left - W / 2);
    }
  });

  // Blinking and attention hops ---------------------------------------------------
  (function blink() {
    critter.classList.add("blink");
    setTimeout(() => critter.classList.remove("blink"), 140);
    setTimeout(blink, 2500 + Math.random() * 3500);
  })();
  if (!reduceMotion) {
    setInterval(() => {
      if (mode !== "idle") return;
      critter.classList.add("hop");
      setTimeout(() => critter.classList.remove("hop"), 500);
    }, 4000);
  }

  // Animation loop ---------------------------------------------------------------
  function tick(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    if (mode === "idle" && !mouseSeen) {
      idleWander -= dt;
      if (idleWander <= 0) {
        target = clampX(Math.random() * laneWidth());
        idleWander = 3 + Math.random() * 4;
      }
    }
    if (mode !== "probe") {
      const speed = mode === "attack" ? 300 : mode === "hide" ? 220 : 90;
      const dx = clampX(target) - x;
      const step = reduceMotion ? dx : Math.sign(dx) * Math.min(Math.abs(dx), speed * dt);
      x += step;
      if (Math.abs(dx) > 1) facing = dx > 0 ? 1 : -1;
      critter.classList.toggle("walking", Math.abs(dx) > 1);
    } else {
      critter.classList.remove("walking");
    }
    critter.style.transform = `translateX(${x}px) scaleX(${facing})`;
    critter.classList.toggle("legs-alt", Math.floor(now / 140) % 2 === 1);
    if (!pop.hidden) follow(pop);
    // Tag shows whenever the popover isn't covering it (and he isn't mid-attack).
    tag.hidden = mode === "attack" || !pop.hidden;
    if (!tag.hidden) {
      const t = tagText();
      if (tag.textContent !== t) tag.textContent = t;
      tag.classList.toggle("warn", pokes > 0);
      follow(tag);
    }
    requestAnimationFrame(tick);
  }
  setMode("idle");
  requestAnimationFrame(tick);
})();
