import { Module } from "@nestjs/common";
import { OnboardingController } from "./onboarding.controller.js";
import { OnboardingService } from "./onboarding.service.js";

@Module({
  providers: [OnboardingService],
  controllers: [OnboardingController],
})
export class OnboardingModule {}
