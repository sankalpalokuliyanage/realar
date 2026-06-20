import { FaceLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/dist/vision_bundle.js";

const video = document.getElementById('video');
const canvas = document.getElementById('output');
const ctx = canvas.getContext('2d');
const crown = new Image();
crown.src = 'crown.png'; 

let faceLandmarker;

async function setup() {
    // MediaPipe Vision Tasks setup
    const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
    );
    
    faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
            delegate: "GPU"
        },
        runningMode: "VIDEO",
        numFaces: 1
    });

    // කැමරාව ක්‍රියාත්මක කිරීම
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = stream;
    video.play();
    video.onloadeddata = predict;
}

async function predict() {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    // මුහුණ හඳුනා ගැනීම
    const results = faceLandmarker.detectForVideo(video, performance.now());

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // වීඩියෝව ඇඳීම
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    if (results.faceLandmarks && results.faceLandmarks.length > 0) {
        const landmarks = results.faceLandmarks[0];
        const topHead = landmarks[10]; // නළල මැද ලක්ෂ්‍යය
        
        const crownWidth = 150;
        const crownHeight = 100;
        
        // ඔටුන්න ඇඳීම
        ctx.drawImage(
            crown, 
            (topHead.x * canvas.width) - (crownWidth / 2), 
            (topHead.y * canvas.height) - 100, 
            crownWidth, 
            crownHeight
        );
    }
    requestAnimationFrame(predict);
}

setup();