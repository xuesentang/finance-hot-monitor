/**
 * 一次性迁移脚本：为现有 Keyword 记录填充 type 和 normalizedKey
 *
 * 用法：npx tsx scripts/migrate-keywords.ts
 */

import { prisma } from '../src/db.js';
import { detectKeywordType, extractCoreEntity } from '../src/services/ai.js';

async function main() {
  const keywords = await prisma.keyword.findMany();
  console.log(`Found ${keywords.length} keywords to migrate`);

  let updated = 0;
  for (const kw of keywords) {
    const type = detectKeywordType(kw.text);
    const normalizedKey = extractCoreEntity(kw.text, type);

    await prisma.keyword.update({
      where: { id: kw.id },
      data: { type, normalizedKey },
    });

    console.log(`  "${kw.text}" → type=${type}, normalizedKey=${normalizedKey}`);
    updated++;
  }

  console.log(`\nDone: ${updated} keywords updated`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
