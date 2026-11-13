export function getFormattedTimestamp() {
  const now = new Date();
  return now.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

export function getCategoryName(typeID) {
  const num = Number(typeID);
  switch (num) {
    case 172:
      return 'Life';
    case 27:
      return 'Nature';
    case 376:
      return 'Product';
    default:
      return 'Other';
  }
}

export const FALLBACK_STARTUPS = [
  {
    id: '35020',
    name: 'EEL Energy',
    category: 'Nature',
    typeID: 27,
    commercialDescription:
      'IF WE produce energy using sustainable sources, can we preserve our planet? 20 years of research by Jean-Baptiste Drevet on the coupling between fluids and undulating membranes has allowed him to give life to EEL Energy. The company develops an undulating membrane inspired by bio-mimicry – the motion made by fish swimming – to generate electricity from marine or river currents. Simple, robust, and highly efficient.',
    highQualityURL:
      'https://byme-prod-697c4ef6b5ec31e272ee67749bea4b727f31d5b0.s3.eu-west-1.amazonaws.com/data/geometries/66E5F454-1708-4BFB-A136-19F0F21D60B8/BM3/Lod_0_std.BM3',
    largeResolutionURL:
      'https://byme-prod-697c4ef6b5ec31e272ee67749bea4b727f31d5b0.s3.eu-west-1.amazonaws.com/data/geometries/66E5F454-1708-4BFB-A136-19F0F21D60B8/Thumbnails/512.jpg',
    videoURL: '/video/eel_energy.mp4',
    productSheetUrl: 'https://www.3ds.com/3dexperiencelab/portfolio/eel-energy',
    physicalFeatures: [
      'Flexible undulating membrane or wave hydro-generator fin',
      'Elongated hydrodynamic frame with mast or mooring anchors',
      'Composite fish-tail or eel-like waving surface for tidal energy',
      'Yellow/metallic marine structural components with submersible generator hub'
    ],
  },
  {
    id: '35022',
    name: 'Gyrolift',
    category: 'Life',
    typeID: 172,
    commercialDescription:
      'IF WE have an innovative personal mobility device combining standing and seated postures, can we empower inclusive independence? Gyrolift develops self-balancing robotic mobility solutions for users with reduced mobility in daily and workplace life.',
    highQualityURL:
      'https://byme-prod-697c4ef6b5ec31e272ee67749bea4b727f31d5b0.s3.eu-west-1.amazonaws.com/data/geometries/BD7F63E1-44B7-4FEA-BC35-7F2A281A7BF9/BM3/Lod_0_std.BM3',
    largeResolutionURL:
      'https://byme-prod-697c4ef6b5ec31e272ee67749bea4b727f31d5b0.s3.eu-west-1.amazonaws.com/data/geometries/BD7F63E1-44B7-4FEA-BC35-7F2A281A7BF9/Thumbnails/512.jpg',
    videoURL: '/video/gyrolift.mp4',
    productSheetUrl: 'https://www.3ds.com/3dexperiencelab/portfolio/gyrolift',
    physicalFeatures: [
      'Two-wheeled self-balancing robotic mobility vehicle / gyroscopic chair',
      'Articulated vertical standing mechanism with chest/knee support pads',
      'Compact electric drive chassis with joystick handle controller',
      'Ergonomic molded seat with metallic motorized lifting column'
    ],
  },
  {
    id: 'RJOAvP',
    name: 'Biomotum',
    category: 'Life',
    typeID: 172,
    commercialDescription:
      'IF WE build assistive devices, can we improve the health of nearly 1 billion people? Biomotum develops the SPARK, an intelligent, lightweight, battery-powered ankle exoskeleton designed to deliver joint assistance and resistance for individuals with mobility impairments.',
    highQualityURL:
      'https://byme-prod-697c4ef6b5ec31e272ee67749bea4b727f31d5b0.s3.eu-west-1.amazonaws.com/data/geometries/8F8A71F6-612B-4B40-AF37-9D2000A8C277/BM3/Lod_0_std.BM3',
    largeResolutionURL:
      'https://byme-prod-697c4ef6b5ec31e272ee67749bea4b727f31d5b0.s3.eu-west-1.amazonaws.com/data/geometries/8F8A71F6-612B-4B40-AF37-9D2000A8C277/Thumbnails/512.jpg',
    videoURL: '/video/biomotum.mp4',
    productSheetUrl: 'https://www.3ds.com/3dexperiencelab/portfolio/biomotum',
    physicalFeatures: [
      'Robotic ankle exoskeleton (SPARK) wearable brace',
      'Calf cuff with motorized actuator on lateral side',
      'Carbon fiber heel strut and footplate interface',
      'Compact battery pack and wiring harness for biomechanical gait assistance'
    ],
  },
  {
    id: 'nMxpMN',
    name: 'Endiatx',
    category: 'Life',
    typeID: 172,
    commercialDescription:
      'IF WE create a pill-sized robot, CAN WE redefine medicine from the inside out? Endiatx is developing PillBot™, a micro-robot designed to navigate the human gastrointestinal tract and provide real-time, high-definition optical diagnostics without invasive sedation.',
    highQualityURL:
      'https://byme-prod-697c4ef6b5ec31e272ee67749bea4b727f31d5b0.s3.eu-west-1.amazonaws.com/data/geometries/CBA478EC-61FD-43F6-BBF5-5233BE92F311/BM3/Lod_0_std.BM3',
    largeResolutionURL:
      'https://byme-prod-697c4ef6b5ec31e272ee67749bea4b727f31d5b0.s3.eu-west-1.amazonaws.com/data/geometries/CBA478EC-61FD-43F6-BBF5-5233BE92F311/Thumbnails/512.jpg',
    videoURL: '/video/endiatx.mp4',
    productSheetUrl: 'https://www.3ds.com/3dexperiencelab/portfolio/endiatx',
    physicalFeatures: [
      'Capsule-shaped miniature swallowable robot (PillBot)',
      'Transparent optical dome with camera lens and micro-LED illuminators',
      'Integrated micro-pump waterjet thrusters or intake vents for navigation',
      'Smooth cylindrical medical biocompatible capsule casing'
    ],
  },
  {
    id: '35024',
    name: 'Biomodex',
    category: 'Life',
    typeID: 172,
    commercialDescription:
      'Biomodex develops 3D printed synthetic biomechanical anatomical twins for pre-operative planning and endovascular physician training, replicating human tissue compliance and hemodynamics with surgical fidelity.',
    highQualityURL: '',
    largeResolutionURL:
      'https://images.unsplash.com/photo-1579684385127-1ef15d508118?auto=format&fit=crop&w=600&q=80',
    videoURL: '/video/biomodex.mp4',
    physicalFeatures: [
      'Transparent silicone anatomical vascular cartridge with brain aneurysms or arteries',
      'Clear acrylic fluidics perfusion training station',
      'Realistic red fluid blood-flow mimicking cardiovascular catheter training model'
    ],
  },
  {
    id: '35026',
    name: 'XSun',
    category: 'Nature',
    typeID: 27,
    commercialDescription:
      'Solar-powered autonomous aerial drones engineered with multi-wing architecture to deliver extended flight endurance for environmental surveillance, wildfire prevention, and ocean monitoring.',
    highQualityURL: '',
    largeResolutionURL:
      'https://images.unsplash.com/photo-1508614589041-895b88991e3e?auto=format&fit=crop&w=600&q=80',
    videoURL: '/video/xsun.mp4',
    physicalFeatures: [
      'Tandem double-wing fixed-wing drone aircraft (SolarXOne)',
      'High-efficiency solar photovoltaic panels covering both upper wings',
      'Twin fuselage booms with dual electric push/pull propellers'
    ],
  },
  {
    id: '35028',
    name: 'NetZero',
    category: 'Product',
    typeID: 376,
    commercialDescription:
      'NetZero accelerates tropical biochar production to remove carbon dioxide permanently from the atmosphere while improving soil fertility for local agricultural communities.',
    highQualityURL: '',
    largeResolutionURL:
      'https://images.unsplash.com/photo-1530587191325-3db32d826c18?auto=format&fit=crop&w=600&q=80',
    videoURL: '/video/netzero.mp4',
    physicalFeatures: [
      'Modular pyrolysis reactor and carbonization kiln system',
      'Black porous carbon biochar granules and organic agricultural soil amendments',
      'Industrial heat recycling chimney and hopper feed mechanism'
    ],
  },
  {
    id: '35030',
    name: 'Damae Medical',
    category: 'Life',
    typeID: 172,
    commercialDescription:
      'Optical imaging technology enabling non-invasive deep cellular optical biopsies of skin tissue directly at patient bedside to detect melanoma and skin cancers in real time without excision.',
    highQualityURL: '',
    largeResolutionURL:
      'https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?auto=format&fit=crop&w=600&q=80',
    videoURL: '/video/damaemedical.mp4',
    physicalFeatures: [
      'Handheld optical coherence tomography (OCT) probe',
      'Mobile medical diagnostic cart with touch interface display',
      'Microscopic optical head with precision contact ring for skin scanning'
    ],
  },
  {
    id: '35032',
    name: 'Agreenculture',
    category: 'Product',
    typeID: 376,
    commercialDescription:
      'Autonomous robotics and high-precision GNSS positioning solutions dedicated to sustainable agriculture, soil conservation, and organic weeding without chemical inputs.',
    highQualityURL: '',
    largeResolutionURL:
      'https://images.unsplash.com/photo-1586771107445-d3ca888129ff?auto=format&fit=crop&w=600&q=80',
    videoURL: '/video/agreenculture.mp4',
    physicalFeatures: [
      'Compact tracked autonomous agricultural rover robot (Ceol)',
      'Dual GNSS RTK antenna dome mounts on top mast',
      'Mechanical weeding tines and low-center-of-gravity yellow chassis'
    ],
  },
  {
    id: '35034',
    name: 'BrainSightAI',
    category: 'Life',
    typeID: 172,
    commercialDescription:
      'AI and neuroscience platform mapping functional brain connectomics to transform neuropsychiatric disease detection, neuro-oncology surgery planning, and precision therapeutics.',
    highQualityURL: '',
    largeResolutionURL:
      'https://images.unsplash.com/photo-1559757175-5700dde675bc?auto=format&fit=crop&w=600&q=80',
    videoURL: '/video/brainsight.mp4',
    physicalFeatures: [
      '3D holographic neural connectome brain tractography visualization',
      'Color-coded white matter fiber tracts and neural connectivity hub maps',
      'High-resolution multi-modal fMRI analytics interface'
    ],
  },
];

function parseProductsToStartups(rawData) {
  const productsArray = Array.isArray(rawData)
    ? rawData
    : rawData.products || rawData.data || [];

  const filtered = productsArray.filter((product) => {
    const typeID = Number(product.definition?.typeID);
    const description = product.definition?.commercialDescription;
    const isDeleted = product.isDeleted === true || product.isDeleted === 'true';

    if (
      !description ||
      typeof description !== 'string' ||
      description.trim() === '' ||
      description === 'null' ||
      isDeleted
    ) {
      return false;
    }

    return (
      typeID === 172 ||
      typeID === 27 ||
      typeID === 376 ||
      Boolean(product.presentation?.model3D?.highQualityURL)
    );
  });

  return filtered.map((product) => {
    const name = product.definition?.name || 'Innovation Project';
    const typeID = Number(product.definition?.typeID || 27);
    const safeVideoName = name.toLowerCase().replace(/[^a-z0-9]/g, '_') + '.mp4';
    const highQualityURL = product.presentation?.model3D?.highQualityURL || '';
    const largeResolutionURL =
      product.presentation?.thumbnail?.largeResolutionURL ||
      product.presentation?.thumbnail?.mediumResolutionURL ||
      `https://picsum.photos/seed/${encodeURIComponent(name)}/600/400`;

    const existing = FALLBACK_STARTUPS.find(
      (f) => f.name.toLowerCase() === name.toLowerCase() || f.id === product.definition?.id
    );

    return {
      id: product.definition?.id || Math.random().toString(36).substring(2, 9),
      name,
      commercialDescription:
        product.definition?.commercialDescription || 'No description provided.',
      category: getCategoryName(typeID),
      typeID,
      highQualityURL,
      largeResolutionURL,
      videoURL: `/video/${safeVideoName}`,
      productSheetUrl: product.definition?.productSheetUrl || '',
      physicalFeatures: existing?.physicalFeatures || [
        `${name} showroom hardware product`,
        'High precision engineering prototype',
        'Physical demonstration unit',
      ],
    };
  });
}

export async function fetchStartups() {
  const headers = {
    accept: 'application/json',
    timestamp: getFormattedTimestamp(),
    token: '',
    'X-Byme-Entity-ID': '333',
  };

  const proxyUrl = '/api/byme/3/products?brandID=514&languageID=1&languageCode=en-GB';
  const directUrl =
    'https://platform.by.me/api/3/products?brandID=514&languageID=1&languageCode=en-GB';

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(proxyUrl, { method: 'GET', headers, signal: controller.signal });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      const parsed = parseProductsToStartups(data);
      if (parsed.length > 0) return parsed;
    }
  } catch {
    // try direct
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(directUrl, { method: 'GET', headers, signal: controller.signal });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      const parsed = parseProductsToStartups(data);
      if (parsed.length > 0) return parsed;
    }
  } catch {
    // fallback
  }

  return FALLBACK_STARTUPS;
}
