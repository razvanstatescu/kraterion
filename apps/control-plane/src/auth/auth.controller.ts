import { Body, Controller, NotFoundException, Post } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { ApiKeysService } from "../api-keys/api-keys.service.js";
import { ControlPlaneError } from "../errors/control-plane-error.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { ProjectsService } from "../projects/projects.service.js";
import { parseBody } from "../validation/zod-pipe.js";
import {
  type DevSignInDto,
  type DevSignUpDto,
  devSignInSchema,
  devSignUpSchema,
} from "./dto.js";
import { TokensService } from "./tokens.service.js";

const isProd = () => process.env["NODE_ENV"] === "production";

/**
 * Phase-1 auth surface. Both endpoints are dev-only — they return 404 in
 * production. Phase 4 replaces them with real zkLogin / Google OAuth.
 */
@Controller("v1/auth")
export class AuthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokensService,
    private readonly projects: ProjectsService,
    private readonly apiKeys: ApiKeysService,
  ) {}

  /**
   * Create an account, first project, and first API key in one call.
   * Returns the cleartext secret exactly once; the caller is expected
   * to store it.
   *
   * Idempotent it is not — re-running with the same email returns 409.
   */
  @Post("dev-sign-up")
  async devSignUp(@Body(parseBody(devSignUpSchema)) dto: DevSignUpDto) {
    if (isProd()) throw new NotFoundException();

    const projectName = dto.project_name ?? "default";
    const keyName = dto.key_name ?? "default";

    const result = await this.prisma
      .$transaction(async (tx) => {
        const account = await tx.account.create({
          data: {
            email: dto.email,
            zklogin_sub: `dev:${dto.email}`,
            sui_address: dto.sui_address,
            status: "active",
          },
        });
        const project = await this.projects.create(account.id, projectName, tx);
        const minted = await this.apiKeys.mint(project.id, keyName, tx);
        return { account, project, minted };
      })
      .catch((err) => {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          const target = ((err.meta as { target?: string[] | string } | undefined)?.target ?? []) as string[] | string;
          const field = Array.isArray(target) ? target[0] : String(target);
          throw new ControlPlaneError("Conflict", `Account ${field} already in use`, {
            field: field ?? "unknown",
          });
        }
        throw err;
      });

    const token = this.tokens.sign({
      sub: result.account.id,
      email: result.account.email,
      sui_address: result.account.sui_address,
    });

    return {
      account: redactAccount(result.account),
      project: result.project,
      akia: result.minted.apiKey.access_key_id,
      secret: result.minted.secret,
      api_key_id: result.minted.apiKey.id,
      token,
      WARNING: "The `secret` field is shown only once. Store it now; it cannot be retrieved later.",
    };
  }

  /**
   * Dev-only sign-in by email. No password — Phase 4 replaces with zkLogin.
   */
  @Post("dev-sign-in")
  async devSignIn(@Body(parseBody(devSignInSchema)) dto: DevSignInDto) {
    if (isProd()) throw new NotFoundException();

    const account = await this.prisma.account.findUnique({ where: { email: dto.email } });
    if (!account) {
      throw new ControlPlaneError("NotFound", "Account not found");
    }
    const token = this.tokens.sign({
      sub: account.id,
      email: account.email,
      sui_address: account.sui_address,
    });
    return { account: redactAccount(account), token };
  }
}

function redactAccount<T extends { id: string; email: string; sui_address: string; status: string; created_at: Date }>(a: T) {
  return {
    id: a.id,
    email: a.email,
    sui_address: a.sui_address,
    status: a.status,
    created_at: a.created_at,
  };
}
