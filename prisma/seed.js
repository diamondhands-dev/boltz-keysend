const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const bluewallet = await prisma.blacklist.upsert({
    where: { nodeId: '02c3be1b43f90f089fddeff84014dca38fd0f6ab4224dbf6c18a5e36d55d7917cc' },
    update: {},
    create: {
      nodeId: '02c3be1b43f90f089fddeff84014dca38fd0f6ab4224dbf6c18a5e36d55d7917cc',
      alias: 'bluewallet',
    },
  })

  const walletofsatoshi = await prisma.blacklist.upsert({
    where: { nodeId: '035e4ff418fc8b5554c5d9eea66396c227bd429a3251c8cbc711002ba215bfc226' },
    update: {},
    create: {
        nodeId: '035e4ff418fc8b5554c5d9eea66396c227bd429a3251c8cbc711002ba215bfc226',
        alias: 'walletofsatoshi',
    },
  })

  const bfx_lnd0 = await prisma.blacklist.upsert({
    where: { nodeId: '033d8656219478701227199cbd6f670335c8d408a92ae88b962c49d4dc0e83e025' },
    update: {},
    create: {
        nodeId: '033d8656219478701227199cbd6f670335c8d408a92ae88b962c49d4dc0e83e025',
        alias: 'bfx_lnd0',
    },
  })

  const bfx_lnd1 = await prisma.blacklist.upsert({
    where: { nodeId: '03cde60a6323f7122d5178255766e38114b4722ede08f7c9e0c5df9b912cc201d6' },
    update: {},
    create: {
        nodeId: '03cde60a6323f7122d5178255766e38114b4722ede08f7c9e0c5df9b912cc201d6',
        alias: 'bfx_lnd1',
    },
  })



  console.log({ bluewallet, walletofsatoshi, bfx_lnd0, bfx_lnd1 })
}
main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })