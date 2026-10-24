// The header critter: follows the cursor, can be "probed", hides, and fights back.
(() => {
  const lane = document.querySelector(".critter-lane");
  const critter = document.getElementById("critter");
  const pop = document.getElementById("critter-pop");
  const hint = document.getElementById("critter-hint");
  if (!lane || !critter || !pop) return;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const PX = 3;              // screen pixels per art pixel
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
  let pokes = 0, mode = "idle", modeTimer = 0, popTimer = 0, idleWander = 0;
  let mouseSeen = false;

  const laneWidth = () => lane.clientWidth;
  const clampX = (v) => Math.max(4, Math.min(laneWidth() - W - 4, v));

  function say(html, ms = 3500) {
    pop.innerHTML = html;
    pop.hidden = false;
    placePop();
    clearTimeout(popTimer);
    if (ms) popTimer = setTimeout(() => (pop.hidden = true), ms);
  }
  function placePop() {
    const left = Math.max(8, Math.min(window.innerWidth - pop.offsetWidth - 8,
      lane.getBoundingClientRect().left + x + W / 2 - pop.offsetWidth / 2));
    pop.style.left = left + "px";
  }

  const bar = (label, v) =>
    `<div class="feat"><span>${label}</span><i style="--v:${v}"></i><b>${v.toFixed(2)}</b></div>`;

  function readout(cur, shy, sword, caption) {
    return `<p class="pop-title">${caption}</p>
      ${bar("curiosity", cur)}${bar("shyness", shy)}${bar("sword", sword)}
      <p class="pop-eq">mood &asymp; 0.91&middot;curiosity &minus; 0.35&middot;pokes&sup2;</p>
      <p class="pop-note">equation found by symbolic regression (R&sup2; = 0.97, n = ${pokes})</p>`;
  }

  function setMode(next, ms) {
    mode = next;
    critter.dataset.mode = next;
    clearTimeout(modeTimer);
    if (ms) modeTimer = setTimeout(() => setMode("idle"), ms);
  }

  // Interaction ------------------------------------------------------------------
  critter.addEventListener("click", () => {
    if (hint) hint.remove();
    pokes += 1;
    if (pokes === 1) {
      setMode("probe", 6000);
      say(readout(0.91, 0.24, 0.03, "Probing activations&hellip;"), 6000);
    } else if (pokes === 2) {
      const r = critter.getBoundingClientRect();
      target = r.left - lane.getBoundingClientRect().left > laneWidth() / 2 ? 4 : laneWidth() - W - 4;
      setMode("hide", 4500);
      say(readout(0.40, 0.88, 0.21, "Hey. That's private."), 4500);
    } else {
      setMode("attack", 3600);
      say(readout(0.12, 0.05, 0.99, "En garde!"), 3600);
      if (!reduceMotion) document.body.classList.add("shake");
      setTimeout(() => document.body.classList.remove("shake"), 450);
      modeTimer = setTimeout(() => {
        setMode("idle");
        pokes = 0;
        say(`<p class="pop-title">&hellip;fine.</p><p>Interpretability is harder when the model fights back.
             <a href="#publications">Read the papers instead.</a></p>`, 5000);
      }, 3600);
    }
  });

  window.addEventListener("pointermove", (e) => {
    mouseSeen = true;
    if (mode === "idle" || mode === "attack") {
      target = clampX(e.clientX - lane.getBoundingClientRect().left - W / 2);
    }
  });

  // Blinking ---------------------------------------------------------------------
  (function blink() {
    critter.classList.add("blink");
    setTimeout(() => critter.classList.remove("blink"), 140);
    setTimeout(blink, 2500 + Math.random() * 3500);
  })();

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
      const speed = mode === "attack" ? 260 : mode === "hide" ? 220 : 90;
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
    if (!pop.hidden) placePop();
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();
