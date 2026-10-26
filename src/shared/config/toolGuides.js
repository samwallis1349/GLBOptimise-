/**
 * Plain-language guide shown under a tool: what it is for, how to use it and
 * common questions. Rendered visibly on the tool page (ToolGuide.js) and into
 * the static HTML crawlers read (scripts/seo-pages.mjs), so the two always
 * match. Keep answers true to what the tool actually does.
 */
export const TOOL_GUIDES = {
  'optimise-glb': {
    heading: 'How to compress a GLB file',
    intro: [
      'Optimise GLB shrinks a GLB or glTF model so it downloads and loads faster on the web, in game engines and in AR. It welds duplicate vertices, removes unused data, quantises vertex attributes, compresses geometry with Draco or Meshopt and can downscale and re-encode textures, all in one pass.',
      'Everything runs in your browser. Your model is never uploaded, so it works on unreleased and client work, and you can compare the result side by side with the original before you download it.',
    ],
    steps: [
      'Drop a .glb or .gltf file onto the page.',
      'Pick a preset, or choose Draco or Meshopt compression and a maximum texture size yourself.',
      'Check the before and after sizes and the side-by-side preview.',
      'Download the optimised GLB.',
    ],
    faqs: [
      {
        q: 'Should I use Draco or Meshopt?',
        a: 'Draco usually gives the smallest geometry, but decoding it costs some CPU time when the model loads. Meshopt files are often slightly larger but decode much faster and also compress animation data. Three.js, Babylon.js and model-viewer support both; check what your engine or platform supports before choosing.',
      },
      {
        q: 'Why is my GLB still large after compression?',
        a: 'In most models the textures, not the geometry, make up most of the file. Lowering the maximum texture size (for example from 4K to 2K or 1K) or switching to WebP or KTX2 textures usually saves far more than geometry compression alone.',
      },
      {
        q: 'Does optimising change how the model looks?',
        a: 'Welding, pruning and compression are designed to be visually lossless. Quantisation, texture downscaling and simplification trade a little detail for size, which is why the tool shows the original and the result side by side before you download.',
      },
      {
        q: 'Is my model uploaded anywhere?',
        a: 'No. The whole process runs locally in your browser, and the file never leaves your device.',
      },
    ],
  },

  'reduce-polys': {
    heading: 'How to reduce the polygon count of a 3D model',
    intro: [
      'Reduce Polys lowers the triangle count of a GLB or glTF model while keeping its shape, so it renders faster in games, on mobile, in WebGL and in VR. It uses mesh simplification that can protect material boundaries, UV seams and normals, so textures stay where they belong.',
      'Choose a Light, Medium or Heavy preset or set your own target, then check the simplified mesh and its wireframe before downloading. It all runs in your browser, with nothing uploaded.',
    ],
    steps: [
      'Drop a .glb or .gltf model onto the page.',
      'Choose a preset or set a custom reduction target.',
      'Check the new triangle count and the wireframe preview.',
      'Download the reduced GLB.',
    ],
    faqs: [
      {
        q: 'How many polygons should a game model have?',
        a: 'It depends on the platform and how big the object appears on screen. As a rough guide, small props on mobile often sit in the hundreds to a few thousand triangles, and hero characters in the low tens of thousands. On desktop and console the budgets are much higher. Check your engine and target hardware rather than relying on one number.',
      },
      {
        q: 'Will reducing polygons break my textures?',
        a: 'Protecting UV seams and material boundaries keeps textures mapped correctly. Very heavy reductions can still soften fine detail, so compare the result with the original before you use it.',
      },
      {
        q: 'Does it work on animated or rigged models?',
        a: 'The simplifier can keep skinning data (joints and weights), morph targets and animations. Heavily reduced rigged meshes can deform less cleanly, so test the result in your engine.',
      },
      {
        q: 'What is the difference between reducing polys and generating LODs?',
        a: 'Reduce Polys makes one lighter version of your model. Generate LODs makes several versions at different detail levels, so an engine can swap to a simpler one as the object moves further away.',
      },
    ],
  },

  'compress-textures': {
    heading: 'How to compress the textures in a 3D model',
    intro: [
      'Compress Textures resizes and re-encodes the textures inside a GLB or glTF model, which is usually the quickest way to make a model much smaller. Set a maximum size from 4K down to 256, and choose WebP, JPEG, PNG, AVIF or GPU-ready KTX2 (Basis ETC1S or UASTC).',
      'The model keeps its geometry and materials; only the images change. It runs in your browser, so nothing is uploaded.',
    ],
    steps: [
      'Drop a .glb or .gltf model onto the page.',
      'Choose a maximum texture size and an output format.',
      'Check the new file size and preview the result.',
      'Download the model with compressed textures.',
    ],
    faqs: [
      {
        q: 'What is KTX2 and when should I use it?',
        a: 'KTX2 with Basis Universal compression stays compressed in GPU memory, unlike JPEG, PNG and WebP, which the GPU has to unpack to full size. That means less video memory and faster loading on mobile and VR. ETC1S gives the smallest files; UASTC keeps more quality and suits normal maps.',
      },
      {
        q: 'WebP or JPEG?',
        a: 'WebP is usually smaller than JPEG at similar quality and supports transparency. Most modern engines and browsers accept WebP textures in glTF; if a target does not, use JPEG for colour maps and PNG where you need exact values.',
      },
      {
        q: 'What texture size should I use?',
        a: 'For mobile and the web, 1K or 2K is enough for most objects; keep 4K for large surfaces or hero assets seen up close. Halving the resolution cuts the pixel count to a quarter.',
      },
    ],
  },

  'generate-lods': {
    heading: 'How to generate LODs for a 3D model',
    intro: [
      'Generate LODs creates several levels of detail from one GLB or glTF model. Each level has fewer triangles than the last, so a game engine or 3D viewer can show a lighter mesh when the object is far away and keep the frame rate up.',
      'Pick a Standard, Aggressive or Minimal preset or set your own targets, preview each level, and download them individually or together as a ZIP. It runs in your browser with nothing uploaded.',
    ],
    steps: [
      'Drop a .glb or .gltf model onto the page.',
      'Choose a preset or set the reduction for each level.',
      'Preview each LOD and its triangle count.',
      'Download one level or all of them as a ZIP.',
    ],
    faqs: [
      {
        q: 'What are LODs?',
        a: 'Levels of detail (LODs) are simpler versions of the same model. LOD0 is the full-detail original; LOD1, LOD2 and so on have progressively fewer triangles and are shown as the object gets further from the camera.',
      },
      {
        q: 'How many LOD levels do I need?',
        a: 'Three or four levels is common for game assets. Small props may need only two, and very large or frequently repeated objects benefit from more.',
      },
      {
        q: 'How do I use the LODs in Unity, Unreal or Three.js?',
        a: 'Import each level into your engine and assign them to its LOD system: a LOD Group in Unity, the LOD settings on a static mesh in Unreal, or THREE.LOD in Three.js.',
      },
    ],
  },

  'convert-files': {
    heading: 'How to convert 3D model files',
    intro: [
      'Convert Files opens 24 3D model formats, including FBX, OBJ, DAE (Collada), STL, PLY, 3MF, 3DS and USD, and saves to 14, including GLB, glTF, OBJ, FBX, DAE, STL and 3MF. Use it to turn an FBX or OBJ into a GLB for the web, or to get a model into the format your engine or printer needs.',
      'Conversion runs in your browser, so files are never uploaded.',
    ],
    steps: [
      'Drop your model file onto the page (include any texture files it uses).',
      'Choose the output format.',
      'Download the converted file.',
    ],
    faqs: [
      {
        q: 'How do I convert FBX to GLB?',
        a: 'Drop the FBX file onto the page, choose GLB as the output and download. If the FBX references separate texture files, add those too so they are packed into the GLB.',
      },
      {
        q: 'Why are my textures missing after converting?',
        a: 'Formats such as OBJ and some FBX files keep textures as separate images. Include those image files when you convert, or the converted model will have no textures to embed.',
      },
      {
        q: 'Is GLB better than glTF?',
        a: 'They hold the same data. GLB packs the model, textures and buffers into one binary file, which is easier to share and load on the web; glTF keeps them as separate files.',
      },
    ],
  },

  'inspect-glb': {
    heading: 'How to inspect and debug a GLB file',
    intro: [
      'Inspect GLB opens a GLB or glTF model and shows everything inside it: the scene hierarchy, meshes, materials, textures, animations and how many bytes each part takes up. Use it to find out why a model is large, check a texture is using the right format, or debug a file before it goes into your game or website.',
      'You can also open .zip glTF packages and loose textures, including KTX2. It runs in your browser, so the file is never uploaded.',
    ],
    steps: [
      'Drop a .glb, .gltf or .zip file onto the page.',
      'Browse the scene tree, meshes, materials and textures.',
      'Check the size breakdown to see what is taking up space.',
    ],
    faqs: [
      {
        q: 'How do I see what is making my GLB so big?',
        a: 'Open it and look at the size breakdown. Textures are usually the largest part; the tool shows each one with its resolution and format, so you can see which to compress or resize.',
      },
      {
        q: 'Can I check whether a GLB uses Draco, Meshopt or KTX2?',
        a: 'Yes. The inspector shows the glTF extensions a file uses, so you can see whether its geometry or textures are already compressed.',
      },
      {
        q: 'Can I view a GLB file without installing software?',
        a: 'Yes. Drop it onto the page to view and explore it in your browser, with no download or account needed.',
      },
    ],
  },

  'texture-resizer': {
    heading: 'How to resize textures for games and 3D',
    intro: [
      'Texture Resizer scales PNG, JPEG and WebP images to 4K, 2K, 1K, 512, 256 or 128 pixels, or to a custom size, and saves them as WebP, PNG or JPEG. Resize up to 40 textures at once, for example a whole PBR set, before you bring them into your engine or 3D app.',
      'All resizing happens in your browser; nothing is uploaded.',
    ],
    steps: [
      'Drop up to 40 PNG, JPEG or WebP images onto the page.',
      'Pick a target size and output format.',
      'Download the resized textures.',
    ],
    faqs: [
      {
        q: 'Why should texture sizes be powers of two?',
        a: 'Sizes such as 512, 1024 and 2048 work best with mipmapping and GPU texture compression, and some older or mobile hardware requires them. The presets all use power-of-two sizes.',
      },
      {
        q: 'Which format should I save textures in?',
        a: 'WebP is usually the smallest and supports transparency. Use PNG for normal maps and other data textures where exact values matter, and JPEG where WebP is not supported.',
      },
      {
        q: 'Can I resize textures that are inside a GLB?',
        a: 'Texture Resizer works on image files. To resize the textures inside a GLB or glTF model, use Compress Textures instead.',
      },
    ],
  },

  'glb-builder': {
    heading: 'How to combine GLB models into one scene',
    intro: [
      'GLB Builder & Merger lets you place several GLB, glTF and FBX models on a ground plane, move, rotate and scale them, and export the arrangement as one merged GLB. Use it to assemble a scene, a level block-out or a product set without opening Blender.',
      'It runs in your browser, so your models are never uploaded.',
    ],
    steps: [
      'Drop the GLB, glTF or FBX models you want to combine.',
      'Arrange them on the ground plane.',
      'Export the scene as a single GLB.',
    ],
    faqs: [
      {
        q: 'How do I merge multiple GLB files into one?',
        a: 'Add all the models, position them where you want them, then export. The result is a single GLB containing every model in its placed position.',
      },
      {
        q: 'Can I combine FBX and GLB models?',
        a: 'Yes. FBX files are converted on the way in, so you can mix them with GLB and glTF models and export one GLB.',
      },
      {
        q: 'Will the merged file be large?',
        a: 'It is roughly the size of the models added together. Run the result through Optimise GLB or Compress Textures to make it smaller.',
      },
    ],
  },

  'model-to-iso-sprites': {
    heading: 'How to turn a 3D model into isometric game sprites',
    intro: [
      'Model to Iso Sprites renders a GLB, glTF or FBX model with a true 2:1 isometric camera (45° turn, atan(½) tilt) at a fixed scale, so every character, prop and building you make with the same preset matches on the grid.',
      'Every frame shares one base point: the pixel that sits on the tile centre. You get a sprite sheet PNG, a JSON atlas with frames, anchors and an animations index, and optionally every frame as its own PNG in a ZIP. Everything runs in your browser.',
    ],
    steps: [
      'Drop a model (or try the sample robot) and check its height in metres.',
      'Pick a project preset (64, 128 or 256 px tiles) and 8, 4 or 1 directions.',
      'Tick the animations to include, pick 8, 12 or 24 fps and keep "Play in place" on for walk and run cycles.',
      'Choose a style (clean outline, soft, or pixel art), check the preview next to the reference person and crate, then make the sprites.',
    ],
    faqs: [
      {
        q: 'Why do my sprites from different models line up?',
        a: 'The camera angle and the pixels per metre come from the project preset, not from the model, and the base point is always the tile centre under the model. Use the same preset for every asset in a game.',
      },
      {
        q: 'What does loop-safe mean?',
        a: 'The last frame of a looping clip is the same pose as the first. Loop-safe leaves it out so the animation does not stutter when it wraps round.',
      },
      {
        q: 'Which directions do 4 directions give me?',
        a: 'The four diagonals (NE, SE, SW, NW), because in 2:1 isometric those run along the tile grid. Your engine can mirror SE/SW for E/W if you need eight.',
      },
      {
        q: 'How do I use the JSON in my engine?',
        a: 'Each frame lists its rectangle on the sheet and its anchor (the base point in pixels) and pivot (the same point from 0 to 1). The animations block lists the frame names for each clip and direction, with the fps.',
      },
    ],
  },
  'character-workshop': {
    heading: 'How to prepare a 3D character for a Three.js game',
    intro: [
      'Character Workshop loads a GLB, glTF or FBX character, shows its skeleton and animation clips, checks it for common problems and exports a GLB with the clips you choose. OBJ, STL, PLY and 3MF files load as static meshes; Collada and USDZ support is experimental.',
      'Everything runs in your browser and your original file is never changed. After every export the tool reloads the new GLB and compares it with the original, so you can see that the skeleton, triangles and clips survived.',
    ],
    steps: [
      'Drop a character file (for glTF, OBJ or FBX with separate textures, drop all the files together).',
      'Play, scrub and loop its clips, and check the Idle, Walk, Run, Sit, Type, Wave and Think categories.',
      'Fix scale or orientation in Settings if needed, and read the validation results.',
      'Choose the clips to keep and export a GLB.',
    ],
    faqs: [
      {
        q: 'Can it convert FBX to GLB?',
        a: 'Yes, using the three.js FBX loader and glTF exporter. Meshes, skeletons, skin weights, embedded clips and textures are kept; FBX Phong materials are approximated as PBR materials, and the tool says so before you export.',
      },
      {
        q: 'Why does my category say "Animation not available"?',
        a: 'Clips are only matched by name, so a walk cycle is never labelled as typing. Import an animation pack that uses the same bone names (for example Mixamo clips downloaded without skin), or assign a clip you know is right.',
      },
      {
        q: 'Does passing validation mean my character is game ready?',
        a: 'No. It means none of the problems the tool can detect were found. Always test the character in your own game.',
      },
      {
        q: 'Can I open .blend files?',
        a: 'Not in the browser. In Blender use File, Export, glTF 2.0 (.glb) with Animation ticked, then load the GLB here.',
      },
    ],
  },
  'model-to-isometric': {
    heading: 'How to render a 3D model as eight isometric sprites',
    intro: [
      'Model to Isometric renders a GLB or self-contained FBX with a fixed orthographic camera from eight directions, 45° apart, so every view of the model is framed the same way. It suits buildings, props and characters for isometric and top-down 2D games.',
      'Animated models render 4 to 16 frames per direction, one sheet row per direction. Everything runs in your browser and your model never leaves your device.',
    ],
    steps: [
      'Drop a GLB or FBX (up to 200 MB), or try the sample building.',
      'Drag the preview left or right to set the starting rotation, and up or down to set the camera elevation. 35.3° is true isometric.',
      'Pick a resolution from 256 to 2048 px and a background. For an animated model, pick the clip and the frames per direction.',
      'Lock the scale if you are rendering a set of models that must stay in proportion, then press Generate 8 Views.',
      'Download the eight PNGs, the sprite sheet and the JSON together in one ZIP.',
    ],
    faqs: [
      {
        q: 'How is this different from Model to Iso Sprites?',
        a: 'Model to Isometric gives you eight views at the camera angle you choose, which suits props, buildings and concept work. Model to Iso Sprites locks the camera to true 2:1 isometric and the scale to a tile preset, and builds a full sprite sheet and atlas for a game engine.',
      },
      {
        q: 'Why are sprites from different models different sizes?',
        a: 'By default each model fills its frame. Lock the scale and set the pixels per metre, and every model you render keeps the same size and stands on the same ground point.',
      },
      {
        q: 'Does it work with FBX files?',
        a: 'Yes, when the textures are embedded in the FBX. Textures kept as separate files are not loaded, so convert the model to GLB first if they come out missing.',
      },
    ],
  },
  'iso-scene-builder': {
    heading: 'How to build an isometric scene from PNG sprites',
    intro: [
      'Iso Scene Builder keeps a bank of your isometric PNG and WebP objects and lets you drag them onto a 2:1 grid to lay out a level, a room or a promo shot. Objects snap to the tiles and sort their depth automatically, so whatever is lower on screen draws in front.',
      'Your bank and the current scene are saved in this browser, and nothing is uploaded. Export the scene as a PNG, as a layout.json for your game, or as a ZIP with both and every object image.',
    ],
    steps: [
      'Add transparent PNG or WebP objects to your bank. Sprites from Model to Iso Sprites or Alpha Cutout work well.',
      'Pick a tile width and a snap mode: tile centres, tile corners, half tiles or off.',
      'Drag objects onto the grid, or click one to drop it in the middle. Arrow keys nudge, F flips, and [ and ] change the layer.',
      'Check each object\'s ground point, the gold dot that sits on the tile. Detect from pixels finds it for you, or set it by hand.',
      'Export a PNG at 0.5× to 2×, the layout JSON, or the scene ZIP.',
    ],
    faqs: [
      {
        q: 'How does it decide what is in front?',
        a: 'With auto depth on, the object whose ground point is lower on screen draws in front. Layers override that: an object on a higher layer always draws on top.',
      },
      {
        q: 'What is in layout.json?',
        a: 'Every placed object with its draw order, world and grid position, scale, flip and layer, so you can rebuild the scene in your engine.',
      },
      {
        q: 'Where are my objects kept?',
        a: 'In this browser on this device. They are not uploaded. In a private window the bank is not kept after you leave.',
      },
    ],
  },
  'alpha-cutout': {
    heading: 'How to remove a background and split a sprite sheet',
    intro: [
      'Alpha Cutout lifts sprites, icons and effects off their background and splits a sprite sheet into separate transparent PNGs. It is built for art on white or flat backgrounds, and also handles gradients, noise and soft effects like smoke and splatter.',
      'Fix any edge by hand with the wand, box, lasso, erase and restore tools, then download every sprite in one ZIP. Processing stays in your browser.',
    ],
    steps: [
      'Drop a PNG, JPG or WebP, or paste one with Ctrl+V.',
      'Choose how the background is removed: Smart flood for busy backgrounds, Colour to alpha for soft effects, Colour key for hard-edged sprites, or Existing alpha to clean up a PNG.',
      'Tidy the edges with alpha cut-off, speck removal and shrink or grow edge. Add edge padding so mipmaps don\'t show dark outlines.',
      'Split the sheet with Auto-detect or a grid of rows and columns, and click the thumbnails to include or skip each sprite.',
      'Touch up any pixels on the preview, then download the sprites as a ZIP.',
    ],
    faqs: [
      {
        q: 'Why is a gap inside my sprite still filled?',
        a: 'Smart flood clears the background from the image border inwards, so an enclosed gap, like the space between an arm and a body, needs a seed. Choose Pick in the touch-up tools and click the gap.',
      },
      {
        q: 'Auto-detect missed or merged a sprite. What now?',
        a: 'Use the Sprite box tool (B) and drag around the piece. Lower Merge gap to separate pieces that were joined, or raise it to join pieces that belong together.',
      },
      {
        q: 'Why do my sprites get dark outlines in the engine?',
        a: 'Fully clear pixels still carry a colour, and mipmapping blends it into the edge. Turn on edge padding on export so the clear pixels take the sprite\'s edge colour.',
      },
    ],
  },
  'line-studio': {
    heading: 'How to clean up line art and colouring pages',
    intro: [
      'Line Studio takes a scan or drawing, removes the white background and redraws rough, broken lines smooth at the weight you choose. It is made for colouring book pages and fine line art.',
      'Export a transparent PNG, a traced SVG that scales to any size, or both in a ZIP. Processing stays in your browser.',
    ],
    steps: [
      'Drop a PNG, WebP or JPG, or paste one with Ctrl+V.',
      'Set the white tolerance and edge softness so the paper disappears and the lines stay.',
      'Turn on line enhancement and choose 3 weights (fine, medium and bold) or 1 weight for every line. Keep solid black areas and join small breaks if you need them.',
      'Drag a box over any lettering so it keeps its original lines.',
      'Check the result on light and dark backgrounds, then download the PNG, the SVG, or both as a ZIP.',
    ],
    faqs: [
      {
        q: 'Why did some letters change shape?',
        a: 'Redrawn lines can close small gaps, so an "a" may turn into an "o". Drag a box over the text to mark it as lettering, and it stays as drawn.',
      },
      {
        q: 'Should I use traced vectors or image in SVG?',
        a: 'Traced vectors scale sharply to any size and suit logos, icons and flat game art. Image in SVG wraps a pixel-perfect copy, which is better for painterly sprites and photos.',
      },
    ],
  },
  'app-icon-generator': {
    heading: 'How to make app icons for iOS, Android and game UI',
    intro: [
      'iOS App Icon Generator turns one 1024 × 1024 artwork into a full icon set. Frame it in a squircle, rounded, circle or shield mask, add a background, a border, a badge or a gloss, and preview it on a home screen, a store page, a game inventory and a watch face.',
      'If you have no artwork yet, it can write a prompt for Midjourney, DALL·E or Flux. Everything exports as one ZIP.',
    ],
    steps: [
      'Upload your icon (PNG, JPG, SVG or WebP), paste it, or pick a sample. No artwork yet? Describe your app in the AI Prompt Crafter and copy the prompt.',
      'Choose the mask shape, then set the padding, subject scale and position.',
      'Set the background style, border, badge and gloss.',
      'Check the live previews, then export the complete package as a ZIP.',
    ],
    faqs: [
      {
        q: 'What is in the ZIP?',
        a: 'An Xcode AppIcon.appiconset, Android mipmaps and store icons, a game UI sprite sheet and the master 1024 × 1024 PNG.',
      },
      {
        q: 'Does the prompt crafter make the image?',
        a: 'No. It writes a prompt for you to paste into your image generator. Upload the result here to frame and export it.',
      },
    ],
  },
};

/** @param {string} toolId */
export function getToolGuide(toolId) {
  return TOOL_GUIDES[toolId] ?? null;
}
