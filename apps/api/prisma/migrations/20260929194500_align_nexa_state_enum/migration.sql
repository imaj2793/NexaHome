-- Sinkronkan enum "NexaState" dengan 8 state kanonik yang dipakai runtime
-- (union NexaState di apps/web/lib/nexa.ts dan event WebSocket `nexa.state`).
-- Enum ini belum dipakai kolom apa pun, sehingga tidak ada data yang hilang.
ALTER TYPE "NexaState" RENAME TO "NexaState_old";

CREATE TYPE "NexaState" AS ENUM (
    'IDLE',
    'LISTENING',
    'THINKING',
    'PROCESSING',
    'SUCCESS',
    'ERROR',
    'READY',
    'SLEEPING'
);

DROP TYPE "NexaState_old";
