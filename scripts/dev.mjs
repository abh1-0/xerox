import { spawn } from 'node:child_process';

const tasks = [['api', 'dev:api'], ['customer', 'dev:customer'], ['admin', 'dev:admin']];
const processes = tasks.map(([name, script]) => {
  const child = process.platform === 'win32'
    ? spawn('cmd.exe', ['/d', '/s', '/c', `npm run ${script}`], { stdio: 'inherit', windowsHide: true })
    : spawn('npm', ['run', script], { stdio: 'inherit' });
  child.on('exit', (code) => { if (code && code !== 0) console.error(`${name} stopped with exit code ${code}`); });
  return child;
});
const stop = () => processes.forEach((child) => child.kill());
process.on('SIGINT', stop); process.on('SIGTERM', stop);
