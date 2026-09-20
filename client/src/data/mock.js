export const stats = [
  {
    key: 'papers',
    label: 'Papers',
    value: '4,892',
    delta: '+12% vs 2024',
    deltaPositive: true,
    icon: 'papers',
    tone: 'blue',
    spark: [8, 14, 10, 18, 12, 22, 16, 26, 20, 32],
    sparkTone: 'teal'
  },
  {
    key: 'topics',
    label: 'Topics',
    value: '186',
    delta: '+8% vs 2024',
    deltaPositive: true,
    icon: 'topics',
    tone: 'violet',
    spark: [6, 12, 9, 15, 20, 14, 24, 18, 26, 30],
    sparkTone: 'violet'
  },
  {
    key: 'conferences',
    label: 'Conferences',
    value: '12',
    delta: '+0% vs last year',
    deltaPositive: true,
    icon: 'conferences',
    tone: 'blue',
    spark: null,
    bars: [8, 14, 10, 22, 16, 30, 36]
  },
  {
    key: 'sync',
    label: 'Last sync',
    value: '2 hours ago',
    delta: 'Up to date',
    deltaPositive: true,
    icon: 'sync',
    tone: 'teal',
    spark: null,
    status: true
  }
]

export const hotTopics = [
  { rank: 1, name: 'Diffusion Models', papers: 842, trend: 42, color: '#6c5ce7', spark: [10, 16, 14, 22, 18, 28, 24, 34] },
  { rank: 2, name: '3D Vision', papers: 623, trend: 28, color: '#2dd4bf', spark: [8, 12, 18, 14, 20, 26, 22, 30] },
  { rank: 3, name: 'Vision-Language Models', papers: 598, trend: 35, color: '#5b8def', spark: [6, 14, 10, 20, 16, 26, 22, 32] },
  { rank: 4, name: 'Autonomous Driving', papers: 421, trend: 18, color: '#ffa94d', spark: [12, 10, 16, 14, 20, 18, 24, 22] },
  { rank: 5, name: 'Multimodal Learning', papers: 398, trend: 25, color: '#ff8fab', spark: [8, 14, 12, 18, 24, 20, 28, 26] },
  { rank: 6, name: 'Image Segmentation', papers: 372, trend: 12, color: '#22c38b', spark: [14, 12, 18, 16, 20, 18, 22, 24] },
  { rank: 7, name: 'Generative 3D', papers: 318, trend: 31, color: '#4f7cff', spark: [6, 10, 16, 12, 20, 26, 24, 30] },
  { rank: 8, name: 'Video Understanding', papers: 306, trend: 20, color: '#845ef7', spark: [10, 14, 12, 18, 16, 22, 20, 26] },
  { rank: 9, name: 'Self-Supervised Learning', papers: 287, trend: 16, color: '#0ca678', spark: [12, 16, 14, 18, 22, 20, 24, 26] },
  { rank: 10, name: 'Neural Rendering', papers: 263, trend: 14, color: '#fab005', spark: [10, 12, 16, 14, 18, 22, 20, 24] }
]

export const networkNodes = [
  {
    id: 'vlm',
    name: 'Vision-Language Models',
    color: '#6c5ce7',
    children: [
      { id: 'diffusion', name: 'Diffusion Models', color: '#2dd4bf', children: [
        { name: 'Text-to-Image' }, { name: 'Generative Models' }, { name: 'DiT' }
      ] },
      { id: 'driving', name: 'Autonomous Driving', color: '#ffa94d', children: [
        { name: 'Motion Prediction' }, { name: 'Scene Understanding' }, { name: 'BEV' }
      ] },
      { id: 'segmentation', name: 'Image Segmentation', color: '#ff8fab', children: [
        { name: 'Semantic Segmentation' }, { name: 'Panoptic Segmentation' }, { name: 'Medical Imaging' }
      ] },
      { id: 'vision3d', name: '3D Vision', color: '#4f7cff', children: [
        { name: '3D Reconstruction' }, { name: 'NeRF' }, { name: '3D Detection' }
      ] },
      { id: 'video', name: 'Video Understanding', color: '#845ef7', children: [
        { name: 'Video Generation' }, { name: 'Action Recognition' }, { name: 'Temporal Modeling' }
      ] }
    ]
  }
]

export const recentPapers = [
  {
    title: 'Scalable Vision-Language Models with Mixture of Experts',
    authors: 'Zhang et al.',
    conference: 'CVPR 2025',
    topics: [
      { name: 'Vision-Language Models', color: '#ecebfd', text: '#6c5ce7' },
      { name: 'Multimodal Learning', color: '#e4f8f0', text: '#0ca678' }
    ],
    date: 'Jun 17, 2025'
  },
  {
    title: '4D Gaussian Splatting for Real-time Dynamic Scene Rendering',
    authors: 'Li et al.',
    conference: 'CVPR 2025',
    topics: [
      { name: '3D Vision', color: '#e7efff', text: '#4f7cff' },
      { name: 'Neural Rendering', color: '#fff4e0', text: '#e8890c' }
    ],
    date: 'Jun 16, 2025'
  },
  {
    title: 'DriveWorld: World Model for Autonomous Driving',
    authors: 'Chen et al.',
    conference: 'CVPR 2025',
    topics: [
      { name: 'Autonomous Driving', color: '#ffe9e0', text: '#e8590c' },
      { name: 'World Models', color: '#ffeef3', text: '#d6336c' }
    ],
    date: 'Jun 16, 2025'
  },
  {
    title: 'Towards Generalist Video Understanding',
    authors: 'Wang et al.',
    conference: 'CVPR 2025',
    topics: [
      { name: 'Video Understanding', color: '#ecebfd', text: '#6c5ce7' },
      { name: 'Multimodal Learning', color: '#e4f8f0', text: '#0ca678' }
    ],
    date: 'Jun 15, 2025'
  },
  {
    title: 'Segment Anything in 3D',
    authors: 'Kim et al.',
    conference: 'CVPR 2025',
    topics: [
      { name: '3D Vision', color: '#e7efff', text: '#4f7cff' },
      { name: 'Image Segmentation', color: '#ffeef3', text: '#d6336c' }
    ],
    date: 'Jun 15, 2025'
  }
]

export const libraryPapers = [
  {
    id: 'PP-004892',
    title: 'Scalable Vision-Language Models with Mixture of Experts',
    conference: 'CVPR',
    year: '2025',
    topic: 'Vision-Language',
    status: 'Complete'
  },
  {
    id: 'PP-004891',
    title: '4D Gaussian Splatting for Real-time Dynamic Scene Rendering',
    conference: 'CVPR',
    year: '2025',
    topic: '3D Vision',
    status: 'Complete'
  },
  {
    id: 'PP-004890',
    title: 'DriveWorld: World Model for Autonomous Driving',
    conference: 'CVPR',
    year: '2025',
    topic: 'Autonomous',
    status: 'Needs review'
  },
  {
    id: 'PP-004889',
    title: 'Towards Generalist Video Understanding',
    conference: 'CVPR',
    year: '2025',
    topic: 'Video',
    status: 'Complete'
  },
  {
    id: 'PP-004888',
    title: 'Segment Anything in 3D',
    conference: 'CVPR',
    year: '2025',
    topic: 'Segmentation',
    status: 'Duplicate'
  },
  {
    id: 'PP-004887',
    title: 'NeRF in the Wild: A Survey',
    conference: 'ICCV',
    year: '2023',
    topic: '3D Vision',
    status: 'Complete'
  }
]

export const trendSeries = {
  diffusion: [18, 24, 30, 42, 52, 76],
  vision3d: [20, 27, 34, 45, 58, 64],
  vlm: [12, 19, 30, 38, 53, 70],
  segmentation: [29, 34, 38, 43, 47, 50]
}
