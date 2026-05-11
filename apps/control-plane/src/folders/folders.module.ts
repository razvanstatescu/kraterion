import { Module } from "@nestjs/common";
import { BucketsModule } from "../buckets/buckets.module.js";
import { FoldersController } from "./folders.controller.js";
import { FoldersService } from "./folders.service.js";

@Module({
  imports: [BucketsModule],
  controllers: [FoldersController],
  providers: [FoldersService],
  exports: [FoldersService],
})
export class FoldersModule {}
