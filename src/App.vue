<template>
  <div class="ocr-container">
    <video ref="videoRef" autoplay playsinline class="camera-view"></video>

    <div class="overlay">
      <div class="status-badge" :class="{ 'is-active': isProcessing }">
        {{ isProcessing ? '⚡ Processing...' : '📡 Live Scanning' }}
      </div>
      <div class="scan-frame"></div>
    </div>

    <div class="debug-panel">
      <div class="debug-header">Debug View</div>
      <img v-if="debugImageUrl" :src="debugImageUrl" class="debug-preview" />
      <div v-else class="debug-placeholder">No frame captured</div>
      
      <div class="debug-info">
        <p>Res: {{ debugInfo.res }}</p>
        <p>Size: {{ debugInfo.size }} KB</p>
        <p>Last Sync: {{ debugInfo.time }}</p>
        <div class="result-text">{{ text }}</div>
      </div>
    </div>

    <canvas ref="canvasRef" v-show="false"></canvas>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted } from 'vue';

// --- State ---
const videoRef = ref<HTMLVideoElement | null>(null);
const canvasRef = ref<HTMLCanvasElement | null>(null);
const isProcessing = ref(false);
const isLooping = ref(false);
const text = ref('');

const debugImageUrl = ref<string | null>(null);
const debugInfo = reactive({
  res: '0x0',
  size: '0',
  time: '-'
});

let stream: MediaStream | null = null;

// --- Methods ---

const initCamera = async () => {
  try {
    const constraints = {
      video: {
        facingMode: 'environment',
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
      audio: false
    };

    stream = await navigator.mediaDevices.getUserMedia(constraints);
    if (videoRef.value) {
      videoRef.value.srcObject = stream;
      
      const track = stream.getVideoTracks()[0];
      const capabilities: any = track.getCapabilities();
      if (capabilities.focusMode?.includes('continuous')) {
        await track.applyConstraints({
          advanced: [{ focusMode: 'continuous' } as any]
        });
      }
    }
    startCaptureLoop();
  } catch (err) {
    alert("Camera Error: " + err);
  }
};

const captureSingleFrame = (): Promise<Blob | null> => {
  return new Promise((resolve) => {
    if (!videoRef.value || !canvasRef.value) return resolve(null);

    const video = videoRef.value;
    const canvas = canvasRef.value;
    const context = canvas.getContext('2d');

    if (!context || video.videoWidth === 0) return resolve(null);

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.7);
  });
};

const sendToServer = async (imageBlob: Blob) => {
  isProcessing.value = true;
  try {
    const formData = new FormData();
    formData.append("images", imageBlob, "frame.jpg");

    const response = await fetch('https://itg-go.onrender.com/ocr-single-safe', {
      method: 'POST',
      body: formData
    });
    
    const data = await response.json();
    text.value = data.results?.[0] || 'No text found';
  } catch (ex) {
    console.error('API Error:', ex);
  } finally {
    isProcessing.value = false;
  }
};

const runLoop = async () => {
  if (!isLooping.value) return;

  const blob = await captureSingleFrame();

  if (blob && !isProcessing.value) {
    // Update Debug UI
    if (debugImageUrl.value) URL.revokeObjectURL(debugImageUrl.value);
    debugImageUrl.value = URL.createObjectURL(blob);
    
    debugInfo.res = `${canvasRef.value?.width}x${canvasRef.value?.height}`;
    debugInfo.size = (blob.size / 1024).toFixed(2);
    debugInfo.time = new Date().toLocaleTimeString();

    // OCR Request
    await sendToServer(blob);
  }

  // เมื่อทุกอย่างเสร็จ (หรือข้าม) รอ 1 วิแล้วเริ่มรอบใหม่
  setTimeout(runLoop, 1000);
};

const startCaptureLoop = () => {
  isLooping.value = true;
  runLoop();
};

const stopCaptureLoop = () => {
  isLooping.value = false;
  if (debugImageUrl.value) URL.revokeObjectURL(debugImageUrl.value);
};

// --- Lifecycle ---
onMounted(() => initCamera());
onUnmounted(() => {
  stopCaptureLoop();
  stream?.getTracks().forEach(track => track.stop());
});
</script>

<style scoped>
.ocr-container {
  position: relative;
  width: 100vw;
  height: 100vh;
  background: #000;
  overflow: hidden;
}

.camera-view {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.overlay {
  position: absolute;
  top: 0; left: 0; width: 100%; height: 100%;
  display: flex; flex-direction: column; align-items: center;
  pointer-events: none;
}

.status-badge {
  margin-top: 20px;
  padding: 6px 16px;
  background: rgba(0,0,0,0.75);
  color: #00ff00;
  border: 1px solid #00ff00;
  border-radius: 20px;
  font-size: 14px;
  transition: all 0.3s;
}

.status-badge.is-active {
  color: #ffcc00;
  border-color: #ffcc00;
  box-shadow: 0 0 10px rgba(255, 204, 0, 0.5);
}

.scan-frame {
  margin: auto;
  width: 80%;
  height: 20%;
  border: 2px solid rgba(255,255,255,0.8);
  box-shadow: 0 0 0 1000px rgba(0,0,0,0.5);
  border-radius: 8px;
}

.debug-panel {
  position: absolute;
  bottom: 20px;
  right: 20px;
  width: 180px;
  background: rgba(0, 0, 0, 0.9);
  border: 1px solid #333;
  border-radius: 12px;
  padding: 10px;
  color: #fff;
  font-family: 'Courier New', Courier, monospace;
  font-size: 11px;
  z-index: 100;
}

.debug-header {
  font-weight: bold;
  margin-bottom: 8px;
  color: #00ff00;
  text-transform: uppercase;
}

.debug-preview {
  width: 100%;
  border-radius: 4px;
  margin-bottom: 8px;
}

.result-text {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed #444;
  color: #00ffcc;
  word-break: break-all;
}
</style>