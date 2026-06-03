"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Mark } from "@/components/ui/Mark";
import { useResetOnboarding } from "@/lib/queries";

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
      { href: "/billing", label: "Billing", icon: "credit-card" },
      { href: "/settings", label: "Settings", icon: "settings" },
    ],
  },
];

interface Props {
  projectName?: string;
  accountEmail?: string | undefined;
  accountInitial?: string | undefined;
  /** Show the "Get started" sidebar shortcut. True when the user has
   *  dismissed (or graduated from) the onboarding card and might want
   *  to bring it back. */
  showGetStarted?: boolean;
}

export function Sidebar({
  projectName = "default",
  accountEmail,
  accountInitial = "?",
  showGetStarted = false,
}: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const reset = useResetOnboarding();
  const isActive = (href: string) => pathname === href || pathname?.startsWith(`${href}/`);

  const onGetStarted = () => {
    reset.mutate(undefined, {
      onSuccess: () => router.push("/buckets"),
    });
  };

  return (
    <aside className="ks-sidebar">
      <Link href="/buckets" className="ks-brand">
        <Mark size={28} variant="light" />
        <span className="ks-wordmark">Kraterion</span>
      </Link>

      {showGetStarted ? (
        <nav className="ks-nav" style={{ marginBottom: 12 }}>
          <button
            type="button"
            onClick={onGetStarted}
            className="ks-navitem"
            style={{
              width: "100%",
              background: "transparent",
              border: "1px solid var(--border)",
              cursor: "pointer",
              font: "inherit",
              textAlign: "left",
            }}
          >
            <Icon name="info" size={16} />
            <span>Get started</span>
          </button>
        </nav>
      ) : null}

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
