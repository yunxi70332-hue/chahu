// v2.4 一次性迁移:存量产品 upstreamPrice = price
// 背景:v2.3 及之前导入的 price 就是上游大富报价;引入下浮模式后,price 语义变为
// 「代理收购价 = 上游价 ×(1-品类下浮%)」,因此把存量价原样回填为上游价,
// 再按当前下浮比例重算代理价(未配置下浮的品类代理价=上游价,行为不变)。
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEFAULT_RATES = { 手机: 2, 平板电脑: 3, 智能穿戴: 4, 笔记本电脑: 3, 配件: 5 };

async function main() {
  // Prisma 无法用字段值回填另一字段,逐条处理(1685 行,秒级)
  const products = await prisma.product.findMany({
    where: { upstreamPrice: null, price: { not: null } },
    select: { id: true, price: true },
  });
  for (const p of products) {
    await prisma.product.update({ where: { id: p.id }, data: { upstreamPrice: p.price } });
  }
  console.log(`[migrate-v2.4] upstreamPrice 回填 ${products.length} 条`);

  // 默认下浮比例(仅当尚未配置时写入)
  const existing = await prisma.setting.findUnique({ where: { key: 'markdown_rates' } });
  if (!existing) {
    await prisma.setting.create({
      data: { key: 'markdown_rates', value: JSON.stringify(DEFAULT_RATES) },
    });
    console.log('[migrate-v2.4] 已写入默认下浮比例', DEFAULT_RATES);
  } else {
    console.log('[migrate-v2.4] markdown_rates 已存在,跳过');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
