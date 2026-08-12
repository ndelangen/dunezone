import { Link } from '@tanstack/react-router';
import { ProfileLink } from '@ui/content/ProfileLink';

import { useCurrentProfile } from '@db/profiles';

import styles from './SiteNavigation.module.css';

/** Product navigation, including its profile-aware account destination. */
export function SiteNavigation() {
  const profile = useCurrentProfile();

  return (
    <nav className={styles.root} aria-label="Primary navigation">
      <div className={styles.links}>
        <Link to="/" className={styles.logo} aria-label="Dune home">
          <img className={styles.logoImage} src="/web/logo.svg" alt="" />
        </Link>
        <Link to="/" activeProps={{ className: styles.activeLink }} activeOptions={{ exact: true }}>
          Home
        </Link>
        <Link to="/factions" activeProps={{ className: styles.activeLink }}>
          Factions
        </Link>
        <Link to="/rulesets" activeProps={{ className: styles.activeLink }}>
          Rulesets
        </Link>
        <Link to="/profiles" activeProps={{ className: styles.activeLink }}>
          Profiles
        </Link>
        <Link to="/assets" activeProps={{ className: styles.activeLink }}>
          Assets
        </Link>
      </div>
      <div className={styles.account}>
        {profile.data ? (
          <ProfileLink
            slug={profile.data.slug}
            username={profile.data.username}
            avatar_url={profile.data.avatar_url}
            className={styles.avatarLink}
            title={profile.data.username ?? 'Profile'}
            showUsername={false}
          />
        ) : (
          <Link to="/auth/login" activeProps={{ className: styles.activeLink }}>
            Login
          </Link>
        )}
      </div>
    </nav>
  );
}
