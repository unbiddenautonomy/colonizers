import { artFor } from '../theme/boards/art.ts';
import { useLook } from '../theme/looks.tsx';
import { ChartArt, MasqueradeArt } from './LookArtTables.tsx';
import { DecoArt, IslesArt } from './LookArtMore.tsx';

/** Header art for the looks that have it, drawn in the look's own colours. */
export function LookArt() {
  const { look } = useLook();
  // A painted header, where one has been dropped in, wins over the drawing.
  const painting = artFor(look.family).header;
  if (painting)
    return (
      <div className="look-art look-art-painting">
        <img src={painting} alt="" />
      </div>
    );
  if (look.family === 'deco') return <DecoArt />;
  if (look.family === 'isles') return <IslesArt />;
  if (look.family === 'masquerade') return <MasqueradeArt />;
  if (look.family === 'chart') return <ChartArt />;
  return null;
}
