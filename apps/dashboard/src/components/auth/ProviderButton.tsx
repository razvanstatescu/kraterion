import { type ReactNode } from "react";
import { GoogleLogo } from "./GoogleLogo";
import { GithubLogo } from "./GithubLogo";

type Provider = "google" | "github";

interface Props {
  provider: Provider;
  onClick?: () => void;
  loading?: boolean;
  disabled?: boolean;
  comingSoon?: boolean;
}

const LABEL: Record<Provider, string> = {
  google: "Continue with Google",
  github: "Continue with GitHub",
};

export function ProviderButton({ provider, onClick, loading, disabled, comingSoon }: Props) {
  const isDisabled = disabled || loading || comingSoon;
  const Logo = provider === "google" ? GoogleLogo : GithubLogo;

  return (
    <button
      type="button"
      onClick={comingSoon ? undefined : onClick}
      disabled={isDisabled}
      aria-disabled={isDisabled || undefined}
      className="ks-provider"
      data-provider={provider}
      data-coming-soon={comingSoon || undefined}
    >
      <span className="ks-provider-logo">
        <Logo size={18} />
      </span>
      <span className="ks-provider-label">
        {loading ? "Signing in…" : LABEL[provider]}
      </span>
      {comingSoon ? <ComingSoonTag /> : null}
    </button>
  );
}

function ComingSoonTag(): ReactNode {
  return <span className="ks-provider-tag">Coming soon</span>;
}
