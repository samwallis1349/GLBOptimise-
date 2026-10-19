/**
 * Graphic Illustration Portfolio & Studio Data
 * All content is editable and structured for high-end editorial display.
 */

export const STUDIO_INFO = {
  name: 'Sam',
  brandSymbol: 'S',
  badge: 'Graphic Design',
  tagline: 'Ideas, illustrated. Worlds, imagined.',
  subheading: 'Original graphic design, vector identity, and visual storytelling for businesses, games and ambitious creative projects.',
  artistName: 'Sam',
  artistTitle: 'Graphic Designer',
  location: 'United Kingdom',
  email: 'sam@assetbench.co.uk',
  availability: 'Available for Q4 2026 & 2027 Commissions',
  social: {
    instagram: 'https://instagram.com',
    artstation: 'https://artstation.com',
    dribbble: 'https://dribbble.com',
    behance: 'https://behance.net',
    github: 'https://github.com',
  },
};

export const CATEGORIES = [
  'All Work',
  'Character Illustration',
  'Isometric Worlds',
  'Brand Illustration',
  'Game Art and Assets',
  'Editorial Illustration',
  'Mascots and Characters',
];

export const PROJECTS = [
  {
    id: 'stargazer-of-sol',
    title: 'The Stargazer of Sol',
    category: 'Character Illustration',
    tagline: 'Narrative character design rooted in textile warmth and celestial brass mechanics.',
    image: '/illustration/portfolio-character.jpg',
    span: 'tall',
    year: '2026',
    format: 'Digital Painting & Vector Accents',
    role: 'Character Design & Visual Storytelling',
    overview:
      'Created as a primary protagonist study for an atmospheric adventure narrative. The character balances human vulnerability with intricate costume design—featuring a heavyweight wool traveling cloak, hand-tooled brass astrolabe, and expressive lighting that guides the viewer’s eye toward celestial wonder.',
    artDirection:
      'Focus on organic tactile textures rather than glossy digital plastic. The cloak weaves, brass patina, and stippled skin tones were hand-painted to evoke early 20th-century storybook illustrations modernized with clean graphic silhouettes.',
    palette: ['#F7F6F2', '#D97706', '#9A3412', '#334155', '#10100E'],
    deliverables: ['Full-body Character Sheet', 'Expression & Gesture Studies', 'Layered 4K Master', 'Color & Tone Variants'],
    conceptNote: 'Independent concept developed for editorial publication and narrative worldbuilding.',
  },
  {
    id: 'cloud-terraces-aethel',
    title: 'The Cloud Terraces of Aethel',
    category: 'Isometric Worlds',
    tagline: 'Floating agricultural architecture and copper observatories above twilight mists.',
    image: '/illustration/portfolio-isometric.jpg',
    span: 'wide',
    year: '2026',
    format: 'Isometric Vector & Digital Matte',
    role: 'Environment Design & World Architecture',
    overview:
      'A sprawling isometric cross-section of a tranquil airborne biome. Stepped tea plantations cascade into crystalline turquoise falls, connected by cantilevered stone bridges and guarded by an astronomical dome catching the last golden hour warmth.',
    artDirection:
      'Strict 30-degree isometric projection paired with atmospheric depth fading. Soft cloud particulate wraps around the lower strata while sharp architectural geometry remains instantly readable at both desktop scale and mobile viewing.',
    palette: ['#F7F6F2', '#F59E0B', '#10B981', '#0E7490', '#10100E'],
    deliverables: ['High-Resolution Vector Panorama', 'Layered Environment Breakdown', 'Lighting & Shadow Map Pass', 'Interactive Crop Points'],
    conceptNote: 'Worldbuilding art direction and visual exploratory for prospective interactive media.',
  },
  {
    id: 'kinetic-flow-brand-identity',
    title: 'Kinetic Flow: Brand Identity System',
    category: 'Brand Illustration',
    tagline: 'Fluid abstract geometry meeting restrained Scandinavian typography and warm earthy palettes.',
    image: '/illustration/portfolio-brand.jpg',
    span: 'regular',
    year: '2026',
    format: 'Precision Vector & 3D Shading',
    role: 'Brand Illustration & Visual System',
    overview:
      'An expansive illustrative identity crafted for an emerging creative technology studio. The visual system uses ribbons of continuous movement to symbolize the transition of rough ideas into structured, polished digital products.',
    artDirection:
      'Restrained, deliberate, and free of unnecessary noise. The ribbon forms combine mathematical bezier curvature with tactile paper-like micro-grain, ensuring the brand feels human rather than algorithmically generated.',
    palette: ['#F7F6F2', '#D97706', '#EA580C', '#451A03', '#10100E'],
    deliverables: ['Master Hero Key Visual', 'Modular Vector Icon Set', 'Editorial Section Headers', 'Brand Guidelines Asset Kit'],
    conceptNote: 'Commissioned exploratory brand system for creative studio collateral and launch communications.',
  },
  {
    id: 'relics-sunken-citadel',
    title: 'Relics of the Sunken Citadel',
    category: 'Game Art and Assets',
    tagline: 'Stylized 2.5D prop sheets, bioluminescent artifacts, and cartographic charts for indie games.',
    image: '/illustration/portfolio-game-art.jpg',
    span: 'regular',
    year: '2026',
    format: 'Game-Ready Isometric Sprites',
    role: 'Game Art, Prop Design & Asset Pipeline',
    overview:
      'A modular suite of fantasy game assets tailored for isometric and 2.5D game engines. Includes ancient brine-encrusted chests, brass dive lanterns, luminous alchemy vials, and celestial maritime maps.',
    artDirection:
      'High readability at small sprite resolutions with delightful painterly details on zoom. Built to drop directly into Unity, Godot, and Three.js environments with premultiplied alpha and clean silhouette edges.',
    palette: ['#F7F6F2', '#D97706', '#065F46', '#1E293B', '#10100E'],
    deliverables: ['Atlas Sprite Sheets', 'PBR Roughness & Normal Maps', 'Individual Transparent PNGs', 'Modular Prop Variations'],
    conceptNote: 'Production-ready game art demo developed for AssetBench interactive showcase.',
  },
  {
    id: 'archie-studio-automaton',
    title: 'Archie: The Studio Automaton',
    category: 'Mascots and Characters',
    tagline: 'A tactile brass-and-ceramic companion designed to bring warmth to technical workflows.',
    image: '/illustration/portfolio-mascot.jpg',
    span: 'tall',
    year: '2026',
    format: 'Character Illustration & Turnaround Sheet',
    role: 'Mascot Design & Brand Personality',
    overview:
      'Archie is the official studio companion—a diminutive robot crafted from unglazed cream ceramic, polished bronze joints, and expressive ocular displays. He holds an oversized drafting pencil and inspects every piece of art before delivery.',
    artDirection:
      'Inspired by vintage Braun industrial design and stop-motion puppet physics. Archie avoids overly cute clichés in favor of earnest craftsmanship, tangible mechanical plausibility, and subtle comedic timing.',
    palette: ['#F7F6F2', '#B45309', '#78350F', '#64748B', '#10100E'],
    deliverables: ['Full Turnaround Model Sheet', '24 Expressive Pose Vignettes', 'Vector Mascot Library', 'Animated UI Sticker Set'],
    conceptNote: 'Original studio mascot designed to represent genuine handcrafted digital artistry.',
  },
  {
    id: 'architects-of-imagination',
    title: 'Architects of Imagination',
    category: 'Editorial Illustration',
    tagline: 'Editorial commentary on creative courage, drafting desks, and ideas taking flight.',
    image: '/illustration/portfolio-editorial.jpg',
    span: 'wide',
    year: '2026',
    format: 'Fine Line Vector & Gouache Wash',
    role: 'Editorial Art Direction & Cover Design',
    overview:
      'Created for a feature essay examining how physical sketching and patient ideation resist the rush of disposable digital content. The central figure sketches birds of folded parchment that rise into an expansive, sun-drenched horizon.',
    artDirection:
      'Oversized negative space, bold silhouette contrasts, and subtle risograph-style paper textures. Warm ivory and burnt amber create an inviting, contemplative atmosphere that complements long-form editorial journalism.',
    palette: ['#F7F6F2', '#D97706', '#9A3412', '#44403C', '#10100E'],
    deliverables: ['Double-page Magazine Spread', 'Spot Illustration Accents', 'Digital Article Banners', 'Archival Art Print Edition'],
    conceptNote: 'Editorial concept illustrating the enduring value of human artistic direction and craft.',
  },
];

export const PAST_LOGOS = [
  {
    id: 'abp-law-firm',
    title: 'ABP Law Firm, PC',
    category: 'Legal & Corporate Identity',
    badge: 'Heraldic Crest',
    description:
      'Authoritative corporate crest featuring neoclassical pillars, balance of justice scale, sculpted heraldic shield, and laurel wreath framing in navy and warm gold.',
    image: '/illustration/logos/preview.png',
    isSvg: false,
    accent: '#1E3A8A',
    notes: 'Engineered for corporate stationery, gold foil letterheads, embossed business cards, and storefront bronze plaques.',
    year: 'Brand Identity',
    format: 'Corporate Identity Suite',
    deliverables: ['Primary Crest Mark', 'Wordmark Lockup', 'Stationery & Gold Foil Prep', 'Favicon & Social Tile'],
    palette: ['#0F172A', '#D97706', '#F8FAFC', '#94A3B8'],
  },
  {
    id: 'stride-projects',
    title: 'Stride Projects',
    category: 'Brand Identity Suite',
    badge: 'Full Multi-Format Suite',
    description:
      'Multi-platform commercial identity featuring an isometric geometric S-ribbon icon with bold condensed typography, delivered across full colour, reverse dark, and mono print.',
    image: '/illustration/logos/versions.png',
    isSvg: false,
    accent: '#0891B2',
    notes: 'Includes square social media tile, circular profile avatar, high-visibility browser favicon, and production monochrome assets.',
    year: 'Brand System',
    format: 'Complete 6-Asset Brand Suite',
    deliverables: ['Full Colour Master', 'Dark Background Reverse', '1-Colour Black Print', 'Social Media & Favicon Assets'],
    palette: ['#0E7490', '#F59E0B', '#1E293B', '#F8FAFC'],
  },
  {
    id: 'critical-drive-systems',
    title: 'Critical Drive Systems',
    category: 'Engineering & Industrial Mark',
    badge: 'Powertrain Vector',
    description:
      'High-impact engineering identity combining an electric stator with copper windings, brushed metallic rotor housing, and dynamic speed vector blades.',
    image: '/illustration/logos/4preview.png',
    isSvg: false,
    accent: '#0284C7',
    notes: 'Combines technical mechanical drafting with stylized automotive branding for high-torque electric propulsion systems.',
    year: 'Industrial Mark',
    format: 'Engineering Vector & 3D Shading',
    deliverables: ['Industrial Key Visual', 'Vector Silhouette', 'Embossed Decal Master', 'Digital Application Formats'],
    palette: ['#0369A1', '#EA580C', '#0F172A', '#E2E8F0'],
  },
  {
    id: 'blushop',
    title: 'Blushop | بلوشاپ',
    category: 'E-Commerce & Retail Brand',
    badge: '3D Retail Mark',
    description:
      'Vibrant bilingual e-commerce identity featuring a glossy azure shopping bag embraced by an orbital cart ring, with harmonious Latin and Arabic typography.',
    image: '/illustration/logos/2preview.png',
    isSvg: false,
    accent: '#2563EB',
    notes: 'Engineered for high visibility on mobile app stores, app launcher icons, delivery packaging, and responsive digital storefronts.',
    year: 'Retail Brand',
    format: '3D Gloss Mark & Bilingual Typography',
    deliverables: ['Bilingual Master Logo', '3D App Launcher Icon', 'Packaging Stamp Master', 'Favicon & Mobile Assets'],
    palette: ['#2563EB', '#60A5FA', '#0F172A', '#FFFFFF'],
  },
  {
    id: 'cfgrow',
    title: 'Cfgrow',
    category: 'Financial Technology',
    badge: 'Full Multi-Format Suite',
    description:
      'Financial growth identity showcasing circular upward metric bar charts with a golden acceleration arc across full colour, negative space dark mode, and single-colour print.',
    image: '/illustration/logos/1versions.png',
    isSvg: false,
    accent: '#B45309',
    notes: 'Standardized across full color corporate decks, negative space dark mode, single-ink invoice headers, and high-density tab favicons.',
    year: 'Brand System',
    format: 'Complete 6-Asset Brand Suite',
    deliverables: ['Full Colour Master', 'Dark Background Negative', 'Mono Print Version', 'Square & Profile Icons'],
    palette: ['#0F2942', '#D97706', '#1E293B', '#F1F5F9'],
  },
  {
    id: 'checkmk-uk',
    title: 'Checkmk UK',
    category: 'Tech & Infrastructure',
    badge: 'Isometric Vector',
    description:
      'Geometric isometric hexagon mark framing an ascending dimensional chevron arrow in vivid emerald and mint, communicating system monitoring and uptime growth.',
    image: '/illustration/logos/3preview.png',
    isSvg: false,
    accent: '#059669',
    notes: 'Crisp modern tech identity with clean sans-serif typography, highly readable from 16px server status indicators up to conference booths.',
    year: 'Tech Vector',
    format: 'Precision Vector Geometry',
    deliverables: ['Isometric Hexagon Mark', 'Horizontal Wordmark', 'High-DPI App Icon', 'Monochrome Vector Masters'],
    palette: ['#059669', '#34D399', '#0F172A', '#F0FDF4'],
  },
  {
    id: 'wholesale-bargains',
    title: 'Wholesale Bargains Midlands',
    category: 'Commercial Retail Wordmark',
    badge: 'High-Impact Logotype',
    description:
      'Bold commercial retail logotype engineered with high-contrast magenta badge framing and clean modern typography for prominent storefronts and fleet liveries.',
    image: '/illustration/logos/1preview.png',
    isSvg: false,
    accent: '#DB2777',
    notes: 'Optimized for wide-format outdoor banners, commercial vehicles, printed flyers, and responsive digital retail promotions.',
    year: 'Retail Wordmark',
    format: 'Commercial Retail Logotype',
    deliverables: ['Primary Wordmark Master', 'Horizontal Billboard Lockup', 'Fleet Decal Vector', 'Single-Color Stamp'],
    palette: ['#DB2777', '#BE185D', '#1E293B', '#FFFFFF'],
  },
];

export const FEATURED_PROJECT = {
  headline: 'Small details. Entire worlds.',
  subheading:
    'An expansive look inside an imaginary multi-level creative atelier—where ideas are forged, miniature craftsmen debate over blueprints, and every corner rewards the curious eye.',
  image: '/illustration/featured-studio.jpg',
  highlights: [
    { title: 'Layered Scenery', desc: 'Three distinct architectural tiers capturing drafting, physical sculpting, and library research.' },
    { title: 'Controlled Lighting', desc: 'Warm amber brass pendant lights cast soft volumetric warmth against industrial steel windows.' },
    { title: 'Expressive Characters', desc: 'Miniature figures in dynamic poses—each engaged in authentic studio rituals.' },
    { title: 'Unified Visual Language', desc: 'Consistent line weights and tactile palettes ensuring harmony across the entire composition.' },
  ],
};

export const SERVICES = [
  {
    id: 'custom-illustration',
    num: '01',
    title: 'Custom Graphic Illustration',
    description:
      'Bespoke hero artworks, marketing key visuals, and editorial centerpieces. Designed to turn complex narratives into emotionally resonant imagery that stays with audiences.',
    deliverables: ['Editorial spreads', 'Website hero art', 'Book & album covers', 'Packaging graphics'],
  },
  {
    id: 'character-mascot-design',
    num: '02',
    title: 'Character and Mascot Design',
    description:
      'Memorable protagonists and brand mascots bursting with personality. Built from thumbnail sketches through model sheets, turnaround poses, and expressive icon sets.',
    deliverables: ['Brand ambassadors', 'Game protagonists', 'Turnaround model sheets', 'Expression libraries'],
  },
  {
    id: 'isometric-environments',
    num: '03',
    title: 'Isometric Environment Art',
    description:
      'Intricate diorama cutaways, floating worldscapes, and architectural cross-sections. Perfect for interactive explainer journeys, games, and premium product pages.',
    deliverables: ['Diorama cityscapes', 'Floating biomes', 'Technical cross-sections', 'Game world maps'],
  },
  {
    id: 'game-art-assets',
    num: '04',
    title: 'Game Art and Asset Creation',
    description:
      'Production-ready 2D and 2.5D game art. Props, item icons, tileable backgrounds, and UI assets optimized for seamless engine integration and crisp rendering.',
    deliverables: ['Isometric sprite sheets', 'Item & inventory icons', 'UI theme elements', 'Tileable terrain kits'],
  },
  {
    id: 'brand-marketing-graphics',
    num: '05',
    title: 'Brand and Marketing Graphics',
    description:
      'Cohesive illustrative systems that elevate company identities above generic vector stock. We create a distinctive brand style guide and modular library of assets.',
    deliverables: ['Brand illustration systems', 'Feature onboarding art', 'Marketing campaign kits', 'Vector iconography'],
  },
  {
    id: 'ai-assisted-refinement',
    num: '06',
    title: 'AI-Assisted Illustration Refinement',
    description:
      'Professional human art direction for AI outputs. We take raw concept renders, fix anatomical flaws, redraw clean vector contours, harmonize color palettes, and deliver production-grade master files.',
    deliverables: ['Vector master redraws', 'Anatomy & perspective fixes', 'Color & lighting balancing', 'Commercial file prep'],
  },
];

export const PRINCIPLES = [
  {
    title: 'Concept before styling',
    desc: 'Great illustration is problem solving in disguise. Every piece starts with a narrative hook, clear purpose, and emotional intent before ornamental lines are placed.',
  },
  {
    title: 'Depth through nuance',
    desc: 'Light, delicate paper grain, and layered atmospheric perspective breathe genuine warmth into digital compositions that flat vectors cannot emulate.',
  },
  {
    title: 'Craftsmanship that scales',
    desc: 'From an 80px social avatar to an 8-meter billboard, every path is manually closed, optimized, and built to survive the harshest production requirements.',
  },
  {
    title: 'Every pixel has purpose',
    desc: 'We discard decorative noise to let the heart of the artwork speak. Generous whitespace gives the eye space to breathe and appreciate the craft.',
  },
];

export const ABOUT_COPY = {
  headline: 'A little imagination goes a long way.',
  paragraphs: [
    'I combine graphic design, thoughtful typography, and meticulous visual craft to create memorable brand identities and artwork for digital products, games, and forward-thinking businesses.',
    'Over the years, my work has spanned commercial brand identity suites, complete logo vector packages, narrative character design, miniature isometric dioramas, and vector restorations. I believe the best design doesn’t merely decorate a page—it creates an emotional anchor that makes visitors stop scrolling and remember who you are.',
    'Based in the UK, I collaborate directly with founders, creative directors, and indie game studios worldwide. Whether you need an enduring brand identity package, custom vector mark, or a complete illustrative world, every project is handled with patient craft, honest communication, and obsessive attention to detail.',
  ],
  quote: '“Design is the bridge between what an idea is and what it feels like.”',
};
