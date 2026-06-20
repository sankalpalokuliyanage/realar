const video = document.getElementById('video');
const canvas = document.getElementById('output');
const ctx = canvas.getContext('2d');
const crown = new Image();
crown.src = 'crown.png'; // ඔබේ පින්තූරයේ නම

let faceLandmarker;

async function setup() {
    const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm");
    faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task" },
        runningMode: "VIDEO"
    });

    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = stream;
    video.play();
    video.onloadeddata = predict;
}

async function predict() {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const results = faceLandmarker.detectForVideo(video, performance.now());

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    if (results.faceLandmarks.length > 0) {
        const landmarks = results.faceLandmarks[0];
        // මුහුණේ ඉහළම ලක්ෂ්‍යය (හිස මුදුන සඳහා)
        const topHead = landmarks[10]; 
        
        const crownWidth = 150;
        const crownHeight = 100;
        
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