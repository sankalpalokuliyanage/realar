const video = document.getElementById('video');
const canvas = document.getElementById('output');
const ctx = canvas.getContext('2d');

const selfieSegmentation = new SelfieSegmentation({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`
});

// modelSelection: 1 මගින් වඩාත් පැහැදිලි segmentation එකක් ලබාගනී
selfieSegmentation.setOptions({ modelSelection: 1 });
selfieSegmentation.onResults(onResults);

function onResults(results) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Quality වැඩි කිරීමට
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    ctx.save();
    
    // මායිම් මෘදු කිරීමට blur එකක් එකතු කිරීම
    ctx.filter = 'blur(2px)'; 
    ctx.drawImage(results.segmentationMask, 0, 0, canvas.width, canvas.height);
    
    ctx.globalCompositeOperation = 'source-in';
    ctx.filter = 'none'; 
    ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
    
    ctx.restore();
}

const camera = new Camera(video, {
    onFrame: async () => {
        await selfieSegmentation.send({ image: video });
    },
    width: 1280, // High Resolution ලබාගැනීමට
    height: 720
});
camera.start();