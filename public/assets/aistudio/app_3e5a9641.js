import * as THREE from 'three';
import * as xb from 'xrblocks';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { fetchStartups } from './apiService.js';
import { convertBm3UrlToGlbBlob } from './bm3Converter.js';
import { VREnvironmentManager } from './vrEnvironment.js';
import { VoiceAssistant } from './voiceService.js';

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
    //this.isModelAnimating = true;
    this.baseModelY = 1.25;
    this.modelTime = 0;

    this.modelContainer.position.set(0, this.baseModelY, -1.0);
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
        if (hudVoice) hudVoice.textContent = this.voiceAssistant.isListening ? 'Listening…' : 'Voice AI';
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

  executeVoiceIntent(intent) {
    switch (intent.intent) {
      case 'load_video':
        this.loadCurrentVideo();
        break;
	  case 'show_overview':
        this.showOverview();
        break;
      case 'next_page':
        if (!this.isOverviewMode) this.showOverview();
        this.navigateOverview(1);
        break;
      case 'previous_page':
        if (!this.isOverviewMode) this.showOverview();
        this.navigateOverview(-1);
        break;
      case 'show_all':
        this.filterCategory('all');
        break;
      case 'filter_category':
        if (intent.categoryName) this.filterCategory(intent.categoryName);
        break;
      case 'goto_index':
        if (intent.gotoIndex) {
          const target = Math.max(1, Math.min(intent.gotoIndex, this.filteredStartups.length)) - 1;
          this.selectStartup(target);
        }
        break;
      case 'goto_name':
        if (intent.gotoName) {
          const nameLower = intent.gotoName.toLowerCase();
          const found = this.filteredStartups.findIndex((s) =>
            s.name.toLowerCase().includes(nameLower)
          );
          if (found !== -1) {
            this.selectStartup(found);
          }
        }
        break;
      case 'load_model':
        this.loadCurrent3DModel();
        break;
      case 'increase_size':
        this.adjustModelScale(intent.scaleFactor || 1.25);
        break;
      case 'decrease_size':
        this.adjustModelScale(intent.scaleFactor || 0.8);
        break;
      case 'move_up':
        this.adjustModelElevation(0.1);
        break;
      case 'move_down':
        this.adjustModelElevation(-0.1);
        break;
      case 'toggle_animation':
        this.toggleModelAnimation();
        break;
      case 'enter_vr':
        this.setVRMode('VR');
        break;
      case 'switch_ar':
        this.setVRMode('AR');
        break;
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
        // 1. Invisible left spacer to balance the Voice AI button
        //new xb.UIPanel({ style: { width: 110 } }), 

        // 2. Title panel with alignItems: 'center' and flexGrow
	new xb.UIPanel({
	  style: { 
		 flexDirection: 'row', 
		 alignItems: 'center', 
		 justifyContent: 'center', 
		 gap: 12, 
		 flexGrow: 1 
	  },
	  children: [
		new xb.UIImage({
		  src: '/logo.png', // Replace this with the actual URL or local path to your logo
		  style: { width: 200, height: 50 }, // Adjust the dimensions to fit your specific logo
		}),
		new xb.UIText({
		  text: '', // Added an em-dash for visual separation (as per your original comment)
		  style: { fontSize: 16, color: '#94a3b8' },
		}),
	  ],
	}),
        
        // 3. Right-aligned Voice AI button, locked to the same width as the left spacer
       /* new xb.UIButton({
          label: 'Voice AI',
          icon: 'mic',
          style: { width: 110, height: 36, paddingLeft: 12, paddingRight: 12, backgroundColor: '#1e3a8a' },
          onClick: () => this.voiceAssistant.toggle(),
        }), */
      ],
    });

    const filterRow = new xb.UIPanel({
      style: {
        width: '100%',
        flexDirection: 'row',
        gap: 8,
        marginTop: 4,
        marginBottom: 4,
      },
      children: [
        new xb.UIButton({
          label: 'All projects',
          style: { flexGrow: 1, height: 34, fontSize: 13 },
          onClick: () => this.filterCategory('all'),
        }),
        new xb.UIButton({
          label: 'Life',
          style: { flexGrow: 1, height: 34, fontSize: 13 },
          onClick: () => this.filterCategory('172'),
        }),
        new xb.UIButton({
          label: 'Nature',
          style: { flexGrow: 1, height: 34, fontSize: 13 },
          onClick: () => this.filterCategory('27'),
        }),
        new xb.UIButton({
          label: 'Product',
          style: { flexGrow: 1, height: 34, fontSize: 13 },
          onClick: () => this.filterCategory('376'),
        }),
      ],
    });

    const row0 = new xb.UIPanel({ style: { width: '100%', minHeight: 90, flexDirection: 'row', gap: 10 } });
    const row1 = new xb.UIPanel({ style: { width: '100%', minHeight: 90, flexDirection: 'row', gap: 10 } });
    const row2 = new xb.UIPanel({ style: { width: '100%', minHeight: 90, flexDirection: 'row', gap: 10 } });
    const row3 = new xb.UIPanel({ style: { width: '100%', minHeight: 90, flexDirection: 'row', gap: 10 } });
    const gridRows = [row0, row1, row2, row3];

	const leftGridColumn = new xb.UIPanel({
		  style: {
			flexGrow: 1, // Decreased from 1 to 0.6 (40% reduction)
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

    // Kept instantiation to prevent breaking updateSideDescription(), but removed from layout below
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
      children: [this.overviewSideTitleText], // Removed overviewSideCategoryText to free up space
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
        height: 155, // Increased height slightly to comfortably fit the multi-line description
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

    this.overviewSideModelBtn = new xb.UIButton({
      label: 'Load 3D Virtual Twin',
      icon: 'view_in_ar',
      style: { width: 200, height: 38, fontSize: 12, backgroundColor: '#2563eb' }, // Automatically shrinks to fit the new video button
      onClick: () => this.loadCurrent3DModel(),
    });

    this.overviewSideVideoBtn = new xb.UIButton({
      label: 'Load Video',
      icon: 'play_arrow', 
      style: { width: 200, height: 38, fontSize: 12, backgroundColor: '#10b981' }, 
      onClick: () => this.loadCurrentVideo(),
    });

    this.overviewSideVRBtn = new xb.UIButton({
      label: 'VR Mode',
      icon: 'public',
      style: { width: 100, height: 38, fontSize: 12, backgroundColor: '#7c3aed' },
      onClick: () => this.toggleVRMode(),
    });

    const sideActionsRow = new xb.UIPanel({
      style: { width: '100%', flexDirection: 'row', gap: 8 },
      children: [this.overviewSideModelBtn, this.overviewSideVideoBtn, this.overviewSideVRBtn],
    });

	const rightDescPanel = new xb.UIPanel({
		  style: {
			width: 460, // 
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
			sideActionsRow,
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
      size: { width: 1.2, height: 'auto' }, // Decreased overall width from 1.54 to 1.4
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

    this.overviewCard.position.set(0, 1.45, -1.35);
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

    const actions = new xb.UIPanel({
      style: { width: '100%', flexDirection: 'row', gap: 10, marginTop: 4 },
      children: [
        this.detailModelBtn,
        new xb.UIButton({
          label: 'VR Mode',
          icon: 'public',
          style: { width: 120, height: 42, backgroundColor: '#7c3aed' },
          onClick: () => this.toggleVRMode(),
        }),
        new xb.UIButton({
          label: 'Back to Grid',
          icon: 'grid_view',
          style: { width: 130, height: 42, backgroundColor: '#334155' },
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

    this.detailCard.position.set(0, 1.45, -1.25);
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
      size: { width: 0.36, height: 'auto' },
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

    this.modelControlCard.position.set(0.65, 1.25, -0.9);
    this.modelControlCard.visible = false;
    this.modelControlCard.name = 'Model Control Palette';
    this.add(this.modelControlCard);
  }

  createVoiceCard() {
    this.voiceStatusText = new xb.UIText({
      text: 'Tap mic or speak commands',
      style: { fontSize: 12, color: '#94a3b8' },
    });

    this.voiceTranscriptText = new xb.UIText({
      text: '"Ask anything about startups or 3D models"',
      style: { fontSize: 13, color: '#e2e8f0', whiteSpace: 'pre-line' },
    });

    this.voiceResponseText = new xb.UIText({
      text: 'Gemini Live Assistant ready.',
      style: { fontSize: 13, color: '#67e8f9', fontWeight: 'bold', whiteSpace: 'pre-line' },
    });

    this.voiceMicBtn = new xb.UIButton({
      label: 'Start Voice Assistant',
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
      size: { width: 0.45, height: 'auto' },
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

    this.voiceCard.position.set(-0.7, 1.25, -1.1);
    this.voiceCard.name = 'Voice Assistant Card';
    this.add(this.voiceCard);
  }

   createVideoPlayerCard() {
    // 1. Create HTML5 Video Element
    this.videoElement = document.createElement('video');
    this.videoElement.crossOrigin = 'anonymous';
    this.videoElement.playsInline = true;
    this.videoElement.style.display = 'none';
    document.body.appendChild(this.videoElement);

    // 2. Create Three.js Video Mesh
    const videoTexture = new THREE.VideoTexture(this.videoElement);
    videoTexture.colorSpace = THREE.SRGBColorSpace;
    const videoMaterial = new THREE.MeshBasicMaterial({ map: videoTexture });
    const videoGeometry = new THREE.PlaneGeometry(1.6, 0.9); // 16:9 Aspect Ratio
    this.videoMesh = new THREE.Mesh(videoGeometry, videoMaterial);
    this.videoMesh.position.set(0, 0.5, 0); // Local position above controls

    // 3. Create UI Controls Card
    this.videoTitleText = new xb.UIText({
      text: 'Playing Video...',
      style: { fontSize: 16, fontWeight: 'bold', color: '#ffffff', textAlign: 'center' },
    });

    const playPauseBtn = new xb.UIButton({
      label: 'Play / Pause',
      icon: 'play_arrow',
      style: { 
        width: 120, // Sets a fixed width instead of stretching
        height: 28, // Decreased from 38
        fontSize: 12, // Scales down the text to fit the smaller button
        backgroundColor: '#2563eb' 
      },
      onClick: () => {
        if (this.videoElement.paused) this.videoElement.play();
        else this.videoElement.pause();
      },
    });

    const closeBtn = new xb.UIButton({
      label: 'Close Video',
      icon: 'close',
      style: { flexGrow: 1, height: 38, backgroundColor: '#dc2626' },
      onClick: () => this.hideVideoPlayer(),
    });

    const controlsRow = new xb.UIPanel({
      style: { width: '100%', flexDirection: 'row', gap: 8, marginTop: 8 },
      children: [playPauseBtn, closeBtn],
    });

    this.videoControlCard = new xb.UICard({
      size: { width: 0.6, height: 'auto' },
      style: {
        flexDirection: 'column',
        gap: 8,
        padding: 12,
        backgroundColor: '#0a0f1dEE',
        borderRadius: 14,
      },
      children: [this.videoTitleText, controlsRow],
    });
    this.videoControlCard.position.set(0, -0.15, 0.05);

    // 4. Group Screen and Controls
    this.videoPlayerGroup = new THREE.Group();
    this.videoPlayerGroup.xb = { manipulation: true };
    this.videoPlayerGroup.add(this.videoMesh);
    this.videoPlayerGroup.add(this.videoControlCard);

    // 5. Position to the right of the Overview Card and angle it inward
    this.videoPlayerGroup.position.set(1.5, 1.45, -1.15);
    this.videoPlayerGroup.rotation.y = -0.35; // Angle slightly toward the center
    this.videoPlayerGroup.visible = false;
    this.add(this.videoPlayerGroup);
  }

  hideVideoPlayer() {
    this.videoElement.pause();
    this.videoElement.src = ''; // Clear source to stop buffering
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
        tile.title.text = `#${itemIdx + 1} ${startup.name}`;
        tile.cat.text = startup.category;

        const cleanDesc = startup.commercialDescription.replace(/\s+/g, ' ').trim();
        tile.snippet.text = cleanDesc.slice(0, 72) + '...';
        tile.image.src = startup.largeResolutionURL || 'https://picsum.photos/seed/startup/200/200';

        const isSelected = itemIdx === this.currentIndex;
        tile.container.style.borderColor = isSelected ? '#38bdf8' : 'rgba(255, 255, 255, 0.08)';
        tile.container.style.backgroundColor = isSelected ? 'rgba(30, 58, 138, 0.65)' : 'rgba(30, 41, 59, 0.7)';
      } else {
        tile.container.visible = false;
      }
    }

    if (this.filteredStartups.length > 0) {
      if (this.currentIndex < startIdx || this.currentIndex >= startIdx + this.pageSize) {
        this.currentIndex = startIdx;
      }
      this.updateSideDescription(this.currentIndex);
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
    if (this.detailStatusText) {
      this.detailStatusText.text = this.overviewSideStatusText.text;
      this.detailStatusText.style.color = this.overviewSideStatusText.style.color;
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

  filterCategory(category) {
    this.activeFilter = category;
    if (category === 'all') {
      this.filteredStartups = [...this.allStartups];
    } else {
      const catNum = Number(category);
      this.filteredStartups = this.allStartups.filter((s) => Number(s.typeID) === catNum);
    }
    this.overviewPageIndex = 0;
    this.currentIndex = 0;
    this.updateOverviewGrid();

    if (this.vrManager && this.vrManager.currentMode === 'VR') {
      this.vrManager.setCategory(category);
      this.updateVRUI('VR');
    }

    document.querySelectorAll('.hud-filter-btn').forEach((btn) => {
      if (btn.getAttribute('data-cat') === String(category)) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    const hudSelection = document.getElementById('hud-current-selection');
    if (hudSelection) {
      hudSelection.textContent = `Filtered ${this.filteredStartups.length} startups in category`;
    }
  }

  selectStartup(index) {
    if (index < 0 || index >= this.filteredStartups.length) return;
    this.currentIndex = index;
    const startup = this.filteredStartups[index];

    const startIdx = this.overviewPageIndex * this.pageSize;
    for (let i = 0; i < this.pageSize; i++) {
      const itemIdx = startIdx + i;
      const tile = this.startupTilePanels[i];
      if (tile && tile.container) {
        const isSelected = itemIdx === index;
        tile.container.style.borderColor = isSelected ? '#38bdf8' : 'rgba(255, 255, 255, 0.08)';
        tile.container.style.backgroundColor = isSelected ? 'rgba(30, 58, 138, 0.65)' : 'rgba(30, 41, 59, 0.7)';
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
      hudSelection.textContent = `Selected: ${startup.name} (${startup.category})`;
    }
  }

  async loadCurrent3DModel() {
    const startup = this.filteredStartups[this.currentIndex];
    if (!startup || !startup.highQualityURL) return;

    this.detailModelBtn.disabled = true;
    this.detailModelBtn.label = 'Converting BM3 to GLB…';
    this.detailStatusText.text = 'Downloading BM3 archive & constructing binary GLB in memory…';
    this.detailStatusText.style.color = '#60a5fa';

    try {
      const glbBlob = await convertBm3UrlToGlbBlob(startup.highQualityURL);
      const arrayBuffer = await glbBlob.arrayBuffer();

      this.dismissCurrentModel();

      const loader = new GLTFLoader();
      loader.parse(
        arrayBuffer,
        '',
        (gltf) => {
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

          this.detailModelBtn.label = 'Reload 3D Virtual Twin';
          this.detailModelBtn.disabled = false;
          this.detailStatusText.text = `✓ ${startup.name} Virtual Twin loaded! Grab, rotate or scale in AR/VR.`;
          this.detailStatusText.style.color = '#34d399';

          const hudSelection = document.getElementById('hud-current-selection');
          if (hudSelection) {
            hudSelection.textContent = `3D Model Loaded: ${startup.name}. You can pinch to manipulate.`;
          }
        },
        (error) => {
          console.error('Error parsing GLTF:', error);
          this.detailStatusText.text = 'Error compiling 3D GLTF model.';
          this.detailStatusText.style.color = '#f87171';
          this.detailModelBtn.disabled = false;
        }
      );
    } catch (err) {
      console.error('Failed to convert or load 3D model:', err);
      this.detailStatusText.text = 'Failed to download or convert BM3 model.';
      this.detailStatusText.style.color = '#f87171';
      this.detailModelBtn.disabled = false;
    }
  }

  loadCurrentVideo() {
    const startup = this.filteredStartups[this.currentIndex];
    if (!startup || !startup.videoURL) {
      if (this.overviewSideStatusText) {
        this.overviewSideStatusText.text = 'No video available for this project.';
        this.overviewSideStatusText.style.color = '#f87171';
      }
      return;
    }

    if (this.overviewSideStatusText) {
      this.overviewSideStatusText.text = `Playing video: ${startup.name}...`;
      this.overviewSideStatusText.style.color = '#34d399';
    }

    // Setup and show video player side-by-side
    this.videoTitleText.text = `${startup.name} - Video Profile`;
    this.videoElement.src = startup.videoURL;
    this.videoPlayerGroup.visible = true;

    // Play video
    this.videoElement.play().catch(e => {
      console.warn('Video autoplay blocked. User must press play manually.', e);
    });
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
      this.overviewSideVRBtn.label = isVR ? 'Back to AR' : 'VR Mode';
      this.overviewSideVRBtn.icon = isVR ? 'view_in_ar' : 'public';
      this.overviewSideVRBtn.style.backgroundColor = isVR ? '#059669' : '#7c3aed';
    }

    if (this.modelVRBtn) {
      this.modelVRBtn.label = isVR ? 'Back to AR' : 'VR Dome';
      this.modelVRBtn.icon = isVR ? 'view_in_ar' : 'public';
      this.modelVRBtn.style.backgroundColor = isVR ? '#059669' : '#7c3aed';
    }

    const hudLabel = document.getElementById('hud-vr-btn-label');
    if (hudLabel) {
      hudLabel.textContent = isVR ? 'Back to AR' : 'VR Mode';
    }

    const hudSelection = document.getElementById('hud-current-selection');
    if (hudSelection) {
      hudSelection.textContent = isVR
        ? `VR Mode Active: ${envTitle}`
        : 'AR Mode Active: Real-world passthrough environment';
    }
  }

  dismissCurrentModel() {
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
    this.baseModelY = 1.25;
    this.modelContainer.position.set(0, this.baseModelY, -1.0);
  }

  setupHUDControls() {
    document.querySelectorAll('.hud-filter-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const cat = e.currentTarget.getAttribute('data-cat') || 'all';
        this.filterCategory(cat);
      });
    });

    const vrBtn = document.getElementById('hud-vr-btn');
    if (vrBtn) {
      vrBtn.addEventListener('click', () => this.toggleVRMode());
    }

    const voiceBtn = document.getElementById('hud-voice-btn');
    if (voiceBtn) {
      voiceBtn.addEventListener('click', () => {
        this.voiceAssistant.toggle();
        const hudVoice = document.getElementById('hud-voice-status');
        if (hudVoice) hudVoice.textContent = this.voiceAssistant.isListening ? 'Listening…' : 'Voice AI';
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
  }

  dispose() {
    this.voiceAssistant.stop();
    this.vrManager.dispose();
    this.dismissCurrentModel();
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const options = new xb.Options();
  options.enableXRTransitions();
  options.setAppTitle('Startup XR Showcase');
  options.setAppDescription(
    'Interactive 3DEXPERIENCE Lab startup showcase with BM3-to-GLB conversion, voice AI, and AR/VR modes.'
  );
  options.enableHands();
  options.enableReticles();

  xb.add(new StartupShowcaseScript());
  await xb.init(options);
});
