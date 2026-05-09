import { Module } from "@nestjs/common";
import { ProjectsModule } from "../projects/projects.module.js";
import { BucketsController } from "./buckets.controller.js";
import { BucketsService } from "./buckets.service.js";
import { ObjectsController } from "./objects.controller.js";
import { PrepareTxController } from "./prepare/prepare.controller.js";
import { PrepareTxService } from "./prepare/prepare.service.js";

@Module({
  imports: [ProjectsModule],
  controllers: [BucketsController, ObjectsController, PrepareTxController],
  providers: [BucketsService, PrepareTxService],
  exports: [BucketsService],
})
export class BucketsModule {}
