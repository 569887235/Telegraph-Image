import { cors, errorHandling, telemetryData } from '../utils/middleware';

export const onRequest = [cors, errorHandling, telemetryData];