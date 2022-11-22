# Boltz keysend server
This program retrieves swap info from boltz database and pay out for reward (to apply a minus fee).

### Prerequisites

- [Node.js](https://nodejs.org/) Version 14 or higher

### Install
```
git clone {this repo}
cd {this repo}
npm install
```
### Configure

```
cp .env.example .env
```

```
npx prisma migrate reset
npx prisma migrate dev --name init
npx prisma migrate dev --name added_job_title

npx prisma db seed
```

### Run
```
npm start
```

### Cronjob
If you use PM2 for process manager, use the command below.
```
pm2 start src/main.js --name <appname> --cron-restart="*/10 * * * *"
```