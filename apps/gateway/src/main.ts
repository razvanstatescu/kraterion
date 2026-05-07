import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ bodyLimit: 13 * 1024 * 1024 * 1024 }),
  );
  const port = Number(process.env.PORT ?? 4002);
  await app.listen(port, "0.0.0.0");
}

bootstrap();
