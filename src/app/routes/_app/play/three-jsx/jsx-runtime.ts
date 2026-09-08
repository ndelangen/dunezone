import type { ThreeElements } from '@react-three/fiber/webgpu';
import type { JSX as ReactJSX } from 'react';

export { Fragment, jsx, jsxs } from 'react/jsx-runtime';

/*
 * Three's intrinsic elements belong to the scene files that opt into this runtime.
 * Adding them to React.JSX also expands every DOM component's React.ElementType.
 * The Fiber patch removes that ambient declaration; runtime functions stay React's.
 */
export declare namespace JSX {
  export type ElementType = ReactJSX.ElementType;
  export type Element = ReactJSX.Element;
  export type ElementClass = ReactJSX.ElementClass;
  export type ElementAttributesProperty = ReactJSX.ElementAttributesProperty;
  export type ElementChildrenAttribute = ReactJSX.ElementChildrenAttribute;
  export type LibraryManagedAttributes<C, P> = ReactJSX.LibraryManagedAttributes<C, P>;
  export type IntrinsicAttributes = ReactJSX.IntrinsicAttributes;
  export type IntrinsicClassAttributes<T> = ReactJSX.IntrinsicClassAttributes<T>;
  export interface IntrinsicElements extends ReactJSX.IntrinsicElements, ThreeElements {}
}
