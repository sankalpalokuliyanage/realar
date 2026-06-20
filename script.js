import { HandLandmarker, FilesetResolver } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/vision_bundle.js';

const video = document.getElementById('video');
const overlay = document.getElementById('overlay');
const overlayCtx = overlay.getContext('2d');
const board = document.getElementById('board');
const boardCtx = board.getContext('2d');
// mirror mode: shows mirrored video and maps landmarks accordingly
let mirror = true;
function sx(x, w) { return mirror ? (1 - x) * w : x * w; }
function sy(y, h) { return y * h; }
const toolbar = document.getElementById('toolbar');
const pencilBtn = document.getElementById('tool-pencil');
const eraserBtn = document.getElementById('tool-eraser');
const clearBtn = document.getElementById('tool-clear');

let currentTool = 'pencil'; // 'pencil'|'eraser'
const selectTimers = {}; // buttonId -> startTime
const SELECT_HOLD_MS = 400;

let handLandmarker = null;
let particles = [];
let lastTime = performance.now();
let debug = false;
let audioCtx = null;
let portalOsc = null;
let portalActive = false;
let prevPortalActive = false;
// fingertip trails storage: key = `${handIndex}_${landmarkIndex}` -> [{x,y,t},...]
const fingertipTrails = {};
// drawing board state
const lastDrawPos = {}; // key = handIndex -> {x,y}
const DRAW_THRESHOLD = 38;
const ERASE_THRESHOLD = 38;
const DRAW_STROKE = 14;
const ERASER_SIZE = 64;

function resizeOverlay() {
    overlay.width = window.innerWidth;
    overlay.height = window.innerHeight;
    if (board) {
        board.width = window.innerWidth;
        board.height = window.innerHeight;
    }
    // position toolbar hit areas don't need resizing here (DOM handles layout)
}
window.addEventListener('resize', resizeOverlay);

function spawnParticle(x, y, color) {
    particles.push({
        x, y,
        vx: (Math.random() - 0.5) * 1.2,
        vy: (Math.random() - 1.5) * 1.2,
        life: 1.0,
        size: 6 + Math.random() * 8,
        color
    });
}

function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.vy += 0.002 * dt; // gentle gravity
        p.x += p.vx * dt * 0.06;
        p.y += p.vy * dt * 0.06;
        p.life -= 0.002 * dt;
        p.size *= 0.995;
        if (p.life <= 0 || p.size < 0.5) particles.splice(i, 1);
    }
}

function drawGlowCircle(ctx, x, y, r, color) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(0.6, color.replace(/\)$/, ',0.25)').replace('rgb', 'rgba'));
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
}

// helper to build rgba from rgb and alpha
function rgba(rgbStr, a) {
    // expects 'rgb(r,g,b)'
    const nums = rgbStr.match(/\d+/g) || [255,255,255];
    return `rgba(${nums[0]},${nums[1]},${nums[2]},${a})`;
}

function drawParticles(ctx) {
    for (const p of particles) {
        const alpha = Math.max(0, p.life);
        ctx.globalCompositeOperation = 'lighter';
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
        grad.addColorStop(0, rgba('rgb(255,220,120)', alpha));
        grad.addColorStop(0.5, rgba('rgb(200,120,255)', alpha * 0.6));
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
}

function drawOrb(ctx, x, y, radius, colorA, colorB) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
    g.addColorStop(0, colorA);
    g.addColorStop(0.6, colorB);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI*2);
    ctx.fill();
    // ring
    ctx.lineWidth = Math.max(2, radius * 0.08);
    ctx.strokeStyle = colorB;
    ctx.beginPath();
    ctx.arc(x, y, radius * 0.9, 0, Math.PI*2);
    ctx.stroke();
    ctx.restore();
}

function drawPortal(ctx, x, y, radius, t) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // rotating ribbons
    for (let i = 0; i < 5; i++) {
        const a = t * 0.004 + i * Math.PI * 0.4;
        const r1 = radius * (0.6 + 0.12 * Math.sin(a * 3 + i));
        const r2 = radius * (1.0 + 0.08 * Math.cos(a * 2 + i));
        const x1 = x + Math.cos(a) * r1;
        const y1 = y + Math.sin(a) * r1;
        const x2 = x + Math.cos(a + 0.6) * r2;
        const y2 = y + Math.sin(a + 0.6) * r2;
        const grad = ctx.createLinearGradient(x1, y1, x2, y2);
        grad.addColorStop(0, 'rgba(160,220,255,0.25)');
        grad.addColorStop(1, 'rgba(255,160,220,0.35)');
        ctx.strokeStyle = grad;
        ctx.lineWidth = Math.max(6, radius * 0.06);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.quadraticCurveTo(x, y - radius * 0.2, x2, y2);
        ctx.stroke();
    }
    // central glow
    const g = ctx.createRadialGradient(x, y, 0, x, y, radius * 0.9);
    g.addColorStop(0, 'rgba(220,200,255,0.9)');
    g.addColorStop(0.5, 'rgba(160,220,255,0.25)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, radius * 0.9, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
}

function attractParticlesTo(x, y, strength) {
    for (const p of particles) {
        const dx = x - p.x;
        const dy = y - p.y;
        const d2 = dx*dx + dy*dy + 0.01;
        const f = strength / d2;
        p.vx += dx * f * 0.03;
        p.vy += dy * f * 0.03;
    }
}

function drawLandmarks(ctx, landmarks) {
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(0,255,180,0.8)';
    ctx.fillStyle = 'rgba(0,255,180,0.9)';
    for (let i = 0; i < landmarks.length; i++) {
        const x = sx(landmarks[i].x, overlay.width);
        const y = sy(landmarks[i].y, overlay.height);
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
    }

    // connections
    const connections = [
        [0,1],[1,2],[2,3],[3,4],
        [0,5],[5,6],[6,7],[7,8],
        [5,9],[9,10],[10,11],[11,12],
        [9,13],[13,14],[14,15],[15,16],
        [13,17],[17,18],[18,19],[19,20],[0,17]
    ];
    ctx.strokeStyle = 'rgba(120,200,255,0.6)';
    ctx.beginPath();
    for (const [a,b] of connections) {
        ctx.moveTo(sx(landmarks[a].x, overlay.width), sy(landmarks[a].y, overlay.height));
        ctx.lineTo(sx(landmarks[b].x, overlay.width), sy(landmarks[b].y, overlay.height));
    }
    ctx.stroke();
}

function updateFingertipTrail(handIndex, lmIndex, x, y) {
    const key = `${handIndex}_${lmIndex}`;
    if (!fingertipTrails[key]) fingertipTrails[key] = [];
    const arr = fingertipTrails[key];
    arr.push({ x, y, t: performance.now() });
    if (arr.length > 12) arr.shift();
}

function drawFingertipTrail(ctx, handIndex, lmIndex) {
    const key = `${handIndex}_${lmIndex}`;
    const arr = fingertipTrails[key];
    if (!arr || arr.length < 2) return;
    ctx.save();
    // draw fading trail
    for (let i = 0; i < arr.length - 1; i++) {
        const a = arr[i];
        const b = arr[i+1];
        const alpha = (i+1) / arr.length * 0.9;
        ctx.strokeStyle = `rgba(255,220,120,${alpha})`;
        ctx.lineWidth = 2 + (i / arr.length) * 3;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
    }
    ctx.restore();
}

function drawFingertipSparkle(ctx, x, y, size, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    const spikes = 6;
    for (let i = 0; i < spikes; i++) {
        const a = (i / spikes) * Math.PI * 2;
        const lx = Math.cos(a) * size;
        const ly = Math.sin(a) * size;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(lx, ly);
        ctx.stroke();
    }
    ctx.restore();
}

function drawArmLine(ctx, x0, y0, x1, y1) {
    ctx.save();
    const grad = ctx.createLinearGradient(x0, y0, x1, y1);
    grad.addColorStop(0, 'rgba(120,200,255,0.95)');
    grad.addColorStop(0.6, 'rgba(200,160,255,0.45)');
    grad.addColorStop(1, 'rgba(255,220,120,0)');
    ctx.strokeStyle = grad;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    // a thinner inner glow
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.restore();
}

async function setup() {
    resizeOverlay();

    const visionTask = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm');
    handLandmarker = await HandLandmarker.createFromOptions(visionTask, {
        baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'
        },
        runningMode: 'VIDEO',
        numHands: 2
    });

    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = stream;
    await video.play();
    // apply visual mirror to video element
    video.style.transform = mirror ? 'scaleX(-1)' : '';

    requestAnimationFrame(render);
}

function render() {
    const now = performance.now();
    const dt = now - lastTime;
    lastTime = now;

    overlayCtx.clearRect(0,0,overlay.width, overlay.height);

    if (!handLandmarker) {
        requestAnimationFrame(render);
        return;
    }

    const results = handLandmarker.detectForVideo(video, performance.now());
    const hands = results?.landmarks || [];
    // Board-only mode: drawing/erase + gesture-based toolbar selection
    const domRects = {
        pencil: pencilBtn.getBoundingClientRect(),
        eraser: eraserBtn.getBoundingClientRect(),
        clear: clearBtn.getBoundingClientRect()
    };

    for (let h = 0; h < hands.length; h++) {
        const lm = hands[h];
        if (!lm) continue;
        const idx = lm[8];
        const thumb = lm[4];
        const middle = lm[12];
        const pd = Math.hypot(sx(idx.x, overlay.width) - sx(thumb.x, overlay.width), sy(idx.y, overlay.height) - sy(thumb.y, overlay.height));
        const md = Math.hypot(sx(middle.x, overlay.width) - sx(thumb.x, overlay.width), sy(middle.y, overlay.height) - sy(thumb.y, overlay.height));
        const drawPinch = pd < DRAW_THRESHOLD;
        const isErasePinch = md < ERASE_THRESHOLD;
        const drawX = sx(idx.x, board.width);
        const drawY = sy(idx.y, board.height);

        // gesture-based toolbar hover + select (index finger position)
        const ix = sx(idx.x, window.innerWidth);
        const iy = sy(idx.y, window.innerHeight);
        // helper
        function checkRectHover(name, rect) {
            return ix >= rect.left && ix <= rect.right && iy >= rect.top && iy <= rect.bottom;
        }

        // handle hover classes and selection timers
        for (const [name, rect] of Object.entries(domRects)) {
            const btn = name === 'pencil' ? pencilBtn : (name === 'eraser' ? eraserBtn : clearBtn);
            if (checkRectHover(name, rect)) {
                btn.classList.add('hover');
                // start timer if pinched
                if (drawPinch) {
                    if (!selectTimers[name]) selectTimers[name] = performance.now();
                    else if (performance.now() - selectTimers[name] > SELECT_HOLD_MS) {
                        // activate
                        if (name === 'pencil' || name === 'eraser') {
                            currentTool = name;
                            pencilBtn.classList.toggle('active', currentTool === 'pencil');
                            eraserBtn.classList.toggle('active', currentTool === 'eraser');
                        } else if (name === 'clear') {
                            boardCtx.clearRect(0,0,board.width, board.height);
                        }
                        selectTimers[name] = null;
                    }
                }
            } else {
                btn.classList.remove('hover');
                selectTimers[name] = null;
            }
        }

        // drawing / erasing behavior
        const handKey = `h${h}`;
        if (drawPinch && !isErasePinch && currentTool === 'pencil') {
            // draw
            boardCtx.save();
            boardCtx.globalCompositeOperation = 'source-over';
            boardCtx.lineCap = 'round';
            boardCtx.lineJoin = 'round';
            boardCtx.strokeStyle = h === 0 ? 'rgba(255,220,120,0.95)' : 'rgba(180,220,255,0.95)';
            boardCtx.lineWidth = DRAW_STROKE;
            if (!lastDrawPos[handKey]) {
                boardCtx.beginPath();
                boardCtx.moveTo(drawX, drawY);
                boardCtx.lineTo(drawX, drawY);
                boardCtx.stroke();
                lastDrawPos[handKey] = { x: drawX, y: drawY };
            } else {
                boardCtx.beginPath();
                boardCtx.moveTo(lastDrawPos[handKey].x, lastDrawPos[handKey].y);
                boardCtx.lineTo(drawX, drawY);
                boardCtx.stroke();
                lastDrawPos[handKey].x = drawX;
                lastDrawPos[handKey].y = drawY;
            }
            boardCtx.restore();
        } else if ((drawPinch && isErasePinch) || (drawPinch && currentTool === 'eraser')) {
            // erase
            boardCtx.save();
            boardCtx.globalCompositeOperation = 'destination-out';
            boardCtx.beginPath();
            boardCtx.arc(drawX, drawY, ERASER_SIZE, 0, Math.PI * 2);
            boardCtx.fill();
            boardCtx.restore();
            delete lastDrawPos[handKey];
        } else {
            delete lastDrawPos[handKey];
        }
    }

    requestAnimationFrame(render);
}

setup().catch((e) => { console.error(e); alert('Failed to start hand detector. See console.'); });

// simple debug toggle
window.addEventListener('keydown', (e) => {
    if (e.key === 'd') debug = !debug;
    if (e.key === 'c') {
        // clear the persistent board
        if (boardCtx) {
            boardCtx.clearRect(0,0,board.width, board.height);
        }
    }
});

// toolbar mouse fallback
pencilBtn.addEventListener('click', () => { currentTool = 'pencil'; pencilBtn.classList.add('active'); eraserBtn.classList.remove('active'); });
eraserBtn.addEventListener('click', () => { currentTool = 'eraser'; eraserBtn.classList.add('active'); pencilBtn.classList.remove('active'); });
clearBtn.addEventListener('click', () => { boardCtx.clearRect(0,0,board.width, board.height); });
