require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { requireSession } = require('./session');
const { startRun, resumeRun } = require('./agent');
const { runRadarScan, scheduleDailyScan } = require('./radar');
const { chatCompletionStream } = require('./llm');

const app = express();
const PORT = process.env.PORT || 3003;
const HOST = process.env.HOST || '127.0.0.1';

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  console.error('❌ 缺少 SUPABASE_URL 或 SUPABASE_SERVICE_KEY');
  process.exit(1);
}
if (!process.env.LLM_API_KEY || !process.env.LLM_ENDPOINT || !process.env.AGENT_MODEL) {
  console.error('❌ 缺少 LLM_API_KEY、LLM_ENDPOINT 或 AGENT_MODEL');
  process.exit(1);
}

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',').map((origin) => origin.trim()).filter(Boolean);

app.set('trust proxy', 'loopback');
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    if (process.env.NODE_ENV !== 'production' && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
app.use(express.json({ limit: '256kb' }));

app.get('/api/agent/health', (req, res) => {
  res.json({ status: 'ok', service: 'agent-proxy' });
});

// SSE 推流：每个事件一行 data: JSON
function openSse(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 15_000);
  res.on('close', () => clearInterval(heartbeat));
  return (event) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };
}

app.post('/api/agent/runs', requireSession, async (req, res) => {
  const userMessage = String(req.body?.message || '').trim();
  const matterId = req.body?.matter_id ? Number(req.body.matter_id) : null;
  if (!userMessage) return res.status(400).json({ error: '消息不能为空' });
  if (userMessage.length > 8000) return res.status(400).json({ error: '消息过长' });

  const emit = openSse(res);
  try {
    await startRun({ matterId, userMessage, session: req.session, emit });
  } catch (err) {
    console.error('[Agent Run Error]', err.message);
    emit({ type: 'error', error: err.message });
  } finally {
    res.end();
  }
});

app.post('/api/agent/runs/:id/approve', requireSession, async (req, res) => {
  const runId = Number(req.params.id);
  if (!Number.isInteger(runId)) return res.status(400).json({ error: '无效的运行 ID' });
  const emit = openSse(res);
  try {
    await resumeRun({ runId, approved: true, session: req.session, emit });
  } catch (err) {
    console.error('[Agent Approve Error]', err.message);
    emit({ type: 'error', error: err.message });
  } finally {
    res.end();
  }
});

app.post('/api/agent/runs/:id/reject', requireSession, async (req, res) => {
  const runId = Number(req.params.id);
  if (!Number.isInteger(runId)) return res.status(400).json({ error: '无效的运行 ID' });
  const emit = openSse(res);
  try {
    await resumeRun({ runId, approved: false, session: req.session, emit });
  } catch (err) {
    console.error('[Agent Reject Error]', err.message);
    emit({ type: 'error', error: err.message });
  } finally {
    res.end();
  }
});

// 通用 MiMo 文本接口：合同抽取、风险扫描等前端能力只通过服务端调用模型。
app.post('/api/agent/chat', requireSession, async (req, res) => {
  const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
  if (!messages.length || messages.length > 20) return res.status(400).json({ error: '消息格式无效' });
  const safeMessages = messages.map((message) => ({
    role: ['system', 'user', 'assistant'].includes(message?.role) ? message.role : 'user',
    content: String(message?.content || '').slice(0, 30_000),
  }));
  if (safeMessages.reduce((total, message) => total + message.content.length, 0) > 50_000) {
    return res.status(400).json({ error: '消息内容过长' });
  }
  const emit = openSse(res);
  try {
    const { message } = await chatCompletionStream(safeMessages, (text) => emit({ type: 'delta', text }), {
      temperature: Math.min(1, Math.max(0, Number(req.body?.temperature ?? 0.3))),
    });
    emit({ type: 'final', text: message.content });
  } catch (err) {
    emit({ type: 'error', error: err.message });
  } finally {
    res.end();
  }
});

// 手动触发雷达扫描（admin），用于测试与补扫
app.post('/api/agent/radar/scan', requireSession, async (req, res) => {
  if (req.session.role !== 'admin') {
    return res.status(403).json({ error: '仅管理员可手动触发雷达扫描' });
  }
  try {
    res.json(await runRadarScan());
  } catch (err) {
    console.error('[Radar Scan Error]', err.message);
    res.status(502).json({ error: err.message });
  }
});

app.listen(PORT, HOST, () => {
  console.log(`✅ Agent Proxy 已启动: http://${HOST}:${PORT}`);
  console.log('   健康检查: GET /api/agent/health');
  console.log('   发起运行: POST /api/agent/runs (SSE)');
  scheduleDailyScan((err, result) => {
    if (err) console.error('[Radar] 扫描失败:', err.message);
    else console.log(`[Radar] 扫描完成: 候选 ${result.scanned} 条，新建 ${result.created} 条待办`);
  });
  console.log(`   雷达扫描: 每日 ${process.env.RADAR_SCAN_HOUR || 8}:00 自动执行，POST /api/agent/radar/scan 可手动触发`);
});
