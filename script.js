import { FaceLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/dist/vision_bundle.js";

const video = document.getElementById('video');
const canvas = document.getElementById('output');
const ctx = canvas.getContext('2d');
const crown = new Image();
crown.src = 'crown.png'; 

async function setup() {
    // 1. WASM ගොනු සඳහා නිවැරදිම මග
    const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
);
    
    const faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
            delegate: "GPU"
        },
        runningMode: "VIDEO",
        numFaces: 1
    });

    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = stream;
    video.play();

    video.onloadeddata = () => {
        predict(faceLandmarker);
    };
}

async function predict(faceLandmarker) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const results = faceLandmarker.detectForVideo(video, performance.now());

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    if (results.faceLandmarks && results.faceLandmarks.length > 0) {
        const topHead = results.faceLandmarks[0][10]; 
        ctx.drawImage(crown, (topHead.x * canvas.width) - 75, (topHead.y * canvas.height) - 100, 150, 100);
    }
    requestAnimationFrame(() => predict(faceLandmarker));
}

setup();