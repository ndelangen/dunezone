import type { z } from 'zod';

import { MarkdownContent } from '../../../components/block/MarkdownContent';
import type { FactionRender } from '../../../schema/faction';
import { isLight } from '../../utils/contrast';
import { LeaderToken } from '../leader/Leader';
import { Token } from '../token/Token';
import { TroopToken } from '../troop/Troop';
import styles from './Sheet.module.css';

type SheetProps = z.infer<typeof FactionRender.sheet>;

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
        <Token logo={props.logo} background={props.background} />
      </div>
      <div className={styles.start}>
        <strong className={styles.head}>At start:</strong>{' '}
        <span className={styles.startingSpice} data-faction-starting-spice>
          <strong>Starting spice:</strong> {props.rules.spiceCount}
        </span>
        {props.rules.startText.trim().length > 0 ? (
          <>
            <span className={styles.setupSeparator} aria-hidden>
              ·
            </span>
            <span data-faction-start-instructions>
              <MarkdownContent forceInline>{props.rules.startText}</MarkdownContent>
            </span>
          </>
        ) : null}
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
                  {props.troops.map((troop) => (
                    <div key={`${troop.image}-${troop.name}`} className={styles.troop}>
                      <div>
                        <TroopToken
                          background={props.background}
                          image={troop.image}
                          star={troop.star}
                          striped={troop.striped}
                        />
                      </div>
                      <section>
                        <div className={`${styles.head} ${styles.troopHeading}`}>
                          <span>{troop.name}</span>
                          <span className={styles.troopSupply} data-faction-troop-supply>
                            ×{troop.count}
                          </span>
                        </div>
                        <div className={styles.text}>
                          <MarkdownContent>{troop.description}</MarkdownContent>
                        </div>
                      </section>

                      {troop.back && (
                        <>
                          <img className={styles.icon} src="/vector/icon/flip.svg" alt="Flip" />
                          <div>to:</div>
                          <div>
                            <TroopToken
                              background={props.background}
                              image={troop.back.image}
                              star={troop.back.star}
                              striped={troop.back.striped}
                            />
                          </div>
                          <section>
                            <div className={styles.head}>{troop.back.name}</div>
                            <div className={styles.text}>
                              <MarkdownContent>{troop.back.description}</MarkdownContent>
                            </div>
                          </section>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
            {props.leaders.length > 0 && (
              <>
                <div className={styles.subtitle}>Leaders</div>
                <div className={styles.leaders}>
                  {props.leaders.map((leader) => (
                    <div key={leader.image}>
                      <LeaderToken
                        background={props.background}
                        image={leader.image}
                        logo={props.logo}
                        name={leader.name}
                        strength={leader.strength}
                      />
                    </div>
                  ))}
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
