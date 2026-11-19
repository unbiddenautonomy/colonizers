/**
 * The web fonts the looks use. The app used to ask Google for all of them
 * before anything was drawn (24 families, a third of a megabyte); it now asks
 * for the two the chosen look needs, after the first draw.
 */
const GOOGLE: Record<string, string> = {
  Fraunces: 'Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700',
  Inter: 'Inter:wght@400;500;600;700',
  Manrope: 'Manrope:wght@400;500;600;700;800',
  'Space Grotesk': 'Space+Grotesk:wght@500;700',
  'Bodoni Moda': 'Bodoni+Moda:opsz,wght@6..96,500;6..96,600;6..96,700',
  Jost: 'Jost:wght@400;500;600;700',
  'Playfair Display': 'Playfair+Display:ital,wght@0,600;0,700;1,600',
  'Libre Caslon Text': 'Libre+Caslon+Text:ital,wght@0,400;0,700;1,400',
  'Lilita One': 'Lilita+One',
  Nunito: 'Nunito:wght@400;600;700;800',
  'DM Sans': 'DM+Sans:wght@400;500;700',
  'IM Fell English': 'IM+Fell+English:ital@0;1',
  'IM Fell English SC': 'IM+Fell+English+SC',
  Spectral: 'Spectral:ital,wght@0,400;0,600;1,400',
  Bangers: 'Bangers',
  'Russo One': 'Russo+One',
  Barlow: 'Barlow:wght@400;500;600;700',
  Rye: 'Rye',
  Bitter: 'Bitter:wght@400;600;700',
  Chewy: 'Chewy',
  Fredoka: 'Fredoka:wght@400;500;600',
  'Shippori Mincho B1': 'Shippori+Mincho+B1:wght@600;800',
  Oswald: 'Oswald:wght@500;600;700',
  'DM Serif Display': 'DM+Serif+Display',
};

/**
 * Whether this stack starts with a family we fetch. The looks' own test uses
 * it, so a new look whose font nobody serves cannot slip in: it would draw in
 * a device font and look nothing like its design.
 */
export function served(stack: string | undefined): boolean {
  return !!stack && firstFamily(stack) in GOOGLE;
}

/** The first family named in a CSS font stack, without its quotes. */
export function firstFamily(stack: string): string {
  return (stack.split(',')[0] ?? '').trim().replace(/^['"]|['"]$/g, '');
}

/** Where to fetch the web fonts in these stacks, or null when none of them is one. */
export function fontUrl(stacks: (string | undefined)[]): string | null {
  const families = [
    ...new Set(stacks.map((s) => (s ? firstFamily(s) : '')).filter((f) => f in GOOGLE)),
  ];
  if (!families.length) return null;
  const query = families.map((f) => `family=${GOOGLE[f]!}`).join('&');
  return `https://fonts.googleapis.com/css2?${query}&display=swap`;
}

const asked = new Set<string>();

/** Asks for these fonts once, without holding up what is already on the screen. */
export function loadFonts(url: string | null): void {
  if (!url || typeof document === 'undefined' || asked.has(url)) return;
  asked.add(url);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = url;
  document.head.append(link);
}
