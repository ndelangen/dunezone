import { useAssetResolver } from '../assets/assetRenderMode';
import styles from './RulebookInteriorHeading.module.css';

export function RulebookInteriorHeading({ title, icon }: Readonly<{ title: string; icon?: string }>) {
  const resolveAsset = useAssetResolver();
  return (
    <header>
      <h1 className={styles.title}>
        {icon ? (
          <span className={styles.icon} aria-hidden>
            <img className={styles.image} src={resolveAsset(icon)} alt="" />
          </span>
        ) : null}
        {title}
      </h1>
    </header>
  );
}
