// ╔══════════════════════════════════════════════════════╗
// ║   SERVIDOR MQTT + WEB PUSH — AmbientWatch            ║
// ║   Deploy: Render.com                                 ║
// ╚══════════════════════════════════════════════════════╝

const express  = require('express');
const cors     = require('cors');
const mqtt     = require('mqtt');
const webpush  = require('web-push');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ── VAPID (Web Push) ─────────────────────────────────
// Gere uma vez: npx web-push generate-vapid-keys
// Coloque nas variáveis de ambiente do Render
const VAPID_PUBLIC  = process.env.VAPID_PUBLIC  || 'BGMRvzyBhYUXgyrWjUxFGoy9e8iMs9ukZWNTUTpmgSfb9ZLj_f5EaVr6cyeTn77XLk2y_dcqmlNO3NuK0o8Iilo';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE || 'Qg9yk6vNtlJoZBeCjdtDipCujRrZHo91OuN_oA74e84';
const VAPID_EMAIL   = process.env.VAPID_EMAIL   || 'mailto:seu@email.com';

webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC, VAPID_PRIVATE);

// ── MQTT ─────────────────────────────────────────────
// Mesmas credenciais que o dashboard usa
const MQTT_HOST = process.env.MQTT_HOST || '07847a67e2944aca805e81e761a6f177.s1.eu.hivemq.cloud';
const MQTT_USER = process.env.MQTT_USER || 'monitortemp';
const MQTT_PASS = process.env.MQTT_PASS || '061084Cc@';

const mqttClient = mqtt.connect(`mqtts://${MQTT_HOST}:8883`, {
  username:           MQTT_USER,
  password:           MQTT_PASS,
  clientId:           'ambientwatch-server-01',
  rejectUnauthorized: false,
  reconnectPeriod:    5000,
  keepalive:          60,
  clean:              true
});

mqttClient.on('connect', () => {
  console.log('[MQTT] Conectado ao HiveMQ');
  // Subscreve dados de todos os devices: sensors/+/data
  mqttClient.subscribe('sensors/+/data', err => {
    if (!err) console.log('[MQTT] Subscrito em sensors/+/data');
  });
});

mqttClient.on('error',     e  => console.error('[MQTT] Erro:', e.message));
mqttClient.on('reconnect', () => console.log('[MQTT] Reconectando...'));

// ── ARMAZENAMENTO ────────────────────────────────────
// subscriptions[deviceId] = [ { subscription, alerts: { minTemp, maxTemp, minHum, maxHum } }, ... ]
const subscriptions = {};

// Controle anti-spam: lastAlert[deviceId] = timestamp do último alerta
const lastAlert = {};
const ALERT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutos entre alertas

// ── PROCESSAR MENSAGEM MQTT ──────────────────────────
mqttClient.on('message', async (topic, message) => {
  try {
    // Extrai deviceId do tópico: sensors/DEVICEID/data
    const parts    = topic.split('/');
    const deviceId = parts[1];
    const payload  = JSON.parse(message.toString());

    // Ignora mensagens de erro de sensor ou sem dados válidos
    if (payload.sensor_error) return;
    const temp = parseFloat(payload.temperature);
    const hum  = parseFloat(payload.humidity);
    if (isNaN(temp) || isNaN(hum)) return;

    const subs = subscriptions[deviceId] || [];
    if (subs.length === 0) return;

    // Throttle anti-spam
    const agora    = Date.now();
    const lastTime = lastAlert[deviceId] || 0;
    if (agora - lastTime < ALERT_INTERVAL_MS) return;

    const label = payload.label || deviceId;

    // Verifica alertas para cada subscriber (usa os limites do subscriber)
    for (const sub of subs) {
      const a = sub.alerts || {};
      const msgs = [];

      if (a.minTemp !== null && a.minTemp !== undefined && temp < a.minTemp)
        msgs.push(`Temp baixa: ${temp.toFixed(1)}°C (mín ${a.minTemp}°C)`);
      if (a.maxTemp !== null && a.maxTemp !== undefined && temp > a.maxTemp)
        msgs.push(`Temp alta: ${temp.toFixed(1)}°C (máx ${a.maxTemp}°C)`);
      if (a.minHum  !== null && a.minHum  !== undefined && hum  < a.minHum)
        msgs.push(`Umid baixa: ${hum.toFixed(1)}% (mín ${a.minHum}%)`);
      if (a.maxHum  !== null && a.maxHum  !== undefined && hum  > a.maxHum)
        msgs.push(`Umid alta: ${hum.toFixed(1)}% (máx ${a.maxHum}%)`);

      if (msgs.length === 0) continue;

      lastAlert[deviceId] = agora;
      const titulo = `⚠️ AmbientWatch — ${label}`;
      const corpo  = msgs.join(' | ');
      console.log(`[NOTIF] Alerta para ${deviceId}: ${corpo}`);

      try {
        await webpush.sendNotification(
          sub.subscription,
          JSON.stringify({ titulo, corpo, tag: 'alert-' + deviceId })
        );
        console.log(`[WEBPUSH] Enviado para ${deviceId}`);
      } catch(e) {
        console.error(`[WEBPUSH] Erro:`, e.statusCode, e.body);
        // Remove subscription expirada
        if (e.statusCode === 410 || e.statusCode === 404) {
          subscriptions[deviceId] = subscriptions[deviceId].filter(s => s !== sub);
        }
      }
    }
  } catch(e) {
    console.error('[MQTT] Erro ao processar:', e.message);
  }
});

// ── ROTAS HTTP ───────────────────────────────────────

// Ping — mantém o Render acordado (UptimeRobot)
app.get('/ping', (req, res) => {
  res.json({ status: 'ok', uptime: Math.floor(process.uptime()) + 's' });
});

// Retorna a VAPID public key para o browser registrar o SW
app.get('/vapid-public-key', (req, res) => {
  res.json({ key: VAPID_PUBLIC });
});

// Browser registra subscription Web Push
// Body: { deviceId, subscription, alerts: { minTemp, maxTemp, minHum, maxHum } }
app.post('/subscribe', (req, res) => {
  const { deviceId, subscription, alerts } = req.body;
  if (!deviceId || !subscription) return res.status(400).json({ error: 'Faltam dados' });

  if (!subscriptions[deviceId]) subscriptions[deviceId] = [];

  const existe = subscriptions[deviceId].find(s => s.subscription.endpoint === subscription.endpoint);
  if (!existe) {
    subscriptions[deviceId].push({ subscription, alerts: alerts || {} });
    console.log(`[SUB] Nova subscription para device ${deviceId} (total: ${subscriptions[deviceId].length})`);
  } else {
    // Atualiza limites
    existe.alerts = alerts || existe.alerts;
    console.log(`[SUB] Subscription atualizada para device ${deviceId}`);
  }

  res.json({ ok: true });
});

// Atualiza limites de alerta de uma subscription existente
// Body: { deviceId, alerts: { minTemp, maxTemp, minHum, maxHum } }
app.post('/update-alerts', (req, res) => {
  const { deviceId, alerts } = req.body;
  if (!deviceId) return res.status(400).json({ error: 'deviceId obrigatório' });

  const subs = subscriptions[deviceId] || [];
  subs.forEach(s => { s.alerts = alerts || s.alerts; });

  console.log(`[CONFIG] Alertas atualizados para ${deviceId}:`, alerts);
  res.json({ ok: true });
});

// Status geral
app.get('/', (req, res) => {
  const totalSubs = Object.values(subscriptions).reduce((a, b) => a + b.length, 0);
  res.json({
    status:  'online',
    mqtt:    mqttClient.connected ? 'conectado' : 'desconectado',
    webpush: totalSubs + ' subscriptions',
    uptime:  Math.floor(process.uptime()) + 's'
  });
});

app.listen(PORT, () => {
  console.log(`[SERVER] Rodando na porta ${PORT}`);
});
