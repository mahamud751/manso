const base = process.env.API_URL || 'http://localhost:3000';

async function call(path, { method = 'GET', token, body, headers } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: response.status, json };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function signIn(phone) {
  const otp = await call('/v1/auth/otp', { method: 'POST', body: { phone } });
  assert(otp.status === 201 || otp.status === 200, `otp ${phone} ${otp.status} ${JSON.stringify(otp.json)}`);
  assert(otp.json.debugCode, 'OTP_DEBUG did not return a code');
  const verified = await call('/v1/auth/verify', {
    method: 'POST',
    body: { phone, code: otp.json.debugCode },
  });
  assert(verified.status === 201 || verified.status === 200, `verify ${verified.status} ${JSON.stringify(verified.json)}`);
  return verified.json.accessToken;
}

async function main() {
  const health = await call('/v1/branches');
  assert(health.status === 200 && Array.isArray(health.json) && health.json.length >= 2, `branches ${health.status} ${JSON.stringify(health.json)?.slice(0, 180)}`);
  const branch = health.json[0];

  const docs = await fetch(`${base}/docs`);
  assert(docs.status === 200, `swagger ${docs.status}`);

  const slots = await call(`/v1/slots?branchId=${branch.id}&mode=DELIVERY`);
  assert(slots.status === 200, `slots ${slots.status}`);
  assert(
    slots.json.slots.every((slot) => slot.startMinutes >= 14 * 60),
    `a delivery slot starts before 14:00: ${JSON.stringify(slots.json.slots)}`,
  );

  const replays = await call(`/v1/replays?branchId=${branch.id}`);
  const sold = replays.json.find((row) => row.soldOut);
  assert(sold && sold.orderable === false, 'sold-out replay is still orderable');

  const customer = await signIn('01712345678');
  const forbidden = await call(`/v1/admin/streams/missing/start`, {
    method: 'POST',
    token: customer,
    body: {},
  });
  assert(forbidden.status === 403, `customer admin ${forbidden.status}`);

  const products = await call(`/v1/products?branchId=${branch.id}`, { token: customer });
  const bone = products.json.find((row) => row.slug === 'beef-with-bone');
  assert(bone?.inStock, 'bone is not in stock');

  const address = await call('/v1/addresses', {
    method: 'POST',
    token: customer,
    body: { label: 'Acceptance', line1: 'House 1', area: branch.zones[0].name, city: 'Sylhet', isDefault: true },
  });
  assert(address.status === 201 || address.status === 200, `address ${address.status} ${JSON.stringify(address.json)}`);

  const offer = slots.json.slots[0];
  assert(offer, 'no delivery slot to order');

  await call('/v1/basket/items', {
    method: 'POST',
    token: customer,
    body: { branchId: branch.id, productId: bone.id, grams: 1000, optionId: bone.options[0]?.id },
  });
  const quote = await call('/v1/checkout/holds', {
    method: 'POST',
    token: customer,
    body: {
      branchId: branch.id,
      mode: 'DELIVERY',
      slotTemplateId: offer.id,
      serviceDate: slots.json.serviceDate,
      addressId: address.json.id,
    },
  });
  assert(quote.status === 201 || quote.status === 200, `quote ${quote.status} ${JSON.stringify(quote.json)}`);
  const held = await call(`/v1/checkout/holds/${quote.json.id}`, { token: customer });
  assert(held.status === 200 && held.json.totalPoisha === quote.json.totalPoisha, 'quote reload mismatch');

  const cash = await call('/v1/orders', {
    method: 'POST',
    token: customer,
    headers: { 'Idempotency-Key': `accept-cash-${Date.now()}` },
    body: { quoteId: quote.json.id, method: 'CASH', termsAccepted: true },
  });
  assert(cash.status === 201 || cash.status === 200, `cash ${cash.status} ${JSON.stringify(cash.json)}`);
  assert(cash.json.paymentState === 'CASH_DUE', `cash state ${cash.json.paymentState}`);

  const again = await call('/v1/orders', {
    method: 'POST',
    token: customer,
    headers: { 'Idempotency-Key': `accept-cash-again-${Date.now()}` },
    body: { quoteId: quote.json.id, method: 'CASH', termsAccepted: true },
  });
  // The quote is already consumed. A second order without the same key must fail.
  assert(again.status >= 400, 'a used quote created a second order');

  await call('/v1/basket/items', {
    method: 'POST',
    token: customer,
    body: { branchId: branch.id, productId: bone.id, grams: 1000 },
  });
  const quotePay = await call('/v1/checkout/holds', {
    method: 'POST',
    token: customer,
    body: {
      branchId: branch.id,
      mode: 'DELIVERY',
      slotTemplateId: offer.id,
      serviceDate: slots.json.serviceDate,
      addressId: address.json.id,
    },
  });
  assert(quotePay.status < 300, `pay quote ${quotePay.status} ${JSON.stringify(quotePay.json)}`);
  const online = await call('/v1/orders', {
    method: 'POST',
    token: customer,
    headers: { 'Idempotency-Key': `accept-bkash-${Date.now()}` },
    body: { quoteId: quotePay.json.id, method: 'BKASH', termsAccepted: true },
  });
  assert(online.json.paymentState === 'PENDING', `bkash pending ${online.json.paymentState}`);
  const paid = await call('/v1/payments/sandbox/complete', {
    method: 'POST',
    token: customer,
    body: { orderId: online.json.id, outcome: 'PAID' },
  });
  assert(paid.json.order.paymentState === 'PAID' && paid.json.duplicate === false, `paid ${JSON.stringify(paid.json)}`);
  const replayed = await call('/v1/payments/sandbox/complete', {
    method: 'POST',
    token: customer,
    body: { orderId: online.json.id, outcome: 'PAID' },
  });
  assert(replayed.json.duplicate === true && replayed.json.order.paymentState === 'PAID', 'duplicate payment was applied again');

  const badSignature = await call('/v1/webhooks/payments/sandbox', {
    method: 'POST',
    body: { merchant: 'manso', orderId: online.json.id, transactionId: 'nope', amountPoisha: 1, currency: 'BDT', status: 'PAID' },
    headers: { 'X-Manso-Signature': '00' },
  });
  assert(badSignature.status === 401 && badSignature.json.code === 'SIGNATURE_INVALID', `signature ${badSignature.status}`);

  await call('/v1/basket/items', {
    method: 'POST',
    token: customer,
    body: { branchId: branch.id, productId: bone.id, grams: 1000 },
  });
  const quoteFail = await call('/v1/checkout/holds', {
    method: 'POST',
    token: customer,
    body: {
      branchId: branch.id,
      mode: 'DELIVERY',
      slotTemplateId: offer.id,
      serviceDate: slots.json.serviceDate,
      addressId: address.json.id,
    },
  });
  const failedOrder = await call('/v1/orders', {
    method: 'POST',
    token: customer,
    headers: { 'Idempotency-Key': `accept-fail-${Date.now()}` },
    body: { quoteId: quoteFail.json.id, method: 'CARD', termsAccepted: true },
  });
  const failed = await call('/v1/payments/sandbox/complete', {
    method: 'POST',
    token: customer,
    body: { orderId: failedOrder.json.id, outcome: 'FAILED' },
  });
  assert(failed.json.order.paymentState === 'FAILED', `failed pay ${JSON.stringify(failed.json.order?.paymentState)}`);

  const fresh = await call(`/v1/products?branchId=${branch.id}`);
  const left = fresh.json.find((row) => row.id === bone.id).availableGrams;
  const take = left - 10000;
  assert(take >= 500 && take % 500 === 0, `cannot stage a last-pack race from ${left}g`);
  const other = await signIn('01819990001');
  const collectionBefore = await call(`/v1/slots?branchId=${branch.id}&mode=COLLECTION`);
  assert(collectionBefore.json.slots[0], 'no collection slot');
  await call('/v1/basket/items', {
    method: 'POST',
    token: customer,
    body: { branchId: branch.id, productId: bone.id, grams: take },
  });
  const drainQuote = await call('/v1/checkout/holds', {
    method: 'POST',
    token: customer,
    body: {
      branchId: branch.id,
      mode: 'COLLECTION',
      slotTemplateId: collectionBefore.json.slots[0].id,
      serviceDate: collectionBefore.json.serviceDate,
    },
  });
  assert(drainQuote.status < 300, `drain quote ${drainQuote.status} ${JSON.stringify(drainQuote.json)}`);
  const drained = await call('/v1/orders', {
    method: 'POST',
    token: customer,
    headers: { 'Idempotency-Key': `accept-drain-${Date.now()}` },
    body: { quoteId: drainQuote.json.id, method: 'CASH', termsAccepted: true },
  });
  assert(drained.json.paymentState === 'CASH_DUE', `drain ${JSON.stringify(drained.json)}`);

  await Promise.all([
    call('/v1/basket/items', { method: 'POST', token: customer, body: { branchId: branch.id, productId: bone.id, grams: 10000 } }),
    call('/v1/basket/items', { method: 'POST', token: other, body: { branchId: branch.id, productId: bone.id, grams: 10000 } }),
  ]);
  const collection = await call(`/v1/slots?branchId=${branch.id}&mode=COLLECTION`);
  const race = await Promise.all([customer, other].map((token) =>
    call('/v1/checkout/holds', {
      method: 'POST',
      token,
      body: {
        branchId: branch.id,
        mode: 'COLLECTION',
        slotTemplateId: collection.json.slots[0].id,
        serviceDate: collection.json.serviceDate,
      },
    }),
  ));
  const wins = race.filter((row) => row.status < 300);
  const losses = race.filter((row) => row.status >= 400);
  assert(wins.length === 1 && losses.length === 1, `race ${JSON.stringify(race.map((row) => row.status))}`);
  assert(losses[0].json.code === 'STOCK_CONFLICT', `race code ${losses[0].json.code}`);

  console.log('Acceptance passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
