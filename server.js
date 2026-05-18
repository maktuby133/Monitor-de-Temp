// ╔══════════════════════════════════════════════════════╗
// ║   SERVIDOR MQTT + WEB PUSH — AmbientWatch            ║
// ║   Deploy: Render.com                                 ║
// ╚══════════════════════════════════════════════════════╝

const express = require('express');
const cors    = require('cors');
const mqtt    = require('mqtt');
const webpush = require('web-push');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ── VAPID ─────────────────────────────────────────────
const VAPID_PUBLIC  = process.env.VAPID_PUBLIC  || 'BGMRvzyBhYUXgyrWjUxFGoy9e8iMs9ukZWNTUTpmgSfb9ZLj_f5EaVr6cyeTn77XLk2y_dcqmlNO3NuK0o8Iilo';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE || 'Qg9yk6vNtlJoZBeCjdtDipCujRrZHo91OuN_oA74e84';
const VAPID_EMAIL   = process.env.VAPID_EMAIL   || 'mailto:seu@email.com';

webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC, VAPID_PRIVATE);

// ── MQTT ──────────────────────────────────────────────
const MQTT_HOST = process.env.MQTT_HOST || '07847a67e2944aca805e81e761a6f177.s1.eu.hivemq.cloud';
const MQTT_USER = process.env.MQTT_USER || 'monitortemp';
const MQTT_PASS = process.env.MQTT_PASS || '061084Cc@';

// ── ARMAZENAMENTO EM MEMÓRIA ──────────────────────────
// subscriptions[deviceId] = [ { endpoint, subscription, alerts } ]
// OBS: Render free hiberna — o frontend reenvia a cada 10min via setInterval
const subscriptions = {};

// Anti-spam: lastAlert[deviceId+endpoint] = timestamp
const lastAlert = {};
const ALERT_INTERVAL_MS = 60 * 1000; // 1 minuto

// ── MQTT CLIENT ───────────────────────────────────────
const mqttClient = mqtt.connect(`mqtts://${MQTT_HOST}:8883`, {
  username:           MQTT_USER,
  password:           MQTT_PASS,
  clientId:           'ambientwatch-server-' + Math.random().toString(16).slice(2, 8),
  rejectUnauthorized: false,
  reconnectPeriod:    5000,
  keepalive:          30,
  clean:              true
});

mqttClient.on('connect', () => {
  console.log('[MQTT] Conectado');
  mqttClient.subscribe('sensors/+/data', { qos: 1 }, err => {
    if (!err) console.log('[MQTT] Subscrito em sensors/+/data');
    else console.error('[MQTT] Erro ao subscrever:', err.message);
  });
});

mqttClient.on('error',     e  => console.error('[MQTT] Erro:', e.message));
mqttClient.on('offline',   () => console.warn('[MQTT] Offline'));
mqttClient.on('reconnect', () => console.log('[MQTT] Reconectando...'));

// ── PROCESSAR MENSAGENS MQTT ──────────────────────────
mqttClient.on('message', async (topic, message) => {
  try {
    // topic = "sensors/DEVICEID/data"
    const parts    = topic.split('/');
    const deviceId = parts[1];
    const payload  = JSON.parse(message.toString());

    // Ignora mensagens de erro de sensor
    if (payload.sensor_error) return;

    const temp = parseFloat(payload.temperature);
    const hum  = parseFloat(payload.humidity);
    if (isNaN(temp) || isNaN(hum)) return;

    const subs = subscriptions[deviceId];
    if (!subs || subs.length === 0) {
      // Ninguém subscrito para este device — ignora silenciosamente
      return;
    }

    const label = payload.label || deviceId;
    const agora = Date.now();

    console.log(`[MQTT] ${deviceId}: temp=${temp} hum=${hum} | subs=${subs.length}`);

    for (const sub of [...subs]) {
      // Throttle por device+endpoint (evita spam mesmo com múltiplos browsers)
      const throttleKey = deviceId + '|' + sub.subscription.endpoint;
      if (agora - (lastAlert[throttleKey] || 0) < ALERT_INTERVAL_MS) continue;

      const a = sub.alerts || {};
      const msgs = [];
      if (a.minTemp != null && temp < a.minTemp) msgs.push(`Temp baixa: ${temp.toFixed(1)}°C (mín ${a.minTemp}°C)`);
      if (a.maxTemp != null && temp > a.maxTemp) msgs.push(`Temp alta: ${temp.toFixed(1)}°C (máx ${a.maxTemp}°C)`);
      if (a.minHum  != null && hum  < a.minHum)  msgs.push(`Umid baixa: ${hum.toFixed(1)}% (mín ${a.minHum}%)`);
      if (a.maxHum  != null && hum  > a.maxHum)  msgs.push(`Umid alta: ${hum.toFixed(1)}% (máx ${a.maxHum}%)`);

      if (msgs.length === 0) continue;

      lastAlert[throttleKey] = agora;

      const titulo = `⚠️ AmbientWatch — ${label}`;
      const corpo  = msgs.join(' | ');
      console.log(`[NOTIF] Enviando push para ${deviceId}: ${corpo}`);

      try {
        await webpush.sendNotification(
          sub.subscription,
          JSON.stringify({ titulo, corpo, tag: 'alert-' + deviceId })
        );
        console.log(`[WEBPUSH] ✓ Enviado para endpoint ${sub.subscription.endpoint.slice(-20)}`);
      } catch (e) {
        console.error(`[WEBPUSH] ✗ Erro ${e.statusCode}:`, e.body || e.message);
        // Remove subscription inválida/expirada (410 = gone, 404 = not found)
        if (e.statusCode === 410 || e.statusCode === 404) {
          subscriptions[deviceId] = subscriptions[deviceId].filter(s => s !== sub);
          console.log(`[WEBPUSH] Subscription expirada removida para ${deviceId}`);
        }
      }
    }
  } catch (e) {
    console.error('[MQTT] Erro ao processar mensagem:', e.message);
  }
});

// ── ROTAS HTTP ────────────────────────────────────────

// Ping — UptimeRobot chama a cada 5min para evitar hibernação do Render
app.get('/ping', (req, res) => {
  const totalSubs = Object.values(subscriptions).reduce((a, b) => a + b.length, 0);
  res.json({ status: 'ok', uptime: Math.floor(process.uptime()) + 's', subs: totalSubs });
});

// VAPID public key — browser usa para criar a subscription
app.get('/vapid-public-key', (req, res) => {
  res.json({ key: VAPID_PUBLIC });
});

// Browser registra ou renova subscription Web Push
// Body: { deviceId, subscription, alerts: { minTemp, maxTemp, minHum, maxHum } }
app.post('/subscribe', (req, res) => {
  const { deviceId, subscription, alerts } = req.body;
  if (!deviceId || !subscription || !subscription.endpoint) {
    return res.status(400).json({ error: 'Faltam dados: deviceId e subscription são obrigatórios' });
  }

  if (!subscriptions[deviceId]) subscriptions[deviceId] = [];

  // Upsert por endpoint — evita duplicatas, atualiza alertas
  const idx = subscriptions[deviceId].findIndex(s => s.subscription.endpoint === subscription.endpoint);
  if (idx === -1) {
    subscriptions[deviceId].push({ subscription, alerts: alerts || {} });
    console.log(`[SUB] + Nova subscription: device=${deviceId} total=${subscriptions[deviceId].length}`);
  } else {
    subscriptions[deviceId][idx].alerts = alerts || subscriptions[deviceId][idx].alerts;
    console.log(`[SUB] ~ Atualizada: device=${deviceId} alertas=`, alerts);
  }

  res.json({ ok: true, subs: subscriptions[deviceId].length });
});

// Remove subscription (unsubscribe voluntário)
app.post('/unsubscribe', (req, res) => {
  const { deviceId, endpoint } = req.body;
  if (!deviceId || !endpoint) return res.status(400).json({ error: 'Faltam dados' });
  if (subscriptions[deviceId]) {
    subscriptions[deviceId] = subscriptions[deviceId].filter(s => s.subscription.endpoint !== endpoint);
  }
  res.json({ ok: true });
});

// Status geral
app.get('/', (req, res) => {
  const totalSubs = Object.values(subscriptions).reduce((a, b) => a + b.length, 0);
  const devices   = Object.keys(subscriptions).filter(k => subscriptions[k].length > 0);
  res.json({
    status:  'online',
    mqtt:    mqttClient.connected ? 'conectado' : 'desconectado',
    devices,
    webpush: `${totalSubs} subscriptions`,
    uptime:  Math.floor(process.uptime()) + 's'
  });
});

app.listen(PORT, () => console.log(`[SERVER] Rodando na porta ${PORT}`));
