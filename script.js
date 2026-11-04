// =========================================================
// 조각보 — 가장 귀한 것을 감싸다 : 인터랙션
//
// 라이브러리 (vendor 폴더, 로컬)
//   gsap + ScrollTrigger : 스크롤에 맞춘 애니메이션
//   Lenis                : 컴퓨터에서 휠 스크롤을 부드럽게
//
// 화면에 따라 세 갈래로 나뉨 (gsap.matchMedia)
//   컴퓨터 (900px 이상)   : 화면 고정 + 스크롤에 맞춰 진행 (첫 화면, 아홉 가지 색, 사진, QR)
//   휴대폰               : 고정 없이, 화면에 들어오면 잠깐 움직이는 정도 (transform·opacity만)
//   움직임 줄이기 설정     : 움직임 없이 내용만
//
// 순서: 도우미 → 첫 화면 조각 만들기 → 사진 영상(프레임) → 컴퓨터/휴대폰/정적 설정
//      → 메뉴·현재 섹션 → 크게 보기
// =========================================================

(() => {
  'use strict';

  const root = document.documentElement;

  // 라이브러리를 못 불러왔으면 움직임 없이 내용만 보여 줌
  if (!window.gsap || !window.ScrollTrigger) {
    root.classList.remove('js');
    return;
  }

  gsap.registerPlugin(ScrollTrigger);
  // 휴대폰 주소창이 나타났다 사라질 때마다 다시 계산하지 않게
  ScrollTrigger.config({ ignoreMobileResize: true });


  // ---------- 도우미 ----------

  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
  const clamp = (v, min = 0, max = 1) => Math.min(max, Math.max(min, v));
  const range = (v, a, b) => clamp((v - a) / (b - a)); // v가 a~b를 지나는 동안 0 → 1
  const pct = (v) => `${(v * 100).toFixed(3)}%`;

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

  // 0~1 크기의 사각형을 조각보처럼 크고 작은 사각형으로 나눔
  function makePatches(rnd) {
    const out = [];
    function split(x, y, w, h, depth) {
      const tooSmall = w < 0.16 && h < 0.16;
      if (depth >= 5 || tooSmall || (depth >= 3 && rnd() < 0.35)) {
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


  // =========================================================
  // 1. 첫 화면: 조각 만들기
  //    조각 하나 = 원단 면 + 사진 면. 원단 면은 아홉 색 중 하나,
  //    사진 면은 같은 사진에서 그 조각 자리만 보이게 잘라 냄
  // =========================================================

  // 조각에 쓰는 작은 원단 사진 (images/fabric/tile/)
  const FABRIC_TILES = ['01-gray', '02-sand', '03-red', '04-yellow', '05-navy', '06-green', '07-purple', '08-ink', '09-raw']
    .map((name) => `images/fabric/tile/${name}.webp`);

  const hero = $('[data-hero]');
  const heroStage = $('.hero__stage');
  const heroFrame = $('.hero__frame');
  const heroPhoto = $('.hero__photo');
  const heroTitle = $('.hero__title');
  const heroHint = $('.hero__hint');
  const heroWords = $$('.hero__words span');

  const patches = []; // { el, photo, cx, cy, r }
  let focusPatch = null; // 처음 화면을 가득 채우는 조각 (얼굴 근처)

  function buildHeroPatches() {
    const box = $('.hero__patches');
    const rnd = seededRandom(11);
    const photo = heroFrame.dataset.photo;
    let prev = -1;

    makePatches(rnd).forEach((r) => {
      const el = document.createElement('div');
      el.className = 'patch';
      el.style.left = pct(r.x);
      el.style.top = pct(r.y);
      el.style.width = pct(r.w);
      el.style.height = pct(r.h);

      // 원단 면: 바로 옆 조각과 같은 색이 되지 않게
      const cloth = document.createElement('i');
      cloth.className = 'patch__cloth';
      let f;
      do { f = Math.floor(rnd() * FABRIC_TILES.length); } while (f === prev);
      prev = f;
      cloth.style.backgroundImage = `url("${FABRIC_TILES[f]}")`;

      // 사진 면: 사진 전체를 깔고 이 조각 자리만 보이게
      const face = document.createElement('i');
      face.className = 'patch__photo';
      face.style.backgroundImage = `url("${photo}")`;
      face.style.backgroundSize = `${100 / r.w}% ${100 / r.h}%`;
      face.style.backgroundPosition = `${r.w < 1 ? (r.x / (1 - r.w)) * 100 : 0}% ${r.h < 1 ? (r.y / (1 - r.h)) * 100 : 0}%`;

      el.append(cloth, face);
      box.append(el);

      patches.push({ el, cloth, photo: face, r, cx: r.x + r.w / 2, cy: r.y + r.h / 2 });
    });

    // 처음 화면을 채울 조각: 사진 가운데 부근(얼굴 쪽)에서 가장 넉넉한 조각
    // (가늘고 긴 조각은 화면을 채우려면 너무 크게 확대해야 해서 제외)
    const ratio = heroFrame.offsetWidth / heroFrame.offsetHeight || 0.75;
    const roomy = (p) => Math.min(p.r.w * ratio, p.r.h); // 짧은 변 길이 (사진 높이 기준)
    focusPatch = patches
      .filter((p) => p.cx > 0.25 && p.cx < 0.75 && p.cy > 0.15 && p.cy < 0.65)
      .reduce((best, p) => (!best || roomy(p) > roomy(best) ? p : best), null) || patches[0];

    // 처음 화면을 채우는 조각은 큰 원단 사진으로 (확대해도 결이 선명하게)
    focusPatch.cloth.style.backgroundImage = `url("${heroFrame.dataset.macro}")`;
  }
  buildHeroPatches();

  const otherPatches = patches.filter((p) => p !== focusPatch);
  const photoFaces = patches.map((p) => p.photo);

  // 확대 상태: 가운데 조각이 화면을 가득 채우도록 하는 배율과 위치
  // maxScale: 너무 크게 키우면 휴대폰이 버거워서 상한을 둠
  function heroZoom(maxScale) {
    const fw = heroFrame.offsetWidth;
    const fh = heroFrame.offsetHeight;
    const pw = focusPatch.r.w * fw;
    const ph = focusPatch.r.h * fh;
    const ox = focusPatch.cx * fw; // 사진 틀 안에서 조각 가운데 위치
    const oy = focusPatch.cy * fh;
    return {
      scale: Math.min(maxScale, Math.max(heroStage.clientWidth / pw, heroStage.clientHeight / ph) * 1.06),
      x: heroStage.clientWidth / 2 - (heroFrame.offsetLeft + ox), // 조각 가운데 → 화면 가운데
      y: heroStage.clientHeight / 2 - (heroFrame.offsetTop + oy),
      origin: `${ox}px ${oy}px`,
    };
  }

  // 조각이 조금씩 벌어져 있다가 이어지도록: 사진 가운데에서 바깥쪽으로 밀어 둔 거리
  const spread = (p, axis) => (axis === 'x' ? p.cx - 0.5 : p.cy - 0.5) * 22;


  // =========================================================
  // 2. 사진 섹션 영상 (컴퓨터 전용)
  //    프레임 이미지 243장을 캔버스에 스크롤 위치에 맞춰 그림
  // =========================================================

  const film = $('[data-film]');
  const canvas = $('.film__video');
  const ctx = canvas.getContext('2d');
  const clip = {
    src: canvas.dataset.src,
    count: Number(canvas.dataset.count),
    junction: Number(canvas.dataset.junction), // 2컷 장면이 나오는 프레임 번호
    frames: [],
    current: -1,
  };
  const filmFirst = $('.film__first');
  const filmLast = $('.film__last');
  const filmFrame = $('.film__frame');
  const filmCaptions = $$('.film__caption');
  const filmIndex = $$('.film__index li');

  const frameSrc = (i) => `${clip.src}${String(i + 1).padStart(4, '0')}.webp`;
  const ready = (img) => img && img.complete && img.naturalWidth;

  // 사진 섹션에 가까워졌을 때만 불러옴. 듬성듬성(16장 간격) 먼저 → 점점 촘촘히
  let framesLoading = false;
  function loadFrames() {
    if (framesLoading) return;
    framesLoading = true;
    const order = [];
    const seen = new Set();
    [16, 8, 4, 2, 1].forEach((step) => {
      for (let i = 0; i < clip.count; i += step) {
        if (!seen.has(i)) { seen.add(i); order.push(i); }
      }
    });
    order.forEach((i) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => { if (i === clip.current) drawFrame(i, true); };
      img.src = frameSrc(i);
      clip.frames[i] = img;
    });
  }

  function sizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(canvas.clientWidth * dpr);
    canvas.height = Math.round(canvas.clientHeight * dpr);
    if (clip.current >= 0) drawFrame(clip.current, true);
  }

  function drawFrame(index, force) {
    if (index === clip.current && !force) return;
    clip.current = index;
    // 아직 안 불러온 프레임이면 가장 가까운 앞 프레임을 대신 그림
    let i = index;
    while (i > 0 && !ready(clip.frames[i])) i--;
    const img = clip.frames[i];
    if (!ready(img) || !canvas.width) return;
    // object-fit: cover 처럼 꽉 채워 그리기
    const cw = canvas.width;
    const ch = canvas.height;
    const s = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
    const w = img.naturalWidth * s;
    const h = img.naturalHeight * s;
    ctx.drawImage(img, (cw - w) / 2, (ch - h) / 2, w, h);
  }

  // 영상 재생 위치: 출발 → 2컷 장면(junction) → 도착 지점에서 느려짐
  // v: 스크롤 진행도(0~1) → 영상 위치(0~1). slow가 클수록 세 지점에서 더 오래 머묾
  function easeThrough(v, junction, slow = 0.7) {
    const center = (x) => (x <= junction ? (x / junction) * 0.5 : 0.5 + ((x - junction) / (1 - junction)) * 0.5);
    const uncenter = (y) => (y <= 0.5 ? (y / 0.5) * junction : junction + ((y - 0.5) / 0.5) * (1 - junction));
    const y = center(v);
    return uncenter(y - (slow * Math.sin(4 * Math.PI * y)) / (4 * Math.PI));
  }

  // p: 사진 섹션 진행도 (0~1)
  //   0.00 ~ 0.06  CUT 01 (감싸다) 사진에 머묾
  //   0.06 ~ 1.00  영상: 2컷 장면(머금다)에서 느려졌다가 3컷(마주하다) 사진에 도착해 머묾
  function renderFilm(p) {
    const uv = range(p, 0.06, 1);
    const junction = (clip.junction - 1) / (clip.count - 1);
    const pos = easeThrough(range(uv, 0, 0.8), junction);
    drawFrame(Math.round(pos * (clip.count - 1)));

    const videoIn = range(uv, 0, 0.03); // 영상 첫 장면 = 1컷 사진이라 살짝 겹쳐 바꿈
    const lastIn = range(uv, 0.78, 0.84); // 영상 끝 장면 = 3컷 사진

    // 3컷에 도착한 뒤에도 카메라가 아주 천천히 다가가는 느낌
    filmFrame.style.transform = `scale(${1 + 0.05 * range(uv, 0.8, 1)})`;

    // 완전히 덮인 아래 장면은 숨김 (흐린 가장자리로 비치지 않게)
    canvas.style.opacity = videoIn;
    filmLast.style.opacity = lastIn;
    filmFirst.style.visibility = videoIn >= 1 ? 'hidden' : 'visible';
    canvas.style.visibility = lastIn >= 1 || videoIn <= 0 ? 'hidden' : 'visible';

    const capOpacity = [
      1 - range(uv, 0, 0.08),
      range(pos, junction - 0.12, junction - 0.04) * (1 - range(pos, junction + 0.1, junction + 0.18)),
      range(uv, 0.82, 0.92),
    ];
    filmCaptions.forEach((cap, i) => {
      const o = capOpacity[i];
      cap.style.opacity = o;
      cap.style.transform = `translateY(${(1 - Math.min(1, o * 2)) * 12}px)`;
    });
    const active = uv >= 0.8 ? 2 : pos >= junction - 0.12 ? 1 : 0;
    filmIndex.forEach((li, i) => li.classList.toggle('is-active', i === active));
  }


  // =========================================================
  // 3. 화면별 설정
  // =========================================================

  let lenis = null; // 컴퓨터에서만 사용 (부드러운 휠 스크롤)

  const mm = gsap.matchMedia();

  mm.add({
    desktop: '(min-width: 900px) and (prefers-reduced-motion: no-preference)',
    mobile: '(max-width: 899.98px) and (prefers-reduced-motion: no-preference)',
    reduce: '(prefers-reduced-motion: reduce)',
  }, (context) => {
    const { desktop, mobile } = context.conditions;
    if (desktop) return setupDesktop();
    if (mobile) return setupMobile();
    return setupStatic();
  });


  // ---------- 컴퓨터 ----------

  function setupDesktop() {
    // 부드러운 휠 스크롤 (Lenis) — 스크롤할 때마다 ScrollTrigger에 알려 줌
    if (window.Lenis) {
      lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 0.9 });
      lenis.on('scroll', ScrollTrigger.update);
    }
    const raf = (time) => lenis && lenis.raf(time * 1000);
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0);

    // --- 01 첫 화면: 원단 접사 → 줌아웃 → 조각이 이어짐 → 사진으로 조립 ---
    // 스크롤 길이: end의 숫자(화면 높이의 배수)가 클수록 천천히
    const zoom = () => heroZoom(14);
    const heroTl = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        trigger: hero,
        start: 'top top',
        end: () => `+=${window.innerHeight * 2.6}`,
        pin: heroStage,
        scrub: 1,
        invalidateOnRefresh: true,
      },
    });
    heroTl
      // 한 올: 원단을 아주 가까이 → 뒤로 물러남
      .fromTo(heroFrame,
        { scale: () => zoom().scale, x: () => zoom().x, y: () => zoom().y, transformOrigin: () => zoom().origin, force3D: false },
        { scale: 1, x: 0, y: 0, duration: 4.4, ease: 'power2.inOut', force3D: false }, 0)
      // 한 조각: 벌어져 있던 조각들이 서로 다가가 이어짐
      .fromTo(otherPatches.map((p) => p.el),
        { xPercent: (i) => spread(otherPatches[i], 'x'), yPercent: (i) => spread(otherPatches[i], 'y'), scale: 0.9 },
        { xPercent: 0, yPercent: 0, scale: 1, duration: 2.6, ease: 'power2.out' }, 1.6)
      // 한 사람: 조각마다 사진이 채워짐
      .to(photoFaces, { opacity: 1, duration: 0.6, stagger: { amount: 1.6, from: 'random' } }, 4.0)
      .to(heroPhoto, { opacity: 1, duration: 0.6 }, 6.1)
      // 제목
      .fromTo(heroTitle, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.8 }, 6.3)
      .to(heroHint, { opacity: 0, duration: 0.4 }, 0)
      // 세 낱말
      .fromTo(heroWords[0], { opacity: 1 }, { opacity: 0, duration: 0.5 }, 1.1)
      .fromTo(heroWords[1], { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.5 }, 1.9)
      .to(heroWords[1], { opacity: 0, duration: 0.5 }, 3.5)
      .fromTo(heroWords[2], { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.5 }, 4.5)
      .to(heroWords[2], { opacity: 0, duration: 0.5 }, 6.2)
      .to({}, { duration: 0.6 }); // 끝에서 잠시 머묾

    // --- 01 두 작품, 02 배경: 화면에 들어오면 나타남 ---
    fadeIn();
    gsap.fromTo('.background__cloth img', { scale: 1.18 }, {
      scale: 1, ease: 'none',
      scrollTrigger: { trigger: '#background', start: 'top bottom', end: 'bottom top', scrub: true },
    });
    // 문장 덩어리가 화면 가운데로 올수록 또렷해짐
    $$('.verse').forEach((verse) => {
      gsap.fromTo(verse, { opacity: 0.08, y: 40 }, {
        opacity: 1, y: 0, ease: 'none',
        scrollTrigger: { trigger: verse, start: 'top 88%', end: 'top 50%', scrub: true },
      });
    });

    // --- 03 아홉 가지 색: 화면을 고정하고 옆으로 한 장씩 ---
    const colors = $('[data-colors]');
    const track = $('.colors__track', colors);
    const cards = $$('.hue', colors);
    const dots = $$('.colors__dots li', colors);
    colors.classList.add('is-horizontal');
    const distance = () => track.scrollWidth - window.innerWidth;

    const slide = gsap.to(track, {
      x: () => -distance(),
      ease: 'none',
      scrollTrigger: {
        trigger: colors,
        start: 'top top',
        end: () => `+=${distance()}`,
        pin: true,
        scrub: 0.8,
        invalidateOnRefresh: true,
        onUpdate: (self) => {
          // 화면 가운데에 가장 가까운 카드를 표시
          const x = self.progress * distance() + window.innerWidth / 2;
          let active = -1;
          cards.forEach((card, i) => {
            if (x >= card.offsetLeft && x < card.offsetLeft + card.offsetWidth) active = i;
          });
          dots.forEach((dot, i) => dot.classList.toggle('is-active', i === active));
        },
      },
    });
    cards.forEach((card) => {
      // 원단은 살짝 크게 시작해 제자리로 (천이 내려앉는 느낌)
      gsap.fromTo($('.hue__cloth img', card), { scale: 1.22, xPercent: -8 }, {
        scale: 1, xPercent: 0, ease: 'none',
        scrollTrigger: { trigger: card, containerAnimation: slide, start: 'left right', end: 'left left', scrub: true },
      });
      gsap.fromTo($('.hue__text', card), { opacity: 0, x: 80 }, {
        opacity: 1, x: 0, ease: 'none',
        scrollTrigger: { trigger: card, containerAnimation: slide, start: 'left 80%', end: 'left 30%', scrub: true },
      });
    });
    // 옆으로 숨어 있는 원단 사진은 섹션에 가까워지면 미리 불러 둠
    ScrollTrigger.create({
      trigger: colors, start: 'top bottom+=100%', end: 'max', once: true,
      onEnter: () => $$('img[loading="lazy"]', colors).forEach((img) => { img.loading = 'eager'; }),
    });

    // --- 04 사진: 화면을 고정하고 스크롤로 영상을 넘김 ---
    sizeCanvas();
    const filmState = { p: 0 };
    renderFilm(0);
    gsap.to(filmState, {
      p: 1,
      ease: 'none',
      onUpdate: () => renderFilm(filmState.p),
      scrollTrigger: {
        trigger: film,
        start: 'top top',
        // data-length: 스크롤 길이 (화면 높이의 %). 클수록 영상이 천천히 지나감
        end: () => `+=${window.innerHeight * (Number(film.dataset.length) || 1500) / 100}`,
        pin: '.film__stage',
        scrub: 1.2, // 스크롤을 한 박자 늦게 따라감 (묵직한 관성)
        invalidateOnRefresh: true,
      },
    });
    ScrollTrigger.create({
      trigger: '#photo', start: 'top bottom+=150%', end: 'max', once: true, onEnter: loadFrames,
    });
    ScrollTrigger.addEventListener('refreshInit', sizeCanvasLater);

    // --- 05 QR: 원단 결이 보이는 거리 → QR 전체 ---
    const qrImg = $('.qr__img');
    const steps = $$('.qr__steps li');
    const qrTl = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        trigger: '[data-qr]',
        start: 'top top',
        end: () => `+=${window.innerHeight * 1.8}`,
        pin: '.qr__stage',
        scrub: 1,
      },
    });
    qrTl
      .fromTo(qrImg, { scale: 6, transformOrigin: '38% 46%', force3D: false }, { scale: 1, duration: 3, ease: 'power2.inOut', force3D: false }, 0)
      // 글 네 줄: 지금 거리에 맞는 줄만 또렷하게, 마지막엔 모두
      .fromTo(steps[0], { opacity: 0.18 }, { opacity: 1, duration: 0.3 }, 0)
      .to(steps[0], { opacity: 0.35, duration: 0.3 }, 1)
      .fromTo(steps[1], { opacity: 0.18 }, { opacity: 1, duration: 0.3 }, 1)
      .to(steps[1], { opacity: 0.35, duration: 0.3 }, 2)
      .fromTo(steps[2], { opacity: 0.18 }, { opacity: 1, duration: 0.3 }, 2)
      .fromTo(steps[3], { opacity: 0.18 }, { opacity: 1, duration: 0.4 }, 3)
      .to(steps.slice(0, 3), { opacity: 1, duration: 0.4 }, 3)
      .to({}, { duration: 0.6 });

    // 정리 (화면이 휴대폰 크기로 바뀌면 호출됨)
    return () => {
      gsap.ticker.remove(raf);
      gsap.ticker.lagSmoothing(500, 33);
      if (lenis) { lenis.destroy(); lenis = null; }
      colors.classList.remove('is-horizontal');
      ScrollTrigger.removeEventListener('refreshInit', sizeCanvasLater);
      filmFrame.style.transform = '';
    };
  }

  // 캔버스 크기는 레이아웃이 정해진 뒤에 맞춤
  function sizeCanvasLater() {
    requestAnimationFrame(sizeCanvas);
  }


  // ---------- 휴대폰: 고정 없이 가볍게 ----------

  function setupMobile() {
    // --- 01 첫 화면: 페이지가 열리면 한 번 재생 (스크롤과 무관) ---
    const z = heroZoom(5); // 휴대폰은 5배까지만 확대
    const intro = gsap.timeline({ delay: 0.15, defaults: { ease: 'power2.out' } });
    intro
      .set(heroFrame, { transformOrigin: z.origin })
      .fromTo(heroFrame, { scale: z.scale, x: z.x, y: z.y }, { scale: 1, x: 0, y: 0, duration: 2.4, ease: 'power3.inOut' }, 0)
      .fromTo(otherPatches.map((p) => p.el),
        { xPercent: (i) => spread(otherPatches[i], 'x'), yPercent: (i) => spread(otherPatches[i], 'y'), scale: 0.9 },
        { xPercent: 0, yPercent: 0, scale: 1, duration: 1.4 }, 0.9)
      .fromTo(heroWords[0], { opacity: 0 }, { opacity: 1, duration: 0.4 }, 0)
      .to(heroWords[0], { opacity: 0, duration: 0.3 }, 0.8)
      .fromTo(heroWords[1], { opacity: 0 }, { opacity: 1, duration: 0.4 }, 1.1)
      .to(heroWords[1], { opacity: 0, duration: 0.3 }, 1.9)
      .to(photoFaces, { opacity: 1, duration: 0.45, stagger: { amount: 0.9, from: 'random' } }, 2.1)
      .fromTo(heroWords[2], { opacity: 0 }, { opacity: 1, duration: 0.4 }, 2.2)
      .to(heroWords[2], { opacity: 0, duration: 0.4 }, 3.3)
      .to(heroPhoto, { opacity: 1, duration: 0.6 }, 3.1)
      .fromTo(heroTitle, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.9 }, 3.4);

    // 스크롤을 시작하면 '천천히 내려 보세요' 안내를 거둠
    gsap.to(heroHint, {
      opacity: 0, ease: 'none',
      scrollTrigger: { trigger: hero, start: 'top top', end: '+=160', scrub: true },
    });

    // --- 나머지: 화면에 들어오면 한 번 나타남 ---
    fadeIn();
    $$('.verse').forEach((verse) => {
      gsap.fromTo(verse, { opacity: 0, y: 28 }, {
        opacity: 1, y: 0, duration: 1.2, ease: 'power2.out',
        scrollTrigger: { trigger: verse, start: 'top 84%', toggleActions: 'play none none none' },
      });
    });

    // 사진 세 장면: 천이 내려앉듯
    $$('[data-plate]').forEach((plate) => {
      gsap.fromTo($('.plate__img', plate), { opacity: 0, y: 48 }, {
        opacity: 1, y: 0, duration: 1.3, ease: 'power2.out',
        scrollTrigger: { trigger: plate, start: 'top 86%', toggleActions: 'play none none none' },
      });
      gsap.fromTo($('figcaption', plate), { opacity: 0, y: 16 }, {
        opacity: 1, y: 0, duration: 1, delay: 0.35, ease: 'power2.out',
        scrollTrigger: { trigger: plate, start: 'top 86%', toggleActions: 'play none none none' },
      });
    });

    // QR: 가까이에서 한 걸음 물러나며
    gsap.fromTo('.qr__img', { scale: 1.6 }, {
      scale: 1, duration: 2, ease: 'power3.out',
      scrollTrigger: { trigger: '.qr__media', start: 'top 82%', toggleActions: 'play none none none' },
    });

    return () => {};
  }


  // ---------- 움직임 줄이기: 다 보이는 상태 그대로 ----------

  function setupStatic() {
    gsap.set([heroPhoto, heroTitle], { opacity: 1 });
    gsap.set(photoFaces, { opacity: 1 });
    return () => {};
  }


  // 화면에 들어오면 아래에서 살며시 (data-fade가 붙은 요소)
  function fadeIn() {
    const items = $$('[data-fade]');
    gsap.set(items, { opacity: 0, y: 40 });
    ScrollTrigger.batch(items, {
      start: 'top 88%',
      once: true,
      onEnter: (batch) => gsap.to(batch, { opacity: 1, y: 0, duration: 1.1, ease: 'power2.out', stagger: 0.12 }),
    });
  }


  // =========================================================
  // 4. 메뉴 · 지금 보고 있는 섹션
  // =========================================================

  const topbar = $('.topbar');
  const menuButton = $('.topbar__menu');
  const currentLabel = $('.topbar__current');
  const thread = $('.topbar__thread');
  const navLinks = $$('.topbar__nav a');
  const sections = $$('main > .section');

  function setCurrent(id) {
    navLinks.forEach((a) => {
      const on = a.hash === `#${id}`;
      if (on) {
        a.setAttribute('aria-current', 'true');
        currentLabel.textContent = a.lastChild.textContent.trim();
      } else {
        a.removeAttribute('aria-current');
      }
    });
  }

  // 섹션마다: 화면 가운데를 지나는 동안 메뉴에 표시 / 상단 메뉴 아래에 있는 동안 메뉴 글자색 맞춤
  // (refreshPriority -1: 화면 고정 구간 길이가 먼저 계산된 뒤에 위치를 잼)
  sections.forEach((section) => {
    ScrollTrigger.create({
      trigger: section,
      start: 'top 50%',
      end: 'bottom 50%',
      refreshPriority: -1,
      onToggle: (self) => self.isActive && setCurrent(section.id),
    });
    ScrollTrigger.create({
      trigger: section,
      start: () => `top ${topbar.offsetHeight / 2}px`,
      end: () => `bottom ${topbar.offsetHeight / 2}px`,
      refreshPriority: -1,
      onToggle: (self) => {
        if (self.isActive) topbar.dataset.theme = section.classList.contains('theme-light') ? 'light' : 'dark';
      },
    });
  });

  // 첫 화면을 지나면 상단 메뉴에 바탕을 깖
  ScrollTrigger.create({
    trigger: hero,
    start: 'bottom top+=80',
    refreshPriority: -1,
    onEnter: () => topbar.classList.add('is-solid'),
    onLeaveBack: () => topbar.classList.remove('is-solid'),
  });

  // 페이지를 얼마나 내려왔는지: 실이 늘어남
  const setThread = gsap.quickSetter(thread, 'scaleX');
  ScrollTrigger.create({
    start: 0,
    end: 'max',
    refreshPriority: -1,
    onUpdate: (self) => setThread(self.progress),
  });

  // 휴대폰 메뉴 열기·닫기
  function toggleMenu(open) {
    topbar.classList.toggle('is-open', open);
    root.classList.toggle('menu-open', open);
    menuButton.setAttribute('aria-expanded', String(open));
    menuButton.querySelector('.sr-only').textContent = open ? '메뉴 닫기' : '메뉴 열기';
  }
  menuButton.addEventListener('click', () => toggleMenu(!topbar.classList.contains('is-open')));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && topbar.classList.contains('is-open')) {
      toggleMenu(false);
      menuButton.focus();
    }
  });

  // 메뉴·링크를 누르면 그 섹션으로 부드럽게 이동
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  function goTo(hash, instant) {
    const target = hash && hash.length > 1 ? document.getElementById(hash.slice(1)) : null;
    if (!target) return false;
    const y = target.getBoundingClientRect().top + window.scrollY;
    if (lenis && !instant) {
      lenis.scrollTo(y, { duration: 1.6 });
    } else {
      window.scrollTo({ top: y, behavior: instant || reduceMotion.matches ? 'auto' : 'smooth' });
    }
    // 키보드 사용자도 그 섹션부터 이어서 읽도록 초점 이동
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
    return true;
  }

  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href^="#"]');
    if (!link) return;
    toggleMenu(false);
    if (goTo(link.hash)) {
      e.preventDefault();
      history.replaceState(null, '', link.hash);
    }
  });

  // 다 불러온 뒤 위치를 다시 계산 (주소에 #섹션이 있으면 그 자리로)
  window.addEventListener('load', () => {
    ScrollTrigger.refresh();
    if (location.hash) goTo(location.hash, true);
  });


  // =========================================================
  // 5. 사진 크게 보기
  // =========================================================

  const lightbox = $('.lightbox');
  const lbImg = $('.lightbox__img', lightbox);
  const lbTitle = $('.lightbox__title', lightbox);
  const lbCount = $('.lightbox__count', lightbox);
  const lbItems = $$('[data-lightbox]');
  let lbIndex = 0;

  // srcset이 있으면 가장 큰 사진으로
  const largest = (img) => (img.srcset ? img.srcset.split(',').pop().trim().split(' ')[0] : img.currentSrc || img.src);

  function showPhoto(index) {
    lbIndex = (index + lbItems.length) % lbItems.length;
    const item = lbItems[lbIndex];
    const img = $('img', item);
    lbImg.src = largest(img);
    lbImg.alt = img.alt;
    lbTitle.textContent = item.dataset.caption;
    lbCount.textContent = `${lbIndex + 1} / ${lbItems.length}`;
    if (!lightbox.open) {
      lightbox.showModal();
      if (lenis) lenis.stop();
    }
  }

  lbItems.forEach((item, i) => item.addEventListener('click', () => showPhoto(i)));
  $('.lightbox__prev', lightbox).addEventListener('click', () => showPhoto(lbIndex - 1));
  $('.lightbox__next', lightbox).addEventListener('click', () => showPhoto(lbIndex + 1));
  $('.lightbox__close', lightbox).addEventListener('click', () => lightbox.close());
  lightbox.addEventListener('close', () => { if (lenis) lenis.start(); });

  // 사진 바깥 빈 곳을 누르면 닫힘
  lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox) lightbox.close();
  });

  // 키보드 ← →
  lightbox.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') showPhoto(lbIndex - 1);
    if (e.key === 'ArrowRight') showPhoto(lbIndex + 1);
  });

  // 휴대폰: 옆으로 밀어서 넘기기
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
})();
