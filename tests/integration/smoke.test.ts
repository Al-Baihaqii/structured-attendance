import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { readdirSync } from "node:fs";
import { withTestPrisma } from "./helpers/prisma";

test("isolated PostgreSQL has committed migrations and supports a city fixture", async () => {
  await withTestPrisma(async prisma => {
    const migrations = await prisma.$queryRaw<Array<{ migration_name: string }>>`
      SELECT migration_name FROM "_prisma_migrations"
      WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
    const expected = readdirSync("prisma/migrations", { withFileTypes: true })
      .filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
    assert.ok(expected.length > 0);
    assert.deepEqual(migrations.map(row => row.migration_name).sort(), expected);
    const id = randomUUID();
    try {
      await prisma.city.create({ data: { id, name: `Integration smoke ${id}` } });
      const city = await prisma.city.findUniqueOrThrow({ where: { id } });
      assert.equal(city.name, `Integration smoke ${id}`);
      assert.equal(city.isActive, true);
    } finally {
      // Never truncate shared tables; delete only this test's uniquely identified fixture.
      await prisma.city.deleteMany({ where: { id } });
    }
  });
});
