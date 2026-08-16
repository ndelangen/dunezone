/**
 * Neutral stand-in content for surface stories.
 * 
 * A surface story is about the pane — its border, translucency, blur, divisions — so its contents are deliberately meaningless.
 * Anything readable pulls the eye onto the content and away from the thing under test, and implies the surface cares what goes in it.
 * It does not.
 * 
 * When a story varies a size, vary _this_: a control wired to a hidden spacer proves nothing, whereas growing the visible stand-in shows the surface following its content.
 */
export function SurfaceFiller({
  height = 80,
  width,
  className,
}: {
  height?: number;
  width?: number;
  className?: string;
}) {
  return (
    <div aria-hidden className={className} style={{ height, width, borderRadius: 4, background: 'rgb(0 0 0 / 12%)' }} />
  );
}
