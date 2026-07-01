import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const adminPhone = '2348000000000';
  const ownerPhone = '2348011111111';
  const driverPhone = '2348022222222';

  const pinHash = await bcrypt.hash('1234', 10);

  const admin = await prisma.user.upsert({
    where: { phone: adminPhone },
    create: {
      phone: adminPhone,
      role: UserRole.admin,
      fullName: 'SureDriver Admin',
      pinHash,
    },
    update: { pinHash, fullName: 'SureDriver Admin' },
  });

  await prisma.invite.upsert({
    where: { phone: ownerPhone },
    create: { phone: ownerPhone, role: UserRole.owner },
    update: {},
  });

  await prisma.invite.upsert({
    where: { phone: driverPhone },
    create: { phone: driverPhone, role: UserRole.driver },
    update: {},
  });

  let owner = await prisma.user.findUnique({ where: { phone: ownerPhone } });
  if (!owner) {
    owner = await prisma.user.create({
      data: {
        phone: ownerPhone,
        role: UserRole.owner,
        fullName: 'Mrs. Halima Adebayo',
        pinHash,
        ownerProfile: {
          create: {
            defaultAddress: '12 Admiralty Way, Lekki, Lagos',
            emergencyContact: '2348033333333',
          },
        },
      },
    });
  } else {
    owner = await prisma.user.update({
      where: { id: owner.id },
      data: { fullName: 'Mrs. Halima Adebayo', pinHash },
    });
  }

  const ownerProfile = await prisma.ownerProfile.findUnique({ where: { userId: owner.id } });
  if (ownerProfile) {
    const existingVehicle = await prisma.vehicle.findFirst({
      where: { ownerProfileId: ownerProfile.id },
    });
    if (!existingVehicle) {
      await prisma.vehicle.create({
        data: {
          ownerProfileId: ownerProfile.id,
          make: 'Toyota',
          model: 'Camry',
          plateNumber: 'LAG-123-XY',
          color: 'Silver',
        },
      });
    }
  }

  let driver = await prisma.user.findUnique({ where: { phone: driverPhone } });
  if (!driver) {
    driver = await prisma.user.create({
      data: {
        phone: driverPhone,
        role: UserRole.driver,
        fullName: 'Emeka Bello',
        pinHash,
        driverProfile: {
          create: {
            verificationStatus: 'approved',
            bankCode: '058',
            bankName: 'GTBank',
            accountNumber: '0123456789',
            accountName: 'Emeka Bello',
            isOnline: false,
          },
        },
      },
    });
  } else {
    await prisma.driverProfile.updateMany({
      where: { userId: driver.id },
      data: { verificationStatus: 'approved' },
    });
    await prisma.user.update({
      where: { id: driver.id },
      data: { fullName: 'Emeka Bello', pinHash },
    });
  }

  console.log('Seed complete');
  console.log('Admin:', adminPhone, 'PIN: 1234');
  console.log('Owner:', ownerPhone, 'PIN: 1234');
  console.log('Driver:', driverPhone, 'PIN: 1234');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
