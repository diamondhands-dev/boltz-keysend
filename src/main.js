const lndService = require('./lndService');
const { PrismaClient } = require('@prisma/client');
require('dotenv').config();
const prisma = new PrismaClient();
const prisma_boltz = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL_BOLTZ,
    },
  },
});

main();

async function main() {
  const swaps =
    await prisma_boltz.$queryRaw`SELECT id, invoice, expectedAmount FROM Swaps WHERE status == 'transaction.claimed';`;
  for (const swap of swaps) {
    const id = await prisma.payment.findUnique({
      where: { id: swap.id },
    });
    if (!id) {
      const invoice = await lndService.decodePayReq(swap.invoice);
      // Check if the destination is not in a blacklist
      const blacklist = await prisma.blacklist.findUnique({
        where: { nodeId: invoice.destination },
      });
      if (!blacklist) {
        const create = await prisma.payment.create({
          data: {
            id: swap.id,
            swapAmount: swap.expectedAmount,
            payoutAmount: Math.floor(swap.expectedAmount * process.env.FEE),
            nodeId: invoice.destination,
          },
        });
      } else {
        console.log(`This node ${blacklist.nodeId} is in a blacklist`);
      }
    }
  }

  const payments = await prisma.payment.findMany({
    where: { status: 'created' },
    select: {
      id: true,
      swapAmount: true,
      payoutAmount: true,
      nodeId: true,
    },
  });

  for (const payment of payments) {
    lndService.keysend(payment.nodeId, payment.payoutAmount, payment.id);
  }
}
