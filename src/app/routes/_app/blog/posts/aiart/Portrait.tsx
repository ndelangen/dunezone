import { resolveAsset } from '@shared/media/resolveAsset';

import styles from './Portrait.module.css';

/**
 * A leader portrait cut to the circle the token keeps, at the size the figure sets through `--disc`.
 * The portrait alone, without a token around it: the post is about the pictures, and a token would need a faction, a name and a strength the repo does not record for every one of them.
 */
export function Portrait({ imageKey, alt }: Readonly<{ imageKey: string; alt: string }>) {
  return <img className={styles.portrait} src={resolveAsset(imageKey, 'large')} alt={alt} loading="lazy" />;
}
