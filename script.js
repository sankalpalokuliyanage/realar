import { FaceLandmarker, FilesetResolver } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/vision_bundle.js';

const video = document.getElementById('video');
const canvas = document.getElementById('output');
const ctx = canvas.getContext('2d');
const crown = new Image();
crown.src = 'crown.png';

async function setup() {
    try {
        const visionTask = await FilesetResolver.forVisionTasks(
            'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm'
        );

        const faceLandmarker = await FaceLandmarker.createFromOptions(visionTask, {
            baseOptions: {
                modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'
            },
            runningMode: 'VIDEO'
        });

        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        video.srcObject = stream;

        await video.play();
        await new Promise((resolve) => {
            if (video.readyState >= 2) {
                resolve();
            } else {
                video.onloadeddata = () => resolve();
            }
        });

        requestAnimationFrame(() => predict(faceLandmarker));
    } catch (error) {
        console.error('Setup failed:', error);
        alert('Failed to start face detection. Open the console for details.');
    }
}

function predict(faceLandmarker) {
    if (video.videoWidth && video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
    }

    const results = faceLandmarker.detectForVideo(video, performance.now());

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    if (results?.faceLandmarks?.length) {
        const topHead = results.faceLandmarks[0][10];
        if (topHead) {
            const x = topHead.x * canvas.width - 75;
            const y = topHead.y * canvas.height - 100;
            ctx.drawImage(crown, x, y, 150, 100);
        }
    }

    requestAnimationFrame(() => predict(faceLandmarker));
}

setup();