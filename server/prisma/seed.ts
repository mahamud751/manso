import { PrismaClient, FulfilmentMode, OrderStatus, PaymentMethod, PaymentState, ProductKind, RefundStatus, ReleaseStatus, StreamStatus, SupportStatus, SupportTopic, UserRole } from '@prisma/client';
import { addDays, dateOnly, dhakaDateString, dhakaParts } from '../src/common/time';

const prisma = new PrismaClient();

function atDhaka(isoDate: string, hour: number, minute = 0) {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour - 6, minute, 0));
}

async function main() {
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;
  for (const table of tables) {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${table.tablename}" RESTART IDENTITY CASCADE`);
  }

  const now = new Date();
  const today = dhakaDateString(now);
  const yesterday = addDays(today, -1);
  const hour = dhakaParts(now).hour;
  const streamStatus = hour >= 10 && hour < 16 ? StreamStatus.LIVE : hour >= 16 ? StreamStatus.ENDED : StreamStatus.SCHEDULED;

  const uposhahar = await prisma.branch.create({
    data: {
      slug: 'uposhahar',
      name: 'MANSO Uposhahar',
      area: 'Uposhahar',
      addressLine: 'House 12, Road 4, Uposhahar',
      city: 'Sylhet',
      phone: '+8801711002200',
      lat: 24.9048,
      lng: 91.8924,
      opensAt: '09:00',
      closesAt: '20:00',
      collectionOpensAt: '12:00',
      deliveryStartsAt: '14:00',
      deliveryFeePoisha: 6000,
      minOrderPoisha: 50000,
      imageUrl: '/media/shop.jpg',
    },
  });
  const zindabazar = await prisma.branch.create({
    data: {
      slug: 'zindabazar',
      name: 'MANSO Zindabazar',
      area: 'Zindabazar',
      addressLine: 'Zindabazar Road, Sylhet',
      city: 'Sylhet',
      phone: '+8801711002201',
      lat: 24.8972,
      lng: 91.8711,
      opensAt: '09:00',
      closesAt: '20:00',
      collectionOpensAt: '12:00',
      deliveryStartsAt: '14:00',
      deliveryFeePoisha: 8000,
      minOrderPoisha: 50000,
      imageUrl: '/media/shop.jpg',
    },
  });

  await prisma.zone.createMany({
    data: [
      { branchId: uposhahar.id, name: 'Uposhahar', feePoisha: 6000 },
      { branchId: uposhahar.id, name: 'Shahjalal Upashahar', feePoisha: 6000 },
      { branchId: zindabazar.id, name: 'Zindabazar', feePoisha: 8000 },
    ],
  });

  const slotRows = [
    [FulfilmentMode.DELIVERY, '2–4 pm', 14 * 60, 16 * 60, 8],
    [FulfilmentMode.DELIVERY, '4–6 pm', 16 * 60, 18 * 60, 8],
    [FulfilmentMode.DELIVERY, '6–8 pm', 18 * 60, 20 * 60, 6],
    [FulfilmentMode.COLLECTION, '12–2 pm', 12 * 60, 14 * 60, 10],
    [FulfilmentMode.COLLECTION, '2–4 pm', 14 * 60, 16 * 60, 10],
    [FulfilmentMode.COLLECTION, '4–6 pm', 16 * 60, 18 * 60, 8],
    [FulfilmentMode.COLLECTION, '6–8 pm', 18 * 60, 20 * 60, 6],
  ] as const;
  for (const branch of [uposhahar, zindabazar]) {
    for (const [mode, label, startMinutes, endMinutes, capacity] of slotRows) {
      await prisma.slotTemplate.create({
        data: { branchId: branch.id, mode, label, startMinutes, endMinutes, capacity },
      });
    }
  }
  const deliverySlot = await prisma.slotTemplate.findFirstOrThrow({
    where: { branchId: uposhahar.id, mode: FulfilmentMode.DELIVERY, startMinutes: 14 * 60 },
  });
  const collectionSlot = await prisma.slotTemplate.findFirstOrThrow({
    where: { branchId: uposhahar.id, mode: FulfilmentMode.COLLECTION, startMinutes: 14 * 60 },
  });

  const facility = await prisma.facility.create({ data: { name: 'Manso Sylhet facility' } });
  const beef = await prisma.category.create({ data: { slug: 'beef', nameEn: 'Beef', nameBn: 'গরুর মাংস', sort: 1 } });

  const defs = [
    {
      slug: 'beef-with-bone',
      kind: ProductKind.BEEF,
      nameEn: 'Beef with bone',
      nameBn: 'হাড়সহ গরু',
      descriptionEn: 'Fresh beef with bone from today’s released batch. A rich cut for curry.',
      descriptionBn: 'আজকের ছাড় করা ব্যাচের হাড়সহ তাজা গরুর মাংস। কারি রান্নার জন্য।',
      boneContent: 'With bone',
      imageUrl: '/media/bone.jpg',
      sort: 1,
      price: 75000,
      otherPrice: 76000,
      options: [
        ['Curry cut', 'কারি কাট'],
        ['Large pieces', 'বড় টুকরা'],
      ],
    },
    {
      slug: 'boneless-beef',
      kind: ProductKind.BONELESS,
      nameEn: 'Boneless beef',
      nameBn: 'হাড়বিহীন গরু',
      descriptionEn: 'Lean boneless beef, trimmed for kebabs, stir fry and steak slices.',
      descriptionBn: 'কাবাব, ভাজি আর স্লাইসের জন্য ছাঁটা হাড়বিহীন গরু।',
      boneContent: 'Boneless',
      imageUrl: '/media/boneless.jpg',
      sort: 2,
      price: 95000,
      otherPrice: 96000,
      options: [
        ['Curry cut', 'কারি কাট'],
        ['Steak slices', 'স্টেক স্লাইস'],
      ],
    },
    {
      slug: 'beef-mince',
      kind: ProductKind.MINCE,
      nameEn: 'Beef mince',
      nameBn: 'গরুর কিমা',
      descriptionEn: 'Freshly minced beef from the same day’s batch.',
      descriptionBn: 'একই দিনের ব্যাচ থেকে তাজা গরুর কিমা।',
      boneContent: 'Minced',
      imageUrl: '/media/mince.jpg',
      sort: 3,
      price: 85000,
      otherPrice: 86000,
      options: [
        ['Fine', 'মিহি'],
        ['Coarse', 'মোটা'],
      ],
    },
    {
      slug: 'beef-curry-cut',
      kind: ProductKind.BEEF,
      nameEn: 'Beef curry cut',
      nameBn: 'গরুর কারি কাট',
      descriptionEn: 'Medium curry pieces with a little bone, ready for the pot.',
      descriptionBn: 'সামান্য হাড়সহ মাঝারি কারি টুকরা।',
      boneContent: 'Some bone',
      imageUrl: '/media/curry.jpg',
      sort: 4,
      price: 78000,
      otherPrice: 79000,
      options: [
        ['Medium curry', 'মাঝারি কারি'],
        ['Large pieces', 'বড় টুকরা'],
      ],
    },
  ];

  const products = [];
  for (const def of defs) {
    const product = await prisma.product.create({
      data: {
        slug: def.slug,
        categoryId: beef.id,
        kind: def.kind,
        nameEn: def.nameEn,
        nameBn: def.nameBn,
        descriptionEn: def.descriptionEn,
        descriptionBn: def.descriptionBn,
        boneContent: def.boneContent,
        imageUrl: def.imageUrl,
        sort: def.sort,
        options: { create: def.options.map(([nameEn, nameBn], index) => ({ nameEn, nameBn, sort: index })) },
      },
    });
    await prisma.priceVersion.create({
      data: { productId: product.id, branchId: uposhahar.id, pricePerKgPoisha: def.price, effectiveFrom: atDhaka(yesterday, 6) },
    });
    await prisma.priceVersion.create({
      data: { productId: product.id, branchId: zindabazar.id, pricePerKgPoisha: def.otherPrice, effectiveFrom: atDhaka(yesterday, 6) },
    });
    products.push(product);
  }

  const batchToday = await prisma.batch.create({
    data: {
      code: '024',
      facilityId: facility.id,
      branchId: uposhahar.id,
      preparationDate: dateOnly(today),
      releaseStatus: ReleaseStatus.RELEASED,
      notes: 'Released saleable cuts from today’s preparation.',
    },
  });
  const batchOld = await prisma.batch.create({
    data: {
      code: '023',
      facilityId: facility.id,
      branchId: uposhahar.id,
      preparationDate: dateOnly(yesterday),
      releaseStatus: ReleaseStatus.SOLD_OUT,
      notes: 'Previous batch. Saleable weight is finished.',
    },
  });
  const batchOther = await prisma.batch.create({
    data: {
      code: '011',
      facilityId: facility.id,
      branchId: zindabazar.id,
      preparationDate: dateOnly(today),
      releaseStatus: ReleaseStatus.RELEASED,
    },
  });

  const todayStock = [18000, 12000, 10000, 15000];
  const soldToday = [1000, 1000, 0, 0];
  for (let i = 0; i < products.length; i += 1) {
    await prisma.batchCutStock.create({
      data: {
        batchId: batchToday.id,
        productId: products[i].id,
        saleableGrams: todayStock[i],
        soldGrams: soldToday[i],
      },
    });
    await prisma.batchCutStock.create({
      data: {
        batchId: batchOld.id,
        productId: products[i].id,
        saleableGrams: 8000,
        soldGrams: 8000,
      },
    });
    await prisma.batchCutStock.create({
      data: {
        batchId: batchOther.id,
        productId: products[i].id,
        saleableGrams: 6000,
        soldGrams: 0,
      },
    });
    await prisma.inventoryMovement.create({
      data: { batchId: batchToday.id, productId: products[i].id, type: 'RELEASE', grams: todayStock[i], note: 'Released for sale' },
    });
  }

  const session = await prisma.streamSession.create({
    data: {
      facilityId: facility.id,
      branchId: uposhahar.id,
      batchId: batchToday.id,
      titleEn: 'Today’s cutting session',
      titleBn: 'আজকের কাটিং সেশন',
      summaryEn: 'Fresh beef from our Sylhet facility. Preparation and cutting only.',
      summaryBn: 'সিলেট ফ্যাসিলিটি থেকে তাজা গরু। শুধু প্রস্তুতি ও কাটিং।',
      status: streamStatus,
      scheduledStart: atDhaka(today, 10),
      scheduledEnd: atDhaka(today, 13),
      startedAt: streamStatus === StreamStatus.SCHEDULED ? null : atDhaka(today, 10),
      endedAt: streamStatus === StreamStatus.ENDED ? atDhaka(today, 13) : null,
      heartbeatAt: streamStatus === StreamStatus.LIVE ? now : null,
      posterUrl: '/media/live.jpg',
      pins: { create: products.map((product, index) => ({ productId: product.id, sort: index })) },
    },
  });
  await prisma.replayAsset.create({
    data: {
      batchId: batchOld.id,
      branchId: uposhahar.id,
      titleEn: 'Full cutting session',
      titleBn: 'পুরো কাটিং সেশন',
      summaryEn: 'Yesterday’s preparation. This batch is sold out.',
      summaryBn: 'গতকালের প্রস্তুতি। এই ব্যাচ শেষ।',
      recordedAt: atDhaka(yesterday, 10),
      durationSec: 2 * 60 * 60 + 13 * 60,
      viewCount: 0,
      posterUrl: '/media/live.jpg',
      published: true,
      orderable: false,
    },
  });

  const customer = await prisma.user.create({
    data: {
      phone: '+8801712345678',
      name: 'Customer',
      role: UserRole.CUSTOMER,
      preferredBranchId: uposhahar.id,
      consent: { create: { liveAlerts: true, offers: false, orderUpdates: true, termsAcceptedAt: now } },
    },
  });
  const address = await prisma.address.create({
    data: {
      userId: customer.id,
      label: 'Home',
      line1: 'House 12, Road 4',
      area: 'Uposhahar',
      city: 'Sylhet',
      postcode: '3100',
      isDefault: true,
    },
  });
  const owner = await prisma.user.create({
    data: { phone: '+8801700000001', name: 'Manso Owner', role: UserRole.OWNER, consent: { create: {} } },
  });
  const driver = await prisma.user.create({
    data: {
      phone: '+8801700000002',
      name: 'Rafiq',
      role: UserRole.DRIVER,
      staffBranchId: uposhahar.id,
      consent: { create: {} },
    },
  });

  const addressSnapshot = {
    id: address.id,
    label: 'Home',
    line1: 'House 12, Road 4',
    area: 'Uposhahar',
    city: 'Sylhet',
    postcode: '3100',
  };
  const bone = products[0];
  const boneless = products[1];

  const delivered = await prisma.order.create({
    data: {
      number: 1024,
      userId: customer.id,
      branchId: uposhahar.id,
      mode: FulfilmentMode.DELIVERY,
      status: OrderStatus.DELIVERED,
      paymentState: PaymentState.PAID,
      paymentMethod: PaymentMethod.BKASH,
      serviceDate: dateOnly(yesterday),
      slotTemplateId: deliverySlot.id,
      slotLabel: '2–4 pm',
      addressSnapshot,
      subtotalPoisha: 170000,
      feePoisha: 6000,
      totalPoisha: 176000,
      lines: {
        create: [
          line(bone, batchOld.id, '023', 1000, 75000, 75000, 'Curry cut'),
          line(boneless, batchOld.id, '023', 1000, 95000, 95000, 'Curry cut'),
        ],
      },
      payments: {
        create: {
          method: PaymentMethod.BKASH,
          amountPoisha: 176000,
          state: PaymentState.PAID,
          transactionId: 'BK9F4H7D2E',
          providerRef: 'BK9F4H7D2E',
          createdAt: atDhaka(yesterday, 12, 18),
        },
      },
      events: {
        create: [
          { status: OrderStatus.RECEIVED, note: 'Order placed', createdAt: atDhaka(yesterday, 12, 10) },
          { status: OrderStatus.ACCEPTED, note: 'Accepted', createdAt: atDhaka(yesterday, 12, 15) },
          { status: OrderStatus.PREPARING, note: 'Being prepared', createdAt: atDhaka(yesterday, 12, 40) },
          { status: OrderStatus.READY, note: 'Packed', createdAt: atDhaka(yesterday, 13, 20) },
          { status: OrderStatus.OUT_FOR_DELIVERY, note: 'On the way', createdAt: atDhaka(yesterday, 14, 10) },
          { status: OrderStatus.DELIVERED, note: 'Delivered', createdAt: atDhaka(yesterday, 14, 5) },
        ],
      },
    },
  });
  await prisma.refund.create({
    data: {
      orderId: delivered.id,
      amountPoisha: 75000,
      reason: 'Bone-in cut was not the requested size.',
      status: RefundStatus.UNDER_REVIEW,
      createdAt: atDhaka(yesterday, 15, 10),
    },
  });
  await prisma.supportCase.create({
    data: {
      userId: customer.id,
      orderId: delivered.id,
      topic: SupportTopic.WRONG_CUT,
      message: 'The bone-in pieces were larger than the curry cut I asked for.',
      status: SupportStatus.REVIEWING,
      createdAt: atDhaka(yesterday, 15, 10),
    },
  });

  await prisma.order.create({
    data: {
      number: 1025,
      userId: customer.id,
      branchId: uposhahar.id,
      mode: FulfilmentMode.COLLECTION,
      status: OrderStatus.COLLECTED,
      paymentState: PaymentState.PAID,
      paymentMethod: PaymentMethod.CASH,
      serviceDate: dateOnly(yesterday),
      slotTemplateId: collectionSlot.id,
      slotLabel: '2–4 pm',
      addressSnapshot: {
        label: uposhahar.name,
        line1: uposhahar.addressLine,
        area: uposhahar.area,
        city: uposhahar.city,
      },
      subtotalPoisha: 170000,
      feePoisha: 0,
      totalPoisha: 170000,
      collectionCode: '4826',
      lines: {
        create: [
          line(bone, batchOld.id, '023', 1000, 75000, 75000, 'Large pieces'),
          line(boneless, batchOld.id, '023', 1000, 95000, 95000, 'Steak slices'),
        ],
      },
      payments: {
        create: { method: PaymentMethod.CASH, amountPoisha: 170000, state: PaymentState.PAID, transactionId: 'CASH-1025' },
      },
      events: {
        create: [
          { status: OrderStatus.RECEIVED, createdAt: atDhaka(yesterday, 11, 5) },
          { status: OrderStatus.READY, note: 'Ready for collection', createdAt: atDhaka(yesterday, 13, 30) },
          { status: OrderStatus.COLLECTED, note: 'Collected at branch', createdAt: atDhaka(yesterday, 15, 25) },
        ],
      },
    },
  });

  const active = await prisma.order.create({
    data: {
      number: 1026,
      userId: customer.id,
      branchId: uposhahar.id,
      mode: FulfilmentMode.DELIVERY,
      status: OrderStatus.OUT_FOR_DELIVERY,
      paymentState: PaymentState.PAID,
      paymentMethod: PaymentMethod.BKASH,
      serviceDate: dateOnly(today),
      slotTemplateId: deliverySlot.id,
      slotLabel: '2–4 pm',
      addressSnapshot,
      subtotalPoisha: 170000,
      feePoisha: 6000,
      totalPoisha: 176000,
      lines: {
        create: [
          line(bone, batchToday.id, '024', 1000, 75000, 75000, 'Curry cut'),
          line(boneless, batchToday.id, '024', 1000, 95000, 95000, 'Curry cut'),
        ],
      },
      payments: {
        create: {
          method: PaymentMethod.BKASH,
          amountPoisha: 176000,
          state: PaymentState.PAID,
          transactionId: 'BK2LIVE1026',
          createdAt: atDhaka(today, 11, 5),
        },
      },
      events: {
        create: [
          { status: OrderStatus.RECEIVED, createdAt: atDhaka(today, 11, 2) },
          { status: OrderStatus.ACCEPTED, createdAt: atDhaka(today, 11, 20) },
          { status: OrderStatus.PREPARING, createdAt: atDhaka(today, 11, 40) },
          { status: OrderStatus.READY, createdAt: atDhaka(today, 12, 10) },
          { status: OrderStatus.OUT_FOR_DELIVERY, note: 'Out for delivery', createdAt: atDhaka(today, 14, 5) },
        ],
      },
    },
  });
  await prisma.driverAssignment.create({
    data: { orderId: active.id, driverId: driver.id, status: 'OUT' },
  });

  await prisma.notificationEvent.createMany({
    data: [
      {
        userId: customer.id,
        type: 'GO_LIVE',
        sessionId: session.id,
        titleEn: 'Manso is live now',
        titleBn: 'ম্যানসো এখন লাইভ',
        bodyEn: 'Fresh beef is available at MANSO Uposhahar. Order for delivery from 2 pm.',
        bodyBn: 'ম্যানসো উপশহরে তাজা গরু পাওয়া যাচ্ছে। দুপুর ২টা থেকে ডেলিভারি।',
        deepLink: `live:${session.id}`,
        dedupeKey: `live:${session.id}:GO_LIVE`,
        createdAt: atDhaka(today, 10, 1),
      },
      {
        userId: customer.id,
        type: 'ORDER_UPDATE',
        orderId: active.id,
        titleEn: 'Your order is on the way',
        titleBn: 'আপনার অর্ডার রওনা হয়েছে',
        bodyEn: `Order #1026 is out for delivery, 2–4 pm.`,
        bodyBn: 'অর্ডার #1026 ডেলিভারিতে বের হয়েছে, দুপুর ২টা–৪টা।',
        deepLink: `order:${active.id}`,
        dedupeKey: `order:${active.id}:OUT_FOR_DELIVERY`,
        createdAt: atDhaka(today, 14, 5),
      },
      {
        userId: customer.id,
        type: 'ORDER_UPDATE',
        orderId: delivered.id,
        titleEn: 'Order delivered',
        titleBn: 'অর্ডার পৌঁছেছে',
        bodyEn: 'Order #1024 was delivered. Thank you for choosing MANSO.',
        bodyBn: 'অর্ডার #1024 পৌঁছেছে। ম্যানসো বেছে নেওয়ার জন্য ধন্যবাদ।',
        deepLink: `order:${delivered.id}`,
        dedupeKey: `order:${delivered.id}:DELIVERED`,
        createdAt: atDhaka(yesterday, 14, 6),
      },
    ],
  });

  await prisma.policyPage.createMany({
    data: [
      {
        slug: 'terms',
        titleEn: 'Terms and conditions',
        titleBn: 'শর্তাবলি',
        bodyEn:
          'Manso sells fixed-weight packs of fresh beef from the branch you select. Delivery windows start at 2:00 pm Bangladesh time. A checkout hold lasts 10 minutes and freezes the quoted price. Cash is due on delivery or collection. Online payment is confirmed only by a signed provider callback. Refunds are reviewed against the order and are not instant. Watching a broadcast from outside Bangladesh does not mean we ship internationally.',
        bodyBn:
          'ম্যানসো আপনার নির্বাচিত শাখা থেকে নির্দিষ্ট ওজনের তাজা গরুর মাংস বিক্রি করে। ডেলিভারি দুপুর ২টা (বাংলাদেশ সময়) থেকে শুরু। চেকআউট হোল্ড ১০ মিনিট এবং ওই সময়ের দাম অপরিবর্তিত থাকে। ক্যাশ ডেলিভারি বা সংগ্রহের সময় দিতে হয়। অনলাইন পেমেন্ট শুধু স্বাক্ষরিত কলব্যাকে নিশ্চিত হয়। রিফান্ড অর্ডার দেখে যাচাই করা হয়। দেশের বাইরে থেকে দেখা মানে আন্তর্জাতিক শিপিং নয়।',
      },
      {
        slug: 'privacy',
        titleEn: 'Privacy policy',
        titleBn: 'গোপনীয়তা নীতি',
        bodyEn:
          'We store your phone number, name, addresses and orders so we can prepare and deliver beef. Live questions are private to you and the branch. We do not put your details on the public broadcast. You can delete your account; we anonymise the profile and keep orders and payments for reconciliation. Notification choices for live alerts and offers are separate and off until you opt in.',
        bodyBn:
          'অর্ডার তৈরি ও পৌঁছে দিতে আমরা আপনার ফোন, নাম, ঠিকানা ও অর্ডার রাখি। লাইভ প্রশ্ন শুধু আপনি ও শাখা দেখেন। পাবলিক সম্প্রচারে আপনার তথ্য দেওয়া হয় না। অ্যাকাউন্ট মুছলে প্রোফাইল মুছে যায়, হিসাব মেলানোর জন্য অর্ডার ও পেমেন্ট থাকে। লাইভ অ্যালার্ট ও অফার আলাদা, এবং আপনি চালু না করা পর্যন্ত বন্ধ থাকে।',
      },
    ],
  });

  await prisma.counter.create({ data: { id: 'order_number', value: 1026 } });
  await prisma.auditEvent.create({
    data: { actorId: owner.id, action: 'SEED', entity: 'Database', entityId: 'local', meta: { today, streamStatus } },
  });

  console.log(`Seeded Manso for ${today}. Stream is ${streamStatus}. Demo customer +8801712345678.`);
}

function line(
  product: { id: string; nameEn: string; imageUrl: string },
  batchId: string,
  batchCode: string,
  grams: number,
  unit: number,
  total: number,
  optionName: string,
) {
  return {
    productId: product.id,
    batchId,
    productName: product.nameEn,
    batchCode,
    imageUrl: product.imageUrl,
    orderedGrams: grams,
    unitPricePerKgPoisha: unit,
    lineTotalPoisha: total,
    optionName,
  };
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
