import urllib.request

url = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/vision_bundle.js'
text = urllib.request.urlopen(url, timeout=20).read().decode('utf-8', errors='ignore')
print('len', len(text))
print('HandLandmarker', 'HandLandmarker' in text)
print('FaceLandmarker', 'FaceLandmarker' in text)
print('FilesetResolver', 'FilesetResolver' in text)
print('export', 'export {' in text)
print('window.vision', 'window.vision' in text)
