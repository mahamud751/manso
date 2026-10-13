# Manso

Fresh-beef customer app for Sylhet. The phone app is React Native CLI. The API is NestJS, Prisma and local PostgreSQL, with Swagger at `/docs`.

Prices, stock, slots and orders come from the API. Money is integer poisha. Weights are integer grams. Delivery slots start at 14:00 Asia/Dhaka.

## API

```bash
cd server
cp .env.example .env
npm install
npx prisma migrate dev --name init
npm run db:seed
npm run start:dev
```

Create the database once with `createdb manso` if it does not exist. See `server/README.md` for demo phones and the local payment sandbox.

## App

```bash
cd app
npm install
npm start
npm run ios
```

The iOS simulator uses `http://localhost:3000`. The Android emulator uses `http://10.0.2.2:3000`. Sign in with `01712345678`. While `OTP_DEBUG=true`, the one-time code is shown on the sign-in screen.
