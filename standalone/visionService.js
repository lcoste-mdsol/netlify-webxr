import * as xb from 'xrblocks';

export class VisionDetectionService {
  constructor(startups = []) {
    this.startups = startups;
    this.testImage = null;
    this.webcamStream = null;
    this.webcamVideo = null;
  }

  setStartups(startups) {
    this.startups = startups;
  }

  hasTestImage() {
    return Boolean(this.testImage);
  }

  getTestImagePreview() {
    if (!this.testImage) return null;
    return {
      previewDataUrl: this.testImage.previewDataUrl,
      label: this.testImage.label,
    };
  }

  clearTestImage() {
    this.testImage = null;
  }

  isWebcamActive() {
    return Boolean(this.webcamStream && this.webcamVideo && this.webcamVideo.readyState >= 2);
  }

  getWebcamVideoElement() {
    return this.webcamVideo;
  }

  async setTestImageFile(file) {
    const rawDataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('Failed to read image file.'));
      reader.readAsDataURL(file);
    });
    return this.setTestImageDataUrl(rawDataUrl, file.name || 'Uploaded photo');
  }

  async setTestImageDataUrl(dataUrl, label = 'Desktop test photo') {
    const compressed = await this.normalizeDataUrlToJpeg(dataUrl, 1024);
    const match = compressed.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/s);
    const mimeType = match ? match[1] : 'image/jpeg';
    const base64 = match ? match[2] : compressed;

    this.testImage = {
      base64,
      mimeType,
      previewDataUrl: compressed,
      label,
    };
    return { previewDataUrl: compressed, label };
  }

  normalizeDataUrlToJpeg(dataUrl, maxDim = 1024) {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const w = img.naturalWidth || img.width || 640;
        const h = img.naturalHeight || img.height || 480;
        const scale = Math.min(1, maxDim / Math.max(w, h));
        const targetW = Math.max(1, Math.round(w * scale));
        const targetH = Math.max(1, Math.round(h * scale));
        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(0, 0, targetW, targetH);
          ctx.drawImage(img, 0, 0, targetW, targetH);
          resolve(canvas.toDataURL('image/jpeg', 0.88));
        } else {
          resolve(dataUrl);
        }
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  }

  async startWebcam(videoElement) {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Webcam capture is not supported in this browser.');
    }
    this.stopWebcam();
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 960 }, height: { ideal: 720 } },
      audio: false,
    });
    const video = videoElement || document.createElement('video');
    video.playsInline = true;
    video.muted = true;
    video.srcObject = stream;
    await video.play();

    this.webcamStream = stream;
    this.webcamVideo = video;
    return video;
  }

  stopWebcam() {
    if (this.webcamStream) {
      this.webcamStream.getTracks().forEach((track) => track.stop());
      this.webcamStream = null;
    }
    if (this.webcamVideo) {
      this.webcamVideo.srcObject = null;
      this.webcamVideo = null;
    }
  }

  captureFromWebcam() {
    const video = this.webcamVideo;
    if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
      return null;
    }
    const maxDim = 960;
    const scale = Math.min(1, maxDim / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
    return {
      imageBase64: dataUrl.split(',')[1],
      mimeType: 'image/jpeg',
      captureSource: 'webcam',
      previewDataUrl: dataUrl,
    };
  }

  async captureCameraFrame() {
    if (this.testImage) {
      return {
        imageBase64: this.testImage.base64,
        mimeType: this.testImage.mimeType,
        captureSource: 'uploaded_photo',
        previewDataUrl: this.testImage.previewDataUrl,
      };
    }

    const webcamFrame = this.captureFromWebcam();
    if (webcamFrame) {
      return webcamFrame;
    }

    if (xb.core?.deviceCamera?.getSnapshot) {
      try {
        const snapshot = await xb.core.deviceCamera.getSnapshot({
          outputFormat: 'base64',
          mimeType: 'image/jpeg',
          quality: 0.85,
          width: 960,
          height: 720,
        });
        if (snapshot) {
          const isDataUrl = snapshot.startsWith('data:');
          const base64 = isDataUrl ? snapshot.split(',')[1] : snapshot;
          const previewDataUrl = isDataUrl ? snapshot : `data:image/jpeg;base64,${base64}`;
          return {
            imageBase64: base64,
            mimeType: 'image/jpeg',
            captureSource: 'xr_camera',
            previewDataUrl,
          };
        }
      } catch (err) {
        console.warn('Device camera snapshot error in standalone vision:', err);
      }
    }

    if (xb.core?.renderer?.domElement) {
      try {
        if (xb.core.scene && xb.core.camera && xb.core.renderer.render) {
          xb.core.renderer.render(xb.core.scene, xb.core.camera);
        }
        const canvas = xb.core.renderer.domElement;
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        if (dataUrl && dataUrl.length > 2500) {
          return {
            imageBase64: dataUrl.split(',')[1],
            mimeType: 'image/jpeg',
            captureSource: 'xr_canvas',
            previewDataUrl: dataUrl,
          };
        }
      } catch {
        // ignore
      }
    }

    const placeholderDataUrl = this.createPlaceholderShowroomSnapshotDataUrl();
    return {
      imageBase64: placeholderDataUrl.split(',')[1],
      mimeType: 'image/jpeg',
      captureSource: 'placeholder',
      previewDataUrl: placeholderDataUrl,
    };
  }

  createPlaceholderShowroomSnapshotDataUrl() {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const grad = ctx.createLinearGradient(0, 0, 640, 480);
      grad.addColorStop(0, '#0f172a');
      grad.addColorStop(1, '#1e293b');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 640, 480);

      ctx.fillStyle = '#334155';
      ctx.beginPath();
      ctx.ellipse(320, 360, 200, 60, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(56, 189, 248, 0.2)';
      ctx.beginPath();
      ctx.arc(320, 240, 110, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 22px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Showroom Physical Prototype Focus', 320, 240);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '16px sans-serif';
      ctx.fillText('No active camera feed - upload photo or enable webcam', 320, 275);
    }
    return canvas.toDataURL('image/jpeg', 0.85);
  }

  async identifyProductInFrame(frameInput, userHint) {
    const imageBase64 = typeof frameInput === 'string' ? frameInput : frameInput.imageBase64;
    const mimeType = typeof frameInput === 'string' ? 'image/jpeg' : frameInput.mimeType;
    const captureSource =
      typeof frameInput === 'string' ? undefined : frameInput.captureSource;

    const catalogueContext = this.startups.map((s, idx) => ({
      index: idx + 1,
      name: s.name,
      category: s.category,
      has3DModel: Boolean(s.highQualityURL),
      description: s.commercialDescription,
      physicalFeatures: s.physicalFeatures || [
        `${s.name} technology prototype`,
        'Precision mechanical showroom assembly',
      ],
    }));

    // Call server-side Gemini 4 Flash Vision API
    try {
      const response = await fetch('/api/vision/identify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64,
          mimeType,
          userHint,
          catalogueContext,
        }),
      });

      if (response.ok) {
        const parsed = await response.json();
        if (parsed && parsed.matchedStartupName) {
          const matched = this.findStartupByName(parsed.matchedStartupName);
          if (matched) {
            return {
              startup: matched,
              confidence: parsed.confidence || 0.9,
              reasoning:
                parsed.reasoning || `Detected visual alignment with ${matched.name} physical prototype.`,
              matchedVisualFeatures: parsed.matchedVisualFeatures || matched.physicalFeatures || [],
              suggestedAction: `Ask "Load 3D model" to overlay the ${matched.name} virtual twin in AR.`,
              voiceResponse: parsed.voiceResponse,
              source: parsed.source || 'gemini',
              captureSource,
              model: parsed.model,
              fallbackReason: parsed.fallbackReason,
              latencyMs: parsed.latencyMs,
              timestamp: Date.now(),
            };
          }
        }
      }
    } catch (err) {
      console.warn('Server vision detection API error, using context heuristic:', err);
    }

    return this.createHeuristicMatch(userHint, captureSource);
  }

  findStartupByName(name) {
    const target = name.toLowerCase().trim();
    return this.startups.find((s) => {
      const sName = s.name.toLowerCase().trim();
      return sName === target || sName.includes(target) || target.includes(sName);
    });
  }

  createHeuristicMatch(userHint, captureSource) {
    let matched = this.startups[0];
    if (userHint) {
      const hintLower = userHint.toLowerCase();
      const found = this.startups.find((s) => {
        return (
          hintLower.includes(s.name.toLowerCase()) ||
          s.commercialDescription.toLowerCase().includes(hintLower) ||
          s.category.toLowerCase().includes(hintLower)
        );
      });
      if (found) matched = found;
    }

    return {
      startup: matched,
      confidence: 0.72,
      reasoning: `Client fallback match (${matched.name}): Server vision endpoint unreachable.`,
      matchedVisualFeatures: matched.physicalFeatures || [
        'Catalog fallback context',
      ],
      suggestedAction: `Ask "Load 3D model" to overlay the ${matched.name} virtual twin in AR.`,
      source: 'fallback',
      captureSource,
      fallbackReason: 'Vision endpoint unreachable from client.',
      timestamp: Date.now(),
    };
  }
}
