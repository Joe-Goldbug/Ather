import { inspectDataPlaneEnvironment, type RuntimeService } from '../apps/api/src/deploy/data-plane-preflight.js';

const serviceArg = process.argv.find((argument) => argument.startsWith('--service='));
const service = serviceArg?.slice('--service='.length);

if (service !== 'api' && service !== 'worker') {
  console.error('[data-plane-preflight] use --service=api or --service=worker');
  process.exitCode = 1;
} else {
  const result = inspectDataPlaneEnvironment(service as RuntimeService, process.env);
  console.log(JSON.stringify(result));
  if (!result.ok) process.exitCode = 1;
}
