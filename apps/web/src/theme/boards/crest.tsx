import type { Theme, ThemePieces } from '../clean.ts';

/**
 * The Wano number disc, shared by the painted Grand Line crews (Beasts, Big Mom, the Navy): a
 * paper disc with an ink ring and a thin vermilion ring inside, and a brush-serif number. Painted
 * lands are busy, and this plain disc reads best on all of them.
 */
export const CREST = {
  ink: '#1b2233',
  paper: '#f3ead2',
  vermilion: '#b8321e',
  font: "'Shippori Mincho B1', 'Noto Serif JP', Georgia, serif",
};

export const crestToken: NonNullable<ThemePieces['token']> = ({ x, y, r }) => (
  <>
    <circle
      className="token-face"
      cx={x}
      cy={y}
      r={r}
      fill={CREST.paper}
      stroke={CREST.ink}
      strokeWidth={2.2}
    />
    <circle
      cx={x}
      cy={y}
      r={r * 0.84}
      fill="none"
      stroke={CREST.vermilion}
      strokeOpacity={0.7}
      strokeWidth={1}
    />
  </>
);

/** The board settings that go with the crest disc. */
export const crestRest: Partial<Theme> = {
  token: CREST.paper,
  tokenText: CREST.ink,
  tokenHot: CREST.vermilion,
  tokenFont: CREST.font,
};
