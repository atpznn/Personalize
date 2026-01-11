// composables/useOCR.js
import { ref } from 'vue';
import { createWorker } from 'tesseract.js';

export function useOCR() {
  const ocrText = ref('');
  const confidence = ref(0);
  const isRecognizing = ref(false);
  const worker = ref(null);
const isProcessing = ref(false)
  // เริ่มต้นสร้าง Worker (แนะนำให้รันครั้งเดียวตอน mounted)
  const initOCR = async (lang = 'tha+eng',) => {
    worker.value = await createWorker(lang,1);
  };

  const recognize = async (imageSource) => {
    if (!worker.value) await initOCR('eng');
    
    isRecognizing.value = true;
    try {
      // imageSource รับได้ทั้ง URL, Base64, Blob หรือ HTMLCanvasElement
      const { data: { text, confidence: conf } } = await worker.value.recognize(imageSource);
      ocrText.value = text;
      confidence.value = conf;
      return text
    } catch (err) {
      console.error("OCR Error:", err);
    } finally {
      isProcessing.value = false;
    }
  };

  const terminateOCR = async () => {
    if (worker.value) {
      await worker.value.terminate();
    }
  };

  return {
    ocrText,
    confidence,
    isRecognizing,
    initOCR,
    recognize,
    terminateOCR
  };
}