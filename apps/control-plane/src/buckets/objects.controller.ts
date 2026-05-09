import { Controller, Get, Param, Req, UseGuards } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { AuthGuard } from "../auth/auth.guard.js";
import { requireUser } from "../auth/request-context.js";
import { BucketsService } from "./buckets.service.js";
import { serializeObject } from "./serialize.js";

@Controller("v1/objects")
@UseGuards(AuthGuard)
export class ObjectsController {
  constructor(private readonly buckets: BucketsService) {}

  @Get(":objectId")
  async get(@Req() req: FastifyRequest, @Param("objectId") objectId: string) {
    const user = requireUser(req);
    const object = await this.buckets.getObject(user.accountId, objectId);
    return { object: serializeObject(object) };
  }
}
