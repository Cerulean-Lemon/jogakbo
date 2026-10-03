// 조각보 네 컷 스크롤 시퀀스
//
// 스크롤 위치를 0~1 사이의 진행도(progress)로 바꾸고,
// 그 값에 따라 각 요소의 transform / opacity를 매 프레임 계산한다.
//
// 진행도 구간
//   0.00 ~ 0.28  CUT 01  원단 클로즈업 → 줌아웃으로 전신 리빌
//   0.28 ~ 0.52  CUT 02  조각이 모여 사진 완성
//   0.52 ~ 0.76  CUT 03
//   0.76 ~ 1.00  CUT 04

const SEGMENTS = [0, 0.28, 0.52, 0.76, 1];

const story = document.querySelector('.story');
const stage = story.querySelector('.stage');
const frame = story.querySelector('.frame');
const title = story.querySelector('.title');
const hint = story.querySelector('.scroll-hint');
const captions = [...story.querySelectorAll('.caption')];
const dots = [...story.querySelectorAll('.cut-index li')];
const pieceLayers = [...story.querySelectorAll('.layer--pieces')];

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

frame.style.transformOrigin = frame.dataset.zoomOrigin || '50% 50%';


// ---------- 계산 도우미 ----------

const clamp = (v, min = 0, max = 1) => Math.min(max, Math.max(min, v));

// v가 a~b 구간을 지나는 동안 0 → 1
const range = (v, a, b) => clamp((v - a) / (b - a));

const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// 시드가 같으면 항상 같은 값을 내는 난수 (새로고침해도 조각 모양이 같게)
function seededRandom(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}


// ---------- 조각 만들기 ----------

// 사진(0~1 크기의 사각형)을 조각보처럼 크고 작은 사각형으로 나눈다
function makePatches(rnd) {
  const out = [];

  function split(x, y, w, h, depth) {
    const tooSmall = w < 0.2 && h < 0.2;
    if (depth >= 4 || tooSmall || (depth >= 2 && rnd() < 0.3)) {
      out.push({ x, y, w, h });
      return;
    }
    const k = 0.3 + rnd() * 0.4;
    if (w > h * 0.8) {
      split(x, y, w * k, h, depth + 1);
      split(x + w * k, y, w * (1 - k), h, depth + 1);
    } else {
      split(x, y, w, h * k, depth + 1);
      split(x, y + h * k, w, h * (1 - k), depth + 1);
    }
  }

  split(0, 0, 1, 1, 0);
  return out;
}

const pct = (v) => `${(v * 100).toFixed(3)}%`;

function buildPieces(layer) {
  const rnd = seededRandom(Number(layer.dataset.seed) || 1);
  const rects = makePatches(rnd);
  const src = layer.dataset.src;

  const pieces = rects.map((r) => {
    const el = document.createElement('div');
    el.className = 'piece';
    el.style.backgroundImage = `url("${src}")`;
    // 같은 사진을 통째로 깔고, 이 조각 부분만 남기고 잘라냄
    el.style.clipPath = `inset(${pct(r.y)} ${pct(1 - r.x - r.w)} ${pct(1 - r.y - r.h)} ${pct(r.x)})`;
    el.style.transformOrigin = `${pct(r.x + r.w / 2)} ${pct(r.y + r.h / 2)}`;
    layer.appendChild(el);

    // 조각은 사진 바깥쪽 방향에서 날아와 제자리에 붙는다
    const cx = r.x + r.w / 2 - 0.5;
    const cy = r.y + r.h / 2 - 0.5;
    const len = Math.hypot(cx, cy) || 1;
    const dist = 60 + rnd() * 60; // 사진 크기 대비 %

    return {
      el,
      dx: (cx / len) * dist,
      dy: (cy / len) * dist,
      rot: (rnd() - 0.5) * 30,
      delay: rnd() * 0.45,
    };
  });

  return { layer, pieces };
}

const assembled = pieceLayers.map(buildPieces);


// ---------- 장면 그리기 ----------

let startScale = 3;

// 클로즈업 시작 배율: 사진이 화면을 넉넉히 덮을 만큼
function measure() {
  const fw = frame.offsetWidth;
  const fh = frame.offsetHeight;
  const cover = Math.max(stage.clientWidth / fw, stage.clientHeight / fh);
  startScale = Math.max(3.2, cover * 1.6);
}

function getProgress() {
  const rect = story.getBoundingClientRect();
  const total = story.offsetHeight - stage.offsetHeight;
  return clamp(-rect.top / total);
}

function render() {
  const p = getProgress();
  // 각 컷 구간 안에서의 진행도 (0~1)
  const u = SEGMENTS.slice(0, 4).map((start, i) => range(p, start, SEGMENTS[i + 1]));

  // CUT 01: 줌아웃
  const zoom = easeInOut(range(u[0], 0.1, 0.75));
  const scale = reduceMotion ? 1 : startScale + (1 - startScale) * zoom;
  frame.style.transform = `scale(${scale})`;

  const titleOut = range(u[0], 0.05, 0.35);
  title.style.opacity = 1 - titleOut;
  title.style.transform = `translateY(${-titleOut * 40}px)`;
  hint.style.opacity = 1 - range(p, 0, 0.03);

  // CUT 02~04: 조각 모으기
  assembled.forEach(({ layer, pieces }, i) => {
    const t = u[i + 1];
    layer.style.visibility = t > 0 ? 'visible' : 'hidden';
    if (t <= 0) return;

    pieces.forEach((piece) => {
      const local = range(t, piece.delay, piece.delay + 0.25);
      const e = easeOut(local);
      const rest = 1 - e;
      piece.el.style.opacity = range(local, 0, 0.4);
      piece.el.style.transform = reduceMotion
        ? 'none'
        : `translate(${piece.dx * rest}%, ${piece.dy * rest}%) rotate(${piece.rot * rest}deg) scale(${1 + 0.15 * rest})`;
    });
  });

  // 컷 설명: 사진이 완성되면 나타나고, 다음 컷이 시작되면 사라짐
  let active = 0;
  captions.forEach((cap, i) => {
    const fadeIn = range(u[i], i === 0 ? 0.75 : 0.72, i === 0 ? 0.92 : 0.9);
    const fadeOut = i < 3 ? range(u[i + 1], 0, 0.12) : 0;
    const o = fadeIn * (1 - fadeOut);
    cap.style.opacity = o;
    cap.style.transform = `translateY(${(1 - fadeIn) * 12}px)`;
    if (i === 0 || u[i] > 0.5) active = i;
  });
  dots.forEach((dot, i) => dot.classList.toggle('is-active', i === active));
}


// ---------- 실행 ----------

let ticking = false;
function requestRender() {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    ticking = false;
    render();
  });
}

window.addEventListener('scroll', requestRender, { passive: true });
window.addEventListener('resize', () => {
  measure();
  requestRender();
});

measure();
render();


// ---------- 원단 소개: 화면에 들어오면 조각이 차례로 나타남 ----------

const patchwork = document.querySelector('.patchwork');
const patchObserver = new IntersectionObserver((entries) => {
  if (entries[0].isIntersecting) {
    patchwork.classList.add('is-in');
    patchObserver.disconnect();
  }
}, { threshold: 0.2 });
patchObserver.observe(patchwork);
