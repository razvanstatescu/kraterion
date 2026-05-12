"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Mark } from "@/components/ui/Mark";

interface NavItem {
  href: string;
  label: string;
  icon: IconName;
}

interface NavGroup {
  label?: string;
  items: NavItem[];
}

const GROUPS: NavGroup[] = [
  {
    label: "Storage",
    items: [
      { href: "/buckets", label: "Buckets", icon: "bucket" },
      { href: "/keys",    label: "Access keys", icon: "key" },
      { href: "/usage",   label: "Usage", icon: "chart" },
    ],
  },
  {
    label: "AI",
    items: [
      { href: "/agents",  label: "Agents", icon: "lock" },
    ],
  },
  {
    label: "Account",
    items: [
      { href: "/activity", label: "Activity", icon: "info" },
      { href: "/settings", label: "Settings", icon: "settings" },
    ],
  },
];

interface Props {
  projectName?: string;
  accountEmail?: string | undefined;
  accountInitial?: string | undefined;
}

export function Sidebar({ projectName = "default", accountEmail, accountInitial = "?" }: Props) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname?.startsWith(`${href}/`);

  return (
    <aside className="ks-sidebar">
      <Link href="/buckets" className="ks-brand">
        <Mark size={28} variant="light" />
        <span className="ks-wordmark">Kraterion</span>
      </Link>

      {GROUPS.map((group, idx) => (
        <div key={idx}>
          {group.label ? <div className="ks-nav-group">{group.label}</div> : null}
          <nav className="ks-nav">
            {group.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`ks-navitem${isActive(item.href) ? " is-active" : ""}`}
              >
                <Icon name={item.icon} size={16} />
                <span>{item.label}</span>
              </Link>
            ))}
          </nav>
        </div>
      ))}

      <div className="ks-org">
        <div className="micro" style={{ marginBottom: 6 }}>Project</div>
        <div className="ks-orgname">{projectName}</div>
        <div className="ks-orgmeta">testnet</div>
      </div>

      <div className="ks-account">
        <div className="ks-avatar">{accountInitial}</div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 500,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {accountEmail ?? "Signed in"}
          </div>
        </div>
        <Icon name="chevronDown" size={14} />
      </div>
    </aside>
  );
}
