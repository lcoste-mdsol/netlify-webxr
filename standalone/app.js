import * as THREE from 'three';
import * as xb from 'xrblocks';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { fetchStartups } from './apiService.js';
import { convertBm3UrlToGlbBlob } from './bm3Converter.js';
import { VREnvironmentManager } from './vrEnvironment.js';
import { VoiceAssistant } from './voiceService.js';
import { VisionDetectionService } from './visionService.js';

class StartupShowcaseScript extends xb.Script {
  constructor() {
    super();
    this.allStartups = [];
    this.filteredStartups = [];
    this.activeFilter = 'all';
    this.currentIndex = 0;
    this.overviewPageIndex = 0;
    this.pageSize = 8;
    this.isOverviewMode = true;

    // 3D Model State
    this.modelContainer = new THREE.Group();
    this.currentLoadedModel = null;
    this.mixer = null;
    this.isModelAnimating = true;
    this.baseModelY = 1.28;
    this.modelTime = 0;
    this.modelLoadSeq = 0;

    this.modelContainer.position.set(0, this.baseModelY, -0.78);
    this.modelContainer.xb = { manipulation: true };
    this.add(this.modelContainer);
  }

  async init() {
    this.add(new THREE.HemisphereLight(0xffffff, 0x334155, 2.8));
    const mainLight = new THREE.DirectionalLight(0xffffff, 2.0);
    mainLight.position.set(3, 5, 2);
    mainLight.castShadow = true;
    this.add(mainLight);

    const blueAccent = new THREE.PointLight(0x38bdf8, 2, 8);
    blueAccent.position.set(-2, 2.5, -0.5);
    this.add(blueAccent);

    this.vrManager = new VREnvironmentManager(xb.core.scene);

    this.updateHUDConnectionStatus('Connecting to API...');
    this.allStartups = await fetchStartups();
    this.filteredStartups = [...this.allStartups];
    this.updateHUDConnectionStatus('API Connected • ' + this.allStartups.length + ' Startups');

    this.visionService = new VisionDetectionService(this.allStartups);

    this.buildSpatialUI();
    this.setupVoiceAssistant();
    this.setupHUDControls();
    this.showOverview();

    window.app = this;
  }

  setupVoiceAssistant() {
    this.voiceAssistant = new VoiceAssistant(this.allStartups, {
      onStatusChange: (status) => {
        if (this.voiceStatusText) this.voiceStatusText.text = status;
        const hudVoice = document.getElementById('hud-voice-status');
        if (hudVoice) hudVoice.textContent = this.voiceAssistant.isListening ? 'Listening...' : 'Voice AI';
      },
      onTranscript: (t) => {
        if (this.voiceTranscriptText) this.voiceTranscriptText.text = `"${t}"`;
      },
      onResponse: (reply) => {
        if (this.voiceResponseText) this.voiceResponseText.text = reply;
        const hudSelection = document.getElementById('hud-current-selection');
        if (hudSelection) hudSelection.textContent = reply;
      },
      onIntent: (intent) => {
        this.executeVoiceIntent(intent);
      },
    });
  }

  async executeVoiceIntent(intent) {
    switch (intent.intent) {
      case 'detect_product':
        await this.triggerProductDetection(intent.rawText);
        break;

      case 'load_3d_model':
      case 'load_model':
        this.loadCurrent3DModel();
        break;

      case 'goto_index':
        if (intent.gotoIndex && this.filteredStartups.length > 0) {
          const target = Math.max(1, Math.min(intent.gotoIndex, this.filteredStartups.length)) - 1;
          this.selectStartup(target);
          const s = this.filteredStartups[target];
          this.voiceAssistant.speak(
            `Selected startup #${target + 1}: ${s.name} in the ${s.category} sector. ${s.commercialDescription.slice(0, 140)}... Say "Load 3D model" or "Load video".`
          );
        }
        break;

      case 'goto_name':
      case 'describe_startup':
        if (intent.gotoName || intent.startupName) {
          const searchName = (intent.gotoName || intent.startupName || '').toLowerCase();
          let found = this.filteredStartups.findIndex((s) =>
            s.name.toLowerCase().includes(searchName)
          );
          if (found === -1) {
            this.filterCategory('all');
            found = this.filteredStartups.findIndex((s) =>
              s.name.toLowerCase().includes(searchName)
            );
          }
          if (found !== -1) {
            this.selectStartup(found);
            const s = this.filteredStartups[found];
            this.voiceAssistant.speak(
              `Selected #${found + 1} ${s.name} in ${s.category}. ${s.commercialDescription.slice(0, 140)}... Say "Load 3D model" or "Load video".`
            );
          }
        }
        break;

      case 'increase_size':
      case 'scale_up':
        this.adjustModelScale(intent.scaleFactor || 1.25);
        this.voiceAssistant.speak('Virtual twin scaled up.');
        break;

      case 'decrease_size':
      case 'scale_down':
        this.adjustModelScale(intent.scaleFactor || 0.8);
        this.voiceAssistant.speak('Virtual twin scaled down.');
        break;

      case 'move_up':
        this.adjustModelElevation(0.1);
        this.voiceAssistant.speak('Virtual twin raised.');
        break;

      case 'move_down':
        this.adjustModelElevation(-0.1);
        this.voiceAssistant.speak('Virtual twin lowered.');
        break;

      case 'toggle_animation':
        this.toggleModelAnimation();
        this.voiceAssistant.speak(
          this.isModelAnimating ? 'Virtual twin animation resumed.' : 'Virtual twin animation paused.'
        );
        break;

      case 'dismiss_model':
      case 'remove_model':
        this.dismissCurrentModel();
        this.voiceAssistant.speak('3D virtual twin removed.');
        break;

      case 'load_video':
      case 'play_video':
        this.loadCurrentVideo();
        break;

      case 'close_video':
        this.hideVideoPlayer();
        this.voiceAssistant.speak('Video player closed.');
        break;

      case 'show_overview':
        this.showOverview();
        this.voiceAssistant.speak('Showing showroom catalogue grid.');
        break;

      case 'next_page':
      case 'next_item':
        if (this.isOverviewMode) {
          this.navigateOverview(1);
          this.voiceAssistant.speak(`Next page ${this.overviewPageIndex + 1}.`);
        } else {
          this.selectStartup((this.currentIndex + 1) % this.filteredStartups.length);
        }
        break;

      case 'previous_page':
      case 'previous_item':
        if (this.isOverviewMode) {
          this.navigateOverview(-1);
          this.voiceAssistant.speak(`Previous page ${this.overviewPageIndex + 1}.`);
        } else {
          this.selectStartup(
            (this.currentIndex - 1 + this.filteredStartups.length) % this.filteredStartups.length
          );
        }
        break;

      case 'show_all':
        this.filterCategory('all');
        this.voiceAssistant.speak(`Showing all ${this.allStartups.length} showroom projects.`);
        break;

      case 'filter_category':
        if (intent.categoryName) {
          this.filterCategory(intent.categoryName);
          this.voiceAssistant.speak(
            `Filtered to ${intent.categoryTitle || 'category'} with ${this.filteredStartups.length} startups.`
          );
        }
        break;

      case 'enter_vr':
        this.setVRMode('VR');
        this.voiceAssistant.speak('Entered VR immersive showroom dome.');
        break;

      case 'switch_ar':
        this.setVRMode('AR');
        this.voiceAssistant.speak('Switched back to AR real-world view.');
        break;

      case 'help':
        this.voiceAssistant.speak(
          'You can say: "select startup number 4", "recognize this product", "load 3D model", "remove the 3D model", "scale up", "scale down", "move up", "move down", "animate", "load video", "close video", "switch to VR", "switch to AR", "next page", or filter by "Life", "Nature", "Product", or "All projects".'
        );
        break;

      default:
        if (intent.rawText && intent.rawText.length > 3) {
          this.voiceAssistant.speak(
            `I heard "${intent.rawText}". You can say: "select startup number 4", "load 3D model", "remove the 3D model", "load video", "switch to VR", or "recognize this product".`
          );
        }
        break;
    }
  }

  async triggerProductDetection(userQueryPrompt) {
    if (this.overviewSideStatusText) {
      this.overviewSideStatusText.text = 'Capturing frame & analyzing with Gemini Vision...';
      this.overviewSideStatusText.style.color = '#38bdf8';
    }
    const hudConfidence = document.getElementById('hud-detection-confidence');
    if (hudConfidence) hudConfidence.textContent = 'Scanning...';

    try {
      const frame = await this.visionService.captureCameraFrame();
      this.updateVisionPreviewSnapshot(frame.previewDataUrl, frame.captureSource);

      const result = await this.visionService.identifyProductInFrame(frame, userQueryPrompt);

      let matchedIdx = this.filteredStartups.findIndex((s) => s.id === result.startup.id);
      if (matchedIdx === -1) {
        this.filterCategory('all');
        matchedIdx = this.filteredStartups.findIndex((s) => s.id === result.startup.id);
      }
      if (matchedIdx !== -1) {
        this.selectStartup(matchedIdx);
      }

      const sourceLabel = result.source === 'fallback' ? 'Fallback' : 'Gemini Vision';
      const captureLabel = this.formatCaptureSource(result.captureSource);
      const vocalText =
        result.voiceResponse ||
        `I identified ${result.startup.name}. ${result.startup.commercialDescription.slice(0, 140)}... Say "Load 3D model" to overlay the virtual twin.`;
      this.voiceAssistant.speak(vocalText);

      if (this.overviewSideStatusText) {
        this.overviewSideStatusText.text = `✓ ${sourceLabel} (${captureLabel}): ${result.startup.name} (${Math.round(result.confidence * 100)}%)`;
        this.overviewSideStatusText.style.color = result.source === 'fallback' ? '#fbbf24' : '#34d399';
      }
      if (this.overviewSideDescText) {
        const hintNote =
          result.captureSource === 'placeholder'
            ? '\n\n[Desktop Tip: No camera feed detected. Use "Upload Test Photo" or "Use Webcam" in the HUD to test Gemini Vision with a real photo.]'
            : '';
        this.overviewSideDescText.text = `${result.reasoning}\n\n${result.startup.commercialDescription}${hintNote}`;
      }
      if (hudConfidence) {
        hudConfidence.textContent = `${Math.round(result.confidence * 100)}% • ${sourceLabel}`;
      }
      const hudSelection = document.getElementById('hud-current-selection');
      if (hudSelection) {
        hudSelection.textContent = `Identified (${sourceLabel} via ${captureLabel}): ${result.startup.name} — ${result.reasoning}`;
      }
    } catch (err) {
      console.warn('Vision detection error:', err);
    }
  }

  formatCaptureSource(source) {
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

  updateVisionPreviewSnapshot(previewDataUrl, captureSource) {
    if (this.visionService?.isWebcamActive()) return;
    const previewWrap = document.getElementById('hud-vision-preview');
    const previewImg = document.getElementById('hud-vision-preview-img');
    const webcamVideo = document.getElementById('hud-webcam-video');
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

  buildSpatialUI() {
    this.createOverviewCard();
    this.createDetailCard();
    this.createModelControlCard();
    this.createVoiceCard();
    this.createVideoPlayerCard();
  }

  createOverviewCard() {
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
          style: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            flexGrow: 1,
          },
          children: [
            new xb.UIPanel({
              style: {
                paddingLeft: 12,
                paddingRight: 12,
                paddingTop: 5,
                paddingBottom: 5,
                borderRadius: 999,
                backgroundColor: 'rgba(56, 189, 248, 0.16)',
                borderWidth: 1,
                borderColor: 'rgba(56, 189, 248, 0.45)',
              },
              children: [
                new xb.UIText({
                  text: '3DEXPERIENCE LAB',
                  style: { fontSize: 13, fontWeight: 'bold', color: '#38bdf8' },
                }),
              ],
            }),
            new xb.UIText({
              text: 'Startup Showroom & AI Vision',
              style: { fontSize: 17, color: '#f8fafc', fontWeight: 'bold' },
            }),
          ],
        }),
      ],
    });

    this.filterButtons = {
      all: new xb.UIButton({
        label: 'All projects',
        style: { flexGrow: 1, height: 34, fontSize: 13, backgroundColor: '#0284c7' },
        onClick: () => this.filterCategory('all'),
      }),
      '172': new xb.UIButton({
        label: 'Life',
        style: { flexGrow: 1, height: 34, fontSize: 13, backgroundColor: '#1e293b' },
        onClick: () => this.filterCategory('172'),
      }),
      '27': new xb.UIButton({
        label: 'Nature',
        style: { flexGrow: 1, height: 34, fontSize: 13, backgroundColor: '#1e293b' },
        onClick: () => this.filterCategory('27'),
      }),
      '376': new xb.UIButton({
        label: 'Product',
        style: { flexGrow: 1, height: 34, fontSize: 13, backgroundColor: '#1e293b' },
        onClick: () => this.filterCategory('376'),
      }),
    };

    const filterRow = new xb.UIPanel({
      style: {
        width: '100%',
        flexDirection: 'row',
        gap: 8,
        marginTop: 4,
        marginBottom: 4,
      },
      children: [
        this.filterButtons.all,
        this.filterButtons['172'],
        this.filterButtons['27'],
        this.filterButtons['376'],
      ],
    });

    const row0 = new xb.UIPanel({ style: { width: '100%', minHeight: 90, flexDirection: 'row', gap: 10 } });
    const row1 = new xb.UIPanel({ style: { width: '100%', minHeight: 90, flexDirection: 'row', gap: 10 } });
    const row2 = new xb.UIPanel({ style: { width: '100%', minHeight: 90, flexDirection: 'row', gap: 10 } });
    const row3 = new xb.UIPanel({ style: { width: '100%', minHeight: 90, flexDirection: 'row', gap: 10 } });
    this.gridRows = [row0, row1, row2, row3];
    const gridRows = this.gridRows;

    const leftGridColumn = new xb.UIPanel({
      style: {
        flexGrow: 1,
        flexBasis: 0,
        flexDirection: 'column',
        gap: 10,
      },
      children: [row0, row1, row2, row3],
    });

    this.startupTilePanels = [];
    for (let i = 0; i < this.pageSize; i++) {
      const tileImg = new xb.UIImage({
        src: 'https://picsum.photos/seed/placeholder/200/200',
        ariaLabel: 'Startup preview',
        style: {
          width: 76,
          height: 76,
          objectFit: 'cover',
          borderRadius: 8,
          backgroundColor: '#0f172a',
        },
      });

      const tileTitle = new xb.UIText({
        text: 'Startup Name',
        style: { fontSize: 14, fontWeight: 'bold', color: '#ffffff' },
      });

      const tileCat = new xb.UIText({
        text: 'Category',
        style: { fontSize: 11, color: '#38bdf8', fontWeight: 'bold' },
      });

      const tileSnippet = new xb.UIText({
        text: 'Description snippet...',
        style: { fontSize: 11, lineHeight: 1.35, color: '#94a3b8', whiteSpace: 'pre-line' },
      });

      const textColumn = new xb.UIPanel({
        style: {
          flexGrow: 1,
          flexBasis: 0,
          flexDirection: 'column',
          gap: 3,
        },
        children: [tileTitle, tileCat, tileSnippet],
      });

      const tileIndex = i;
      const tileContainer = new xb.UIButton({
        ariaLabel: `Startup ${i + 1}`,
        style: {
          flexGrow: 1,
          flexBasis: 0,
          minHeight: 90,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          padding: 10,
          borderRadius: 10,
          backgroundColor: 'rgba(30, 41, 59, 0.7)',
          borderWidth: 1,
          borderColor: 'rgba(255, 255, 255, 0.08)',
        },
        children: [tileImg, textColumn],
        onClick: () => {
          const index = this.overviewPageIndex * this.pageSize + tileIndex;
          if (index < this.filteredStartups.length) {
            this.selectStartup(index);
          }
        },
      });

      this.startupTilePanels.push({
        container: tileContainer,
        image: tileImg,
        title: tileTitle,
        cat: tileCat,
        snippet: tileSnippet,
      });

      const rowIndex = Math.floor(i / 2);
      gridRows[rowIndex].add(tileContainer);
    }

    this.overviewSideTitleText = new xb.UIText({
      text: 'Startup Name',
      style: { fontSize: 20, fontWeight: 'bold', color: '#ffffff' },
    });

    this.overviewSideCategoryText = new xb.UIText({
      text: 'Category Name',
      style: { fontSize: 12, color: '#38bdf8', fontWeight: 'bold' },
    });

    const sideTitleBox = new xb.UIPanel({
      style: {
        width: '100%',
        flexDirection: 'column',
        gap: 2,
        paddingBottom: 6,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
      },
      children: [this.overviewSideTitleText, this.overviewSideCategoryText],
    });

    this.overviewSideImage = new xb.UIImage({
      src: 'https://picsum.photos/seed/hero/600/300',
      ariaLabel: 'Selected startup preview',
      style: {
        width: '100%',
        height: 125,
        objectFit: 'cover',
        borderRadius: 8,
        backgroundColor: '#0f172a',
      },
    });

    this.overviewSideDescText = new xb.UIText({
      text: 'Commercial description...',
      style: { fontSize: 12, lineHeight: 1.4, color: '#e2e8f0', whiteSpace: 'pre-line' },
    });

    const sideDescScroll = new xb.UIScrollView({
      style: {
        width: '100%',
        height: 155,
        padding: 6,
        backgroundColor: 'rgba(0, 0, 0, 0.25)',
        borderRadius: 6,
      },
      children: [this.overviewSideDescText],
    });

    this.overviewSideStatusText = new xb.UIText({
      text: '3D Virtual Twin available',
      style: { fontSize: 11, color: '#34d399', textAlign: 'center' },
    });

    this.overviewSideScanBtn = new xb.UIButton({
      label: 'Scan Item',
      icon: 'photo_camera',
      style: { flexGrow: 1, height: 36, fontSize: 12, backgroundColor: '#0284c7' },
      onClick: () => this.triggerProductDetection(),
    });

    this.overviewSideModelBtn = new xb.UIButton({
      label: 'Load 3D Twin',
      icon: 'view_in_ar',
      style: { flexGrow: 1, height: 36, fontSize: 12, backgroundColor: '#2563eb' },
      onClick: () => this.loadCurrent3DModel(),
    });

    this.overviewSideVideoBtn = new xb.UIButton({
      label: 'Load Video',
      icon: 'play_arrow',
      style: { flexGrow: 1, height: 36, fontSize: 12, backgroundColor: '#10b981' },
      onClick: () => this.loadCurrentVideo(),
    });

    this.overviewSideVRBtn = new xb.UIButton({
      label: 'Switch to VR',
      icon: 'public',
      style: { flexGrow: 1, height: 36, fontSize: 12, backgroundColor: '#7c3aed' },
      onClick: () => this.toggleVRMode(),
    });

    const sideActionsRow1 = new xb.UIPanel({
      style: { width: '100%', flexDirection: 'row', gap: 8 },
      children: [this.overviewSideScanBtn, this.overviewSideModelBtn],
    });

    const sideActionsRow2 = new xb.UIPanel({
      style: { width: '100%', flexDirection: 'row', gap: 8 },
      children: [this.overviewSideVideoBtn, this.overviewSideVRBtn],
    });

    const rightDescPanel = new xb.UIPanel({
      style: {
        width: 410,
        flexShrink: 0,
        flexDirection: 'column',
        gap: 8,
        padding: 12,
        backgroundColor: 'rgba(15, 23, 42, 0.9)',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(56, 189, 248, 0.25)',
      },
      children: [
        sideTitleBox,
        this.overviewSideImage,
        sideDescScroll,
        this.overviewSideStatusText,
        sideActionsRow1,
        sideActionsRow2,
      ],
    });

    const mainBodyRow = new xb.UIPanel({
      style: {
        width: '100%',
        flexDirection: 'row',
        gap: 14,
        alignItems: 'stretch',
      },
      children: [leftGridColumn, rightDescPanel],
    });

    this.overviewPageText = new xb.UIText({
      text: 'Page 1 of 1',
      style: { fontSize: 13, color: '#94a3b8', textAlign: 'center' },
    });

    const footer = new xb.UIPanel({
      style: {
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: 8,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
      },
      children: [
        new xb.UIButton({
          label: 'Previous Page',
          icon: 'arrow_back',
          style: { width: 140, height: 34, fontSize: 12 },
          onClick: () => this.navigateOverview(-1),
        }),
        this.overviewPageText,
        new xb.UIButton({
          label: 'Next Page',
          icon: 'arrow_forward',
          style: { width: 140, height: 34, fontSize: 12 },
          onClick: () => this.navigateOverview(1),
        }),
      ],
    });

    this.overviewCard = new xb.UICard({
      size: { width: 1.12, height: 'auto' },
      manipulation: true,
      edge: true,
      style: {
        flexDirection: 'column',
        gap: 12,
        padding: 16,
        backgroundColor: '#0a0f1dEE',
        borderRadius: 16,
      },
      children: [header, filterRow, mainBodyRow, footer],
    });

    this.overviewCard.position.set(0.14, 1.45, -0.90);
    this.overviewCard.name = 'Startup Overview Card';
    this.add(this.overviewCard);
  }

  createDetailCard() {
    this.detailTitleText = new xb.UIText({
      text: 'Startup Name',
      style: { fontSize: 26, fontWeight: 'bold', color: '#ffffff' },
    });

    this.detailCategoryText = new xb.UIText({
      text: 'Category Name',
      style: { fontSize: 13, color: '#38bdf8', fontWeight: 'bold' },
    });

    const titleBox = new xb.UIPanel({
      style: {
        width: '100%',
        flexDirection: 'column',
        gap: 2,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        paddingBottom: 8,
      },
      children: [this.detailTitleText, this.detailCategoryText],
    });

    this.detailImage = new xb.UIImage({
      src: 'https://picsum.photos/seed/detail/800/400',
      ariaLabel: 'Startup hero preview',
      style: {
        width: '100%',
        height: 140,
        objectFit: 'cover',
        borderRadius: 10,
        backgroundColor: '#0f172a',
      },
    });

    this.detailDescriptionText = new xb.UIText({
      text: 'Loading description...',
      style: { fontSize: 14, lineHeight: 1.45, color: '#e2e8f0', whiteSpace: 'pre-line' },
    });

    const scrollDescription = new xb.UIScrollView({
      style: { width: '100%', height: 110, padding: 8, backgroundColor: 'rgba(0, 0, 0, 0.2)', borderRadius: 8 },
      children: [this.detailDescriptionText],
    });

    this.detailStatusText = new xb.UIText({
      text: '3D Virtual Twin available for interactive spatial inspection.',
      style: { fontSize: 12, color: '#94a3b8', textAlign: 'center' },
    });

    this.detailModelBtn = new xb.UIButton({
      label: 'Load 3D Virtual Twin',
      icon: 'view_in_ar',
      style: { flexGrow: 1, height: 42, backgroundColor: '#2563eb' },
      onClick: () => this.loadCurrent3DModel(),
    });

    this.detailVideoBtn = new xb.UIButton({
      label: 'Load Video',
      icon: 'play_arrow',
      style: { width: 125, height: 42, backgroundColor: '#10b981' },
      onClick: () => this.loadCurrentVideo(),
    });

    this.detailVRBtn = new xb.UIButton({
      label: 'Switch to VR',
      icon: 'public',
      style: { width: 130, height: 42, backgroundColor: '#7c3aed' },
      onClick: () => this.toggleVRMode(),
    });

    const actions = new xb.UIPanel({
      style: { width: '100%', flexDirection: 'row', gap: 8, marginTop: 4 },
      children: [
        this.detailModelBtn,
        this.detailVideoBtn,
        this.detailVRBtn,
        new xb.UIButton({
          label: 'Back to Grid',
          icon: 'grid_view',
          style: { width: 125, height: 42, backgroundColor: '#334155' },
          onClick: () => this.showOverview(),
        }),
      ],
    });

    this.detailCard = new xb.UICard({
      size: { width: 0.85, height: 'auto' },
      manipulation: true,
      edge: true,
      style: {
        flexDirection: 'column',
        gap: 12,
        padding: 16,
        backgroundColor: '#0a0f1dEE',
        borderRadius: 16,
      },
      children: [titleBox, this.detailImage, scrollDescription, this.detailStatusText, actions],
    });

    this.detailCard.position.set(0.08, 1.45, -0.88);
    this.detailCard.visible = false;
    this.detailCard.name = 'Startup Detail Card';
    this.add(this.detailCard);
  }

  createModelControlCard() {
    this.modelInfoText = new xb.UIText({
      text: 'Virtual Twin Controls',
      style: { fontSize: 13, fontWeight: 'bold', color: '#60a5fa', textAlign: 'center' },
    });

    const scaleRow = new xb.UIPanel({
      style: { width: '100%', flexDirection: 'row', gap: 8 },
      children: [
        new xb.UIButton({
          label: 'Scale +',
          icon: 'zoom_in',
          style: { flexGrow: 1, height: 34, fontSize: 12 },
          onClick: () => this.adjustModelScale(1.25),
        }),
        new xb.UIButton({
          label: 'Scale -',
          icon: 'zoom_out',
          style: { flexGrow: 1, height: 34, fontSize: 12 },
          onClick: () => this.adjustModelScale(0.8),
        }),
      ],
    });

    const moveRow = new xb.UIPanel({
      style: { width: '100%', flexDirection: 'row', gap: 8 },
      children: [
        new xb.UIButton({
          label: 'Move Up',
          icon: 'arrow_upward',
          style: { flexGrow: 1, height: 34, fontSize: 12 },
          onClick: () => this.adjustModelElevation(0.1),
        }),
        new xb.UIButton({
          label: 'Move Down',
          icon: 'arrow_downward',
          style: { flexGrow: 1, height: 34, fontSize: 12 },
          onClick: () => this.adjustModelElevation(-0.1),
        }),
      ],
    });

    this.modelVRBtn = new xb.UIButton({
      label: 'VR Dome',
      icon: 'public',
      style: { flexGrow: 1, height: 34, fontSize: 12, backgroundColor: '#7c3aed' },
      onClick: () => this.toggleVRMode(),
    });

    const animRow = new xb.UIPanel({
      style: { width: '100%', flexDirection: 'row', gap: 8 },
      children: [
        new xb.UIButton({
          label: 'Animate',
          icon: 'sync',
          style: { flexGrow: 1, height: 34, fontSize: 12, backgroundColor: '#0284c7' },
          onClick: () => this.toggleModelAnimation(),
        }),
        this.modelVRBtn,
      ],
    });

    const dismissBtn = new xb.UIButton({
      label: 'Dismiss Model',
      icon: 'close',
      style: { width: '100%', height: 32, fontSize: 12, backgroundColor: '#dc2626' },
      onClick: () => this.dismissCurrentModel(),
    });

    this.modelControlCard = new xb.UICard({
      size: { width: 0.38, height: 'auto' },
      manipulation: true,
      edge: true,
      style: {
        flexDirection: 'column',
        gap: 8,
        padding: 12,
        backgroundColor: '#0a0f1dEE',
        borderRadius: 14,
      },
      children: [this.modelInfoText, scaleRow, moveRow, animRow, dismissBtn],
    });

    this.modelControlCard.position.set(0.50, 1.18, -0.78);
    this.modelControlCard.rotation.y = -0.28;
    this.modelControlCard.visible = false;
    this.modelControlCard.name = 'Model Control Palette';
    this.add(this.modelControlCard);
  }

  createVoiceCard() {
    this.voiceStatusText = new xb.UIText({
      text: 'Ask "Recognize this product" or "Load 3D model"',
      style: { fontSize: 12, color: '#94a3b8' },
    });

    this.voiceTranscriptText = new xb.UIText({
      text: '"What product is this?"',
      style: { fontSize: 13, color: '#e2e8f0', whiteSpace: 'pre-line' },
    });

    this.voiceResponseText = new xb.UIText({
      text: 'Gemini Voice AI ready.',
      style: { fontSize: 13, color: '#67e8f9', fontWeight: 'bold', whiteSpace: 'pre-line' },
    });

    this.voiceMicBtn = new xb.UIButton({
      label: 'Toggle Voice Assistant',
      icon: 'mic',
      style: { width: '100%', height: 40, backgroundColor: '#2563eb' },
      onClick: () => {
        this.voiceAssistant.toggle();
        this.voiceMicBtn.label = this.voiceAssistant.isListening ? 'Stop Voice Assistant' : 'Start Voice Assistant';
        this.voiceMicBtn.style.backgroundColor = this.voiceAssistant.isListening ? '#dc2626' : '#2563eb';
      },
    });

    const header = new xb.UIPanel({
      style: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
      children: [
        new xb.UIText({
          text: 'Gemini Voice AI',
          style: { fontSize: 16, fontWeight: 'bold', color: '#60a5fa' },
        }),
        this.voiceStatusText,
      ],
    });

    this.voiceCard = new xb.UICard({
      size: { width: 0.40, height: 'auto' },
      manipulation: true,
      edge: true,
      style: {
        flexDirection: 'column',
        gap: 10,
        padding: 14,
        backgroundColor: '#0a0f1dEE',
        borderRadius: 14,
      },
      children: [header, this.voiceTranscriptText, this.voiceResponseText, this.voiceMicBtn],
    });

    this.voiceCard.position.set(-0.62, 1.45, -0.82);
    this.voiceCard.rotation.y = 0.35;
    this.voiceCard.name = 'Voice Assistant Card';
    this.add(this.voiceCard);
  }

  createVideoPlayerCard() {
    this.videoElement = document.createElement('video');
    this.videoElement.crossOrigin = 'anonymous';
    this.videoElement.playsInline = true;
    this.videoElement.style.display = 'none';
    document.body.appendChild(this.videoElement);

    this.videoTexture = new THREE.VideoTexture(this.videoElement);
    this.videoTexture.colorSpace = THREE.SRGBColorSpace;

    this.videoFallbackCanvas = document.createElement('canvas');
    this.videoFallbackCanvas.width = 960;
    this.videoFallbackCanvas.height = 540;
    this.videoFallbackTexture = new THREE.CanvasTexture(this.videoFallbackCanvas);
    this.videoFallbackTexture.colorSpace = THREE.SRGBColorSpace;
    this.isUsingVideoFallback = false;
    this.isFallbackPlaying = true;
    this.videoFallbackTime = 0;
    this.videoFallbackStartup = null;
    this.videoFallbackThumbImg = null;

    const videoMaterial = new THREE.MeshBasicMaterial({ map: this.videoTexture });
    const videoGeometry = new THREE.PlaneGeometry(0.68, 0.382);
    this.videoMesh = new THREE.Mesh(videoGeometry, videoMaterial);
    this.videoMesh.position.set(0, 0.22, 0);

    this.videoTitleText = new xb.UIText({
      text: 'Playing Video...',
      style: { fontSize: 15, fontWeight: 'bold', color: '#ffffff', textAlign: 'center' },
    });

    const playPauseBtn = new xb.UIButton({
      label: 'Play / Pause',
      icon: 'play_arrow',
      style: { width: 120, height: 32, fontSize: 12, backgroundColor: '#2563eb' },
      onClick: () => {
        if (this.isUsingVideoFallback) {
          this.isFallbackPlaying = !this.isFallbackPlaying;
        } else if (this.videoElement.paused) {
          this.videoElement.play();
        } else {
          this.videoElement.pause();
        }
      },
    });

    const closeBtn = new xb.UIButton({
      label: 'Close Video',
      icon: 'close',
      style: { flexGrow: 1, height: 32, backgroundColor: '#dc2626' },
      onClick: () => this.hideVideoPlayer(),
    });

    const controlsRow = new xb.UIPanel({
      style: { width: '100%', flexDirection: 'row', gap: 8, marginTop: 8 },
      children: [playPauseBtn, closeBtn],
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
    this.videoPlayerGroup.xb = { manipulation: true };
    this.videoPlayerGroup.add(this.videoMesh);
    this.videoPlayerGroup.add(this.videoControlCard);

    this.videoPlayerGroup.position.set(0.05, 1.85, -0.84);
    this.videoPlayerGroup.rotation.y = 0;
    this.videoPlayerGroup.visible = false;
    this.add(this.videoPlayerGroup);

    this.videoElement.addEventListener('error', () => {
      if (this.videoPlayerGroup.visible && this.videoFallbackStartup) {
        this.activateVideoFallbackReel(this.videoFallbackStartup);
      }
    });
  }

  activateVideoFallbackReel(startup) {
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

    this.videoMesh.material.map = this.videoFallbackTexture;
    this.videoMesh.material.needsUpdate = true;
    this.drawVideoFallbackFrame(startup);
    this.videoTitleText.text = `${startup.name} — Interactive Showcase`;
  }

  drawVideoFallbackFrame(startup) {
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

  hideVideoPlayer() {
    this.videoElement.pause();
    this.videoElement.removeAttribute('src');
    this.videoElement.load();
    this.isUsingVideoFallback = false;
    this.videoFallbackStartup = null;
    this.videoPlayerGroup.visible = false;

    if (this.overviewSideStatusText) {
      this.overviewSideStatusText.text = '3D Virtual Twin available';
      this.overviewSideStatusText.style.color = '#34d399';
    }
  }

  showOverview() {
    this.isOverviewMode = true;
    this.overviewCard.visible = true;
    this.detailCard.visible = false;
    this.updateOverviewGrid();
  }

  updateOverviewGrid() {
    const totalPages = Math.max(1, Math.ceil(this.filteredStartups.length / this.pageSize));
    this.overviewPageIndex = Math.min(this.overviewPageIndex, totalPages - 1);

    this.overviewPageText.text = `Page ${this.overviewPageIndex + 1} of ${totalPages} (${this.filteredStartups.length} items)`;

    const startIdx = this.overviewPageIndex * this.pageSize;
    for (let i = 0; i < this.pageSize; i++) {
      const itemIdx = startIdx + i;
      const tile = this.startupTilePanels[i];
      if (itemIdx < this.filteredStartups.length) {
        const startup = this.filteredStartups[itemIdx];
        tile.container.visible = true;
        tile.container.style.display = 'flex';
        tile.title.text = `#${itemIdx + 1} ${startup.name}`;
        tile.cat.text = startup.category;

        const cleanDesc = startup.commercialDescription.replace(/\s+/g, ' ').trim();
        tile.snippet.text = cleanDesc.slice(0, 72) + '...';
        tile.image.src = startup.largeResolutionURL || 'https://picsum.photos/seed/startup/200/200';

        const isSelected = itemIdx === this.currentIndex;
        tile.container.style.borderColor = isSelected ? '#38bdf8' : 'rgba(255, 255, 255, 0.08)';
        tile.container.style.backgroundColor = isSelected
          ? 'rgba(30, 58, 138, 0.65)'
          : 'rgba(30, 41, 59, 0.7)';
      } else {
        tile.container.visible = false;
        tile.container.style.display = 'none';
      }
    }

    if (this.gridRows) {
      for (let r = 0; r < this.gridRows.length; r++) {
        const hasItemsInRow = startIdx + r * 2 < this.filteredStartups.length;
        this.gridRows[r].visible = hasItemsInRow;
        this.gridRows[r].style.display = hasItemsInRow ? 'flex' : 'none';
      }
    }

    if (this.filteredStartups.length > 0) {
      if (this.currentIndex < startIdx || this.currentIndex >= startIdx + this.pageSize) {
        this.currentIndex = startIdx;
      }
      this.updateSideDescription(this.currentIndex);
    } else {
      this.overviewSideTitleText.text = 'No startups found';
      this.overviewSideCategoryText.text = 'Filter Result';
      this.overviewSideDescText.text = 'No startups match this category filter. Try selecting "All projects".';
      this.overviewSideModelBtn.disabled = true;
    }
  }

  updateSideDescription(index) {
    if (index < 0 || index >= this.filteredStartups.length) return;
    const startup = this.filteredStartups[index];

    this.overviewSideTitleText.text = startup.name;
    this.overviewSideCategoryText.text = startup.category;
    this.overviewSideImage.src = startup.largeResolutionURL || 'https://picsum.photos/seed/hero/600/300';
    this.overviewSideDescText.text = startup.commercialDescription;

    if (startup.highQualityURL) {
      this.overviewSideModelBtn.label = 'Load 3D Virtual Twin';
      this.overviewSideModelBtn.disabled = false;
      this.overviewSideStatusText.text = '✓ CAD BM3 Geometry ready for 3D inspection.';
      this.overviewSideStatusText.style.color = '#34d399';
    } else {
      this.overviewSideModelBtn.label = '3D Model in Production';
      this.overviewSideModelBtn.disabled = true;
      this.overviewSideStatusText.text = '3D geometry model in preparation for this project.';
      this.overviewSideStatusText.style.color = '#94a3b8';
    }

    if (this.detailTitleText) this.detailTitleText.text = startup.name;
    if (this.detailCategoryText) this.detailCategoryText.text = startup.category;
    if (this.detailImage) this.detailImage.src = startup.largeResolutionURL || 'https://picsum.photos/seed/hero/800/400';
    if (this.detailDescriptionText) this.detailDescriptionText.text = startup.commercialDescription;
    if (this.detailModelBtn) {
      this.detailModelBtn.label = startup.highQualityURL ? 'Load 3D Virtual Twin' : '3D Model in Production';
      this.detailModelBtn.disabled = !startup.highQualityURL;
    }
  }

  navigateOverview(direction) {
    const totalPages = Math.max(1, Math.ceil(this.filteredStartups.length / this.pageSize));
    this.overviewPageIndex = (this.overviewPageIndex + direction + totalPages) % totalPages;
    this.updateOverviewGrid();
  }

  getCurrentCategory() {
    const current = this.filteredStartups[this.currentIndex];
    if (current && current.typeID) {
      return String(current.typeID);
    }
    if (this.activeFilter && this.activeFilter !== 'all') {
      return this.activeFilter;
    }
    return 'all';
  }

  normalizeCategoryKey(category) {
    const raw = String(category ?? 'all').trim().toLowerCase();
    if (raw === 'all' || raw === 'all projects') return 'all';
    if (raw === '172' || raw === 'life' || raw === 'life sciences') return '172';
    if (raw === '27' || raw === 'nature' || raw === 'sustainable nature') return '27';
    if (raw === '376' || raw === 'product' || raw === 'products') return '376';
    return raw;
  }

  filterCategory(category) {
    const normalizedKey = this.normalizeCategoryKey(category);
    this.activeFilter = normalizedKey;

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

    if (this.filterButtons) {
      for (const [key, btn] of Object.entries(this.filterButtons)) {
        btn.style.backgroundColor = key === normalizedKey ? '#0284c7' : '#1e293b';
      }
    }

    this.overviewPageIndex = 0;
    this.currentIndex = 0;
    if (!this.isOverviewMode) {
      this.showOverview();
    } else {
      this.updateOverviewGrid();
    }

    if (this.vrManager && this.vrManager.currentMode === 'VR') {
      this.vrManager.setCategory(normalizedKey);
      this.updateVRUI('VR');
    }

    const hudSelection = document.getElementById('hud-current-selection');
    if (hudSelection) {
      const catLabel =
        normalizedKey === 'all'
          ? 'All projects'
          : normalizedKey === '172'
            ? 'Life'
            : normalizedKey === '27'
              ? 'Nature'
              : normalizedKey === '376'
                ? 'Product'
                : normalizedKey;
      hudSelection.textContent = `Category "${catLabel}": showing ${this.filteredStartups.length} startups`;
    }
  }

  selectStartup(index) {
    if (index < 0 || index >= this.filteredStartups.length) return;
    this.currentIndex = index;
    const startup = this.filteredStartups[index];

    const targetPage = Math.floor(index / this.pageSize);
    if (this.overviewPageIndex !== targetPage) {
      this.overviewPageIndex = targetPage;
      this.updateOverviewGrid();
    }

    const startIdx = this.overviewPageIndex * this.pageSize;
    for (let i = 0; i < this.pageSize; i++) {
      const itemIdx = startIdx + i;
      const tile = this.startupTilePanels[i];
      if (tile && tile.container) {
        const isSelected = itemIdx === index;
        tile.container.style.borderColor = isSelected ? '#38bdf8' : 'rgba(255, 255, 255, 0.08)';
        tile.container.style.backgroundColor = isSelected
          ? 'rgba(30, 58, 138, 0.65)'
          : 'rgba(30, 41, 59, 0.7)';
      }
    }

    this.updateSideDescription(index);

    if (this.vrManager && this.vrManager.currentMode === 'VR') {
      const cat = String(startup.typeID || 'all');
      this.vrManager.setCategory(cat);
      this.updateVRUI('VR');
    }

    const hudSelection = document.getElementById('hud-current-selection');
    if (hudSelection) {
      hudSelection.textContent = `Selected #${index + 1}: ${startup.name} (${startup.category})`;
    }
  }

  async loadCurrent3DModel() {
    const startup = this.filteredStartups[this.currentIndex];
    if (!startup) {
      this.voiceAssistant.speak('Please select a startup first.');
      return;
    }
    if (!startup.highQualityURL) {
      this.voiceAssistant.speak(`The 3D virtual twin for ${startup.name} is currently in preparation.`);
      if (this.overviewSideStatusText) {
        this.overviewSideStatusText.text = `3D model in preparation for ${startup.name}.`;
        this.overviewSideStatusText.style.color = '#94a3b8';
      }
      return;
    }

    const loadSeq = ++this.modelLoadSeq;
    this.voiceAssistant.speak(`Loading 3D virtual twin for ${startup.name}. You can interact with it in space.`);
    this.overviewSideModelBtn.disabled = true;
    this.overviewSideModelBtn.label = 'Converting BM3 to GLB...';
    this.overviewSideStatusText.text = 'Downloading BM3 archive & constructing binary GLB in memory...';
    this.overviewSideStatusText.style.color = '#60a5fa';

    try {
      const glbBlob = await convertBm3UrlToGlbBlob(startup.highQualityURL);
      if (loadSeq !== this.modelLoadSeq) return;
      const arrayBuffer = await glbBlob.arrayBuffer();
      if (loadSeq !== this.modelLoadSeq) return;

      this.clearLoadedModelGeometry();

      const loader = new GLTFLoader();
      loader.parse(
        arrayBuffer,
        '',
        (gltf) => {
          if (loadSeq !== this.modelLoadSeq) return;
          this.currentLoadedModel = gltf.scene;

          const box = new THREE.Box3().setFromObject(gltf.scene);
          const size = box.getSize(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z);
          const scale = maxDim > 0 ? 0.55 / maxDim : 1;
          gltf.scene.scale.setScalar(scale);

          const center = box.getCenter(new THREE.Vector3());
          gltf.scene.position.sub(center.multiplyScalar(scale));

          if (gltf.animations && gltf.animations.length > 0) {
            this.mixer = new THREE.AnimationMixer(gltf.scene);
            gltf.animations.forEach((clip) => {
              this.mixer.clipAction(clip).play();
            });
          }

          this.modelContainer.add(gltf.scene);
          this.modelControlCard.visible = true;
          this.modelInfoText.text = `${startup.name} Twin`;

          this.overviewSideModelBtn.label = 'Reload 3D Virtual Twin';
          this.overviewSideModelBtn.disabled = false;
          this.overviewSideStatusText.text = `✓ ${startup.name} Virtual Twin loaded! Grab, rotate or scale in AR/VR.`;
          this.overviewSideStatusText.style.color = '#34d399';

          const hudSelection = document.getElementById('hud-current-selection');
          if (hudSelection) {
            hudSelection.textContent = `3D Model Loaded: ${startup.name}. You can pinch to manipulate.`;
          }
          this.voiceAssistant.speak(`${startup.name} 3D model is loaded and ready in AR.`);
        },
        (error) => {
          if (loadSeq !== this.modelLoadSeq) return;
          console.error('Error parsing GLTF:', error);
          this.overviewSideStatusText.text = 'Error compiling 3D GLTF model.';
          this.overviewSideStatusText.style.color = '#f87171';
          this.overviewSideModelBtn.disabled = false;
          this.voiceAssistant.speak('Could not render the 3D model.');
        }
      );
    } catch (err) {
      if (loadSeq !== this.modelLoadSeq) return;
      console.error('Failed to convert or load 3D model:', err);
      this.overviewSideStatusText.text = 'Failed to download or convert BM3 model.';
      this.overviewSideStatusText.style.color = '#f87171';
      this.overviewSideModelBtn.disabled = false;
      this.voiceAssistant.speak('Failed to download or convert the 3D model.');
    }
  }

  loadCurrentVideo() {
    const startup = this.filteredStartups[this.currentIndex];
    if (!startup) {
      this.voiceAssistant.speak('Please select a startup first.');
      return;
    }

    if (this.overviewSideStatusText) {
      this.overviewSideStatusText.text = `Playing video: ${startup.name}...`;
      this.overviewSideStatusText.style.color = '#34d399';
    }

    this.videoFallbackStartup = startup;
    this.isUsingVideoFallback = false;
    this.videoMesh.material.map = this.videoTexture;
    this.videoMesh.material.needsUpdate = true;

    this.videoTitleText.text = `${startup.name} - Video Profile`;
    this.videoPlayerGroup.visible = true;

    if (startup.videoURL) {
      this.videoElement.src = startup.videoURL;
      this.videoElement.play().catch(() => {
        this.activateVideoFallbackReel(startup);
      });
    } else {
      this.activateVideoFallbackReel(startup);
    }

    this.voiceAssistant.speak(`Loading video for ${startup.name}.`);
  }

  adjustModelScale(multiplier) {
    if (!this.modelContainer) return;
    this.modelContainer.scale.multiplyScalar(multiplier);
  }

  adjustModelElevation(delta) {
    this.baseModelY += delta;
    this.modelContainer.position.y = this.baseModelY;
  }

  toggleModelAnimation() {
    this.isModelAnimating = !this.isModelAnimating;
    const hudSelection = document.getElementById('hud-current-selection');
    if (hudSelection) {
      hudSelection.textContent = this.isModelAnimating ? 'Animation resumed' : 'Animation paused';
    }
  }

  toggleVRMode() {
    const nextMode = this.vrManager.currentMode === 'AR' ? 'VR' : 'AR';
    this.setVRMode(nextMode);
  }

  setVRMode(mode) {
    const cat = this.getCurrentCategory();
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
        console.warn('XRTransition call error:', err);
      }
    }

    if (mode === 'AR' && xb.core?.scene) {
      xb.core.scene.background = null;
    }

    this.updateVRUI(mode);
  }

  updateVRUI(mode) {
    const isVR = mode === 'VR';
    const cat = this.getCurrentCategory();
    let envTitle = 'Design & Tech Holodeck';
    if (cat === '172') envTitle = 'Life Sciences Medical Cleanroom';
    if (cat === '27') envTitle = 'Sustainable Energy Outside Field';

    if (this.overviewSideVRBtn) {
      this.overviewSideVRBtn.label = isVR ? 'Switch to AR' : 'Switch to VR';
      this.overviewSideVRBtn.icon = isVR ? 'view_in_ar' : 'public';
      this.overviewSideVRBtn.style.backgroundColor = isVR ? '#059669' : '#7c3aed';
    }

    if (this.detailVRBtn) {
      this.detailVRBtn.label = isVR ? 'Switch to AR' : 'Switch to VR';
      this.detailVRBtn.icon = isVR ? 'view_in_ar' : 'public';
      this.detailVRBtn.style.backgroundColor = isVR ? '#059669' : '#7c3aed';
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
        ? `VR Mode Active: ${envTitle}`
        : 'AR Mode Active: Real-world passthrough environment';
    }
  }

  clearLoadedModelGeometry() {
    if (this.currentLoadedModel) {
      this.modelContainer.remove(this.currentLoadedModel);
      this.currentLoadedModel = null;
    }
    if (this.mixer) {
      this.mixer.stopAllAction();
      this.mixer = null;
    }
    this.modelControlCard.visible = false;
    this.modelContainer.scale.set(1, 1, 1);
    this.baseModelY = 1.28;
    this.modelContainer.position.set(0, this.baseModelY, -0.78);
  }

  dismissCurrentModel() {
    this.modelLoadSeq++;
    this.clearLoadedModelGeometry();
    if (this.overviewSideModelBtn) {
      this.overviewSideModelBtn.label = 'Load 3D Virtual Twin';
      this.overviewSideModelBtn.disabled = false;
    }
    if (this.overviewSideStatusText) {
      this.overviewSideStatusText.text = '3D Virtual Twin removed.';
      this.overviewSideStatusText.style.color = '#94a3b8';
    }
  }

  setupHUDControls() {
    const scanBtn = document.getElementById('hud-scan-btn');
    if (scanBtn) {
      scanBtn.addEventListener('click', () => {
        this.triggerProductDetection();
      });
    }

    const twinBtn = document.getElementById('hud-twin-btn');
    if (twinBtn) {
      twinBtn.addEventListener('click', () => {
        this.loadCurrent3DModel();
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
      });
    }

    const voiceBtn = document.getElementById('hud-voice-btn');
    if (voiceBtn) {
      voiceBtn.addEventListener('click', () => {
        this.voiceAssistant.toggle();
        const hudVoice = document.getElementById('hud-voice-status');
        if (hudVoice) hudVoice.textContent = this.voiceAssistant.isListening ? 'Listening...' : 'Voice AI';
      });
    }

    const voiceInput = document.getElementById('hud-voice-input');
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

    document.querySelectorAll('.hint-chip').forEach((chip) => {
      chip.addEventListener('click', (e) => {
        const text = e.target.textContent.replace(/"/g, '').trim();
        if (text) {
          this.voiceAssistant.processTextCommand(text);
        }
      });
    });

    // Desktop Vision Test Inputs: Upload Photo + Live Webcam
    const photoInput = document.getElementById('hud-photo-input');
    const uploadPhotoBtn = document.getElementById('hud-upload-photo-btn');
    const webcamBtn = document.getElementById('hud-webcam-btn');
    const clearSourceBtn = document.getElementById('hud-clear-source-btn');
    const previewWrap = document.getElementById('hud-vision-preview');
    const previewImg = document.getElementById('hud-vision-preview-img');
    const webcamVideo = document.getElementById('hud-webcam-video');
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
          const hudSelection = document.getElementById('hud-current-selection');
          if (hudSelection) {
            hudSelection.textContent = `Webcam unavailable (${err?.message || err}). Use "Upload Test Photo" instead.`;
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

  updateHUDConnectionStatus(status) {
    const elem = document.getElementById('hud-connection-status');
    if (elem) elem.textContent = status;
  }

  update() {
    const delta = xb.getDeltaTime();

    this.vrManager.update(delta);

    if (this.mixer && this.isModelAnimating) {
      this.mixer.update(delta);
    }

    if (this.currentLoadedModel && this.isModelAnimating) {
      this.modelTime += delta;
      this.modelContainer.rotation.y += delta * 0.4;
      this.modelContainer.position.y = this.baseModelY + Math.sin(this.modelTime * 1.8) * 0.025;
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
    this.voiceAssistant.stopAll();
    this.vrManager.dispose();
    this.dismissCurrentModel();
    this.hideVideoPlayer();
    this.videoElement?.remove();
    this.videoTexture?.dispose();
    this.videoFallbackTexture?.dispose();
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const options = new xb.Options();
  options.enableXRTransitions();
  options.setAppTitle('Startup XR Showcase - Standalone JS');
  options.setAppDescription(
    'Interactive 3DEXPERIENCE Lab showroom startup showcase with BM3-to-GLB conversion, computer vision detection, voice AI, and AR/VR modes.'
  );
  options.enableHands();
  options.enableReticles();
  options.enableCamera('environment');
  options.enableDepth();
  options.permissions.camera = true;
  options.permissions.microphone = true;

  xb.add(new StartupShowcaseScript());
  await xb.init(options);
});
