// 조각보 세 컷 스크롤 시퀀스
//
// 스크롤 위치를 0~1 사이의 진행도(progress)로 바꾸고,
// 그 값에 따라 각 요소의 transform / opacity를 매 프레임 계산한다.
//
// 컴퓨터(폭 900px 이상)는 영상으로, 휴대폰은 사진 조각 전환으로 이어진다
//
// 진행도 구간 — 컴퓨터
//   0.00 ~ 0.14  CUT 01  전신이 어둠 속에 서 있음, 제목 → 컷 설명
//   0.14 ~ 1.00  영상    하나로 이어 붙인 영상. 2컷 장면에서 속도를 늦췄다가 다시 올려
//                        멈추지 않고 3컷 사진에 도착한 뒤 머묾
//
// 진행도 구간 — 휴대폰
//   0.00 ~ 0.22  CUT 01
//   0.22 ~ 0.61  CUT 02  조각이 사방에서 날아와 맞춰짐
//   0.61 ~ 1.00  CUT 03

const SEGMENTS = {
  desktop: { cut1: [0, 0.14], video: [0.14, 1] },
  mobile: { cut1: [0, 0.22], cut2: [0.22, 0.61], cut3: [0.61, 1] },
};

const desktopQuery = window.matchMedia('(min-width: 900px)');

const story = document.querySelector('.story');
const stage = story.querySelector('.stage');
const title = story.querySelector('.title');
const hint = story.querySelector('.scroll-hint');
const frame = story.querySelector('.frame');
const firstImg = story.querySelector('.layer--first');
const still = story.querySelector('.layer--still'); // 영상이 도착하는 3컷 사진
const captions = [...story.querySelectorAll('.caption')];
const dots = [...story.querySelectorAll('.cut-index li')];
const pieceLayers = [...story.querySelectorAll('.layer--pieces')];

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;


// ---------- 계산 도우미 ----------

const clamp = (v, min = 0, max = 1) => Math.min(max, Math.max(min, v));

// v가 a~b 구간을 지나는 동안 0 → 1
const range = (v, a, b) => clamp((v - a) / (b - a));

const easeOut = (t) => 1 - Math.pow(1 - t, 3);

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

    // 휴대폰: 사진 바깥쪽 방향에서 날아와 제자리에 붙음
    // 컴퓨터(4컷): 제자리에서 하나씩 스며들듯 나타남
    const cx = r.x + r.w / 2 - 0.5;
    const cy = r.y + r.h / 2 - 0.5;
    const len = Math.hypot(cx, cy) || 1;
    const dist = 60 + rnd() * 60; // 사진 크기 대비 %

    return {
      el,
      dx: (cx / len) * dist,
      dy: (cy / len) * dist,
      rot: (rnd() - 0.5) * 30,
      delay: rnd() * 0.4,
    };
  });

  return { layer, pieces, cut: Number(layer.dataset.cut) };
}

// t: 이 컷 구간의 진행도, fly: 날아오는 방식인지
function animatePieces(pieces, t, fly) {
  pieces.forEach((piece) => {
    if (fly) {
      const local = range(t, piece.delay, piece.delay + 0.25);
      const rest = 1 - easeOut(local);
      piece.el.style.opacity = range(local, 0, 0.4);
      piece.el.style.transform = reduceMotion
        ? 'none'
        : `translate(${piece.dx * rest}%, ${piece.dy * rest}%) rotate(${piece.rot * rest}deg) scale(${1 + 0.15 * rest})`;
    } else {
      const e = easeOut(range(t, piece.delay, piece.delay + 0.3));
      piece.el.style.opacity = e;
      // 아주 살짝 커졌다가 제자리로 (천이 내려앉는 느낌)
      piece.el.style.transform = reduceMotion ? 'none' : `scale(${1 + 0.03 * (1 - e)})`;
    }
  });
}

const assembled = pieceLayers.map(buildPieces);
const piecesOf = (cut) => assembled.find((a) => a.cut === cut);


// ---------- 영상 프레임 (스크롤로 넘기는 영상) ----------

// 영상 하나 = 캔버스 하나. 프레임 이미지를 스크롤 위치에 맞춰 그려 넣는다
const clips = [...story.querySelectorAll('.layer--video')].map((canvas) => ({
  canvas,
  ctx: canvas.getContext('2d'),
  src: canvas.dataset.src,
  count: Number(canvas.dataset.count),
  frames: [],
  current: 0,
}));

const frameSrc = (clip, i) => `${clip.src}${String(i + 1).padStart(4, '0')}.webp`;

// 첫 화면이 늦게 뜨지 않도록, 페이지가 다 열린 뒤 첫 번째 영상부터 차례로 불러옴
// 휴대폰에서는 영상을 쓰지 않으므로 불러오지 않음
let framesLoaded = false;
function loadFrames() {
  if (framesLoaded || !desktopQuery.matches) return;
  framesLoaded = true;
  clips.forEach((clip) => {
    for (let i = 0; i < clip.count; i++) {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        if (i === clip.current) drawFrame(clip, i);
      };
      img.src = frameSrc(clip, i);
      clip.frames[i] = img;
    }
  });
}
if (document.readyState === 'complete') loadFrames();
else window.addEventListener('load', loadFrames);

// 창 크기를 바꿔 휴대폰 ↔ 컴퓨터 화면이 바뀌면 다시 맞춤
desktopQuery.addEventListener('change', () => {
  loadFrames();
  sizeClips();
  requestRender();
});

// 캔버스를 화면 크기에 맞춤 (레티나 화면은 2배로 선명하게)
function sizeClips() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  clips.forEach((clip) => {
    clip.canvas.width = Math.round(clip.canvas.clientWidth * dpr);
    clip.canvas.height = Math.round(clip.canvas.clientHeight * dpr);
    drawFrame(clip, clip.current);
  });
}

function drawFrame(clip, index) {
  clip.current = index;
  // 아직 안 불러온 프레임이면 가장 가까운 앞 프레임을 대신 그림
  const ready = (img) => img && img.complete && img.naturalWidth;
  let i = index;
  while (i > 0 && !ready(clip.frames[i])) i--;
  const img = clip.frames[i];
  if (!ready(img)) return;

  // object-fit: cover 처럼 꽉 채워 그리기
  const cw = clip.canvas.width;
  const ch = clip.canvas.height;
  const scale = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
  const w = img.naturalWidth * scale;
  const h = img.naturalHeight * scale;
  clip.ctx.drawImage(img, (cw - w) / 2, (ch - h) / 2, w, h);
}


// ---------- 장면 그리기 ----------

function getProgress() {
  const rect = story.getBoundingClientRect();
  const total = story.offsetHeight - stage.offsetHeight;
  return clamp(-rect.top / total);
}

// 영상 재생 위치: 1컷에서 부드럽게 출발 → 2컷 장면(junction)에서 느려졌다가 → 3컷에 부드럽게 도착
// v: 스크롤 진행도(0~1) → 반환: 영상 위치(0~1). slow가 클수록 출발·2컷·도착에서 더 천천히
function easeThrough(v, junction, slow = 0.7) {
  // junction이 가운데(0.5)에 오도록 맞춘 뒤, 속도 = 1 - slow·cos(4πy) → 0, 0.5, 1 지점에서 가장 느림
  const center = (x) => (x <= junction ? (x / junction) * 0.5 : 0.5 + ((x - junction) / (1 - junction)) * 0.5);
  const uncenter = (y) => (y <= 0.5 ? (y / 0.5) * junction : junction + ((y - 0.5) / 0.5) * (1 - junction));
  const y = center(v);
  return uncenter(y - (slow * Math.sin(4 * Math.PI * y)) / (4 * Math.PI));
}

function render() {
  const desktop = desktopQuery.matches;
  const segments = desktop ? SEGMENTS.desktop : SEGMENTS.mobile;
  const p = getProgress();
  // 각 구간 안에서의 진행도 (0~1)
  const seg = (name) => range(p, ...segments[name]);
  const u1 = seg('cut1');

  // CUT 01: 스크롤을 시작하면 제목이 사라지고 컷 설명으로 바뀜
  const titleOut = range(u1, 0.1, 0.45);
  title.style.opacity = 1 - titleOut;
  title.style.transform = `translateY(${-titleOut * 24}px)`;
  hint.style.opacity = 1 - range(p, 0, 0.02);

  let stack; // 겹쳐 쌓인 장면들 (아래 → 위). o: 불투명도, full: 아래를 다 덮었는지
  let captionOpacity; // 컷 설명 4개의 불투명도
  let active; // 지금 보고 있는 컷 (오른쪽 번호 표시)

  if (desktop) {
    const clip = clips[0];
    const uv = seg('video');
    const junction = (Number(clip.canvas.dataset.junction) - 1) / (clip.count - 1); // 2컷 장면 위치 (0~1)

    // 영상: 스크롤 0~80% 동안 재생, 출발·2컷 장면·도착에서 느려짐. 나머지는 3컷에 머묾
    const pos = easeThrough(range(uv, 0, 0.8), junction);
    const index = Math.round(pos * (clip.count - 1));
    if (index !== clip.current) drawFrame(clip, index);
    const clipIn = range(uv, 0, 0.03); // 첫 장면 = 1컷 사진이라 살짝 겹쳐 바꿈
    const stillIn = range(uv, 0.78, 0.84); // 끝 장면 = 3컷 사진

    // 3컷에 도착한 뒤에는 카메라가 아주 천천히 계속 다가가는 느낌 (영상이 끝나도 멈추지 않게)
    const pushStart = segments.video[0] + (segments.video[1] - segments.video[0]) * 0.8;
    frame.style.transform = reduceMotion ? 'none' : `scale(${1 + 0.05 * range(p, pushStart, 1)})`;

    stack = [
      { el: firstImg, o: 1 },
      { el: clip.canvas, o: clipIn },
      { el: still, o: stillIn },
    ];

    // 2컷 설명은 영상이 2컷 장면을 지나는 동안, 3컷 설명은 3컷 사진에 도착한 뒤 끝까지
    captionOpacity = [
      range(u1, 0.45, 0.8) * (1 - range(uv, 0, 0.08)),
      range(pos, junction - 0.12, junction - 0.04) * (1 - range(pos, junction + 0.1, junction + 0.18)),
      range(uv, 0.82, 0.92),
    ];
    active = uv >= 0.8 ? 2 : pos >= junction - 0.12 ? 1 : 0;
  } else {
    frame.style.transform = 'none';
    const uCut = [u1, seg('cut2'), seg('cut3')];

    // CUT 02~03: 조각이 사방에서 날아와 맞춰짐
    [2, 3].forEach((cut) => animatePieces(piecesOf(cut).pieces, uCut[cut - 1], true));

    stack = [
      { el: firstImg, o: 1 },
      ...[2, 3].map((cut) => ({
        el: piecesOf(cut).layer,
        o: uCut[cut - 1],
        full: uCut[cut - 1] >= 0.7,
        pieces: true,
      })),
    ];

    // 1컷은 제목이 사라진 뒤, 2·3컷은 조각이 다 모인 뒤 나타나고 다음 컷이 시작되면 사라짐
    captionOpacity = uCut.map((u, i) => {
      const fadeIn = i === 0 ? range(u, 0.45, 0.8) : range(u, 0.72, 0.9);
      const fadeOut = i < 2 ? range(uCut[i + 1], 0, 0.12) : 0;
      return fadeIn * (1 - fadeOut);
    });
    active = uCut.reduce((last, u, i) => (u > 0.5 ? i : last), 0);
  }

  // 완전히 덮인 아래 장면은 숨김 (흐린 가장자리로 비치지 않게)
  let top = 0;
  stack.forEach((layer, i) => {
    if (layer.full ?? layer.o >= 1) top = i;
  });
  stack.forEach((layer, i) => {
    if (!layer.pieces) layer.el.style.opacity = layer.o;
    layer.el.style.visibility = i >= top && layer.o > 0 ? 'visible' : 'hidden';
  });

  // 컷 설명과 오른쪽 컷 번호 표시
  captions.forEach((cap, i) => {
    const o = captionOpacity[i];
    cap.style.opacity = o;
    cap.style.transform = `translateY(${(1 - Math.min(1, o * 2)) * 12}px)`;
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
  sizeClips();
  requestRender();
});

sizeClips();
render();


// ---------- 상단 바 ----------

const topbar = document.querySelector('.topbar');
const navLinks = [...document.querySelectorAll('.topbar__nav a')];

// 네 컷 시퀀스를 지나면 상단 바에 배경을 깖
function updateTopbar() {
  topbar.classList.toggle('is-solid', story.getBoundingClientRect().bottom <= topbar.offsetHeight);
}
window.addEventListener('scroll', updateTopbar, { passive: true });
updateTopbar();

// 지금 보고 있는 섹션의 메뉴를 밝게
const sectionObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    navLinks.forEach((a) => a.classList.toggle('is-active', a.hash === `#${entry.target.id}`));
  });
}, { rootMargin: '-45% 0px -45% 0px' });
document.querySelectorAll('.section').forEach((section) => sectionObserver.observe(section));
sectionObserver.observe(story); // 첫 화면에서는 모든 메뉴를 흐리게


// ---------- 화면에 들어오면 조각이 차례로 나타남 ----------

const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    entry.target.classList.add('is-in');
    revealObserver.unobserve(entry.target);
  });
}, { threshold: 0.15 });
document.querySelectorAll('[data-reveal]').forEach((el) => revealObserver.observe(el));


// ---------- 사진 크게 보기 ----------

const lightbox = document.querySelector('.lightbox');
const lbImg = lightbox.querySelector('.lightbox__img');
const lbTitle = lightbox.querySelector('.lightbox__title');
const lbCount = lightbox.querySelector('.lightbox__count');
const lbItems = [...document.querySelectorAll('[data-lightbox]')];
let lbIndex = 0;

function showPhoto(index) {
  lbIndex = (index + lbItems.length) % lbItems.length;
  const item = lbItems[lbIndex];
  const img = item.querySelector('img');
  lbImg.src = img.currentSrc || img.src;
  lbImg.alt = img.alt;
  lbTitle.textContent = item.dataset.caption;
  lbCount.textContent = `${lbIndex + 1} / ${lbItems.length}`;
  if (!lightbox.open) lightbox.showModal();
}

lbItems.forEach((item, i) => item.addEventListener('click', () => showPhoto(i)));
lightbox.querySelector('.lightbox__prev').addEventListener('click', () => showPhoto(lbIndex - 1));
lightbox.querySelector('.lightbox__next').addEventListener('click', () => showPhoto(lbIndex + 1));
lightbox.querySelector('.lightbox__close').addEventListener('click', () => lightbox.close());

// 사진 바깥 빈 곳을 누르면 닫힘
lightbox.addEventListener('click', (e) => {
  if (e.target === lightbox) lightbox.close();
});

// 키보드 ← →
lightbox.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') showPhoto(lbIndex - 1);
  if (e.key === 'ArrowRight') showPhoto(lbIndex + 1);
});

// 모바일: 옆으로 밀어서 넘기기
let touchX = null;
lightbox.addEventListener('touchstart', (e) => {
  touchX = e.touches[0].clientX;
}, { passive: true });
lightbox.addEventListener('touchend', (e) => {
  if (touchX === null) return;
  const dx = e.changedTouches[0].clientX - touchX;
  if (Math.abs(dx) > 50) showPhoto(lbIndex + (dx < 0 ? 1 : -1));
  touchX = null;
});
