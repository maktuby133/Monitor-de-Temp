// ╔══════════════════════════════════════════════════════╗
// ║   SERVIDOR MQTT + WEB PUSH — AmbientWatch            ║
// ║   Deploy: Render.com                                 ║
// ╚══════════════════════════════════════════════════════╝

const express  = require('express');
const cors     = require('cors');
const mqtt     = require('mqtt');
const webpush  = require('web-push');
const fs       = require('fs');
const path     = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ── VAPID (Web Push) ─────────────────────────────────
const VAPID_PUBLIC  = process.env.VAPID_PUBLIC  || 'BGMRvzyBhYUXgyrWjUxFGoy9e8iMs9ukZWNTUTpmgSfb9ZLj_f5EaVr6cyeTn77XLk2y_dcqmlNO3NuK0o8Iilo';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE || 'Qg9yk6vNtlJoZBeCjdtDipCujRrZHo91OuN_oA74e84';
const VAPID_EMAIL   = process.env.VAPID_EMAIL   || 'mailto:seu@email.com';

webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC, VAPID_PRIVATE);

// ── MQTT ─────────────────────────────────────────────
const MQTT_HOST = process.env.MQTT_HOST || '07847a67e2944aca805e81e761a6f177.s1.eu.hivemq.cloud';
const MQTT_USER = process.env.MQTT_USER || 'monitortemp';
const MQTT_PASS = process.env.MQTT_PASS || '061084Cc@';

// ── PERSISTÊNCIA DE SUBSCRIPTIONS ────────────────────
// Salva em disco para sobreviver a reinicializações do Render
const SUBS_FILE = path.join('/tmp', 'ambientwatch_subs.json');

function loadSubscriptions() {
  try {
    if (fs.existsSync(SUBS_FILE)) {
      const data = JSON.parse(fs.readFileSync(SUBS_FILE, 'utf8'));
      console.log('[SUBS] Carregadas do disco:', Object.keys(data).length, 'devices');
      return data;
    }
  } catch(e) {
    console.warn('[SUBS] Erro ao carregar do disco:', e.message);
  }
  return {};
}

function saveSubscriptions() {
  try {
    fs.writeFileSync(SUBS_FILE, JSON.stringify(subscriptions), 'utf8');
  } catch(e) {
    console.warn('[SUBS] Erro ao salvar no disco:', e.message);
  }
}

// subscriptions[deviceId] = [ { subscription, alerts: { minTemp, maxTemp, minHum, maxHum } }, ... ]
const subscriptions = loadSubscriptions();

// Controle anti-spam: lastAlert[deviceId] = timestamp do último alerta
const lastAlert = {};
const ALERT_INTERVAL_MS = 60 * 1000; // 1 minuto entre alertas

// ── MQTT ─────────────────────────────────────────────
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
  mqttClient.subscribe('sensors/+/data', err => {
    if (!err) console.log('[MQTT] Subscrito em sensors/+/data');
  });
});

mqttClient.on('error',     e  => console.error('[MQTT] Erro:', e.message));
mqttClient.on('reconnect', () => console.log('[MQTT] Reconectando...'));

// ── PROCESSAR MENSAGEM MQTT ──────────────────────────
mqttClient.on('message', async (topic, message) => {
  try {
    const parts    = topic.split('/');
    const deviceId = parts[1];
    const payload  = JSON.parse(message.toString());

    if (payload.sensor_error) return;
    const temp = parseFloat(payload.temperature);
    const hum  = parseFloat(payload.humidity);
    if (isNaN(temp) || isNaN(hum)) return;

    const subs = subscriptions[deviceId] || [];
    if (subs.length === 0) return;

    const agora    = Date.now();
    const lastTime = lastAlert[deviceId] || 0;
    if (agora - lastTime < ALERT_INTERVAL_MS) return;

    const label = payload.label || deviceId;

    for (const sub of subs) {
      const a = sub.alerts || {};
      const msgs = [];

      if (a.minTemp != null && temp < a.minTemp) msgs.push(`Temp baixa: ${temp.toFixed(1)}°C (mín ${a.minTemp}°C)`);
      if (a.maxTemp != null && temp > a.maxTemp) msgs.push(`Temp alta: ${temp.toFixed(1)}°C (máx ${a.maxTemp}°C)`);
      if (a.minHum  != null && hum  < a.minHum)  msgs.push(`Umid baixa: ${hum.toFixed(1)}% (mín ${a.minHum}%)`);
      if (a.maxHum  != null && hum  > a.maxHum)  msgs.push(`Umid alta: ${hum.toFixed(1)}% (máx ${a.maxHum}%)`);

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
        console.error('[WEBPUSH] Erro:', e.statusCode, e.body);
        if (e.statusCode === 410 || e.statusCode === 404) {
          subscriptions[deviceId] = subscriptions[deviceId].filter(s => s !== sub);
          saveSubscriptions();
        }
      }
    }
  } catch(e) {
    console.error('[MQTT] Erro ao processar:', e.message);
  }
});

// ── ROTAS HTTP ───────────────────────────────────────

app.get('/ping', (req, res) => {
  res.json({ status: 'ok', uptime: Math.floor(process.uptime()) + 's' });
});

app.get('/vapid-public-key', (req, res) => {
  res.json({ key: VAPID_PUBLIC });
});

// Browser registra ou atualiza subscription Web Push
app.post('/subscribe', (req, res) => {
  const { deviceId, subscription, alerts } = req.body;
  if (!deviceId || !subscription) return res.status(400).json({ error: 'Faltam dados' });

  if (!subscriptions[deviceId]) subscriptions[deviceId] = [];

  const existe = subscriptions[deviceId].find(s => s.subscription.endpoint === subscription.endpoint);
  if (!existe) {
    subscriptions[deviceId].push({ subscription, alerts: alerts || {} });
    console.log(`[SUB] Nova subscription para ${deviceId} (total: ${subscriptions[deviceId].length})`);
  } else {
    existe.alerts = alerts || existe.alerts;
    console.log(`[SUB] Atualizada para ${deviceId}`);
  }

  saveSubscriptions();
  res.json({ ok: true });
});

app.post('/update-alerts', (req, res) => {
  const { deviceId, alerts } = req.body;
  if (!deviceId) return res.status(400).json({ error: 'deviceId obrigatório' });

  const subs = subscriptions[deviceId] || [];
  subs.forEach(s => { s.alerts = alerts || s.alerts; });
  saveSubscriptions();

  console.log(`[CONFIG] Alertas atualizados para ${deviceId}:`, alerts);
  res.json({ ok: true });
});

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
