import { DECAL, GENERIC, ICON, LOGO, TROOP } from '@shared/assetIds';
import { canonicalVectorArtwork } from '@shared/vectorRules';

export const types = {
  icon: ICON.options.filter((path) => canonicalVectorArtwork(path) === path),
  troop: Object.keys(TROOP.enum),
  generic: Object.keys(GENERIC.enum),
  logo: Object.keys(LOGO.enum),
  decal: Object.keys(DECAL.enum),
};

export const ListIcons = ({ pattern, type }: { pattern: string; type: keyof typeof types }) => {
  const all = types[type];
  const list = pattern === '*' ? all : all.filter((key) => key.includes(pattern));
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
      {list.map((item) => (
        <div
          key={item}
          style={{
            padding: '10px',
            border: '1px solid white',
            borderRadius: '5px',
            backgroundColor: 'rgba(255, 255, 255, 0.2)',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            color: 'white',
          }}
        >
          <img src={item} style={{ width: '100%', maxHeight: '200px', flex: '1' }} alt={item} />
          <div style={{ textAlign: 'center' }}>{item}</div>
        </div>
      ))}
    </div>
  );
};
