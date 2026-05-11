import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

type Tone = "info" | "success" | "warning" | "error";

interface Props {
  tone?: Tone;
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  icon?: IconName;
}

const DEFAULT_ICON: Record<Tone, IconName> = {
  info: "info",
  success: "info",
  warning: "alert",
  error: "shieldOff",
};

export function Banner({ tone = "info", title, body, action, icon }: Props) {
  return (
    <div className={`ks-banner ks-banner-${tone}`}>
      <div className={`ks-banner-icon ks-banner-icon-${tone}`}>
        <Icon name={icon ?? DEFAULT_ICON[tone]} size={14} />
      </div>
      <div className="ks-banner-text">
        <div className="ks-banner-title">{title}</div>
        {body ? <div className="ks-banner-body">{body}</div> : null}
      </div>
      {action ? <div>{action}</div> : null}
    </div>
  );
}
