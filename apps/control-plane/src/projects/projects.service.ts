import { Injectable } from "@nestjs/common";
import { Prisma, type Project } from "@prisma/client";
import { ControlPlaneError } from "../errors/control-plane-error.js";
import { PrismaService } from "../prisma/prisma.service.js";

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    accountId: string,
    name: string,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<Project> {
    try {
      return await tx.project.create({
        data: { account_id: accountId, name },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        throw new ControlPlaneError("Conflict", "Project name already in use", { name });
      }
      throw err;
    }
  }

  async listForAccount(accountId: string): Promise<Project[]> {
    return this.prisma.project.findMany({
      where: { account_id: accountId },
      orderBy: { created_at: "asc" },
    });
  }

  /**
   * Fetch a project, asserting it belongs to the caller. 404 on both
   * missing-and-not-yours so we don't leak project existence across
   * accounts.
   */
  async getOwned(accountId: string, projectId: string): Promise<Project> {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project || project.account_id !== accountId) {
      throw new ControlPlaneError("NotFound", "Project not found");
    }
    return project;
  }
}
