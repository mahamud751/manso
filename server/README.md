# Manso API

NestJS, Prisma and local PostgreSQL for the Manso customer app. Swagger UI is at [http://localhost:3000/docs](http://localhost:3000/docs).

Money is integer poisha. Weights are integer grams. Schedules use Asia/Dhaka.

## Run

PostgreSQL must already be running.

```bash
cd server
cp .env.example .env
npm install
npx prisma migrate dev --name init
npm run db:seed
npm run start:dev
```

`createdb manso` once, if the database does not exist.

## Local accounts

Sign-in is a real one-time code. With `OTP_DEBUG=true` the code is returned by `POST /v1/auth/otp` and is not sent by SMS.

| Phone | Role |
| --- | --- |
| +8801712345678 | Customer with sample orders |
| +8801700000001 | Owner |
| +8801700000002 | Driver |

## Payments

`PAYMENT_SANDBOX=true` enables `POST /v1/payments/sandbox/complete`. That route signs a webhook body and sends it through `POST /v1/webhooks/payments/sandbox`. A client redirect never marks an order paid. Cash stays `CASH_DUE` until the branch or driver records collection.

Do not ship `OTP_DEBUG` or `PAYMENT_SANDBOX` enabled in production. bKash, card, SMS and a live video CDN are not connected; those need merchant accounts.

## Rules covered

- Delivery slots start at 14:00 Bangladesh time. Earlier windows are not offered.
- Checkout holds stock and a slot for 10 minutes inside a transaction.
- Two customers cannot both hold the last pack.
- Replay of a sold-out batch is not orderable.
- Branch staff cannot act on another branch.
- Account deletion anonymises the profile and keeps orders.
