<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted } from 'vue'

const videoRef = ref<HTMLVideoElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const isProcessing = ref(false)
const isLooping = ref(false)
const text = ref('')

// State สำหรับวาดกรอบโฟกัส (Visual Feedback)
const focusBox = reactive({ x: 0, y: 0, show: false })

const debugImageUrl = ref<string | null>(null)
const debugInfo = reactive({ res: '0', size: '0', time: '-' })

let stream: MediaStream | null = null
let track: MediaStreamTrack | null = null

// --- 1. ระบบกล้องและการตั้งค่าความละเอียด ---
const initCamera = async () => {
  try {
    const constraints = {
      video: {
        facingMode: 'environment',
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
    }

    stream = await navigator.mediaDevices.getUserMedia(constraints)
    if (videoRef.value) {
      videoRef.value.srcObject = stream
      track = stream.getVideoTracks()[0]!
    }
    startCaptureLoop()
  } catch (err) {
    console.error('Camera Init Error:', err)
  }
}

// --- 2. ระบบ Tap to Focus (Cherry-picked Logic) ---
const handleFocus = async (e: MouseEvent) => {
  if (!videoRef.value || !track) return

  const video = videoRef.value
  const capabilities = track.getCapabilities() as any

  // ตรวจสอบความสามารถของกล้อง
  if (!capabilities.focusMode) {
    console.warn("This device doesn't support focusMode")
    return
  }

  // คำนวณพิกัดจริง (Logic จาก calculateOffset ในตัวอย่าง)
  const rect = video.getBoundingClientRect()
  const containerWidth = rect.width
  const containerHeight = rect.height
  const videoWidth = video.videoWidth
  const videoHeight = video.videoHeight

  const containerRatio = containerWidth / containerHeight
  const videoRatio = videoWidth / videoHeight

  let offsetX = 0
  let offsetY = 0

  // หาขอบดำ (Offset)
  if (containerRatio > videoRatio) {
    const displayWidth = (containerHeight / videoHeight) * videoWidth
    offsetX = (containerWidth - displayWidth) / 2
  } else {
    const displayHeight = (containerWidth / videoWidth) * videoHeight
    offsetY = (containerHeight - displayHeight) / 2
  }

  // แปลงจุดที่แตะบนหน้าจอเป็นค่า 0 - 1 ของเนื้อวิดีโอจริงๆ
  const x = (e.offsetX - offsetX) / (containerWidth - offsetX * 2)
  const y = (e.offsetY - offsetY) / (containerHeight - offsetY * 2)

  // ข้ามหากแตะโดนขอบดำ
  if (x < 0 || x > 1 || y < 0 || y > 1) return

  // แสดงผล UI จุดโฟกัส
  focusBox.x = e.offsetX
  focusBox.y = e.offsetY
  focusBox.show = true

  try {
    const constraints = {
      advanced: [
        {
          focusMode: capabilities.focusMode.includes('manual') ? 'manual' : 'continuous',
          pointsOfInterest: [{ x, y }], // ส่งพิกัด 0-1 ไปให้ Driver กล้อง
        },
      ],
    }
    await track.applyConstraints(constraints as any)
  } catch (err) {
    console.error('Apply focus failed:', err)
  }

  // ซ่อน UI หลังจาก 2 วินาที
  setTimeout(() => {
    focusBox.show = false
  }, 2000)
}

// --- 3. ระบบ Loop ประมวลผล (Sequence Flow) ---
const captureSingleFrame = (): Promise<Blob | null> => {
  return new Promise((resolve) => {
    if (!videoRef.value || !canvasRef.value) return resolve(null)
    const video = videoRef.value
    const canvas = canvasRef.value
    const ctx = canvas.getContext('2d')
    if (!ctx || video.videoWidth === 0) return resolve(null)

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.7)
  })
}

const sendToServer = async (blob: Blob) => {
  isProcessing.value = true
  try {
    const fd = new FormData()
    fd.append('images', blob, 'scan.jpg')
    const res = await fetch('https://itg-go.onrender.com/ocr-single-safe', {
      method: 'POST',
      body: fd,
    })
    const data = await res.json()
    text.value = data.results?.[0] || 'No text'
  } catch (e) {
    console.error(e)
  } finally {
    isProcessing.value = false
  }
}

const runLoop = async () => {
  if (!isLooping.value) return
  const blob = await captureSingleFrame()
  if (blob && !isProcessing.value) {
    if (debugImageUrl.value) URL.revokeObjectURL(debugImageUrl.value)
    debugImageUrl.value = URL.createObjectURL(blob)
    debugInfo.res = `${canvasRef.value?.width}x${canvasRef.value?.height}`
    debugInfo.size = (blob.size / 1024).toFixed(2)
    debugInfo.time = new Date().toLocaleTimeString()
    await sendToServer(blob)
  }
  setTimeout(runLoop, 1000)
}

const startCaptureLoop = () => {
  isLooping.value = true
  runLoop()
}

onMounted(() => initCamera())
onUnmounted(() => {
  isLooping.value = false
  stream?.getTracks().forEach((t) => t.stop())
})
</script>

<template>
  <div class="ocr-container">
    <video ref="videoRef" autoplay playsinline @click="handleFocus" class="camera-view"></video>

    <div
      v-if="focusBox.show"
      class="focus-indicator"
      :style="{ left: focusBox.x + 'px', top: focusBox.y + 'px' }"
    ></div>

    <div class="overlay">
      <div class="status-badge" :class="{ 'is-active': isProcessing }">
        {{ isProcessing ? '⚡ Processing...' : '📡 Live Scanning' }}
      </div>
      <div class="scan-frame"></div>
    </div>

    <div class="debug-panel">
      <img v-if="debugImageUrl" :src="debugImageUrl" class="debug-preview" />
      <div class="debug-info">
        <p>Res: {{ debugInfo.res }} | Size: {{ debugInfo.size }}KB</p>
        <div class="result-text">{{ text }}</div>
      </div>
    </div>

    <canvas ref="canvasRef" style="display: none"></canvas>
  </div>
</template>

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

.focus-indicator {
  position: absolute;
  width: 60px;
  height: 60px;
  border: 2px solid #00ff00;
  transform: translate(-50%, -50%);
  pointer-events: none;
  animation: pulse 0.5s ease-out;
}

@keyframes pulse {
  0% {
    transform: translate(-50%, -50%) scale(1.5);
    opacity: 0;
  }
  100% {
    transform: translate(-50%, -50%) scale(1);
    opacity: 1;
  }
}

.overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  pointer-events: none;
}
.status-badge {
  margin-top: 20px;
  padding: 6px 16px;
  background: rgba(0, 0, 0, 0.8);
  color: #00ff00;
  border-radius: 20px;
  font-size: 14px;
}
.scan-frame {
  margin: auto;
  width: 80%;
  height: 20%;
  border: 2px solid #fff;
  box-shadow: 0 0 0 1000px rgba(0, 0, 0, 0.5);
}

.debug-panel {
  position: absolute;
  bottom: 20px;
  right: 20px;
  width: 180px;
  background: rgba(0, 0, 0, 0.85);
  padding: 10px;
  color: #fff;
  font-size: 10px;
  border-radius: 8px;
}
.debug-preview {
  width: 100%;
  border-radius: 4px;
}
.result-text {
  margin-top: 5px;
  color: #00ffcc;
  font-weight: bold;
}
</style>
