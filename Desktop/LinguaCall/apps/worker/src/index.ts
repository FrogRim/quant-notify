import "../../api/src/loadEnv";
import {
  parseWorkerBatchInterval,
  parseWorkerBatchLimit,
  startWorkerBatchLoop
} from "../../api/src/modules/jobs/workerApp";

const intervalMs = parseWorkerBatchInterval();
const limit = parseWorkerBatchLimit();

startWorkerBatchLoop({ intervalMs, limit });

console.log(`LinguaCall worker started interval=${intervalMs}ms limit=${limit}`);
