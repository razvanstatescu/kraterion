import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

interface Props {
  icon?: IconName;
  title: string;
  body?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({ icon = "inbox", title, body, action }: Props) {
  return (
    <div className="ks-empty">
      <div className="ks-empty-icon"><Icon name={icon} size={20} /></div>
      <div className="ks-empty-title">{title}</div>
      {body ? <div className="ks-empty-body">{body}</div> : null}
      {action ? <div style={{ marginTop: 16 }}>{action}</div> : null}
    </div>
  );
}
