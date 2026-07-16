import type { z } from 'zod';

import { MarkdownContent } from '../../../components/block/MarkdownContent';
import type { FactionAssets, FactionPreview } from '../../../schema/faction';
import { isLight } from '../../utils/contrast';
import { LeaderToken } from '../leader/Leader';
import { Token } from '../token/Token';
import { TroopToken } from '../troop/Troop';
import styles from './Sheet.module.css';

type AssetSheet = z.infer<typeof FactionAssets.sheet>;
type PreviewSheet = z.infer<typeof FactionPreview.sheet>;
type SheetProps = AssetSheet | PreviewSheet;

// Type guard to check if props are Preview type
function isPreviewSheet(props: SheetProps): props is PreviewSheet {
  return 'background' in props;
}

// Type guard to check if a leader is Preview type (is an object, not a string)
function isPreviewLeader(
  leader: AssetSheet['leaders'][0] | PreviewSheet['leaders'][0]
): leader is PreviewSheet['leaders'][0] {
  return typeof leader === 'object' && leader !== null && 'image' in leader;
}

function isAssetSheet(props: SheetProps): props is AssetSheet {
  return typeof props.leaders[0] === 'string';
}

export const FactionSheet = (props: SheetProps) => {
  return (
    <>
      <style
        // biome-ignore lint/security/noDangerouslySetInnerHtml: I don't care
        dangerouslySetInnerHTML={{
          __html: `
            @property --header-bg-color {
              syntax: "<color>";
              inherits: false;
              initial-value: ${props.themeColor};
            }
            @property --header-text-color {
              syntax: "<color>";
              inherits: false;
              initial-value: ${isLight(props.themeColor) ? 'black' : 'white'};
            }
          `,
        }}
      />
      <div className={styles.container}>
        <FactionSheetPage1 {...props} />
        <FactionSheetPage2 {...props} />
      </div>
    </>
  );
};

export function FactionSheetPage1(props: SheetProps) {
  return (
    <div className={styles.page} data-faction-sheet-page="1">
      <div className={`${styles.page_title} ${styles.title}`}>{props.name}</div>
      <div className={styles.logo}>
        {isAssetSheet(props) ? (
          <img src={props.logo} alt={props.name} title={props.name} />
        ) : (
          <Token logo={props.logo} background={props.background} />
        )}
      </div>
      <div className={styles.start}>
        <strong className={styles.head}>At start:</strong>{' '}
        <MarkdownContent>{props.rules.startText}</MarkdownContent>
      </div>
      <div className={styles.revival}>
        <strong className={styles.head}>Revival:</strong>{' '}
        <MarkdownContent>{props.rules.revivalText}</MarkdownContent>
      </div>
      <div className={styles.rules}>
        <div className={styles.subtitle}>Advantages</div>
        {props.rules.advantages.map((rule) => (
          <div className={styles.rule} key={rule.title}>
            {rule.title && (
              <div className={styles.head}>
                {rule.title}
                {rule.karama && '*'}:&nbsp;
              </div>
            )}
            <div className={styles.text}>
              <MarkdownContent>{rule.text}</MarkdownContent>
            </div>
          </div>
        ))}
        <div className={styles.subtitle}>Alliance</div>
        <div className={styles.rule}>
          <div className={styles.text}>
            <MarkdownContent>{props.rules.alliance.text}</MarkdownContent>
          </div>
        </div>
        <div className={styles.subtitle}>Fate</div>
        <div className={styles.rule}>
          {props.rules.fate.title && <div className={styles.head}>{props.rules.fate.title}</div>}
          <div className={styles.text}>
            <MarkdownContent>{props.rules.fate.text}</MarkdownContent>
          </div>
        </div>
      </div>
    </div>
  );
}

export function FactionSheetPage2(props: SheetProps) {
  return (
    <>
      {props.rules.advantages.filter((r) => !!r.karama).length > 0 ||
      props.troops.length > 0 ||
      props.leaders.length > 0 ? (
        <div className={styles.page} data-faction-sheet-page="2">
          <div className={`${styles.page_subtitle} ${styles.subtitle}`}>Karama effects</div>
          <div className={styles.details}>
            <div className={styles.karama}>
              {props.rules.advantages
                .filter((r) => !!r.karama)
                .map((rule) => (
                  <div className={styles.rule} key={rule.title}>
                    <div className={styles.head}>{rule.title}:&nbsp;</div>
                    <div className={styles.text}>
                      <MarkdownContent>{rule.karama}</MarkdownContent>
                    </div>
                  </div>
                ))}
            </div>
            {props.troops.length > 0 && (
              <>
                <div className={styles.subtitle}>Troops</div>
                <div className={styles.troops}>
                  {props.troops.map((t) => {
                    if (isPreviewSheet(props)) {
                      const previewTroop = t as PreviewSheet['troops'][0];
                      return (
                        <div
                          key={`${previewTroop.image}-${previewTroop.name}`}
                          className={styles.troop}
                        >
                          <div>
                            <TroopToken
                              background={props.background}
                              image={previewTroop.image}
                              star={previewTroop.star}
                              striped={previewTroop.striped}
                            />
                          </div>
                          <section>
                            <div className={styles.head}>{previewTroop.name}</div>
                            <div className={styles.text}>
                              <MarkdownContent>{previewTroop.description}</MarkdownContent>
                            </div>
                          </section>

                          {previewTroop.back && (
                            <>
                              <img className={styles.icon} src="/vector/icon/flip.svg" alt="Flip" />
                              <div>to:</div>
                              <div>
                                <TroopToken
                                  background={props.background}
                                  image={previewTroop.back.image}
                                  star={previewTroop.back.star}
                                  striped={previewTroop.back.striped}
                                />
                              </div>
                              <section>
                                <div className={styles.head}>{previewTroop.back.name}</div>
                                <div className={styles.text}>
                                  <MarkdownContent>{previewTroop.back.description}</MarkdownContent>
                                </div>
                              </section>
                            </>
                          )}
                        </div>
                      );
                    }
                    return (
                      <div key={`${t.image}-${t.name}`} className={styles.troop}>
                        <img src={t.image} alt={t.name} />
                        <section>
                          <div className={styles.head}>{t.name}</div>
                          <div className={styles.text}>
                            <MarkdownContent>{t.description}</MarkdownContent>
                          </div>
                        </section>

                        {t.back && (
                          <>
                            <img className={styles.icon} src="/vector/icon/flip.svg" alt="Flip" />
                            <div>to:</div>
                            <img src={t.back.image} alt={t.back.name} />
                            <section>
                              <div className={styles.head}>{t.back.name}</div>
                              <div className={styles.text}>
                                <MarkdownContent>{t.back.description}</MarkdownContent>
                              </div>
                            </section>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
            {props.leaders.length > 0 && (
              <>
                <div className={styles.subtitle}>Leaders</div>
                <div className={styles.leaders}>
                  {props.leaders.map((l) => {
                    if (isPreviewLeader(l) && isPreviewSheet(props)) {
                      return (
                        <div key={l.image}>
                          <LeaderToken
                            background={props.background}
                            image={l.image}
                            logo={props.logo}
                            name={l.name}
                            strength={l.strength}
                          />
                        </div>
                      );
                    } else if (!isPreviewLeader(l)) {
                      return (
                        <div key={l}>
                          <img src={l} alt={l} />
                        </div>
                      );
                    }
                    return null;
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
      {/* {extras && extras.length > 0 && (
          <div className={styles.page_dynamic}>
            {extras.map((extra) => (
              <>
                <div className={styles.subtitle}>{extra.name}</div>
                <div className={styles.text}>
                  <MarkdownContent>{extra.description}</MarkdownContent>
                </div>
                <div className={styles.extra}>
                  {extra.items.map((item) => (
                    <div key={item.url}>
                      <img src={item.url} alt={item.url} />
                      {item?.description && (
                        <div className={styles.text}>
                          <MarkdownContent>{item.description}</MarkdownContent>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            ))}
          </div>
        )} */}
    </>
  );
}
