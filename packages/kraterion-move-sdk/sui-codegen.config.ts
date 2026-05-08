import type { SuiCodegenConfig } from "@mysten/codegen/config";

const config: SuiCodegenConfig = {
  output: "./src/generated",
  generateSummaries: true,
  prune: true,
  packages: [
    {
      package: "@local-pkg/kraterion",
      path: "../../move/kraterion",
    },
  ],
};

export default config;
