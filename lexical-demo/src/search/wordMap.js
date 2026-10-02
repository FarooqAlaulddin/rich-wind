// Plain data, easy to extend. Two layers:
//   CATEGORIES  words that name a family of groups ("color", "border",
//               "spacing") -> the catalog group labels they open.
//   INTENTS     everyday words and phrases ("bold", "side by side") -> the
//               specific classes that do it, best first.
// PATTERN_INTENTS covers phrases with a number in them. No imports: the seed
// generator reads this file under plain node.

const T = (s) => s.split('|');

/**
 * `labels` are group labels of the generated catalog (see catalogData.js).
 * `palette` opens the shared color palette on that property chip.
 * Labels that a palette chip already covers are not repeated as sections.
 */
export const CATEGORIES = [
  {
    id: 'colors', title: 'Colors', palette: 'text',
    words: T('color|colors|colour|colours|palette|hue|tint|paint'),
    labels: T('Text color|Background color|Border color|Ring color|Outline color|Text decoration color|Shadow color|Fill|Stroke|Gradient from|Gradient via|Gradient to|Accent color|Caret color|Divide|Drop shadow color|Inset ring color|Inset shadow color|Ring offset color|Text shadow color'),
  },
  {
    id: 'background', title: 'Background', palette: 'bg',
    words: T('background|backgrounds|bg|backdrop'),
    labels: T('Background color|Gradient direction|Gradient from|Gradient via|Gradient to|Background image|Background size|Background position|Background repeat|Background clip|Background attachment|Background origin|Background blend mode|Backdrop filter'),
  },
  {
    id: 'gradient', title: 'Gradient', palette: 'from',
    words: T('gradient|gradients|fade|ombre'),
    labels: T('Gradient direction|Gradient from|Gradient via|Gradient to|Gradient from position|Gradient via position|Gradient to position|Gradient via stops'),
  },
  {
    id: 'border', title: 'Border', palette: 'border',
    words: T('border|borders|edge|edges|frame'),
    labels: T('Border width|Border style|Border color|Border radius|Outline style|Outline offset|Outline color|Divide|Border collapse|Border spacing|Ring|Stroke width'),
  },
  {
    id: 'outline', title: 'Outline', palette: 'outline',
    words: T('outline|outlines'),
    labels: T('Outline style|Outline offset|Outline color'),
  },
  {
    id: 'corners', title: 'Corners', words: T('corner|corners|round|rounded|rounding|radius|curve|curved'),
    labels: T('Border radius'),
  },
  {
    id: 'spacing', title: 'Spacing', words: T('spacing|space|spaces|spacer'),
    labels: T('Padding|Margin|Gap|Space between|Text indent'),
  },
  { id: 'padding', title: 'Padding', words: T('padding|pad|inner'), labels: T('Padding') },
  { id: 'margin', title: 'Margin', words: T('margin|margins|outer'), labels: T('Margin') },
  { id: 'gap', title: 'Gap', words: T('gap|gaps|gutter|gutters'), labels: T('Gap|Space between') },
  {
    id: 'size', title: 'Size', words: T('size|sizes|sizing|width|height|dimension|dimensions|wide|tall'),
    labels: T('Width|Height|Size|Aspect ratio'),
  },
  {
    id: 'text', title: 'Text', palette: 'text',
    words: T('text|font|fonts|typography|type|typeface|writing|copy'),
    labels: T('Font size|Font weight|Font family|Font style|Line height|Letter spacing|Text align|Text transform|Text decoration line|Text decoration style|Text decoration thickness|Text underline offset|Text decoration color|Text wrap|Text overflow|Line clamp|Text indent|White space|Word break|Overflow wrap|Hyphens|Vertical align|Font smoothing|Font stretch|Font variant numeric|Text shadow|Text color|List style type'),
  },
  {
    id: 'layout', title: 'Layout', words: T('layout|display|position|positioning|placement|arrange|arrangement'),
    labels: T('Display|Position|Inset|Z index|Overflow|Float|Clear|Isolation|Visibility|Box sizing|Container type|Columns|Break after|Break before|Break inside|Box decoration break'),
  },
  {
    id: 'flex', title: 'Flex', words: T('flex|flexbox|flexible'),
    labels: T('Display|Flex|Flex basis|Flex direction|Flex grow|Flex shrink|Flex wrap|Order|Gap|Justify content|Align items|Align content|Align self|Place content|Place items|Place self'),
  },
  {
    id: 'grid', title: 'Grid', words: T('grid|grids|columns|rows|column|row|cols'),
    labels: T('Display|Grid template columns|Grid template rows|Grid column|Grid row|Grid column start|Grid column end|Grid row start|Grid row end|Grid auto flow|Grid auto columns|Grid auto rows|Gap|Columns|Justify items|Justify self|Place items|Place content|Place self'),
  },
  {
    id: 'align', title: 'Alignment', words: T('align|alignment|justify|justification|center|centre|centering|distribute'),
    labels: T('Justify content|Justify items|Justify self|Align items|Align content|Align self|Place content|Place items|Place self|Text align|Vertical align'),
  },
  {
    id: 'shadow', title: 'Shadow', palette: 'shadow',
    words: T('shadow|shadows|depth|elevation|glow|drop'),
    labels: T('Shadow|Shadow color|Inset shadow|Inset shadow color|Text shadow|Text shadow color|Drop shadow color|Ring|Inset ring|Inset ring color'),
  },
  {
    id: 'effects', title: 'Effects', words: T('effects|effect|filter|filters|opacity|blend|visual'),
    labels: T('Opacity|Filter|Backdrop filter|Mix blend mode|Background blend mode|Shadow|Drop shadow color|Mask image'),
  },
  { id: 'blur', title: 'Blur', words: T('blur|blurry|frosted|glass'), labels: T('Filter|Backdrop filter') },
  {
    id: 'animation', title: 'Animation', words: T('animation|animations|animate|motion|transition|transitions|easing|duration|delay|timing'),
    labels: T('Animation|Transition|Transition behavior|Transition delay|Transition duration|Transition timing function|Duration|Ease'),
  },
  {
    id: 'transform', title: 'Transform', words: T('transform|transforms|rotate|rotation|scale|translate|move|skew|flip|tilt|perspective'),
    labels: T('Transform|Rotate|Scale|Translate|Transform origin|Transform style|Transform box|Perspective|Perspective origin|Backface visibility'),
  },
  {
    id: 'interaction', title: 'Interaction', words: T('cursor|cursors|interaction|interactive|pointer|mouse|touch|select|selection|user'),
    labels: T('Cursor|Pointer events|User select|Resize|Touch action|Appearance|Will change|Caret color|Accent color|Scroll behavior|Overscroll'),
  },
  {
    id: 'scroll', title: 'Scroll', words: T('scroll|scrolling|snap|overscroll|scrollbar'),
    labels: T('Scroll behavior|Scroll snap align|Scroll snap stop|Scroll snap strictness|Scroll snap type|Scroll spacing|Overscroll|Overflow|Touch action'),
  },
  { id: 'list', title: 'List', words: T('list|lists|bullet|bullets|marker'), labels: T('List style type|List style position|List style image') },
  { id: 'table', title: 'Table', words: T('table|tables|cell|cells'), labels: T('Table layout|Border collapse|Border spacing|Caption side') },
  {
    id: 'image', title: 'Image', words: T('image|images|media|picture|photo|video|thumbnail|object|fit|crop'),
    labels: T('Object fit|Object position|Aspect ratio|Background image|Background size|Background position|Mask image'),
  },
  {
    id: 'mask', title: 'Mask', words: T('mask|masks|masking|clip|clipping'),
    labels: T('Mask image|Mask clip|Mask composite|Mask mode|Mask origin|Mask position|Mask radial position|Mask radial shape|Mask radial size|Mask repeat|Mask size|Mask type|Background clip'),
  },
  {
    id: 'ring', title: 'Ring', palette: 'ring', words: T('ring|rings|halo'),
    labels: T('Ring|Ring color|Ring inset|Ring offset|Ring offset color|Inset ring|Inset ring color'),
  },
  {
    id: 'accessibility', title: 'Accessibility', words: T('accessibility|a11y|accessible|contrast|forced'),
    labels: T('Forced color adjust|Color scheme|Pointer events|Visibility|Size'),
  },
  {
    id: 'advanced', title: 'Advanced', words: T('advanced|misc|other|extra|performance|containment'),
    labels: T('Contain|Content|Container type|Field sizing|Will change|Isolation|Color scheme|Box sizing|Appearance|Forced color adjust|Caption side|Transform box|Mask type'),
  },
];

/** Words that pick one color property chip. */
export const PROPERTY_WORDS = {
  text: T('text|font|foreground|fg|ink|type'),
  bg: T('bg|background|backgrounds|fill color|surface'),
  border: T('border|borders|edge|stroke color'),
  ring: T('ring|halo'),
  outline: T('outline'),
  decoration: T('underline|decoration|strikethrough'),
  shadow: T('shadow|glow'),
  fill: T('fill|svg'),
  stroke: T('stroke'),
  from: T('from|gradient'),
  via: T('via'),
  to: T('to'),
};

/** Everyday color names that are not palette families: family and shade. */
export const COLOR_ALIASES = {
  grey: ['gray', 500], navy: ['blue', 900], maroon: ['red', 900], crimson: ['red', 700], tomato: ['red', 500],
  scarlet: ['red', 600], coral: ['orange', 400], gold: ['amber', 400], golden: ['amber', 400], mustard: ['yellow', 600],
  brown: ['amber', 800], tan: ['stone', 300], beige: ['stone', 200], cream: ['amber', 100], ivory: ['stone', 50],
  lavender: ['violet', 300], magenta: ['fuchsia', 500], turquoise: ['teal', 400], aqua: ['cyan', 400],
  mint: ['emerald', 300], olive: ['lime', 700], forest: ['green', 800], charcoal: ['gray', 800], silver: ['gray', 300],
  salmon: ['rose', 300], peach: ['orange', 300], indigo: ['indigo', 500], violet: ['violet', 500],
  burgundy: ['rose', 900], wine: ['rose', 800], rust: ['orange', 700], plum: ['purple', 800],
  'baby blue': ['sky', 200], 'sky blue': ['sky', 400], 'navy blue': ['blue', 900],
  'hot pink': ['pink', 500], 'royal blue': ['blue', 700], 'forest green': ['green', 800], 'lime green': ['lime', 500],
  'off white': ['stone', 50], 'blood red': ['red', 700],
};

/** Shade modifiers. */
export const SHADE_WORDS = {
  lightest: 50, pale: 100, light: 200, soft: 300, pastel: 200, bright: 400, medium: 500, strong: 600, dark: 700, deep: 800, darkest: 900,
};

/**
 * phrase list -> classes, best first. A query matches when it is one of the
 * phrases, a typed beginning of one, or its words are all inside one.
 */
const I = (words, classes) => ({ words: T(words), classes: T(classes) });
export const INTENTS = [
  // Text emphasis
  I('bold|bolder|strong|heavy|thick text', 'font-bold|font-semibold|font-extrabold'),
  I('semibold|semi bold|medium weight', 'font-semibold|font-medium'),
  I('light weight|thin text|thin font|slim text', 'font-light|font-thin|font-extralight'),
  I('normal weight|regular|unbold', 'font-normal'),
  I('italic|italics|slanted|oblique|emphasis', 'italic'),
  I('not italic|no italic|upright', 'not-italic'),
  I('underline|underlined|underscore', 'underline'),
  I('strikethrough|strike|cross out|crossed out|line through', 'line-through'),
  I('no underline|remove underline|plain link', 'no-underline'),
  I('caps|all caps|capitals|uppercase|upper case|shout', 'uppercase'),
  I('lowercase|lower case|small letters', 'lowercase'),
  I('capitalize|title case|capitalise', 'capitalize'),
  I('serif|book font|classic font', 'font-serif'),
  I('sans|sans serif|clean font', 'font-sans'),
  I('mono|monospace|code font|typewriter', 'font-mono'),
  I('big text|bigger text|larger text|large text|increase text|text bigger', 'text-lg|text-xl|text-2xl'),
  I('small text|smaller text|tiny text|fine print|text smaller', 'text-sm|text-xs'),
  I('huge text|giant text|headline|heading size|title size', 'text-4xl|text-5xl|text-3xl'),
  I('tight lines|tight leading|compact lines', 'leading-tight|leading-snug'),
  I('loose lines|airy lines|line spacing|more line height', 'leading-relaxed|leading-loose'),
  I('wide letters|letter spacing|spaced letters|tracking wide', 'tracking-wide|tracking-wider|tracking-widest'),
  I('tight letters|condensed|squeeze letters', 'tracking-tight|tracking-tighter'),
  I('truncate|ellipsis|cut off|cut text|one line|single line', 'truncate|text-ellipsis|whitespace-nowrap'),
  I('no wrap|nowrap|dont wrap|keep on one line', 'whitespace-nowrap|text-nowrap'),
  I('balance text|balanced|balance', 'text-balance|text-pretty'),
  I('break words|wrap long words|long words|overflow words', 'wrap-break-word|wrap-anywhere|break-all'),
  I('smooth text|crisp text|antialiased|smoothing', 'antialiased'),
  I('numbers align|tabular numbers|tabular|table numbers', 'tabular-nums'),
  // Alignment and layout
  I('center|centre|centered|centred|middle|align center|center text|text center|centered text', 'text-center|justify-center|items-center|mx-auto'),
  I('center content|center items|center children|center everything|center both|center horizontally and vertically|dead center', 'flex|items-center|justify-center'),
  I('center horizontally|horizontal center|center x|center block|auto margins', 'mx-auto|justify-center|text-center'),
  I('center vertically|vertical center|center y|middle vertically|vertically', 'items-center|self-center|align-middle'),
  I('left|align left|left align|text left', 'text-left|justify-start|items-start'),
  I('right|align right|right align|text right', 'text-right|justify-end|items-end'),
  I('justify text|justified|both sides', 'text-justify'),
  I('push right|push to the right|move to right|margin left auto', 'ml-auto|justify-end'),
  I('push left|margin right auto', 'mr-auto|justify-start'),
  I('space between|spread|spread out|apart|distribute', 'justify-between|justify-around|justify-evenly'),
  I('side by side|beside|next to each other|in a row|horizontal|horizontally|row layout|inline children|row', 'flex|flex-row|gap-4'),
  I('stack|stacked|stack vertically|one under another|vertical|vertically stacked|column layout|in a column|top to bottom', 'flex-col|flex|gap-4'),
  I('wrap|wrapping|wrap items|let items wrap|multiple lines', 'flex-wrap|flex'),
  I('grow|fill space|take remaining space|expand|stretch to fill|flex grow|flexible width', 'flex-1|grow|w-full'),
  I('dont shrink|no shrink|keep size', 'shrink-0'),
  I('gap|space children|spacing between|space items', 'gap-4|gap-2|gap-6'),
  I('equal columns|even columns|columns|multi column', 'grid-cols-2|grid-cols-3|grid-cols-4'),
  I('two columns|2 columns|half and half|split in two|two up', 'grid-cols-2'),
  I('three columns|3 columns|thirds|three up', 'grid-cols-3'),
  I('four columns|4 columns|four up|quarters', 'grid-cols-4'),
  I('card grid|gallery|tiles|grid layout|responsive grid', 'grid|grid-cols-3|gap-4'),
  I('inline|inline element|flow with text', 'inline|inline-block'),
  I('block|block element|own line|full line', 'block'),
  I('hide|hidden|invisible|disappear|display none|gone|dont show|not visible|vanish', 'hidden|invisible'),
  I('show|visible|unhide|reveal|display', 'block|visible|inline-block'),
  I('screen reader only|sr only|visually hidden|accessible hidden', 'sr-only'),
  // Position
  I('sticky|stick|stay on screen|stays at top|pinned|stuck', 'sticky|top-0|z-10'),
  I('fixed|float on screen|stay in place|always visible|fixed position', 'fixed|top-0|z-50'),
  I('absolute|overlay|on top of|layered|position absolute|stacked on top', 'absolute|inset-0|z-10'),
  I('relative|anchor|position context|position relative', 'relative'),
  I('cover parent|fill parent|fill container|stretch over|full cover', 'absolute|inset-0'),
  I('front|bring to front|on top|above|z top|raise', 'z-10|z-20|z-50'),
  I('behind|send to back|below|lower layer', '-z-10|z-0'),
  I('top|at top|top edge|stick to top', 'top-0|inset-x-0'),
  I('bottom|at bottom|bottom edge|stick to bottom', 'bottom-0|inset-x-0'),
  // Size
  I('full width|fill width|stretch|100% width|entire width|edge to edge|whole width|wide as parent', 'w-full|w-screen|min-w-full'),
  I('full height|fill height|100% height|entire height|tall as parent', 'h-full|h-screen|min-h-screen'),
  I('full screen|fullscreen|whole screen|cover screen|viewport size|fill screen', 'h-screen|w-screen|min-h-screen'),
  I('square|equal sides|1 to 1|aspect square', 'aspect-square|size-16|size-24'),
  I('video ratio|widescreen|16 9|aspect video|wide ratio', 'aspect-video'),
  I('half width|50% width|half the width|half wide|half', 'w-1/2|w-1/3|w-2/3'),
  I('narrow|slim|skinny|thin column|reading width|readable width|prose width|constrain width|limit width|max width|container width', 'max-w-prose|max-w-md|max-w-lg|max-w-xl'),
  I('container|page width|centered container|page container|wrapper|content width', 'container|mx-auto|max-w-5xl|px-4'),
  I('wide|extra wide|wide page|large container', 'max-w-6xl|max-w-7xl|w-full'),
  I('fit content|shrink wrap|hug content|as wide as content|auto size|fit', 'w-fit|h-fit|w-auto'),
  I('tiny|small box|small size|icon size|small square', 'size-4|size-6|size-8'),
  I('avatar|profile picture|avatar size|round image', 'size-10|rounded-full|object-cover'),
  // Spacing
  I('padding|space inside|inner space|breathing room|pad|inside space', 'p-4|p-6|p-2'),
  I('more padding|bigger padding|add padding|extra padding|roomy|spacious|generous padding', 'p-6|p-8|p-5'),
  I('less padding|smaller padding|tighter|compact|snug padding|reduce padding', 'p-2|p-3|p-1'),
  I('no padding|remove padding|zero padding', 'p-0'),
  I('margin|space outside|outer space|space around|outside space', 'm-4|m-2|m-6'),
  I('margin top|space above|space on top|push down', 'mt-4|mt-6|mt-2'),
  I('margin bottom|space below|space after|space under', 'mb-4|mb-6|mb-2'),
  I('no margin|remove margin|zero margin', 'm-0'),
  I('horizontal padding|side padding|left and right padding|padding sides', 'px-4|px-6|px-2'),
  I('vertical padding|top and bottom padding|padding top bottom', 'py-2|py-4|py-6'),
  I('space between children|children spacing|vertical rhythm|space y|stack spacing', 'space-y-4|space-y-2|gap-4'),
  I('space between items horizontal|horizontal spacing|space x', 'space-x-4|space-x-2|gap-4'),
  // Borders, corners
  I('rounded corners|round corners|rounded|rounder|soft corners|smooth corners|round|curved', 'rounded-md|rounded-lg|rounded-xl'),
  I('very rounded|extra rounded|pill|pill shape|pill button|stadium', 'rounded-full|rounded-3xl|rounded-2xl'),
  I('circle|circular|perfect circle|round shape|dot|disc|oval', 'rounded-full|size-16'),
  I('sharp corners|square corners|no rounding|no radius|straight corners|remove rounding|boxy', 'rounded-none|rounded-sm'),
  I('border|outline box|boxed|frame it|add border|bordered|stroke box', 'border|border-2|border-gray-300'),
  I('no border|remove border|borderless|border none', 'border-0|border-none'),
  I('thick border|heavy border|bold border|thicker border', 'border-4|border-2|border-8'),
  I('dashed|dashed border|dash line|dash', 'border-dashed|border'),
  I('dotted|dotted border|dots line', 'border-dotted|border'),
  I('divider|separator|rule|hr|line between|line under|horizontal rule', 'border-b|border-t|divide-y'),
  I('bottom border|underline border|border under', 'border-b|border-b-2'),
  I('top border|border above', 'border-t|border-t-2'),
  I('left border|accent border|quote border|blockquote|callout bar', 'border-l-4|border-l-2|pl-4'),
  I('focus ring|ring|halo|glow ring|highlight ring|outline ring', 'ring-2|ring|ring-blue-500'),
  // Effects
  I('shadow|drop shadow|box shadow|depth|elevate|elevated|lift|raised|floating|card shadow', 'shadow-md|shadow-lg|shadow-sm'),
  I('big shadow|large shadow|strong shadow|deep shadow|dramatic shadow', 'shadow-xl|shadow-2xl|shadow-lg'),
  I('subtle shadow|light shadow|soft shadow|slight shadow|faint shadow', 'shadow-sm|shadow-xs|shadow'),
  I('no shadow|remove shadow|flat|shadow none', 'shadow-none'),
  I('inner shadow|inset shadow|pressed|sunken|inset', 'inset-shadow-sm|shadow-inner|inset-shadow-xs'),
  I('transparent|no background|invisible background|clear background', 'bg-transparent'),
  I('translucent|semi transparent|half transparent|see through|see thru|faded|washed out', 'opacity-50|opacity-75|bg-white/50'),
  I('fade|dim|dimmed|dull|faint|lower opacity|less visible|ghost', 'opacity-50|opacity-60|opacity-75'),
  I('opaque|fully visible|solid|full opacity|bright|undim', 'opacity-100'),
  I('blur|blurred|blurry|soften|out of focus|fuzzy|gaussian', 'blur-md|blur-sm|blur-lg'),
  I('frosted glass|glass|glassmorphism|backdrop blur|blur behind|translucent blur|frosted', 'backdrop-blur-md|backdrop-blur-sm|bg-white/30'),
  I('grayscale|black and white|desaturate|monochrome|greyscale|no color', 'grayscale|saturate-0'),
  I('brighten|brighter|lighten image|more light', 'brightness-110|brightness-125|brightness-150'),
  I('darken|dim image|darken image|less light', 'brightness-75|brightness-50|brightness-90'),
  I('contrast|image contrast|punchy image', 'contrast-125|contrast-150|contrast-100'),
  I('invert|negative|inverted colors', 'invert'),
  I('sepia|vintage|old photo|retro photo', 'sepia'),
  // Transform
  I('tilt|rotate|rotated|turn|tilted|spin angle|angle|slant|rotation', 'rotate-45|rotate-12|rotate-6'),
  I('upside down|flip|flipped|rotate 180|turn around|invert vertically', 'rotate-180|-scale-y-100|-scale-x-100'),
  I('mirror|flip horizontal|mirrored|horizontal flip', '-scale-x-100'),
  I('spin|spinner|rotating|loading spinner|rotate forever|loading', 'animate-spin'),
  I('pulse|pulsing|heartbeat|skeleton|loading skeleton', 'animate-pulse'),
  I('bounce|bouncing|hop|jump', 'animate-bounce'),
  I('ping|radar|notification dot pulse|ripple', 'animate-ping'),
  I('grow on hover|zoom|zoom in|scale up|enlarge|magnify|bigger on hover', 'scale-110|scale-105|scale-125'),
  I('shrink|scale down|zoom out|reduce size|squash', 'scale-90|scale-95|scale-75'),
  I('move|shift|nudge|offset|translate|slide', 'translate-x-2|translate-y-2|-translate-y-1'),
  I('smooth|animated|animate changes|ease|smooth change|transition|animate|tween', 'transition|transition-all|duration-300'),
  I('fast transition|quick|snappy|fast', 'duration-150|duration-100|transition'),
  I('slow transition|slow|lazy|gentle', 'duration-500|duration-700|ease-in-out'),
  I('ease in out|easing|ease out|smooth easing', 'ease-in-out|ease-out|ease-in'),
  // Overflow, interaction
  I('scroll|scrollable|scrolling|overflow scroll|scroll bar|can scroll', 'overflow-auto|overflow-y-auto|overflow-scroll'),
  I('scroll horizontally|horizontal scroll|x scroll|swipe|carousel|slider', 'overflow-x-auto|snap-x|flex'),
  I('scroll vertically|vertical scroll|y scroll|long list|tall scroll', 'overflow-y-auto|h-64|max-h-96'),
  I('clip|cut overflow|hide overflow|crop|contain overflow|clip content|overflow hidden|masked corners', 'overflow-hidden'),
  I('no scroll|lock scroll|prevent scroll|disable scrolling', 'overflow-hidden|overscroll-none'),
  I('smooth scrolling|scroll smoothly|animated scroll', 'scroll-smooth'),
  I('snap|scroll snap|snap points|snap to items', 'snap-x|snap-center|snap-mandatory'),
  I('clickable|pointer|hand cursor|link cursor|button cursor|click|interactive', 'cursor-pointer|select-none|transition'),
  I('not allowed|disabled cursor|forbidden|disabled look|disabled', 'cursor-not-allowed|opacity-50|pointer-events-none'),
  I('no select|unselectable|prevent selection|cant select|dont select text', 'select-none'),
  I('ignore clicks|click through|no pointer events|pass through clicks|no interaction', 'pointer-events-none'),
  I('resize|resizable|drag to resize|textarea resize', 'resize|resize-y|resize-none'),
  I('no resize|fixed size textarea|lock size', 'resize-none'),
  // Images, lists
  I('cover|image cover|fill image|crop to fit|cover box|fill box|cropped|background cover|center crop', 'object-cover|bg-cover|bg-center'),
  I('contain|fit image|show whole image|letterbox|no crop|image contain', 'object-contain|bg-contain'),
  I('bullets|bullet list|disc list|unordered list|list bullets|dots list', 'list-disc|list-inside'),
  I('numbered|numbered list|ordered list|numbers list|list numbers', 'list-decimal|list-inside'),
  I('no bullets|remove bullets|plain list|list none|unstyled list|reset list', 'list-none'),
  I('background image|cover image|hero image|background photo|image as background', 'bg-cover|bg-center|bg-no-repeat'),
  I('no repeat|dont repeat|single image|repeat none', 'bg-no-repeat'),
  I('tile|repeat|tiled|repeat image|pattern', 'bg-repeat|bg-repeat-x|bg-repeat-y'),
  I('fixed background|parallax|background stays|background fixed', 'bg-fixed'),
  I('gradient|linear gradient|color fade|gradient background|fade colors|blend colors', 'bg-linear-to-r|bg-linear-to-b|from-blue-500'),
  I('gradient to right|left to right gradient|horizontal gradient', 'bg-linear-to-r'),
  I('gradient to bottom|top to bottom gradient|vertical gradient|fade down', 'bg-linear-to-b'),
  I('gradient text|rainbow text|colorful text|text gradient', 'bg-clip-text|text-transparent|bg-linear-to-r'),
  // Misc
  I('table|tabular|table layout|fixed table', 'table-fixed|border-collapse|w-full'),
  I('no outline|remove outline|hide outline|focus outline none', 'outline-none|outline-0'),
  I('outline|visible outline|focus outline|outline offset', 'outline|outline-2|outline-offset-2'),
  I('accent|accent color|checkbox color|form accent', 'accent-blue-500|accent-auto'),
  I('caret|cursor color|caret color|text cursor color', 'caret-blue-500'),
  I('aspect|aspect ratio|ratio|proportion|proportions', 'aspect-square|aspect-video|aspect-auto'),
  I('z index|layer|layers|stack order|stacking|depth order', 'z-10|z-20|z-50'),
  I('content|empty content|pseudo content|before after', 'content-none'),
  I('isolate|new stacking context|isolation', 'isolate'),
  I('truncate lines|clamp|line clamp|clamp lines|limit lines|max lines', 'line-clamp-2|line-clamp-3|line-clamp-1'),
];

/** Phrases with a number in them. $1 is the first capture group. */
export const PATTERN_INTENTS = [
  { re: /^(?:grid )?(\d{1,2}) ?(?:col|cols|column|columns)$/, classes: ['grid-cols-$1'] },
  { re: /^(?:grid )?(?:col|cols|column|columns) (\d{1,2})$/, classes: ['grid-cols-$1'] },
  { re: /^(?:grid )?(\d{1,2}) ?(?:row|rows)$/, classes: ['grid-rows-$1'] },
  { re: /^span (\d{1,2})(?: col| cols| columns?)?$/, classes: ['col-span-$1'] },
  { re: /^(\d{1,3}) ?%? (?:opacity|opaque|visible)$/, classes: ['opacity-$1'] },
  { re: /^opacity (\d{1,3}) ?%?$/, classes: ['opacity-$1'] },
  { re: /^(?:rotate|rotation|tilt|turn|angle) (-?\d{1,3}) ?(?:deg|degrees?)?$/, classes: ['rotate-$1', '-rotate-$1'] },
  { re: /^(-?\d{1,3}) ?(?:deg|degrees?) ?(?:rotate|rotation|tilt|turn)?$/, classes: ['rotate-$1'] },
  { re: /^(\d{1,2}) ?(?:lines?)$/, classes: ['line-clamp-$1'] },
  { re: /^(?:clamp|limit|max) (\d{1,2}) ?(?:lines?)?$/, classes: ['line-clamp-$1'] },
  { re: /^(?:z|layer|zindex|z index) ?(\d{1,3})$/, classes: ['z-$1'] },
  { re: /^(?:scale|zoom) (\d{2,3}) ?%?$/, classes: ['scale-$1'] },
  { re: /^(?:blur) (\d{1,2}) ?(?:px)?$/, classes: ['blur-[$1px]'], fit: 'blur' },
  { re: /^(?:delay) (\d{2,4}) ?(?:ms)?$/, classes: ['delay-$1'] },
  { re: /^(?:duration|speed) (\d{2,4}) ?(?:ms)?$/, classes: ['duration-$1'] },
];

/** Relative phrases: direction and the nouns they point at. */
export const RELATIVE_WORDS = {
  up: T('bigger|larger|more|increase|higher|wider|taller|thicker|heavier|bolder|greater|extra|grow|expand|add|longer|bump up|raise|roomier|airier|rounder|floatier'),
  down: T('smaller|less|decrease|lower|narrower|shorter|thinner|reduce|tighter|fewer|shrink|tinier|lighter weight|minus|cut|bump down|sharper|squarer|flatter|denser|fainter'),
  darker: T('darker|deeper|richer|more saturated'),
  lighter: T('lighter|paler|softer color|washed|brighter'),
};

/** Nouns that point a relative word at one kind of class: noun -> group labels. */
export const RELATIVE_NOUNS = {
  text: ['Font size'], font: ['Font size'], size: ['Font size', 'Size'], padding: ['Padding'], pad: ['Padding'],
  margin: ['Margin'], space: ['Padding', 'Margin', 'Gap', 'Space between'], spacing: ['Padding', 'Margin', 'Gap', 'Space between'],
  gap: ['Gap'], width: ['Width'], height: ['Height'], round: ['Border radius'], rounded: ['Border radius'], corners: ['Border radius'],
  radius: ['Border radius'], border: ['Border width'], shadow: ['Shadow'], opacity: ['Opacity'], weight: ['Font weight'],
  bold: ['Font weight'], leading: ['Line height'], lines: ['Line height'], line: ['Line height'], letter: ['Letter spacing'],
  tracking: ['Letter spacing'], blur: ['Filter'], color: [], colour: [], background: [], rotate: ['Rotate'], rotation: ['Rotate'],
  scale: ['Scale'], indent: ['Text indent'],
};
