import { formatAddress } from "@/lib/format";
import { Icon } from "./Icon";

interface Props {
  label: string;
  value: string;
  href?: string;
}

/**
 * `label · mono truncated address · ↗` row. Used wherever an on-chain
 * object is referenced — file drawer, activity feed, revocation banner.
 */
export function OnchainRef({ label, value, href }: Props) {
  const truncated = formatAddress(value);
  const content = (
    <span className="ks-onchain-value">
      <span className="ks-onchain-mono">{truncated}</span>
      {href ? <Icon name="arrow-up-right" size={14} /> : null}
    </span>
  );
  return (
    <div className="ks-onchain-row">
      <span className="ks-onchain-label">{label}</span>
      {href ? (
        <a className="ks-onchain-value" href={href} target="_blank" rel="noreferrer">
          <span className="ks-onchain-mono">{truncated}</span>
          <Icon name="arrow-up-right" size={14} />
        </a>
      ) : (
        content
      )}
    </div>
  );
}
