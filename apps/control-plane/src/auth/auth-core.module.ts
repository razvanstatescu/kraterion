import { Global, Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AuthGuard } from "./auth.guard.js";
import { TokensService } from "./tokens.service.js";

/**
 * Foundational auth providers (TokensService + AuthGuard) registered
 * globally so any module can `@UseGuards(AuthGuard)` without importing
 * AuthModule. Splitting these out of `AuthModule` proper avoids a
 * circular import: `ProjectsModule` would otherwise need `AuthModule`,
 * but `AuthModule`'s controller already imports `ProjectsModule` for the
 * dev-sign-up flow.
 *
 * Hard-fails at boot if `JWT_SECRET` is missing.
 */
function jwtSecret(): string {
  const secret = process.env["JWT_SECRET"];
  if (!secret) {
    throw new Error(
      "JWT_SECRET env var is not set. Generate with " +
        "`node -e 'console.log(require(\"crypto\").randomBytes(32).toString(\"hex\"))'`.",
    );
  }
  return secret;
}

@Global()
@Module({
  imports: [
    JwtModule.register({
      secret: jwtSecret(),
      signOptions: { algorithm: "HS256", expiresIn: "7d" },
    }),
  ],
  providers: [TokensService, AuthGuard],
  exports: [TokensService, AuthGuard, JwtModule],
})
export class AuthCoreModule {}
