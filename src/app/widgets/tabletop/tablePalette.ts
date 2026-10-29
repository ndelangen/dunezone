import { useThree } from '@react-three/fiber/webgpu';
import { useMemo } from 'react';

/* Three needs resolved colours rather than CSS var() strings.
 * Read the canvas's inherited theme so the table, its lights and the surrounding UI share one palette.
 * The app is dark-only; a mounted table has no scheme changes to observe.
 */
export function useTablePalette() {
  const canvas = useThree((state) => state.renderer.domElement);
  return useMemo(() => {
    const style = getComputedStyle(canvas);
    const color = (name: string) => style.getPropertyValue(name).trim();
    return {
      ground: color('--color-ground'),
      top: color('--table-top'),
      base: color('--table-base'),
      boardRim: color('--table-board-rim'),
      slotRim: color('--table-slot-rim'),
      well: color('--table-slot-well'),
      keyLight: color('--color-text'),
      fillLight: color('--ui-highlight'),
    };
  }, [canvas]);
}
