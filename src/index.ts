import * as THREE from 'three';
import * as xb from 'xrblocks';
import { Startup, RecognitionResult, VoiceIntent } from './types.ts';
import { fetchStartups } from './services/apiService.ts';
import { VisionDetectionService } from './services/visionDetectionService.ts';
import { VoiceAssistant } from './services/voiceService.ts';
import { VirtualTwinOverlay } from './services/virtualTwinOverlay.ts';
import { VREnvironmentManager } from './services/vrEnvironment.ts';

class ShowroomProductDetectorApp extends xb.Script {
  private allStartups: Startup[] = [];
  private filteredStartups: Startup[] = [];
  private selectedStartupIndex = 0;
  private activeCategory = 'all';

  private visionService!: VisionDetectionService;
  private voiceAssistant!: VoiceAssistant;
  private virtualTwin!: VirtualTwinOverlay;
  private vrManager!: VREnvironmentManager;

  // Spatial UI Elements
  private catalogueCard!: xb.UICard;
  private detectionCard!: xb.UICard;
  private modelControlsCard!: xb.UICard;
  private voiceCard!: xb.UICard;

  // Video Player Elements
  private videoElement!: HTMLVideoElement;
  private videoTexture!: THREE.VideoTexture;
  private videoFallbackCanvas!: HTMLCanvasElement;
  private videoFallbackTexture!: THREE.CanvasTexture;
  private videoMesh!: THREE.Mesh;
  private videoControlCard!: xb.UICard;
  private videoTitleText!: xb.UIText;
  private videoPlayPauseBtn!: xb.UIButton;
  private videoPlayerGroup!: THREE.Group;
  private isUsingVideoFallback = false;
  private isFallbackPlaying = true;
  private videoFallbackTime = 0;
  private videoFallbackStartup: Startup | null = null;
  private videoFallbackThumbImg: HTMLImageElement | null = null;
  private modelLoadSeq = 0;

  // Dynamic Text/Image references in UI
  private detectionTitleText!: xb.UIText;
  private detectionCategoryText!: xb.UIText;
  private detectionConfidenceText!: xb.UIText;
  private detectionReasoningText!: xb.UIText;
  private detectionFeaturesText!: xb.UIText;
  private detectionImage!: xb.UIImage;
  private detectionActionBtn!: xb.UIButton;
  private detectionVideoBtn!: xb.UIButton;
  private detectionVRBtn!: xb.UIButton;

  private voiceStatusText!: xb.UIText;
  private voiceTranscriptText!: xb.UIText;
  private voiceResponseText!: xb.UIText;
  private voiceMicBtn!: xb.UIButton;

  private modelInfoText!: xb.UIText;
  private modelStatusText!: xb.UIText;
  private modelVRBtn?: xb.UIButton;
  private scrollCatalogue?: xb.UIScrollView;
  private filterButtons: Record<string, xb.UIButton> = {};

  private startupTiles: Array<{
    container: xb.UIButton;
    image: xb.UIImage;
    title: xb.UIText;
    category: xb.UIText;
    snippet: xb.UIText;
  }> = [];

  async init() {
    // 1. Lighting setup
    this.add(new THREE.HemisphereLight(0xffffff, 0x1e293b, 3.2));
    const mainDirLight = new THREE.DirectionalLight(0xffffff, 2.2);
    mainDirLight.position.set(2, 6, 3);
    mainDirLight.castShadow = true;
    this.add(mainDirLight);

    const cyanRimLight = new THREE.PointLight(0x38bdf8, 2, 6);
    cyanRimLight.position.set(-2, 2, -1);
    this.add(cyanRimLight);

    // 2. VR Environment & Virtual Twin 3D Overlay setup
    this.vrManager = new VREnvironmentManager(xb.core.scene);
    this.virtualTwin = new VirtualTwinOverlay();
    this.add(this.virtualTwin);

    // 3. Fetch Showroom startups catalogue
    this.updateHUDStatus('Loading showroom startups...');
    this.allStartups = await fetchStartups();
    this.filteredStartups = [...this.allStartups];
    this.updateHUDStatus(`Ready • ${this.allStartups.length} Showroom Startups`);

    // 4. Initialize Vision and Voice services
    this.visionService = new VisionDetectionService(this.allStartups);
    this.setupVoiceAssistant();

    // 5. Construct 3D Spatial UI
    this.buildSpatialUI();

    // 6. Hook up 2D HUD buttons (for desktop simulator or 2D screen interactions)
    this.setupHUDInteractions();

    // Select the first product by default
    this.selectStartup(0);

    (window as any).app = this;
  }

  private setupVoiceAssistant() {
    this.voiceAssistant = new VoiceAssistant(this.allStartups, {
      onStatusChange: (status) => {
        if (this.voiceStatusText) this.voiceStatusText.text = status;
        const hudVoice = document.getElementById('hud-voice-status');
        if (hudVoice) {
          hudVoice.textContent = this.voiceAssistant.isListening ? 'Listening...' : 'Voice AI';
        }
        const hudBtn = document.getElementById('hud-voice-btn');
        if (hudBtn) {
          if (this.voiceAssistant.isListening) hudBtn.classList.add('listening');
          else hudBtn.classList.remove('listening');
        }
      },
      onTranscript: (transcript) => {
        if (this.voiceTranscriptText) this.voiceTranscriptText.text = `"${transcript}"`;
      },
      onResponse: (response) => {
        if (this.voiceResponseText) this.voiceResponseText.text = response;
        const hudSelection = document.getElementById('hud-current-selection');
        if (hudSelection) hudSelection.textContent = response;
      },
      onIntent: (intent) => {
        this.handleVoiceIntent(intent);
      },
    });
  }

  private async handleVoiceIntent(intent: VoiceIntent) {
    switch (intent.intent) {
      case 'detect_product':
        await this.triggerProductDetection(intent.rawText);
        break;

      case 'load_3d_model':
        await this.loadSelectedStartup3DModel();
        break;

      case 'dismiss_model':
        this.dismissSelectedStartup3DModel();
        this.voiceAssistant.speak('3D virtual twin removed.');
        break;

      case 'load_video':
        this.loadCurrentVideo();
        break;

      case 'close_video':
        this.hideVideoPlayer();
        this.voiceAssistant.speak('Video player closed.');
        break;

      case 'enter_vr':
        this.setVRMode('VR');
        this.voiceAssistant.speak('Switched to VR immersive showroom mode.');
        break;

      case 'switch_ar':
        this.setVRMode('AR');
        this.voiceAssistant.speak('Switched back to AR real-world view.');
        break;

      case 'scale_up':
        this.virtualTwin.adjustScale(intent.factor || 1.25);
        this.voiceAssistant.speak('Virtual twin scaled up.');
        break;

      case 'scale_down':
        this.virtualTwin.adjustScale(intent.factor || 0.8);
        this.voiceAssistant.speak('Virtual twin scaled down.');
        break;

      case 'move_up':
        this.virtualTwin.adjustElevation(intent.factor || 0.1);
        this.voiceAssistant.speak('Virtual twin raised.');
        break;

      case 'move_down':
        this.virtualTwin.adjustElevation(intent.factor || -0.1);
        this.voiceAssistant.speak('Virtual twin lowered.');
        break;

      case 'toggle_animation': {
        const animState = this.virtualTwin.toggleAnimation();
        this.voiceAssistant.speak(animState ? 'Animation resumed.' : 'Animation paused.');
        break;
      }

      case 'goto_index':
        if (intent.gotoIndex && this.filteredStartups.length > 0) {
          const target = Math.max(1, Math.min(intent.gotoIndex, this.filteredStartups.length)) - 1;
          this.selectStartup(target);
          const current = this.filteredStartups[target];
          this.voiceAssistant.speak(
            `Selected startup number ${target + 1}: ${current.name} in ${current.category}. ${current.commercialDescription.slice(0, 150)}... Say "Load 3D model" or "Load video".`
          );
        }
        break;

      case 'next_item':
        if (this.filteredStartups.length > 0) {
          const nextIdx = (this.selectedStartupIndex + 1) % this.filteredStartups.length;
          this.selectStartup(nextIdx);
          const next = this.filteredStartups[nextIdx];
          this.voiceAssistant.speak(`Selected #${nextIdx + 1} ${next.name}.`);
        }
        break;

      case 'previous_item':
        if (this.filteredStartups.length > 0) {
          const prevIdx =
            (this.selectedStartupIndex - 1 + this.filteredStartups.length) %
            this.filteredStartups.length;
          this.selectStartup(prevIdx);
          const prev = this.filteredStartups[prevIdx];
          this.voiceAssistant.speak(`Selected #${prevIdx + 1} ${prev.name}.`);
        }
        break;

      case 'filter_category':
        if (intent.category) {
          this.filterCategory(intent.category);
          this.voiceAssistant.speak(
            `Filtered to ${intent.categoryTitle || intent.category} with ${this.filteredStartups.length} startups.`
          );
        }
        break;

      case 'show_all':
      case 'show_overview':
        this.filterCategory('all');
        this.voiceAssistant.speak(`Showing all ${this.allStartups.length} showroom startups.`);
        break;

      case 'describe_startup':
        if (intent.startupName) {
          let idx = this.filteredStartups.findIndex(
            (s) => s.name.toLowerCase() === intent.startupName?.toLowerCase()
          );
          if (idx === -1) {
            this.filterCategory('all');
            idx = this.filteredStartups.findIndex(
              (s) => s.name.toLowerCase() === intent.startupName?.toLowerCase()
            );
          }
          if (idx !== -1) {
            this.selectStartup(idx);
            const current = this.filteredStartups[idx];
            this.voiceAssistant.speak(
              `#${idx + 1} ${current.name} is in the ${current.category} sector. ${current.commercialDescription.slice(0, 160)}... Say "Load 3D model" or "Load video".`
            );
          }
        }
        break;

      case 'help':
        this.voiceAssistant.speak(
          'Say: "Select startup number 4", "Load 3D model", "Remove the 3D model", "Recognize this product", "Load video", "Close video", "Switch to VR", "Switch to AR", "Scale up", "Scale down", "Move up", "Move down", "Animate", "Filter by Life", "Filter by Nature", "Filter by Product", or "All projects".'
        );
        break;

      default:
        if (intent.rawText.length > 5) {
          this.voiceAssistant.speak(
            `Command "${intent.rawText}" received. Ask "Help" to hear all supported showroom commands.`
          );
        }
        break;
    }
  }

  /**
   * Triggers computer vision detection using the camera frame and startup catalogue context.
   */
  public async triggerProductDetection(userQueryPrompt?: string) {
    this.updateHUDStatus('Capturing frame & analyzing with Gemini Vision...');
    if (this.detectionReasoningText) {
      this.detectionReasoningText.text = 'Analyzing camera / uploaded image with Gemini Vision...';
    }
    if (this.detectionConfidenceText) {
      this.detectionConfidenceText.text = 'Scanning...';
    }

    try {
      const frame = await this.visionService.captureCameraFrame();
      this.updateVisionPreviewSnapshot(frame.previewDataUrl, frame.captureSource);

      const result: RecognitionResult = await this.visionService.identifyProductInFrame(
        frame,
        userQueryPrompt
      );

      // Locate index in list (reset category filter if match is in another category)
      let matchedIdx = this.filteredStartups.findIndex((s) => s.id === result.startup.id);
      if (matchedIdx === -1) {
        this.filterCategory('all');
        matchedIdx = this.filteredStartups.findIndex((s) => s.id === result.startup.id);
      }
      if (matchedIdx !== -1) {
        this.selectStartup(matchedIdx);
      }

      this.displayRecognitionResult(result);

      const sourceTag =
        result.source === 'fallback'
          ? 'Fallback'
          : `Gemini (${result.captureSource || 'camera'})`;
      const vocalText =
        result.voiceResponse ||
        `I identified ${result.startup.name}. ${result.startup.commercialDescription.slice(0, 140)}... Say "Load 3D model" to overlay the virtual twin.`;
      this.voiceAssistant.speak(vocalText);
      this.updateHUDStatus(
        `Identified: ${result.startup.name} (${Math.round(result.confidence * 100)}% • ${sourceTag})`
      );
    } catch (err) {
      console.error('Detection failure:', err);
      this.updateHUDStatus('Detection attempt failed. Please try again.');
    }
  }

  private formatCaptureSource(source?: string): string {
    switch (source) {
      case 'uploaded_photo':
        return 'Test Photo';
      case 'webcam':
        return 'Webcam';
      case 'xr_camera':
        return 'XR Camera';
      case 'xr_canvas':
        return 'XR View';
      case 'placeholder':
        return 'No Camera (Placeholder)';
      default:
        return 'Camera';
    }
  }

  private updateVisionPreviewSnapshot(previewDataUrl: string, captureSource?: string) {
    if (this.visionService.isWebcamActive()) return;
    const previewWrap = document.getElementById('hud-vision-preview');
    const previewImg = document.getElementById('hud-vision-preview-img') as HTMLImageElement | null;
    const webcamVideo = document.getElementById('hud-webcam-video') as HTMLVideoElement | null;
    const statusEl = document.getElementById('hud-vision-source-status');
    if (previewWrap && previewImg && statusEl) {
      previewWrap.classList.add('visible');
      previewImg.style.display = 'block';
      previewImg.src = previewDataUrl;
      if (webcamVideo) webcamVideo.style.display = 'none';
      const label = this.visionService.getTestImagePreview()?.label || this.formatCaptureSource(captureSource);
      statusEl.textContent = label;
    }
  }

  private displayRecognitionResult(result: RecognitionResult) {
    this.detectionCard.visible = true;

    const sourceLabel = result.source === 'fallback' ? 'Fallback' : 'Gemini Vision';
    const captureLabel = this.formatCaptureSource(result.captureSource);

    if (this.detectionTitleText) this.detectionTitleText.text = result.startup.name;
    if (this.detectionCategoryText) {
      this.detectionCategoryText.text = `${result.startup.category} • ${sourceLabel} (${captureLabel})`;
    }
    if (this.detectionConfidenceText) {
      this.detectionConfidenceText.text = `${Math.round(result.confidence * 100)}% • ${sourceLabel}`;
    }
    if (this.detectionReasoningText) {
      const hintNote =
        result.captureSource === 'placeholder'
          ? '\n\nTip: No live camera feed on desktop. Click "Upload Test Photo" or "Use Webcam" in the HUD to test Gemini Vision with real product photos.'
          : '';
      this.detectionReasoningText.text = `${result.reasoning}${hintNote}`;
    }
    if (this.detectionFeaturesText) {
      this.detectionFeaturesText.text = `Matched Features: ${result.matchedVisualFeatures.join(' • ')}`;
    }
    if (this.detectionImage && result.startup.largeResolutionURL) {
      this.detectionImage.src = result.startup.largeResolutionURL;
    }

    const hudSelection = document.getElementById('hud-current-selection');
    if (hudSelection) {
      hudSelection.textContent = `Identified (${sourceLabel} via ${captureLabel}): ${result.startup.name} — ${result.reasoning}`;
    }
    const hudConfidence = document.getElementById('hud-detection-confidence');
    if (hudConfidence) {
      hudConfidence.textContent = `${Math.round(result.confidence * 100)}% • ${sourceLabel}`;
    }
  }

  public dismissSelectedStartup3DModel() {
    this.modelLoadSeq++;
    this.virtualTwin.dismiss();
    this.modelControlsCard.visible = false;
    if (this.detectionActionBtn) {
      this.detectionActionBtn.label = 'Load 3D Virtual Twin';
      this.detectionActionBtn.disabled = false;
    }
    const hudSelection = document.getElementById('hud-current-selection');
    if (hudSelection) {
      hudSelection.textContent = '3D Virtual Twin removed.';
    }
  }

  /**
   * Loads the 3D Virtual Twin model / BM3 GLB in AR as an interactive overlay.
   */
  public async loadSelectedStartup3DModel() {
    const startup = this.filteredStartups[this.selectedStartupIndex];
    if (!startup) return;

    const loadSeq = ++this.modelLoadSeq;

    if (this.detectionActionBtn) {
      this.detectionActionBtn.disabled = true;
      this.detectionActionBtn.label = 'Loading 3D Twin...';
    }

    this.modelControlsCard.visible = true;
    this.modelInfoText.text = `${startup.name} Twin`;
    this.modelStatusText.text = 'Converting BM3 geometry into 3D AR overlay...';

    const success = await this.virtualTwin.loadStartupModel(startup, (progress) => {
      if (loadSeq === this.modelLoadSeq) {
        this.modelStatusText.text = progress;
      }
    });

    if (loadSeq !== this.modelLoadSeq) return;

    if (success) {
      this.modelStatusText.text = `✓ ${startup.name} Virtual Twin active. Pinch to rotate or scale.`;
      if (this.detectionActionBtn) {
        this.detectionActionBtn.label = 'Reload 3D Twin';
        this.detectionActionBtn.disabled = false;
      }
      this.voiceAssistant.speak(`${startup.name} 3D Virtual Twin loaded in AR.`);
    } else {
      this.modelStatusText.text = 'Could not load 3D CAD model.';
      if (this.detectionActionBtn) {
        this.detectionActionBtn.label = 'Retry Load';
        this.detectionActionBtn.disabled = false;
      }
    }
  }

  private selectStartup(index: number) {
    if (index < 0 || index >= this.filteredStartups.length) return;
    this.selectedStartupIndex = index;
    const current = this.filteredStartups[index];

    // Highlight selected tile
    this.startupTiles.forEach((tile, i) => {
      const isSelected = i === index;
      tile.container.style.borderColor = isSelected ? '#38bdf8' : 'rgba(255, 255, 255, 0.1)';
      tile.container.style.backgroundColor = isSelected
        ? 'rgba(30, 58, 138, 0.75)'
        : 'rgba(30, 41, 59, 0.65)';
    });

    // Update detection card with selected startup info
    if (this.detectionTitleText) this.detectionTitleText.text = current.name;
    if (this.detectionCategoryText) this.detectionCategoryText.text = `${current.category} Sector`;
    if (this.detectionReasoningText) this.detectionReasoningText.text = current.commercialDescription;
    if (this.detectionConfidenceText) this.detectionConfidenceText.text = 'Target Selected';
    if (this.detectionImage && current.largeResolutionURL) {
      this.detectionImage.src = current.largeResolutionURL;
    }
    if (this.detectionFeaturesText && current.physicalFeatures) {
      this.detectionFeaturesText.text = `CAD Twin Features: ${current.physicalFeatures.join(' • ')}`;
    }

    const hudSelection = document.getElementById('hud-current-selection');
    if (hudSelection) {
      hudSelection.textContent = `Selected #${index + 1}: ${current.name} (${current.category}) - Say "Recognize this product", "Load 3D model", or "Load video"`;
    }

    if (this.vrManager && this.vrManager.currentMode === 'VR') {
      this.vrManager.setCategory(String(current.typeID || 'all'));
      this.updateVRUI('VR');
    }
  }

  private normalizeCategoryKey(category: string): string {
    const raw = String(category ?? 'all').trim().toLowerCase();
    if (raw === 'all' || raw === 'all projects') return 'all';
    if (raw === '172' || raw === 'life' || raw === 'life sciences') return '172';
    if (raw === '27' || raw === 'nature' || raw === 'sustainable nature') return '27';
    if (raw === '376' || raw === 'product' || raw === 'products') return '376';
    return raw;
  }

  private filterCategory(category: string) {
    const normalizedKey = this.normalizeCategoryKey(category);
    this.activeCategory = normalizedKey;

    if (normalizedKey === 'all') {
      this.filteredStartups = [...this.allStartups];
    } else {
      const catNum = Number(normalizedKey);
      this.filteredStartups = this.allStartups.filter(
        (s) =>
          Number(s.typeID) === catNum ||
          (s.category && s.category.toLowerCase() === normalizedKey)
      );
    }

    for (const [key, btn] of Object.entries(this.filterButtons)) {
      btn.style.backgroundColor = key === normalizedKey ? '#0284c7' : '#1e293b';
    }

    this.selectedStartupIndex = 0;
    this.rebuildStartupTiles();

    if (this.filteredStartups.length > 0) {
      this.selectStartup(0);
    } else {
      if (this.detectionTitleText) this.detectionTitleText.text = 'No startups found';
      if (this.detectionCategoryText) this.detectionCategoryText.text = 'Filter Result';
      if (this.detectionReasoningText) {
        this.detectionReasoningText.text =
          'No startups match this category filter. Select "All" to view the full catalogue.';
      }
      const hudSelection = document.getElementById('hud-current-selection');
      if (hudSelection) {
        hudSelection.textContent = 'No startups match this category filter.';
      }
    }

    if (this.vrManager && this.vrManager.currentMode === 'VR') {
      this.vrManager.setCategory(normalizedKey);
      this.updateVRUI('VR');
    }
  }

  private buildSpatialUI() {
    this.buildDetectionCard();
    this.buildCatalogueCard();
    this.buildModelControlCard();
    this.buildVoiceAssistantCard();
    this.buildVideoPlayerCard();
  }

  private buildDetectionCard() {
    this.detectionTitleText = new xb.UIText({
      text: 'Scan Showroom Item',
      style: { fontSize: 24, fontWeight: 'bold', color: '#ffffff' },
    });

    this.detectionCategoryText = new xb.UIText({
      text: 'AI Computer Vision',
      style: { fontSize: 13, color: '#38bdf8', fontWeight: 'bold' },
    });

    this.detectionConfidenceText = new xb.UIText({
      text: 'Camera Ready',
      style: {
        fontSize: 12,
        fontWeight: 'bold',
        color: '#34d399',
        backgroundColor: 'rgba(52, 211, 153, 0.15)',
        padding: 4,
        borderRadius: 6,
      },
    });

    const header = new xb.UIPanel({
      style: {
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingBottom: 8,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
      },
      children: [
        new xb.UIPanel({
          style: { flexDirection: 'column', gap: 2 },
          children: [this.detectionTitleText, this.detectionCategoryText],
        }),
        this.detectionConfidenceText,
      ],
    });

    this.detectionImage = new xb.UIImage({
      src: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=600&q=80',
      ariaLabel: 'Showroom product preview',
      style: {
        width: '100%',
        height: 140,
        objectFit: 'cover',
        borderRadius: 12,
        backgroundColor: '#0f172a',
      },
    });

    this.detectionReasoningText = new xb.UIText({
      text: 'Point your Galaxy XR camera at any physical item in the showroom and ask "Recognize this product", or click the Scan button below.',
      style: { fontSize: 13, lineHeight: 1.45, color: '#e2e8f0', whiteSpace: 'pre-line' },
    });

    const scrollDescription = new xb.UIScrollView({
      style: {
        width: '100%',
        height: 105,
        padding: 8,
        backgroundColor: 'rgba(0, 0, 0, 0.3)',
        borderRadius: 8,
      },
      children: [this.detectionReasoningText],
    });

    this.detectionFeaturesText = new xb.UIText({
      text: 'Matched CAD Features: Fish bio-mimicry undulating fin • Hydrodynamic frame',
      style: { fontSize: 11, color: '#94a3b8', textAlign: 'center' },
    });

    const scanBtn = new xb.UIButton({
      label: 'Scan Item',
      icon: 'photo_camera',
      style: { flexGrow: 1, height: 42, backgroundColor: '#2563eb' },
      onClick: () => void this.triggerProductDetection(),
    });

    this.detectionActionBtn = new xb.UIButton({
      label: 'Load 3D Virtual Twin',
      icon: 'view_in_ar',
      style: { flexGrow: 1, height: 40, backgroundColor: '#10b981' },
      onClick: () => void this.loadSelectedStartup3DModel(),
    });

    this.detectionVideoBtn = new xb.UIButton({
      label: 'Load Video',
      icon: 'play_arrow',
      style: { flexGrow: 1, height: 40, backgroundColor: '#0284c7' },
      onClick: () => this.loadCurrentVideo(),
    });

    this.detectionVRBtn = new xb.UIButton({
      label: 'Switch to VR',
      icon: 'public',
      style: { flexGrow: 1, height: 40, backgroundColor: '#7c3aed' },
      onClick: () => this.toggleVRMode(),
    });

    const actionRow = new xb.UIPanel({
      style: { width: '100%', flexDirection: 'row', gap: 10, marginTop: 4 },
      children: [scanBtn, this.detectionActionBtn],
    });

    const mediaRow = new xb.UIPanel({
      style: { width: '100%', flexDirection: 'row', gap: 10 },
      children: [this.detectionVideoBtn, this.detectionVRBtn],
    });

    this.detectionCard = new xb.UICard({
      size: { width: 0.58, height: 'auto' },
      manipulation: true,
      edge: true,
      style: {
        flexDirection: 'column',
        gap: 10,
        padding: 16,
        backgroundColor: '#0a0f1dF2',
        borderRadius: 16,
      },
      children: [
        header,
        this.detectionImage,
        scrollDescription,
        this.detectionFeaturesText,
        actionRow,
        mediaRow,
      ],
    });

    this.detectionCard.position.set(0.72, 1.38, -1.2);
    this.detectionCard.rotation.y = -0.28;
    this.detectionCard.name = 'Showroom Product Detection Card';
    this.add(this.detectionCard);
  }

  private buildCatalogueCard() {
    const title = new xb.UIText({
      text: 'Showroom Startups Catalog',
      style: { fontSize: 18, fontWeight: 'bold', color: '#ffffff' },
    });

    this.filterButtons = {
      all: new xb.UIButton({
        label: 'All',
        style: { flexGrow: 1, height: 32, fontSize: 12, backgroundColor: '#0284c7' },
        onClick: () => this.filterCategory('all'),
      }),
      '172': new xb.UIButton({
        label: 'Life',
        style: { flexGrow: 1, height: 32, fontSize: 12, backgroundColor: '#1e293b' },
        onClick: () => this.filterCategory('172'),
      }),
      '27': new xb.UIButton({
        label: 'Nature',
        style: { flexGrow: 1, height: 32, fontSize: 12, backgroundColor: '#1e293b' },
        onClick: () => this.filterCategory('27'),
      }),
      '376': new xb.UIButton({
        label: 'Product',
        style: { flexGrow: 1, height: 32, fontSize: 12, backgroundColor: '#1e293b' },
        onClick: () => this.filterCategory('376'),
      }),
    };

    const filterRow = new xb.UIPanel({
      style: { width: '100%', flexDirection: 'row', gap: 6, marginTop: 4 },
      children: [
        this.filterButtons.all,
        this.filterButtons['172'],
        this.filterButtons['27'],
        this.filterButtons['376'],
      ],
    });

    this.rebuildStartupTiles();

    this.scrollCatalogue = new xb.UIScrollView({
      style: {
        width: '100%',
        height: 280,
        gap: 8,
        padding: 4,
      },
      children: this.startupTiles.map((t) => t.container),
    });

    this.catalogueCard = new xb.UICard({
      size: { width: 0.48, height: 'auto' },
      manipulation: true,
      edge: true,
      style: {
        flexDirection: 'column',
        gap: 10,
        padding: 14,
        backgroundColor: '#0a0f1dEE',
        borderRadius: 16,
      },
      children: [title, filterRow, this.scrollCatalogue],
    });

    this.catalogueCard.position.set(-0.68, 1.4, -1.15);
    this.catalogueCard.rotation.y = 0.22;
    this.catalogueCard.name = 'Startups Catalogue Panel';
    this.add(this.catalogueCard);
  }

  private rebuildStartupTiles() {
    if (this.scrollCatalogue) {
      const existing = this.scrollCatalogue.children.filter((c) => c instanceof xb.UIElement);
      if (existing.length > 0) {
        this.scrollCatalogue.remove(...existing);
      }
      this.scrollCatalogue.scrollTop = 0;
    }

    this.startupTiles = [];
    this.filteredStartups.forEach((startup, index) => {
      const tileImg = new xb.UIImage({
        src: startup.largeResolutionURL || 'https://picsum.photos/seed/thumb/150/150',
        ariaLabel: `${startup.name} preview`,
        style: {
          width: 54,
          height: 54,
          objectFit: 'cover',
          borderRadius: 8,
          backgroundColor: '#0f172a',
        },
      });

      const tileTitle = new xb.UIText({
        text: `#${index + 1} ${startup.name}`,
        style: { fontSize: 13, fontWeight: 'bold', color: '#ffffff' },
      });

      const tileCategory = new xb.UIText({
        text: startup.category,
        style: { fontSize: 10, color: '#38bdf8', fontWeight: 'bold' },
      });

      const tileSnippet = new xb.UIText({
        text: startup.commercialDescription.replace(/\s+/g, ' ').slice(0, 52) + '...',
        style: { fontSize: 11, color: '#94a3b8' },
      });

      const textCol = new xb.UIPanel({
        style: { flexGrow: 1, flexDirection: 'column', gap: 2 },
        children: [tileTitle, tileCategory, tileSnippet],
      });

      const container = new xb.UIButton({
        ariaLabel: `Select ${startup.name}`,
        style: {
          width: '100%',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          padding: 8,
          borderRadius: 10,
          backgroundColor: 'rgba(30, 41, 59, 0.65)',
          borderWidth: 1,
          borderColor: 'rgba(255, 255, 255, 0.1)',
        },
        children: [tileImg, textCol],
        onClick: () => this.selectStartup(index),
      });

      this.startupTiles.push({
        container,
        image: tileImg,
        title: tileTitle,
        category: tileCategory,
        snippet: tileSnippet,
      });
    });

    if (this.scrollCatalogue && this.startupTiles.length > 0) {
      this.scrollCatalogue.add(...this.startupTiles.map((t) => t.container));
    }
  }

  private buildModelControlCard() {
    this.modelInfoText = new xb.UIText({
      text: '3D Virtual Twin Controls',
      style: { fontSize: 14, fontWeight: 'bold', color: '#38bdf8', textAlign: 'center' },
    });

    this.modelStatusText = new xb.UIText({
      text: 'AR Overlay Ready',
      style: { fontSize: 11, color: '#94a3b8', textAlign: 'center' },
    });

    const scaleRow = new xb.UIPanel({
      style: { width: '100%', flexDirection: 'row', gap: 6 },
      children: [
        new xb.UIButton({
          label: 'Scale +',
          icon: 'zoom_in',
          style: { flexGrow: 1, height: 34, fontSize: 12 },
          onClick: () => this.virtualTwin.adjustScale(1.2),
        }),
        new xb.UIButton({
          label: 'Scale -',
          icon: 'zoom_out',
          style: { flexGrow: 1, height: 34, fontSize: 12 },
          onClick: () => this.virtualTwin.adjustScale(0.8),
        }),
      ],
    });

    const elevRow = new xb.UIPanel({
      style: { width: '100%', flexDirection: 'row', gap: 6 },
      children: [
        new xb.UIButton({
          label: 'Move Up',
          icon: 'arrow_upward',
          style: { flexGrow: 1, height: 34, fontSize: 12 },
          onClick: () => this.virtualTwin.adjustElevation(0.1),
        }),
        new xb.UIButton({
          label: 'Move Down',
          icon: 'arrow_downward',
          style: { flexGrow: 1, height: 34, fontSize: 12 },
          onClick: () => this.virtualTwin.adjustElevation(-0.1),
        }),
      ],
    });

    const animBtn = new xb.UIButton({
      label: 'Animate',
      icon: 'sync',
      style: { flexGrow: 1, height: 34, fontSize: 12, backgroundColor: '#0284c7' },
      onClick: () => {
        const running = this.virtualTwin.toggleAnimation();
        animBtn.label = running ? 'Pause' : 'Animate';
      },
    });

    const dismissBtn = new xb.UIButton({
      label: 'Dismiss Model',
      icon: 'close',
      style: { flexGrow: 1, height: 34, fontSize: 12, backgroundColor: '#dc2626' },
      onClick: () => {
        this.dismissSelectedStartup3DModel();
      },
    });

    this.modelVRBtn = new xb.UIButton({
      label: 'Switch to VR',
      icon: 'public',
      style: { flexGrow: 1, height: 34, fontSize: 12, backgroundColor: '#7c3aed' },
      onClick: () => this.toggleVRMode(),
    });

    const bottomRow = new xb.UIPanel({
      style: { width: '100%', flexDirection: 'row', gap: 6 },
      children: [animBtn, this.modelVRBtn, dismissBtn],
    });

    this.modelControlsCard = new xb.UICard({
      size: { width: 0.48, height: 'auto' },
      manipulation: true,
      edge: true,
      style: {
        flexDirection: 'column',
        gap: 8,
        padding: 12,
        backgroundColor: '#0a0f1dF2',
        borderRadius: 14,
      },
      children: [this.modelInfoText, this.modelStatusText, scaleRow, elevRow, bottomRow],
    });

    this.modelControlsCard.position.set(0, 0.92, -0.95);
    this.modelControlsCard.rotation.x = -0.25;
    this.modelControlsCard.visible = false;
    this.modelControlsCard.name = 'Virtual Twin Control Card';
    this.add(this.modelControlsCard);
  }

  private buildVoiceAssistantCard() {
    const title = new xb.UIText({
      text: 'Spatial Voice Assistant',
      style: { fontSize: 16, fontWeight: 'bold', color: '#60a5fa' },
    });

    this.voiceStatusText = new xb.UIText({
      text: 'Ask "Recognize this product" or "Load 3D model"',
      style: { fontSize: 11, color: '#94a3b8' },
    });

    const topHeader = new xb.UIPanel({
      style: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
      children: [title, this.voiceStatusText],
    });

    this.voiceTranscriptText = new xb.UIText({
      text: '"Recognize this product"',
      style: { fontSize: 12, color: '#f1f5f9', opacity: 0.9 },
    });

    this.voiceResponseText = new xb.UIText({
      text: 'Voice assistant ready. Look at a product or tap below.',
      style: { fontSize: 12, color: '#67e8f9', fontWeight: 'bold', whiteSpace: 'pre-line' },
    });

    this.voiceMicBtn = new xb.UIButton({
      label: 'Toggle Voice Assistant',
      icon: 'mic',
      style: { width: '100%', height: 38, backgroundColor: '#2563eb' },
      onClick: () => {
        this.voiceAssistant.toggle();
        this.voiceMicBtn.label = this.voiceAssistant.isListening ? 'Stop Listening' : 'Start Voice Assistant';
        this.voiceMicBtn.style.backgroundColor = this.voiceAssistant.isListening ? '#dc2626' : '#2563eb';
      },
    });

    this.voiceCard = new xb.UICard({
      size: { width: 0.44, height: 'auto' },
      manipulation: true,
      edge: true,
      style: {
        flexDirection: 'column',
        gap: 10,
        padding: 12,
        backgroundColor: '#0a0f1dEE',
        borderRadius: 14,
      },
      children: [topHeader, this.voiceTranscriptText, this.voiceResponseText, this.voiceMicBtn],
    });

    this.voiceCard.position.set(-0.68, 1.76, -1.15);
    this.voiceCard.rotation.y = 0.22;
    this.voiceCard.name = 'Voice Assistant Card';
    this.add(this.voiceCard);
  }

  private buildVideoPlayerCard() {
    this.videoElement = document.createElement('video');
    this.videoElement.crossOrigin = 'anonymous';
    this.videoElement.playsInline = true;
    this.videoElement.loop = true;
    this.videoElement.style.display = 'none';
    document.body.appendChild(this.videoElement);

    this.videoTexture = new THREE.VideoTexture(this.videoElement);
    this.videoTexture.colorSpace = THREE.SRGBColorSpace;

    this.videoFallbackCanvas = document.createElement('canvas');
    this.videoFallbackCanvas.width = 960;
    this.videoFallbackCanvas.height = 540;
    this.videoFallbackTexture = new THREE.CanvasTexture(this.videoFallbackCanvas);
    this.videoFallbackTexture.colorSpace = THREE.SRGBColorSpace;

    const videoMaterial = new THREE.MeshBasicMaterial({ map: this.videoTexture });
    const videoGeometry = new THREE.PlaneGeometry(0.74, 0.416);
    this.videoMesh = new THREE.Mesh(videoGeometry, videoMaterial);
    this.videoMesh.position.set(0, 0.25, 0);

    this.videoTitleText = new xb.UIText({
      text: 'Startup Video Showcase',
      style: { fontSize: 15, fontWeight: 'bold', color: '#ffffff', textAlign: 'center' },
    });

    this.videoPlayPauseBtn = new xb.UIButton({
      label: 'Play / Pause',
      icon: 'play_arrow',
      style: { flexGrow: 1, height: 32, fontSize: 12, backgroundColor: '#2563eb' },
      onClick: () => {
        if (this.isUsingVideoFallback) {
          this.isFallbackPlaying = !this.isFallbackPlaying;
          this.videoPlayPauseBtn.label = this.isFallbackPlaying ? 'Pause' : 'Play';
        } else if (this.videoElement.paused) {
          void this.videoElement.play();
          this.videoPlayPauseBtn.label = 'Pause';
        } else {
          this.videoElement.pause();
          this.videoPlayPauseBtn.label = 'Play';
        }
      },
    });

    const closeBtn = new xb.UIButton({
      label: 'Close Video',
      icon: 'close',
      style: { flexGrow: 1, height: 32, fontSize: 12, backgroundColor: '#dc2626' },
      onClick: () => this.hideVideoPlayer(),
    });

    const controlsRow = new xb.UIPanel({
      style: { width: '100%', flexDirection: 'row', gap: 8, marginTop: 6 },
      children: [this.videoPlayPauseBtn, closeBtn],
    });

    this.videoControlCard = new xb.UICard({
      size: { width: 0.48, height: 'auto' },
      style: {
        flexDirection: 'column',
        gap: 8,
        padding: 12,
        backgroundColor: '#0a0f1dEE',
        borderRadius: 14,
      },
      children: [this.videoTitleText, controlsRow],
    });
    this.videoControlCard.position.set(0, -0.04, 0.03);

    this.videoPlayerGroup = new THREE.Group();
    (this.videoPlayerGroup as any).xb = { manipulation: true };
    this.videoPlayerGroup.add(this.videoMesh);
    this.videoPlayerGroup.add(this.videoControlCard);

    this.videoPlayerGroup.position.set(0.02, 1.82, -1.16);
    this.videoPlayerGroup.rotation.y = 0;
    this.videoPlayerGroup.visible = false;
    this.videoPlayerGroup.name = 'Startup Video Player';
    this.add(this.videoPlayerGroup);

    this.videoElement.addEventListener('error', () => {
      if (this.videoPlayerGroup.visible && this.videoFallbackStartup) {
        this.activateVideoFallbackReel(this.videoFallbackStartup);
      }
    });
  }

  private activateVideoFallbackReel(startup: Startup) {
    this.isUsingVideoFallback = true;
    this.isFallbackPlaying = true;
    this.videoFallbackTime = 0;
    this.videoFallbackStartup = startup;
    this.videoFallbackThumbImg = null;

    if (startup.largeResolutionURL) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        if (this.videoFallbackStartup?.id === startup.id) {
          this.videoFallbackThumbImg = img;
          this.drawVideoFallbackFrame(startup);
        }
      };
      img.src = startup.largeResolutionURL;
    }

    const mat = this.videoMesh.material as THREE.MeshBasicMaterial;
    mat.map = this.videoFallbackTexture;
    mat.needsUpdate = true;
    this.drawVideoFallbackFrame(startup);
    this.videoTitleText.text = `${startup.name} — Interactive Showcase`;
    this.videoPlayPauseBtn.label = 'Pause';
  }

  private drawVideoFallbackFrame(startup: Startup) {
    const ctx = this.videoFallbackCanvas.getContext('2d');
    if (!ctx) return;
    const w = this.videoFallbackCanvas.width;
    const h = this.videoFallbackCanvas.height;

    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#071124');
    grad.addColorStop(1, '#0f2847');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    if (this.videoFallbackThumbImg) {
      ctx.save();
      ctx.globalAlpha = 0.28 + Math.sin(this.videoFallbackTime * 1.5) * 0.04;
      ctx.drawImage(this.videoFallbackThumbImg, 0, 0, w, h);
      ctx.restore();
      const overlay = ctx.createLinearGradient(0, 0, w, 0);
      overlay.addColorStop(0, 'rgba(7, 17, 36, 0.92)');
      overlay.addColorStop(1, 'rgba(7, 17, 36, 0.55)');
      ctx.fillStyle = overlay;
      ctx.fillRect(0, 0, w, h);
    }

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText(`SHOWROOM SPOTLIGHT • ${startup.category.toUpperCase()}`, 48, 68);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 48px sans-serif';
    ctx.fillText(startup.name, 48, 128);

    ctx.fillStyle = '#cbd5e1';
    ctx.font = '24px sans-serif';
    const words = startup.commercialDescription.replace(/\s+/g, ' ').split(' ');
    let line = '';
    let y = 190;
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (ctx.measureText(candidate).width > w - 100) {
        ctx.fillText(line, 48, y);
        line = word;
        y += 34;
        if (y > 410) break;
      } else {
        line = candidate;
      }
    }
    if (line && y <= 410) ctx.fillText(line, 48, y);

    // Animated timeline bar
    const progress = (this.videoFallbackTime % 12) / 12;
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(48, h - 54, w - 96, 8);
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(48, h - 54, (w - 96) * progress, 8);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '18px sans-serif';
    ctx.fillText(
      this.isFallbackPlaying ? '▶ PLAYING SHOWROOM BRIEFING REEL' : '❚❚ PAUSED',
      48,
      h - 72
    );

    this.videoFallbackTexture.needsUpdate = true;
  }

  public loadCurrentVideo() {
    const startup = this.filteredStartups[this.selectedStartupIndex];
    if (!startup) {
      this.voiceAssistant.speak('Please select a startup first.');
      return;
    }

    this.videoFallbackStartup = startup;
    this.isUsingVideoFallback = false;
    const mat = this.videoMesh.material as THREE.MeshBasicMaterial;
    mat.map = this.videoTexture;
    mat.needsUpdate = true;

    this.videoTitleText.text = `${startup.name} — Video Profile`;
    this.videoPlayerGroup.visible = true;
    this.videoPlayPauseBtn.label = 'Pause';

    if (startup.videoURL) {
      this.videoElement.src = startup.videoURL;
      this.videoElement.play().catch(() => {
        this.activateVideoFallbackReel(startup);
      });
    } else {
      this.activateVideoFallbackReel(startup);
    }

    this.voiceAssistant.speak(`Loading video showcase for ${startup.name}.`);
    const hudSelection = document.getElementById('hud-current-selection');
    if (hudSelection) {
      hudSelection.textContent = `Video Showcase Open: ${startup.name}`;
    }
  }

  public hideVideoPlayer() {
    this.videoElement.pause();
    this.videoElement.removeAttribute('src');
    this.videoElement.load();
    this.isUsingVideoFallback = false;
    this.videoFallbackStartup = null;
    this.videoPlayerGroup.visible = false;
  }

  public toggleVRMode() {
    const nextMode = this.vrManager.currentMode === 'AR' ? 'VR' : 'AR';
    this.setVRMode(nextMode);
  }

  public setVRMode(mode: 'AR' | 'VR') {
    const current = this.filteredStartups[this.selectedStartupIndex];
    const cat = current?.typeID ? String(current.typeID) : this.activeCategory;
    this.vrManager.setMode(mode, cat);

    if (xb.core?.transition) {
      try {
        if (mode === 'VR') {
          let vrColor = 0x050914;
          if (cat === '172') vrColor = 0x021827;
          if (cat === '27') vrColor = 0x0284c7;
          xb.core.transition.toVR({ color: vrColor });
        } else {
          xb.core.transition.toAR();
        }
      } catch (err) {
        console.warn('XRTransition error:', err);
      }
    }

    if (mode === 'AR' && xb.core?.scene) {
      xb.core.scene.background = null;
    }

    this.updateVRUI(mode);
  }

  private updateVRUI(mode: 'AR' | 'VR') {
    const isVR = mode === 'VR';
    if (this.detectionVRBtn) {
      this.detectionVRBtn.label = isVR ? 'Switch to AR' : 'Switch to VR';
      this.detectionVRBtn.icon = isVR ? 'view_in_ar' : 'public';
      this.detectionVRBtn.style.backgroundColor = isVR ? '#059669' : '#7c3aed';
    }
    if (this.modelVRBtn) {
      this.modelVRBtn.label = isVR ? 'Switch to AR' : 'Switch to VR';
      this.modelVRBtn.icon = isVR ? 'view_in_ar' : 'public';
      this.modelVRBtn.style.backgroundColor = isVR ? '#059669' : '#7c3aed';
    }

    const hudMode = document.getElementById('hud-mode-indicator');
    if (hudMode) hudMode.textContent = isVR ? 'VR DOME' : 'CAMERA VIEW';
    const hudVrBtn = document.getElementById('hud-vr-btn');
    if (hudVrBtn) hudVrBtn.textContent = isVR ? 'Switch to AR' : 'Switch to VR';
    const hudSelection = document.getElementById('hud-current-selection');
    if (hudSelection) {
      hudSelection.textContent = isVR
        ? 'VR Mode Active: Immersive showroom environment'
        : 'AR Mode Active: Real-world passthrough view';
    }
  }

  private setupHUDInteractions() {
    const scanBtn = document.getElementById('hud-scan-btn');
    if (scanBtn) {
      scanBtn.addEventListener('click', () => {
        void this.triggerProductDetection();
      });
    }

    const twinBtn = document.getElementById('hud-twin-btn');
    if (twinBtn) {
      twinBtn.addEventListener('click', () => {
        void this.loadSelectedStartup3DModel();
      });
    }

    const videoBtn = document.getElementById('hud-video-btn');
    if (videoBtn) {
      videoBtn.addEventListener('click', () => {
        this.loadCurrentVideo();
      });
    }

    const vrBtn = document.getElementById('hud-vr-btn');
    if (vrBtn) {
      vrBtn.addEventListener('click', () => {
        this.toggleVRMode();
        vrBtn.textContent = this.vrManager.currentMode === 'VR' ? 'Switch to AR' : 'Switch to VR';
      });
    }

    const voiceBtn = document.getElementById('hud-voice-btn');
    if (voiceBtn) {
      voiceBtn.addEventListener('click', () => {
        this.voiceAssistant.toggle();
      });
    }

    const voiceInput = document.getElementById('hud-voice-input') as HTMLInputElement | null;
    const voiceSendBtn = document.getElementById('hud-voice-send-btn');
    if (voiceInput && voiceSendBtn) {
      const sendCmd = () => {
        const text = voiceInput.value.trim();
        if (text) {
          this.voiceAssistant.processTextCommand(text);
          voiceInput.value = '';
        }
      };
      voiceSendBtn.addEventListener('click', sendCmd);
      voiceInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') sendCmd();
      });
    }

    // Voice quick hint chips
    document.querySelectorAll('.hint-chip').forEach((chip) => {
      chip.addEventListener('click', (e) => {
        const text = (e.target as HTMLElement).textContent?.replace(/"/g, '').trim() || '';
        if (text) {
          this.voiceAssistant.processTextCommand(text);
        }
      });
    });

    // Desktop Vision Test Inputs: Upload Photo + Live Webcam
    const photoInput = document.getElementById('hud-photo-input') as HTMLInputElement | null;
    const uploadPhotoBtn = document.getElementById('hud-upload-photo-btn');
    const webcamBtn = document.getElementById('hud-webcam-btn');
    const clearSourceBtn = document.getElementById('hud-clear-source-btn');
    const previewWrap = document.getElementById('hud-vision-preview');
    const previewImg = document.getElementById('hud-vision-preview-img') as HTMLImageElement | null;
    const webcamVideo = document.getElementById('hud-webcam-video') as HTMLVideoElement | null;
    const sourceStatus = document.getElementById('hud-vision-source-status');

    const syncSourceUI = () => {
      const testPreview = this.visionService.getTestImagePreview();
      const webcamActive = this.visionService.isWebcamActive();

      uploadPhotoBtn?.classList.toggle('active', Boolean(testPreview));
      webcamBtn?.classList.toggle('active', webcamActive);
      if (webcamBtn) {
        webcamBtn.textContent = webcamActive ? 'Stop Webcam' : 'Use Webcam';
      }
      if (clearSourceBtn) {
        clearSourceBtn.style.display = testPreview || webcamActive ? 'inline-flex' : 'none';
      }

      if (testPreview && previewWrap && previewImg && sourceStatus) {
        previewWrap.classList.add('visible');
        previewImg.style.display = 'block';
        previewImg.src = testPreview.previewDataUrl;
        if (webcamVideo) webcamVideo.style.display = 'none';
        sourceStatus.textContent = `Test: ${testPreview.label}`;
      } else if (webcamActive && previewWrap && webcamVideo && sourceStatus) {
        previewWrap.classList.add('visible');
        webcamVideo.style.display = 'block';
        if (previewImg) previewImg.style.display = 'none';
        sourceStatus.textContent = 'Webcam live';
      } else if (previewWrap) {
        previewWrap.classList.remove('visible');
      }
    };

    if (uploadPhotoBtn && photoInput) {
      uploadPhotoBtn.addEventListener('click', () => {
        photoInput.value = '';
        photoInput.click();
      });
      photoInput.addEventListener('change', async () => {
        const file = photoInput.files?.[0];
        if (!file) return;
        this.visionService.stopWebcam();
        await this.visionService.setTestImageFile(file);
        syncSourceUI();
        const hudSelection = document.getElementById('hud-current-selection');
        if (hudSelection) {
          hudSelection.textContent = `Test photo loaded (${file.name}). Click "Scan & Identify" to test Gemini Vision!`;
        }
      });
    }

    if (webcamBtn) {
      webcamBtn.addEventListener('click', async () => {
        if (this.visionService.isWebcamActive()) {
          this.visionService.stopWebcam();
          syncSourceUI();
          return;
        }
        try {
          this.visionService.clearTestImage();
          await this.visionService.startWebcam(webcamVideo || undefined);
          syncSourceUI();
          const hudSelection = document.getElementById('hud-current-selection');
          if (hudSelection) {
            hudSelection.textContent = 'Desktop webcam active. Hold a product in front of your camera and click "Scan & Identify".';
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          const hudSelection = document.getElementById('hud-current-selection');
          if (hudSelection) {
            hudSelection.textContent = `Webcam unavailable (${msg}). Use "Upload Test Photo" instead.`;
          }
        }
      });
    }

    if (clearSourceBtn) {
      clearSourceBtn.addEventListener('click', () => {
        this.visionService.clearTestImage();
        this.visionService.stopWebcam();
        syncSourceUI();
        const hudSelection = document.getElementById('hud-current-selection');
        if (hudSelection) {
          hudSelection.textContent = 'Cleared custom vision input. Using XR camera/scene.';
        }
      });
    }
  }

  private updateHUDStatus(status: string) {
    const el = document.getElementById('hud-connection-status');
    if (el) el.textContent = status;
  }

  update() {
    const delta = xb.getDeltaTime();
    if (this.vrManager) {
      this.vrManager.update(delta);
    }
    if (this.virtualTwin) {
      this.virtualTwin.update(delta);
    }
    if (
      this.videoPlayerGroup?.visible &&
      this.isUsingVideoFallback &&
      this.isFallbackPlaying &&
      this.videoFallbackStartup
    ) {
      this.videoFallbackTime += delta;
      this.drawVideoFallbackFrame(this.videoFallbackStartup);
    }
  }

  dispose() {
    this.visionService?.stopWebcam();
    this.voiceAssistant.dispose();
    this.virtualTwin.dispose();
    this.vrManager?.dispose();
    this.hideVideoPlayer();
    this.videoElement?.remove();
    this.videoTexture?.dispose();
    this.videoFallbackTexture?.dispose();
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const options = new xb.Options();
  options.enableXRTransitions();
  options.setAppTitle('Galaxy XR Showroom Product Detector');
  options.setAppDescription(
    'Identify physical showroom startup products using computer vision, voice assistant, and 3D BM3 virtual twin AR overlays.'
  );

  // Enable Galaxy XR camera, depth, and spatial hands
  options.enableCamera('environment');
  options.enableDepth();
  options.enableHands();
  options.enableReticles();
  options.permissions.microphone = true;
  options.permissions.camera = true;

  xb.add(new ShowroomProductDetectorApp());
  await xb.init(options);
});
