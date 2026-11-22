/**
 * Applies the ambient-motion preference before hydration, for every document the app or a standalone tool renders.
 * The profile's motion cookie wins over the OS hint.
 */
export const MOTION_BEFORE_HYDRATION = {
  children:
    `(function(){var m=/(?:^|;\\s*)motion=(on|off)(?:;|$)/.exec(document.cookie);` +
    `var r=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;` +
    `document.documentElement.setAttribute('data-motion',(m?m[1]==='on':!r)?'ok':'reduce')})()`,
};
