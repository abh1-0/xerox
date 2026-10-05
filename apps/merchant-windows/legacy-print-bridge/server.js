const crypto = require('crypto');
const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const pdfToPrinter = require('pdf-to-printer');

const app = express();
const port = Number(process.env.SPRINT_PRINT_BRIDGE_PORT || 3001);
const statePath = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Sprint', 'Merchant', 'print-bridge-state.json');
const permittedDirectory = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Sprint', 'Merchant', 'temporary');
fs.mkdirSync(path.dirname(statePath), { recursive: true });

function readState() { try { return JSON.parse(fs.readFileSync(statePath, 'utf8')); } catch { return { executions: {} }; } }
function writeState(state) { const pending = `${statePath}.new`; fs.writeFileSync(pending, JSON.stringify(state, null, 2)); fs.renameSync(pending, statePath); }
function safeTempPath(filePath) { const resolved = path.resolve(String(filePath || '')); return resolved.startsWith(`${path.resolve(permittedDirectory)}${path.sep}`) ? resolved : null; }

app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));
app.get('/health', (_req, res) => res.json({ status: 'ok', bind: '127.0.0.1' }));
app.get('/api/printers', async (_req, res) => {
  try { res.json({ printers: (await pdfToPrinter.getPrinters()).map((printer) => ({ name: printer.name, status: printer.status })) }); }
  catch (error) { res.status(503).json({ error: 'Windows printers could not be read.' }); }
});
app.post('/api/print-local', async (req, res) => {
  const { localFilePath, printer, requestId, copies = 1, paperSize, colorMode, sides } = req.body || {};
  const executionId = req.header('x-sprint-execution-id') || req.body?.executionId;
  if (!executionId || !printer || !requestId || !localFilePath) return res.status(400).json({ error: 'Sprint execution ID, request, printer, and local file are required.' });
  const filePath = safeTempPath(localFilePath);
  if (!filePath || !fs.existsSync(filePath) || path.extname(filePath).toLowerCase() !== '.pdf') return res.status(400).json({ error: 'The print bridge accepts only Sprint-managed temporary PDFs.' });
  const state = readState();
  if (state.executions[executionId]?.state === 'SUBMITTED') return res.status(409).json({ error: 'This physical print was already submitted. Review the queue instead of retrying.' });
  try {
    const printerNames = new Set((await pdfToPrinter.getPrinters()).map((item) => item.name));
    if (!printerNames.has(printer)) return res.status(400).json({ error: 'The configured printer is no longer available.' });
    state.executions[executionId] = { requestId, printer, state: 'SUBMITTING', startedAt: new Date().toISOString(), options: { copies, paperSize, colorMode, sides } }; writeState(state);
    await pdfToPrinter.print(filePath, { printer, copies: Math.max(1, Math.min(99, Number(copies) || 1)), silent: true });
    state.executions[executionId] = { ...state.executions[executionId], state: 'SUBMITTED', submittedAt: new Date().toISOString() }; writeState(state);
    res.status(202).json({ accepted: true, spoolerJobId: null });
  } catch (error) {
    state.executions[executionId] = { ...state.executions[executionId], state: 'ATTENTION_REQUIRED', detail: error.message, updatedAt: new Date().toISOString() }; writeState(state);
    res.status(503).json({ error: 'Windows did not accept this print job. Review printer status before retrying.' });
  }
});
app.listen(port, '127.0.0.1', () => console.log(JSON.stringify({ event: 'sprint.print-bridge.started', port })));
